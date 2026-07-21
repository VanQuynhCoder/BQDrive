import mongoose from "mongoose";

import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { ReviewModel, ReviewStatusEnum } from "../../models/review/review.model";
import {
  BookingStatusEnum,
  OwnerTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

function normalizeRating(value: unknown) {
  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw ErrorHelper.requestDataInvalid("Vui lòng chọn số sao từ 1 đến 5.");
  }

  return rating;
}

function normalizeComment(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 1000);
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
    const comment = normalizeComment(req.body.comment);

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
      comment,
      status: ReviewStatusEnum.VISIBLE,
      reviewerNameSnapshot: authUser.name || plainBooking.renterInfo?.fullName || "",
      carNameSnapshot: plainBooking.carId?.name || "",
      ownerNameSnapshot: getOwnerName(plainBooking),
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      success: true,
      message: "Cảm ơn bạn đã đánh giá chuyến thuê.",
      data: { review },
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
      data: { review: review || null },
    });
  }
}

export default new ReviewRoute().router;
