import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { getBookingDisplayCode } from "../../helper/booking-code.helper";
import {
  UserModel,
  getIdentityVerificationStatus,
  hasCompleteIdentityProfile,
} from "../../models/user/user.model";
import { CarModel } from "../../models/car/car.model";
import { BookingModel } from "../../models/booking/booking.model";
import { ContractModel } from "../../models/contract/contract.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { ReviewModel, ReviewStatusEnum } from "../../models/review/review.model";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import {
  BookingStatusEnum,
  ContractStatusEnum,
  IdentityVerificationStatusEnum,
  PaymentStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { notificationCenterService } from "../../services/notification-center.service";
const ACTIVE_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED,
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];
const ADMIN_USER_SECRET_FIELDS = [
  "-password",
  "-otpCode",
  "-otpExpireAt",
  "-resetPasswordOtpHash",
  "-resetPasswordOtpExpiresAt",
  "-resetPasswordOtpVerified",
  "-resetPasswordOtpVerifiedAt",
  "-resetPasswordOtpAttempts",
  "-resetPasswordTokenHash",
  "-resetPasswordTokenExpiresAt",
].join(" ");

class AdminRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/users",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getUsers),
    );

    this.router.get(
      "/users/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getUserDetail),
    );

    this.router.post(
      "/users/:id/identity/approve",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.approveUserIdentity),
    );

    this.router.post(
      "/users/:id/identity/reject",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.rejectUserIdentity),
    );

    this.router.post(
      "/users/block/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.blockUser),
    );

    this.router.post(
      "/users/unblock/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.unblockUser),
    );

    this.router.delete(
      "/users/delete/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.deleteUser),
    );
    this.router.get(
      "/cars/map",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getCarsMap),
    );
    this.router.get(
      "/reviews",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getReviews),
    );

    this.router.patch(
      "/reviews/:id/hide",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.hideReview),
    );

    this.router.patch(
      "/reviews/:id/show",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.showReview),
    );
  }



  private assertObjectId(id: string, message: string) {
    if (!/^[a-f\d]{24}$/i.test(id)) {
      throw ErrorHelper.requestDataInvalid(message);
    }
  }

  private toAdminReviewItem(review: any) {
    return {
      id: review._id,
      bookingId: review.bookingId?._id || review.bookingId,
      bookingCode: getBookingDisplayCode(review.bookingId),
      carName: review.carNameSnapshot || review.carId?.name || "Xe",
      licensePlate: review.carId?.licensePlate || "",
      renterName: review.reviewerNameSnapshot || review.renterId?.name || "Khách thuê",
      renterEmail: review.renterId?.email || "",
      renterAvatar: review.renterId?.avatar || "",
      rating: review.rating,
      criteria: review.criteria || {},
      comment: review.comment || "",
      images: review.images || [],
      helpfulCount: Number(review.helpfulCount || 0),
      ownerReply: review.ownerReply || null,
      status: review.status,
      report: review.report || null,
      hiddenReason: review.hiddenReason || "",
      hiddenAt: review.hiddenAt,
      createdAt: review.createdAt,
    };
  }

  private getOwnerName(car: any) {
    return car.ownerId?.name || "--";
  }

  private getOwnerEmail(car: any) {
    return car.ownerId?.email || "";
  }

  private getOwnerAddress(car: any) {
    return car.ownerId?.address || "";
  }
  private getOwnerPhone(car: any) {
  return car.ownerId?.phone || "";
}

private toAdminMapCar(car: any) {
  return {
    _id: car._id,
    name: car.name,
    brandName: car.brandId?.name || "",
    licensePlate: car.licensePlate || "",

    pickupAddress: car.pickupAddress || car.address || "",
    pickupFormattedAddress:
      car.pickupFormattedAddress ||
      car.pickupAddress ||
      car.address ||
      "",

    pickupLat: car.pickupLat,
    pickupLng: car.pickupLng,
    pickupNote: car.pickupNote || car.locationNote || "",

    status: car.status,
    car_status: car.status,
    approval_status: car.status,

    // compatibility tạm thời cho frontend
    ownerType: UserRoleEnum.USER,
    ownerName: this.getOwnerName(car),
    ownerEmail: this.getOwnerEmail(car),
    ownerAddress: this.getOwnerAddress(car),
    ownerPhone: this.getOwnerPhone(car),

    images: [],
    lastLocationUpdatedAt: car.lastLocationUpdatedAt,
    locationUpdateCount: car.locationUpdateCount || 0,
  };
}
async getCarsMap(req: Request, res: Response) {
  const cars = await CarModel.find({
    isDeleted: false,
  } as any)
    .select(
      [
        "_id",
        "name",
        "licensePlate",
        "brandId",
        "ownerId",
        "pickupAddress",
        "pickupFormattedAddress",
        "pickupLat",
        "pickupLng",
        "pickupNote",
        "address",
        "locationNote",
        "status",
        "lastLocationUpdatedAt",
        "locationUpdateCount",
      ].join(" "),
    )
    .populate("brandId", "name")
    .populate("ownerId", "name email phone address")
    .sort({ updatedAt: -1 })
    .lean();

  return res.status(200).json({
    status: 200,
    code: "200",
    message: "success",
    data: {
      cars: cars.map((car) => this.toAdminMapCar(car)),
    },
  });
}
  async getReviews(req: Request, res: Response) {
    const status = String(req.query.status || "");
    const filter: any = {};

    if (status && Object.values(ReviewStatusEnum).includes(status as ReviewStatusEnum)) {
      filter.status = status;
    }

    const reviews = await ReviewModel.find(filter)
      .populate("bookingId", "_id bookingCode")
      .populate("carId", "name licensePlate")
      .populate("renterId", "name email avatar")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { reviews: reviews.map((review) => this.toAdminReviewItem(review)) },
    });
  }

  async hideReview(req: Request, res: Response) {
    const authUser = (req as any).user;
    const reviewId = String(req.params.id || "");
    this.assertObjectId(reviewId, "Đánh giá không hợp lệ");

    const review = await ReviewModel.findById(reviewId);
    if (!review) throw ErrorHelper.recordNotFound("Review");

    review.status = ReviewStatusEnum.HIDDEN;
    review.hiddenReason = String(req.body.reason || "Nội dung vi phạm quy định").trim();
    review.hiddenBy = authUser.userId;
    review.hiddenAt = new Date();
    await review.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã ẩn đánh giá",
      data: { review },
    });
  }

  async showReview(req: Request, res: Response) {
    const reviewId = String(req.params.id || "");
    this.assertObjectId(reviewId, "Đánh giá không hợp lệ");

    const review = await ReviewModel.findById(reviewId);
    if (!review) throw ErrorHelper.recordNotFound("Review");

    review.status = ReviewStatusEnum.VISIBLE;
    review.hiddenReason = "";
    review.hiddenBy = undefined as any;
    (review as any).hiddenAt = undefined;
    await review.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã hiển thị lại đánh giá",
      data: { review },
    });
  }
  async getUsers(req: Request, res: Response) {
    const { role, keyword, isBlocked } = req.query;

    const filter: any = {
      isDeleted: false,
      role: { $ne: UserRoleEnum.ADMIN },
    };

    if (role) filter.role = role;
    if (typeof isBlocked !== "undefined") {
      filter.isBlocked = isBlocked === "true";
    }

    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { email: { $regex: keyword, $options: "i" } },
        { phone: { $regex: keyword, $options: "i" } },
      ];
    }

    const users = await UserModel.find(filter)
      .select(ADMIN_USER_SECRET_FIELDS)
      .populate("blockedBy", "name email role")
      .populate("deletedBy", "name email role")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { users: users.map((user) => this.toAdminUser(user)) },
    });
  }

  private maskIdentityNumber(value: unknown) {
    const normalized = String(value || "").trim();
    if (!normalized) return "";

    return `${"*".repeat(Math.max(normalized.length - 3, 0))}${normalized.slice(-3)}`;
  }

  private toAdminUser(user: any) {
    const payload = user?.toObject ? user.toObject() : { ...(user || {}) };
    const hasCccdNumber = Object.prototype.hasOwnProperty.call(payload, "cccdNumber");
    const hasDriverLicenseNumber = Object.prototype.hasOwnProperty.call(
      payload,
      "driverLicenseNumber",
    );

    return {
      ...payload,
      ...(hasCccdNumber
        ? { cccdNumber: this.maskIdentityNumber(payload.cccdNumber) }
        : {}),
      ...(hasDriverLicenseNumber
        ? {
            driverLicenseNumber: this.maskIdentityNumber(
              payload.driverLicenseNumber,
            ),
          }
        : {}),
      identityVerificationStatus: getIdentityVerificationStatus(payload),
    };
  }

  async getUserDetail(req: Request, res: Response) {
    const id = String(req.params.id || "");
    this.assertObjectId(id, "ID người dùng không hợp lệ");

    const user = await UserModel.findOne({
      _id: id,
      isDeleted: false,
      role: { $ne: UserRoleEnum.ADMIN },
    })
      .select(
        [
          ADMIN_USER_SECRET_FIELDS,
          "+cccdNumber",
          "+cccdFrontImage",
          "+cccdBackImage",
          "+driverLicenseNumber",
          "+driverLicenseImage",
        ].join(" "),
      )
      .populate("blockedBy", "name email role")
      .populate("deletedBy", "name email role");

    if (!user) {
      throw ErrorHelper.recordNotFound("Không tìm thấy người dùng");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { user: this.toAdminUser(user) },
    });
  }

  async approveUserIdentity(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id || "");
    this.assertObjectId(id, "ID người dùng không hợp lệ");

    const user = await UserModel.findOne({
      _id: id,
      role: UserRoleEnum.USER,
      isDeleted: false,
    }).select(
      "+cccdNumber +cccdFrontImage +cccdBackImage +driverLicenseNumber +driverLicenseImage",
    );

    if (!user) throw ErrorHelper.recordNotFound("Không tìm thấy người dùng");
    if (!hasCompleteIdentityProfile(user)) {
      throw ErrorHelper.requestDataInvalid("Hồ sơ chưa đủ CCCD và giấy phép lái xe để duyệt");
    }
    if (getIdentityVerificationStatus(user) !== IdentityVerificationStatusEnum.PENDING) {
      throw ErrorHelper.requestDataInvalid("Chỉ có thể duyệt hồ sơ đang chờ xác minh");
    }

    user.identityProfileCompleted = true;
    user.identityVerificationStatus = IdentityVerificationStatusEnum.VERIFIED;
    user.set("identityVerificationReason", undefined);
    user.identityReviewedAt = new Date();
    user.identityReviewedBy = authUser.userId;
    await user.save();

    void notificationCenterService.notifyIdentityVerified(user, authUser.userId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã xác minh hồ sơ định danh",
      data: { user: this.toAdminUser(user) },
    });
  }

  async rejectUserIdentity(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id || "");
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    this.assertObjectId(id, "ID người dùng không hợp lệ");

    if (!reason) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập lý do từ chối hồ sơ");
    }

    const user = await UserModel.findOne({
      _id: id,
      role: UserRoleEnum.USER,
      isDeleted: false,
    }).select(
      "+cccdNumber +cccdFrontImage +cccdBackImage +driverLicenseNumber +driverLicenseImage",
    );

    if (!user) throw ErrorHelper.recordNotFound("Không tìm thấy người dùng");
    if (!hasCompleteIdentityProfile(user)) {
      throw ErrorHelper.requestDataInvalid("Hồ sơ chưa đủ CCCD và giấy phép lái xe để từ chối");
    }
    if (getIdentityVerificationStatus(user) !== IdentityVerificationStatusEnum.PENDING) {
      throw ErrorHelper.requestDataInvalid("Chỉ có thể từ chối hồ sơ đang chờ xác minh");
    }

    user.identityVerificationStatus = IdentityVerificationStatusEnum.REJECTED;
    user.identityVerificationReason = reason;
    user.identityReviewedAt = new Date();
    user.identityReviewedBy = authUser.userId;
    await user.save();

    void notificationCenterService.notifyIdentityRejected(user, reason, authUser.userId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã từ chối hồ sơ định danh",
      data: { user: this.toAdminUser(user) },
    });
  }

  private async checkUserHasActiveBooking(userId: string) {
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      userId,
      status: { $in: ACTIVE_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    return !!booking;
  }
  private async hideCarsByAdmin(filter: Record<string, unknown>) {
    await CarModel.updateMany(
      filter as any,
      {
        hiddenByAdmin: true,
        isHidden: true,
      } as any,
    );
  }

  private async restoreCarsAfterAdminUnblock(filter: Record<string, unknown>) {
    const cars = await CarModel.find(filter as any).select("_id hiddenByOwner");

    if (cars.length === 0) {
      return;
    }

    await CarModel.bulkWrite(
      cars.map((car) => ({
        updateOne: {
          filter: { _id: car._id },
          update: {
            $set: {
              hiddenByAdmin: false,
              isHidden: Boolean((car as any).hiddenByOwner),
            },
          } as any,
        },
      })),
    );
  }

private getUserOwnedCarFilter(userId: string) {
  return {
    ownerId: userId,
    isDeleted: false,
  } as any;
}

  private async checkUserOwnedCarsHaveActiveWork(userId: string) {
    await expireAbandonedPendingBookings();

    const carIds = await CarModel.distinct("_id", {
      ownerId: userId,
      isDeleted: false,
    } as any);

    if (carIds.length === 0) {
      return false;
    }

    const [activeBooking, activeContract, bookingIds] = await Promise.all([
      BookingModel.findOne({
        carId: { $in: carIds },
        status: { $in: ACTIVE_BOOKING_STATUSES },
        isDeleted: false,
      } as any).select("_id"),
      ContractModel.findOne({
        carId: { $in: carIds },
        status: ContractStatusEnum.ACTIVE,
        isDeleted: false,
      } as any).select("_id"),
      BookingModel.distinct("_id", {
        carId: { $in: carIds },
        isDeleted: false,
      } as any),
    ]);

    if (activeBooking || activeContract) {
      return true;
    }

    if (bookingIds.length === 0) {
      return false;
    }

    const pendingPayment = await PaymentModel.findOne({
      bookingId: { $in: bookingIds },
      status: PaymentStatusEnum.PENDING,
    } as any).select("_id");

    return !!pendingPayment;
  }

  async blockUser(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { reason } = req.body;

    if (!reason) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập lý do khóa tài khoản");
    }

    const user = await UserModel.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.requestDataInvalid(
        "Tài khoản đăng nhập không còn tồn tại. .",
      );
    }

    if (user.role === UserRoleEnum.ADMIN) {
      throw ErrorHelper.permissionDeny();
    }

    const hasActiveBooking = await this.checkUserHasActiveBooking(id);

    if (hasActiveBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Không thể khóa tài khoản đang có booking hoạt động",
      );
    }

    if (user.role === UserRoleEnum.USER) {
      const hasActiveConsignmentWork =
        await this.checkUserOwnedCarsHaveActiveWork(id);

      if (hasActiveConsignmentWork) {
        throw ErrorHelper.requestDataInvalid(
          "Không thể khóa tài khoản đang có xe ký gửi phát sinh booking, hợp đồng hoặc thanh toán chưa đóng",
        );
      }

    }

    user.isBlocked = true;
    user.blockedReason = reason;
    user.blockedAt = new Date();
    user.blockedBy = authUser.userId;

    await user.save();

    if (user.role === UserRoleEnum.USER) {
      await this.hideCarsByAdmin(
        this.getUserOwnedCarFilter (String(user._id)),
      );
    }
    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Khóa tài khoản thành công",
      data: { user },
    });
  }

  async unblockUser(req: Request, res: Response) {
    const id = String(req.params.id);

    const user = await UserModel.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!user) {
      throw ErrorHelper.requestDataInvalid(
        "Tài khoản đăng nhập không còn tồn tại. ",
      );
    }

    if (user.role === UserRoleEnum.ADMIN) {
      throw ErrorHelper.permissionDeny();
    }

    user.isBlocked = false;
    user.blockedReason = "";
    user.set("blockedAt", undefined);
    user.set("blockedBy", undefined);

    await user.save();

    if (user.role === UserRoleEnum.USER) {
      await this.restoreCarsAfterAdminUnblock(
        this.getUserOwnedCarFilter (String(user._id)),
      );
    }
    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Mở khóa tài khoản thành công",
      data: { user },
    });
  }

  async deleteUser(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { reason } = req.body;

    if (!reason) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập lý do xóa tài khoản");
    }

    const user = await UserModel.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!user) throw ErrorHelper.userNotExist();

    if (user.role === UserRoleEnum.ADMIN) {
      throw ErrorHelper.permissionDeny();
    }

    const hasActiveBooking = await this.checkUserHasActiveBooking(id);

    if (hasActiveBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Không thể xóa tài khoản đang có booking hoạt động",
      );
    }

    if (user.role === UserRoleEnum.USER) {
      const hasActiveConsignmentWork =
        await this.checkUserOwnedCarsHaveActiveWork(id);

      if (hasActiveConsignmentWork) {
        throw ErrorHelper.requestDataInvalid(
          "Không thể xóa tài khoản đang có xe ký gửi phát sinh booking, hợp đồng hoặc thanh toán chưa đóng",
        );
      }

      await CarModel.updateMany(
        this.getUserOwnedCarFilter(id),
        {
          isDeleted: true,
          isHidden: true,
          hiddenByAdmin: true,
        } as any,
      );
    }
    user.isDeleted = true;
    user.deletedReason = reason;
    user.deletedAt = new Date();
    user.deletedBy = authUser.userId;

    await user.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xóa mềm tài khoản thành công",
      data: { user },
    });
  }
}
export default new AdminRoute().router;
