import mongoose, { type ClientSession } from "mongoose";

import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import {
  BookingExtensionStatusEnum,
  BookingStatusEnum,
  OwnerTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { assertCarAvailability } from "../../helper/car-availability.helper";
import {
  ACTIVE_BOOKING_EXTENSION_STATUSES,
  assertBookingExtensionDuration,
  calculateBookingExtensionPrice,
  expireStaleBookingExtensions,
  getBookingExtensionPaymentDeadline,
} from "../../helper/booking-extension.helper";
import {
  sendBookingExtensionApprovedMail,
  sendBookingExtensionRejectedMail,
  sendBookingExtensionRequestedMail,
} from "../../helper/mail.helper";
import { BookingExtensionModel } from "../../models/booking-extension/bookingExtension.model";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { CarModel } from "../../models/car/car.model";
import { notificationCenterService } from "../../services/notification-center.service";

const OWNER_ROLES = [UserRoleEnum.BUSINESS, UserRoleEnum.USER];
const RENTER_ROLES = [UserRoleEnum.USER];

class BookingExtensionRoute extends BaseRoute {
  customRouting() {
    this.router.post(
      "/bookings/:bookingId/quote",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.quoteExtension),
    );
    this.router.post(
      "/bookings/:bookingId/request",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.requestExtension),
    );
    this.router.get(
      "/bookings/:bookingId",
      [this.authentication, this.roleGuard(OWNER_ROLES)],
      this.route(this.getBookingExtensions),
    );
    this.router.patch(
      "/:id/cancel",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.cancelExtension),
    );
    this.router.patch(
      "/:id/approve",
      [this.authentication, this.roleGuard(OWNER_ROLES)],
      this.route(this.approveExtension),
    );
    this.router.patch(
      "/:id/reject",
      [this.authentication, this.roleGuard(OWNER_ROLES)],
      this.route(this.rejectExtension),
    );
  }

  private async getOwnerContext(authUser: any, session?: ClientSession) {
    if (authUser.role === UserRoleEnum.BUSINESS) {
      const query = BusinessModel.findOne({
        userId: authUser.userId,
        isDeleted: false,
      }).select("_id");
      if (session) query.session(session);
      const business = await query;

      if (!business) throw ErrorHelper.recordNotFound("Doanh nghiệp");
      return { ownerId: business._id, ownerType: OwnerTypeEnum.BUSINESS };
    }

    return { ownerId: authUser.userId, ownerType: OwnerTypeEnum.USER };
  }

  private async findOwnerBooking(
    bookingId: string,
    authUser: any,
    session?: ClientSession,
  ) {
    const owner = await this.getOwnerContext(authUser, session);
    const query = BookingModel.findOne({
      _id: bookingId,
      ownerId: owner.ownerId,
      ownerType: owner.ownerType,
      isDeleted: false,
    });
    if (session) query.session(session);
    const booking = await query;

    if (!booking) throw ErrorHelper.permissionDeny();
    return booking;
  }

  private async findRenterInProgressBooking(
    bookingId: string,
    userId: string,
  ) {
    const booking = await BookingModel.findOne({
      _id: bookingId,
      userId,
      status: BookingStatusEnum.IN_PROGRESS,
      isDeleted: false,
    });

    if (!booking) {
      throw ErrorHelper.requestDataInvalid(
        "Chỉ chuyến thuê đang diễn ra của bạn mới được yêu cầu gia hạn",
      );
    }
    return booking;
  }

  private async buildExtensionQuote(
    bookingId: string,
    userId: string,
    rawRequestedEndAt: unknown,
  ) {
    const requestedEndAt = new Date(String(rawRequestedEndAt || ""));
    if (Number.isNaN(requestedEndAt.getTime())) {
      throw ErrorHelper.requestDataInvalid("Thời gian trả xe mới không hợp lệ");
    }

    const booking = await this.findRenterInProgressBooking(bookingId, userId);
    const oldEndAt = new Date(booking.endDate);
    if (requestedEndAt <= oldEndAt || requestedEndAt <= new Date()) {
      throw ErrorHelper.requestDataInvalid(
        "Thời gian trả xe mới phải sau thời gian trả hiện tại và sau thời điểm hiện tại",
      );
    }

    const quote = await calculateBookingExtensionPrice(
      booking,
      requestedEndAt,
    );
    await assertCarAvailability({
      carId: String(booking.carId),
      start: oldEndAt,
      end: requestedEndAt,
      ignoredBookingId: String(booking._id),
    });
    if (quote.additionalAmount <= 0) {
      throw ErrorHelper.requestDataInvalid("Chi phí gia hạn không hợp lệ");
    }
    return { booking, quote };
  }

  async quoteExtension(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { quote } = await this.buildExtensionQuote(
      String(req.params.bookingId),
      String(authUser.userId),
      req.body?.requestedEndAt,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { quote },
    });
  }

  async requestExtension(req: Request, res: Response) {
    const authUser = (req as any).user;
    const bookingId = String(req.params.bookingId);

    await expireStaleBookingExtensions();
    const { booking, quote } = await this.buildExtensionQuote(
      bookingId,
      String(authUser.userId),
      req.body?.requestedEndAt,
    );

    const activeExtension = await BookingExtensionModel.findOne({
      bookingId: booking._id,
      status: { $in: ACTIVE_BOOKING_EXTENSION_STATUSES },
      isDeleted: false,
    }).select("_id");
    if (activeExtension) {
      throw ErrorHelper.requestDataInvalid(
        "Booking đang có một yêu cầu gia hạn chưa xử lý xong",
      );
    }

    let extension;
    try {
      extension = await BookingExtensionModel.create({
        bookingId: booking._id,
        carId: booking.carId,
        requestedBy: authUser.userId,
        ...quote,
        status: BookingExtensionStatusEnum.REQUESTED,
        requestedAt: new Date(),
        activeLockKey: String(booking._id),
        isDeleted: false,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw ErrorHelper.requestDataInvalid(
          "Booking đang có một yêu cầu gia hạn chưa xử lý xong",
        );
      }
      throw error;
    }

    void notificationCenterService.notifyBookingExtensionRequested(
      extension,
      booking,
      String(authUser.userId),
    );
    void sendBookingExtensionRequestedMail(booking, extension);

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đã gửi yêu cầu gia hạn đến chủ xe",
      data: { extension },
    });
  }

  async getBookingExtensions(req: Request, res: Response) {
    const authUser = (req as any).user;
    const bookingId = String(req.params.bookingId);

    await expireStaleBookingExtensions();
    const isRenter = authUser.role === UserRoleEnum.USER;
    let booking = await BookingModel.findOne({
      _id: bookingId,
      userId: authUser.userId,
      isDeleted: false,
    }).select("_id");

    if (!booking) {
      booking = await this.findOwnerBooking(bookingId, authUser);
    }

    if (!booking || (!isRenter && !booking._id)) {
      throw ErrorHelper.permissionDeny();
    }

    const extensions = await BookingExtensionModel.find({
      bookingId,
      isDeleted: false,
    })
      .populate("paymentId", "amount method status paymentType paidAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { extensions },
    });
  }

  async cancelExtension(req: Request, res: Response) {
    const authUser = (req as any).user;
    const extension = await BookingExtensionModel.findOneAndUpdate(
      {
        _id: String(req.params.id),
        requestedBy: authUser.userId,
        status: BookingExtensionStatusEnum.REQUESTED,
        isDeleted: false,
      },
      {
        $set: { status: BookingExtensionStatusEnum.CANCELLED },
        $unset: { activeLockKey: 1 },
      },
      { new: true },
    );

    if (!extension) {
      throw ErrorHelper.requestDataInvalid(
        "Yêu cầu gia hạn không còn khả dụng để hủy",
      );
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã hủy yêu cầu gia hạn",
      data: { extension },
    });
  }

  async approveExtension(req: Request, res: Response) {
    const authUser = (req as any).user;
    const extension = await BookingExtensionModel.findOne({
      _id: String(req.params.id),
      status: BookingExtensionStatusEnum.REQUESTED,
      isDeleted: false,
    });

    if (!extension) throw ErrorHelper.recordNotFound("Yêu cầu gia hạn");
    const booking = await this.findOwnerBooking(
      String(extension.bookingId),
      authUser,
    );

    if (booking.status !== BookingStatusEnum.IN_PROGRESS) {
      throw ErrorHelper.requestDataInvalid(
        "Booking không còn ở trạng thái đang thuê",
      );
    }
    if (
      new Date(booking.endDate).getTime() !==
      new Date(extension.oldEndAt).getTime()
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Thời gian booking đã thay đổi, không thể duyệt yêu cầu này",
      );
    }

    await expireStaleBookingExtensions();
    const session = await mongoose.startSession();
    let approvedExtension: any;
    let approvedBooking = booking;
    try {
      await session.withTransaction(async () => {
        const lockedCar = await CarModel.findOneAndUpdate(
          { _id: extension.carId, isDeleted: false },
          { $inc: { bookingRevision: 1 } },
          { new: true, session },
        );
        if (!lockedCar) throw ErrorHelper.recordNotFound("Xe");

        approvedBooking = await this.findOwnerBooking(
          String(extension.bookingId),
          authUser,
          session,
        );
        if (approvedBooking.status !== BookingStatusEnum.IN_PROGRESS) {
          throw ErrorHelper.requestDataInvalid(
            "Booking không còn ở trạng thái đang thuê",
          );
        }
        if (
          new Date(approvedBooking.endDate).getTime() !==
          new Date(extension.oldEndAt).getTime()
        ) {
          throw ErrorHelper.requestDataInvalid(
            "Thời gian booking đã thay đổi, không thể duyệt yêu cầu này",
          );
        }

        assertBookingExtensionDuration(
          approvedBooking,
          new Date(extension.requestedEndAt),
        );

        await assertCarAvailability({
          carId: String(extension.carId),
          start: new Date(extension.oldEndAt),
          end: new Date(extension.requestedEndAt),
          ignoredBookingId: String(approvedBooking._id),
          ignoredExtensionId: String(extension._id),
          session,
        });

        approvedExtension = await BookingExtensionModel.findOneAndUpdate(
          {
            _id: extension._id,
            status: BookingExtensionStatusEnum.REQUESTED,
            isDeleted: false,
          },
          {
            $set: {
              status: BookingExtensionStatusEnum.OWNER_APPROVED,
              approvedBy: authUser.userId,
              ownerRespondedAt: new Date(),
              paymentDeadlineAt: getBookingExtensionPaymentDeadline(),
            },
          },
          { new: true, session },
        );
        if (!approvedExtension) {
          throw ErrorHelper.requestDataInvalid(
            "Yêu cầu gia hạn đã được xử lý trước đó",
          );
        }
      });
    } finally {
      await session.endSession();
    }

    void notificationCenterService.notifyBookingExtensionApproved(
      approvedExtension,
      approvedBooking,
      String(authUser.userId),
    );
    void sendBookingExtensionApprovedMail(approvedBooking, approvedExtension);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã duyệt yêu cầu gia hạn",
      data: { extension: approvedExtension },
    });
  }

  async rejectExtension(req: Request, res: Response) {
    const authUser = (req as any).user;
    const rejectReason = String(req.body?.rejectReason || "").trim();
    if (!rejectReason) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập lý do từ chối");
    }

    const extension = await BookingExtensionModel.findOne({
      _id: String(req.params.id),
      status: BookingExtensionStatusEnum.REQUESTED,
      isDeleted: false,
    });
    if (!extension) throw ErrorHelper.recordNotFound("Yêu cầu gia hạn");
    const booking = await this.findOwnerBooking(
      String(extension.bookingId),
      authUser,
    );

    const rejectedExtension = await BookingExtensionModel.findOneAndUpdate(
      {
        _id: extension._id,
        status: BookingExtensionStatusEnum.REQUESTED,
        isDeleted: false,
      },
      {
        $set: {
          status: BookingExtensionStatusEnum.REJECTED,
          approvedBy: authUser.userId,
          ownerRespondedAt: new Date(),
          rejectReason,
        },
        $unset: { activeLockKey: 1 },
      },
      { new: true },
    );
    if (!rejectedExtension) {
      throw ErrorHelper.requestDataInvalid(
        "Yêu cầu gia hạn đã được xử lý trước đó",
      );
    }

    void notificationCenterService.notifyBookingExtensionRejected(
      rejectedExtension,
      booking,
      String(authUser.userId),
    );
    void sendBookingExtensionRejectedMail(booking, rejectedExtension);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã từ chối yêu cầu gia hạn",
      data: { extension: rejectedExtension },
    });
  }
}

export default new BookingExtensionRoute().router;
