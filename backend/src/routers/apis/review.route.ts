import mongoose from "mongoose";

import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { ReviewModel, ReviewStatusEnum, ReviewCriteria } from "../../models/review/review.model";
import {
  BookingStatusEnum,
  OwnerTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { notificationCenterService } from "../../services/notification-center.service";

const REVIEW_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const REVIEW_DEADLINE_MS = 30 * 24 * 60 * 60 * 1000;
const REVIEW_IMAGE_LIMIT = 3;

const criteriaKeys: Array<keyof ReviewCriteria> = [
  "vehicleQuality",
  "cleanliness",
  "descriptionAccuracy",
  "handoverService",
  "ownerAttitude",
  "punctuality",
];

function normalizeRating(value: unknown) {
  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw ErrorHelper.requestDataInvalid("Vui lòng chọn số sao từ 1 đến 5.");
  }

  return rating;
}

function normalizeOptionalRating(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  return normalizeRating(value);
}

function assertNoSensitiveContent(value: string) {
  const patterns = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /(?:\+?84|0)(?:\D*\d){9,10}\b/,
    /\b\d{12}\b/,
    /\b\d{9,16}\b/,
    /https?:\/\/|www\./i,
  ];

  if (patterns.some((pattern) => pattern.test(value))) {
    throw ErrorHelper.requestDataInvalid(
      "Nội dung đánh giá không được chứa email, số điện thoại, CCCD, tài khoản hoặc đường dẫn quảng cáo.",
    );
  }
}

function normalizeComment(value: unknown) {
  if (typeof value !== "string") return "";
  const comment = value.trim().slice(0, 1000);
  if (comment) assertNoSensitiveContent(comment);
  return comment;
}

function normalizeCriteria(value: unknown): ReviewCriteria {
  if (typeof value !== "object" || value === null) return {};

  return criteriaKeys.reduce<ReviewCriteria>((result, key) => {
    const rating = normalizeOptionalRating((value as Record<string, unknown>)[key]);
    if (rating) result[key] = rating;
    return result;
  }, {});
}

function normalizeImages(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, REVIEW_IMAGE_LIMIT);
}

function getOwnerName(booking: any) {
  if (booking.ownerType === OwnerTypeEnum.USER) {
    return booking.ownerId?.name || "Người dùng ký gửi";
  }

  return (
    booking.ownerId?.businessName ||
    booking.businessId?.businessName ||
    "Doanh nghiệp"
  );
}

function getReviewDeadline(booking: any) {
  const baseDate = booking.updatedAt || booking.endDate || booking.createdAt;
  return new Date(new Date(baseDate).getTime() + REVIEW_DEADLINE_MS);
}

function isEditable(review: any) {
  const createdAt = new Date(review.createdAt).getTime();
  return Date.now() - createdAt <= REVIEW_EDIT_WINDOW_MS;
}

function formatReview(review: any) {
  const reviewObject = typeof review.toObject === "function" ? review.toObject() : review;
  const helpfulBy = Array.isArray(reviewObject.helpfulBy) ? reviewObject.helpfulBy : [];

  return {
    ...reviewObject,
    id: reviewObject._id,
    helpfulCount: reviewObject.helpfulCount || helpfulBy.length || 0,
    isEdited:
      reviewObject.updatedAt &&
      reviewObject.createdAt &&
      new Date(reviewObject.updatedAt).getTime() -
        new Date(reviewObject.createdAt).getTime() >
        1000,
    canEdit: isEditable(reviewObject),
    verifiedRental: true,
  };
}

class ReviewRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post(
      "/",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.createReview),
    );

    this.router.patch(
      "/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.updateReview),
    );

    this.router.post(
      "/:id/helpful",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.markHelpful),
    );

    this.router.delete(
      "/:id/helpful",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.unmarkHelpful),
    );

    this.router.get(
      "/booking/:bookingId",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER, UserRoleEnum.BUSINESS, UserRoleEnum.ADMIN]),
      ],
      this.route(this.getBookingReview),
    );
  }

  private async canViewBookingReview(authUser: any, booking: any) {
    if (String(booking.userId?._id || booking.userId) === String(authUser.userId)) {
      return true;
    }

    if (authUser.role === UserRoleEnum.ADMIN) return true;

    if (authUser.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: authUser.userId,
        isDeleted: false,
      }).select("_id");

      return Boolean(
        business &&
          booking.ownerType === OwnerTypeEnum.BUSINESS &&
          String(booking.ownerId?._id || booking.ownerId) === String(business._id),
      );
    }

    return (
      booking.ownerType === OwnerTypeEnum.USER &&
      String(booking.ownerId?._id || booking.ownerId) === String(authUser.userId)
    );
  }

  async createReview(req: Request, res: Response) {
    const authUser = (req as any).user;
    const bookingId = String(req.body.bookingId || "");
    const rating = normalizeRating(req.body.rating);
    const criteria = normalizeCriteria(req.body.criteria);
    const comment = normalizeComment(req.body.comment);
    const images = normalizeImages(req.body.images);

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw ErrorHelper.requestDataInvalid("Booking không hợp lệ.");
    }

    const booking = await BookingModel.findOne({
      _id: bookingId,
      userId: authUser.userId,
      isDeleted: false,
    } as any)
      .populate("carId", "name")
      .populate("businessId", "businessName")
      .populate("ownerId", "name businessName");

    if (!booking) {
      throw ErrorHelper.permissionDeny();
    }

    if (booking.status !== BookingStatusEnum.COMPLETED) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn chỉ có thể đánh giá sau khi chuyến thuê đã hoàn tất.",
      );
    }

    const reviewDeadline = getReviewDeadline(booking);
    if (Date.now() > reviewDeadline.getTime()) {
      throw ErrorHelper.requestDataInvalid(
        "Đã quá thời hạn 30 ngày để đánh giá chuyến thuê này.",
      );
    }

    const existedReview = await ReviewModel.findOne({
      bookingId: booking._id,
      renterId: authUser.userId,
    });

    if (existedReview) {
      throw ErrorHelper.requestDataInvalid("Bạn đã đánh giá booking này.");
    }

    const plainBooking = booking.toObject() as any;
    const review = await ReviewModel.create({
      bookingId: booking._id,
      carId: plainBooking.carId?._id || plainBooking.carId,
      renterId: authUser.userId,
      ownerId: plainBooking.ownerId?._id || plainBooking.ownerId,
      ownerType: plainBooking.ownerType || OwnerTypeEnum.BUSINESS,
      ownerModel:
        (plainBooking.ownerType || OwnerTypeEnum.BUSINESS) === OwnerTypeEnum.USER
          ? "User"
          : "Business",
      rating,
      criteria,
      comment,
      images,
      status: ReviewStatusEnum.VISIBLE,
      reviewerNameSnapshot: authUser.name || plainBooking.renterInfo?.fullName || "",
      carNameSnapshot: plainBooking.carId?.name || "",
      ownerNameSnapshot: getOwnerName(plainBooking),
    });
    void notificationCenterService.notifyReviewCreated(review, authUser.userId);

    return res.status(201).json({
      status: 201,
      code: "201",
      success: true,
      message: "Cảm ơn bạn đã đánh giá chuyến thuê.",
      data: { review: formatReview(review) },
    });
  }

  async updateReview(req: Request, res: Response) {
    const authUser = (req as any).user;
    const reviewId = String(req.params.id || "");

    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      throw ErrorHelper.requestDataInvalid("Đánh giá không hợp lệ.");
    }

    const review = await ReviewModel.findOne({
      _id: reviewId,
      renterId: authUser.userId,
    });

    if (!review) throw ErrorHelper.permissionDeny();
    if (review.status === ReviewStatusEnum.HIDDEN) {
      throw ErrorHelper.requestDataInvalid("Đánh giá đã bị ẩn nên không thể chỉnh sửa.");
    }
    if (!isEditable(review)) {
      throw ErrorHelper.requestDataInvalid(
        "Đánh giá chỉ được chỉnh sửa trong vòng 24 giờ sau khi gửi.",
      );
    }

    review.rating = normalizeRating(req.body.rating);
    review.criteria = normalizeCriteria(req.body.criteria) as any;
    review.comment = normalizeComment(req.body.comment);
    review.images = normalizeImages(req.body.images);
    await review.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "Đã cập nhật đánh giá.",
      data: { review: formatReview(review) },
    });
  }

  async getBookingReview(req: Request, res: Response) {
    const authUser = (req as any).user;
    const bookingId = String(req.params.bookingId || "");

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw ErrorHelper.requestDataInvalid("Booking không hợp lệ.");
    }

    const booking = await BookingModel.findOne({
      _id: bookingId,
      isDeleted: false,
    });

    if (!booking) throw ErrorHelper.recordNotFound("Booking");

    const canView = await this.canViewBookingReview(authUser, booking);
    if (!canView) throw ErrorHelper.permissionDeny();

    const review = await ReviewModel.findOne({
      bookingId,
      renterId: booking.userId,
    }).lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "success",
      data: {
        review: review ? formatReview(review) : null,
        reviewDeadline: getReviewDeadline(booking),
      },
    });
  }

  async markHelpful(req: Request, res: Response) {
    const authUser = (req as any).user;
    const reviewId = String(req.params.id || "");

    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      throw ErrorHelper.requestDataInvalid("Đánh giá không hợp lệ.");
    }

    const review = await ReviewModel.findOne({
      _id: reviewId,
      status: { $ne: ReviewStatusEnum.HIDDEN },
    });
    if (!review) throw ErrorHelper.recordNotFound("Review");

    if (String(review.renterId) === String(authUser.userId)) {
      throw ErrorHelper.requestDataInvalid("Bạn không thể đánh dấu đánh giá của chính mình.");
    }

    const exists = (review.helpfulBy || []).some(
      (userId) => String(userId) === String(authUser.userId),
    );
    if (!exists) {
      review.helpfulBy = [...(review.helpfulBy || []), authUser.userId];
      review.helpfulCount = review.helpfulBy.length;
      await review.save();
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "Đã đánh dấu hữu ích.",
      data: { review: formatReview(review) },
    });
  }

  async unmarkHelpful(req: Request, res: Response) {
    const authUser = (req as any).user;
    const reviewId = String(req.params.id || "");

    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      throw ErrorHelper.requestDataInvalid("Đánh giá không hợp lệ.");
    }

    const review = await ReviewModel.findOne({
      _id: reviewId,
      status: { $ne: ReviewStatusEnum.HIDDEN },
    });
    if (!review) throw ErrorHelper.recordNotFound("Review");

    const helpfulBy = (review.helpfulBy || []).filter(
      (userId) => String(userId) !== String(authUser.userId),
    ) as any;
    review.helpfulBy = helpfulBy;
    review.helpfulCount = helpfulBy.length;
    await review.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "Đã bỏ đánh dấu hữu ích.",
      data: { review: formatReview(review) },
    });
  }
}

export default new ReviewRoute().router;
