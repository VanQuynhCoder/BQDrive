import mongoose from "mongoose";
import type { Namespace } from "socket.io";

import { BookingModel } from "../models/booking/booking.model";
import { getBookingDisplayCode } from "../helper/booking-code.helper";

import { CarModel } from "../models/car/car.model";
import { ExtraChargeModel } from "../models/extra-charge/extraCharge.model";
import {
  INotification,
  NotificationModel,
} from "../models/notification/notification.model";
import {
  NotificationActionKeyEnum,
  NotificationEntityTypeEnum,
  NotificationTypeEnum,
  PaymentTypeEnum,
  UserRoleEnum,
} from "../constants/model.const";

type NotificationInput = {
  recipientId: string | mongoose.Types.ObjectId;
  recipientRole: UserRoleEnum;
  type: NotificationTypeEnum;
  title: string;
  message: string;
  actorId?: string | mongoose.Types.ObjectId | undefined;
  actorRole?: UserRoleEnum | undefined;
  entityType: NotificationEntityTypeEnum;
  entityId?: string | mongoose.Types.ObjectId | undefined;
  bookingId?: string | mongoose.Types.ObjectId | undefined;
  carId?: string | mongoose.Types.ObjectId | undefined;
  actionKey?: NotificationActionKeyEnum | undefined;
  actionUrl?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  dedupeKey: string;
};

type Recipient = {
  recipientId: string;
  recipientRole: UserRoleEnum;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function toId(value: any) {
  return String(value?._id || value || "");
}

function bookingCode(booking: any) {
  return getBookingDisplayCode(booking);
}

function formatCurrency(value: unknown) {
  return `${Math.round(Number(value || 0)).toLocaleString("vi-VN")}đ`;
}

function getCarName(car: any) {
  return car?.name || "Xe BQDrive";
}

function getBookingCarName(booking: any) {
  return getCarName(booking?.carId);
}

function getBookingDateRange(booking: any) {
  const start = booking?.startDate ? DATE_FORMATTER.format(new Date(booking.startDate)) : "";
  const end = booking?.endDate ? DATE_FORMATTER.format(new Date(booking.endDate)) : "";
  return start && end ? `${start} - ${end}` : start || end || "";
}

function sanitizeActionUrl(actionUrl?: string) {
  const value = String(actionUrl || "").trim();

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }

  if (/^(https?:)?\/\//i.test(value)) {
    return undefined;
  }

  return value.slice(0, 500);
}

function pruneMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return {};

  return Object.entries(metadata).reduce<Record<string, unknown>>((result, [key, value]) => {
    if (value === undefined || value === null) return result;
    if (typeof value === "string") result[key] = value.slice(0, 300);
    else if (typeof value === "number" || typeof value === "boolean") result[key] = value;
    return result;
  }, {});
}

class NotificationCenterService {
  private notificationNamespace?: Namespace;

  setNotificationNamespace(namespace: Namespace) {
    this.notificationNamespace = namespace;
  }

  private async hydrateBooking(rawBooking: any) {
    const bookingId = toId(rawBooking);
    if (!bookingId) return rawBooking;

    return (
  (await BookingModel.findById(bookingId)
    .populate("carId", "name licensePlate images")
    .populate("ownerId", "name")
    .lean()) || rawBooking
);
  }

  private async hydrateCar(rawCar: any) {
    const carId = toId(rawCar);
    if (!carId) return rawCar;

    return (
  (await CarModel.findById(carId)
    .populate("ownerId", "name")
    .lean()) || rawCar
);
  }

  private async getOwnerRecipientFromBooking(
  booking: any,
): Promise<Recipient | null> {
  const recipientId = toId(booking?.ownerId);

  return recipientId
    ? {
        recipientId,
        recipientRole: UserRoleEnum.USER,
      }
    : null;
}
  private async getOwnerRecipientFromCar(
  car: any,
): Promise<Recipient | null> {
  const recipientId = toId(car?.ownerId);

  return recipientId
    ? {
        recipientId,
        recipientRole: UserRoleEnum.USER,
      }
    : null;
}

 private getOwnerActionUrl(booking: any) {
  const id = toId(booking);
  return `/consignment/bookings?bookingId=${id}`;
}

  private getOwnerCarActionUrl(car: any) {
  const id = toId(car);
  return `/consignment/cars?carId=${id}`;
}

  async createNotification(input: NotificationInput) {
    const actionUrl = sanitizeActionUrl(input.actionUrl);

    const payload: any = {
      recipientId: input.recipientId,
      recipientRole: input.recipientRole,
      type: input.type,
      title: input.title.trim().slice(0, 160),
      message: input.message.trim().slice(0, 1000),
      entityType: input.entityType,
      metadata: pruneMetadata(input.metadata),
      dedupeKey: input.dedupeKey,
    };

    if (input.actorId) payload.actorId = input.actorId;
    if (input.actorRole) payload.actorRole = input.actorRole;
    if (input.entityId) payload.entityId = input.entityId;
    if (input.bookingId) payload.bookingId = input.bookingId;
    if (input.carId) payload.carId = input.carId;
    if (input.actionKey) payload.actionKey = input.actionKey;
    if (actionUrl) payload.actionUrl = actionUrl;

    const notification = await NotificationModel.create(payload);

    this.notificationNamespace
      ?.to(`user:${String(notification.recipientId)}`)
      .emit("notification_created", {
        notification: notification.toObject(),
      });

    if (notification.type === NotificationTypeEnum.BOOKING_REJECTED) {
      this.notificationNamespace
        ?.to(`user:${String(notification.recipientId)}`)
        .emit("booking_rejected", {
          notification: notification.toObject(),
        });
    }

    return notification;
  }

  async createNotificationSafely(input: NotificationInput) {
    try {
      return await this.createNotification(input);
    } catch (error: any) {
      if (error?.code === 11000) {
        return null;
      }

      console.warn("[NotificationCenter] create failed", error?.message || error);
      return null;
    }
  }

  async createNotificationsSafely(inputs: NotificationInput[]) {
    await Promise.all(inputs.map((input) => this.createNotificationSafely(input)));
  }

  async getNotifications(
    authUser: any,
    query: {
      page?: number;
      limit?: number;
      isRead?: boolean | undefined;
      type?: NotificationTypeEnum | undefined;
    },
  ) {
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 50);
    const filter: any = {
      recipientId: authUser.userId,
      isDeleted: false,
    };

    if (typeof query.isRead === "boolean") {
      filter.isRead = query.isRead;
    }

    if (query.type) {
      filter.type = query.type;
    }

    const [items, total, unreadCount] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificationModel.countDocuments(filter),
      NotificationModel.countDocuments({
        recipientId: authUser.userId,
        isRead: false,
        isDeleted: false,
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
      unreadCount,
    };
  }

  async getUnreadCount(authUser: any) {
    return NotificationModel.countDocuments({
      recipientId: authUser.userId,
      isRead: false,
      isDeleted: false,
    });
  }

  async markRead(authUser: any, notificationId: string) {
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      recipientId: authUser.userId,
      isDeleted: false,
    });

    if (!notification) return null;

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    return notification;
  }

  async markAllRead(authUser: any) {
    const result = await NotificationModel.updateMany(
      {
        recipientId: authUser.userId,
        isRead: false,
        isDeleted: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
    );

    return { modifiedCount: result.modifiedCount || 0 };
  }

  async deleteNotification(authUser: any, notificationId: string) {
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      recipientId: authUser.userId,
      isDeleted: false,
    });

    if (!notification) return null;

    notification.isDeleted = true;
    notification.deletedAt = new Date();
    await notification.save();
    return notification;
  }

  async notifyBookingCreated(rawBooking: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    const owner = await this.getOwnerRecipientFromBooking(booking);
    if (!owner) return;

    await this.createNotificationSafely({
      ...owner,
      type: NotificationTypeEnum.BOOKING_CREATED,
      title: "Có yêu cầu thuê xe mới",
      message: `Mã đặt xe ${bookingCode(booking)} cho xe ${getBookingCarName(booking)} đang chờ bạn xác nhận.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: this.getOwnerActionUrl(booking),
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
        dateRange: getBookingDateRange(booking),
      },
      dedupeKey: `booking-created:${toId(booking)}`,
    });
  }

  async notifyIdentityVerified(user: any, actorId?: string) {
    const userId = toId(user);
    if (!userId) return;

    await this.createNotificationSafely({
      recipientId: userId,
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.IDENTITY_VERIFIED,
      title: "Hồ sơ định danh đã được xác minh",
      message: "Hồ sơ CCCD và giấy phép lái xe của bạn đã được BQDrive xác minh. Bạn có thể tạo booking mới.",
      actorId,
      actorRole: UserRoleEnum.ADMIN,
      entityType: NotificationEntityTypeEnum.USER,
      entityId: userId,
      actionKey: NotificationActionKeyEnum.VIEW_PROFILE,
      actionUrl: "/profile",
      dedupeKey: `identity-verified:${userId}:${new Date(user?.identityReviewedAt || Date.now()).getTime()}`,
    });
  }

  async notifyIdentityRejected(user: any, reason: string, actorId?: string) {
    const userId = toId(user);
    if (!userId) return;

    await this.createNotificationSafely({
      recipientId: userId,
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.IDENTITY_REJECTED,
      title: "Hồ sơ định danh chưa được chấp nhận",
      message: `BQDrive cần bạn cập nhật lại giấy tờ: ${String(reason || "").trim()}`,
      actorId,
      actorRole: UserRoleEnum.ADMIN,
      entityType: NotificationEntityTypeEnum.USER,
      entityId: userId,
      actionKey: NotificationActionKeyEnum.VIEW_PROFILE,
      actionUrl: "/profile",
      dedupeKey: `identity-rejected:${userId}:${new Date(user?.identityReviewedAt || Date.now()).getTime()}`,
    });
  }

  async notifyBookingApproved(rawBooking: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.BOOKING_APPROVED,
      title: "Booking đã được chủ xe duyệt",
      message: `Mã đặt xe ${bookingCode(booking)} cho xe ${getBookingCarName(booking)} đã được duyệt. Bạn có thể tiếp tục thanh toán.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.PAY_REMAINING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
        remainingAmount: Number(booking.remainingAmount || 0),
      },
      dedupeKey: `booking-approved:${toId(booking)}`,
    });
  }

  async notifyBookingMessage(
    rawBooking: any,
    senderId: string,
    message: {
      _id?: string;
      content?: string;
      sender?: { name?: string };
    },
  ) {
    const booking = await this.hydrateBooking(rawBooking);
    const sender = toId(senderId);
    const renterId = toId(booking.userId);
    const ownerId = toId(booking.ownerId);
    const recipientId = sender === renterId ? ownerId : renterId;

    if (!sender || !recipientId || recipientId === sender) return;

    const senderName = String(message.sender?.name || "Người dùng BQDrive").trim();
    const content = String(message.content || "").trim();
    const bookingId = toId(booking);
    const actionUrl = recipientId === ownerId
      ? this.getOwnerActionUrl(booking)
      : `/bookings/${bookingId}`;

    await this.createNotificationSafely({
      recipientId,
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.BOOKING_MESSAGE,
      title: `Tin nhắn mới từ ${senderName}`,
      message: `${senderName}: ${content}`,
      actorId: sender,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING,
      entityId: bookingId,
      bookingId,
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl,
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
        senderName,
      },
      dedupeKey: `booking-message:${toId(message._id)}`,
    });
  }

  async notifyBookingRejected(rawBooking: any, reason?: string, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.BOOKING_REJECTED,
      title: "Booking đã bị từ chối",
      message: `Mã đặt xe ${bookingCode(booking)} cho xe ${getBookingCarName(booking)} đã bị từ chối${reason ? `: ${reason}` : "."}`,
      actorId,
   actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}?recommendation=1`,
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
        reason: reason || "",
        recommendationAvailable: true,
      },
      dedupeKey: `booking-rejected:${toId(booking)}`,
    });
  }

  async notifyBookingCancelled(rawBooking: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    const owner = await this.getOwnerRecipientFromBooking(booking);
    const cancelledByRole = booking?.cancelledByRole || UserRoleEnum.USER;
    const ownerCancelled =
      cancelledByRole !== UserRoleEnum.USER ||
      toId(booking.cancelledBy) !== toId(booking.userId);

    if (ownerCancelled) {
      await this.createNotificationSafely({
        recipientId: toId(booking.userId),
        recipientRole: UserRoleEnum.USER,
        type: NotificationTypeEnum.BOOKING_CANCELLED,
        title: "Chủ xe đã hủy booking",
        message: `Mã đặt xe ${bookingCode(booking)} cho xe ${getBookingCarName(booking)} đã được chủ xe hủy. Nếu bạn đã thanh toán, yêu cầu hoàn tiền sẽ được xử lý theo chính sách.`,
        actorId,
       actorRole: UserRoleEnum.USER,
        entityType: NotificationEntityTypeEnum.BOOKING,
        entityId: toId(booking),
        bookingId: toId(booking),
        carId: toId(booking.carId),
        actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
        actionUrl: `/bookings/${toId(booking)}`,
        metadata: {
          bookingCode: bookingCode(booking),
          carName: getBookingCarName(booking),
        },
        dedupeKey: `booking-cancelled:${toId(booking)}:renter`,
      });
      return;
    }
    if (!owner) return;

    await this.createNotificationSafely({
      ...owner,
      type: NotificationTypeEnum.BOOKING_CANCELLED,
      title: "Khách đã hủy booking",
      message: `Mã đặt xe ${bookingCode(booking)} cho xe ${getBookingCarName(booking)} đã được khách hủy.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: this.getOwnerActionUrl(booking),
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
      },
      dedupeKey: `booking-cancelled:${toId(booking)}`,
    });
  }

  async notifyBookingTimeoutCancelled(
    rawBooking: any,
    timeoutType: "OWNER_RESPONSE_TIMEOUT" | "PAYMENT_TIMEOUT",
  ) {
    const booking = await this.hydrateBooking(rawBooking);
    const isOwnerResponseTimeout = timeoutType === "OWNER_RESPONSE_TIMEOUT";

    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.BOOKING_CANCELLED,
      title: isOwnerResponseTimeout
        ? "Yêu cầu thuê xe đã được hủy tự động"
        : "Booking đã được hủy do quá hạn thanh toán",
      message: isOwnerResponseTimeout
        ? `Mã đặt xe ${bookingCode(booking)} cho xe ${getBookingCarName(booking)} đã được hủy vì bên cho thuê không phản hồi trong 10 phút.`
        : `Mã đặt xe ${bookingCode(booking)} cho xe ${getBookingCarName(booking)} đã được hủy vì bạn chưa thanh toán trong 10 phút sau khi chủ xe duyệt.`,
      entityType: NotificationEntityTypeEnum.BOOKING,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
        timeoutType,
      },
      dedupeKey: `booking-timeout:${timeoutType}:${toId(booking)}`,
    });
  }

  async notifyRefundCreated(rawRefund: any, rawBooking?: any) {
    const booking = await this.hydrateBooking(rawBooking || rawRefund?.bookingId);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.PAYMENT_REFUNDED,
      title: "Yêu cầu hoàn tiền đang chờ xử lý",
      message: `Yêu cầu hoàn ${formatCurrency(rawRefund?.refundAmount)} cho mã đặt xe ${bookingCode(booking)} đã được tạo và đang chờ xử lý thủ công.`,
      entityType: NotificationEntityTypeEnum.REFUND,
      entityId: toId(rawRefund),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}?section=refund`,
      metadata: {
        bookingCode: bookingCode(booking),
        amount: Number(rawRefund?.refundAmount || 0),
        refundStatus: String(rawRefund?.status || ""),
      },
      dedupeKey: `refund-created:${toId(rawRefund)}`,
    });
  }

  async notifyRefundRecipientInfoSubmitted(
    rawRefund: any,
    rawBooking?: any,
    actorId?: string,
  ) {
    const booking = await this.hydrateBooking(rawBooking || rawRefund?.bookingId);
    const owner = await this.getOwnerRecipientFromBooking(booking);
    if (!owner) return;

    await this.createNotificationSafely({
      ...owner,
      type: NotificationTypeEnum.REFUND_RECIPIENT_INFO_SUBMITTED,
      title: "Khách đã cung cấp thông tin nhận tiền hoàn",
      message: `Người thuê đã cung cấp thông tin nhận khoản hoàn ${formatCurrency(rawRefund?.refundAmount)} cho mã đặt xe ${bookingCode(booking)}. Vui lòng thực hiện hoàn tiền.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.REFUND,
      entityId: toId(rawRefund),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/consignment/refunds?refundId=${toId(rawRefund)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        amount: Number(rawRefund?.refundAmount || 0),
        refundStatus: String(rawRefund?.status || ""),
      },
      dedupeKey: `refund-recipient-info:${toId(rawRefund)}`,
    });
  }

  async notifyManualRefundSent(rawRefund: any, rawBooking?: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking || rawRefund?.bookingId);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.PAYMENT_REFUNDED,
      title: "Chủ xe đã gửi tiền hoàn",
      message: `Chủ xe đã xác nhận gửi khoản hoàn ${formatCurrency(rawRefund?.refundAmount)} cho mã đặt xe ${bookingCode(booking)}. Vui lòng kiểm tra và xác nhận đã nhận tiền.`,
      actorId,
      actorRole:UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.REFUND,
      entityId: toId(rawRefund),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}?section=refund`,
      metadata: {
        bookingCode: bookingCode(booking),
        amount: Number(rawRefund?.refundAmount || 0),
      },
      dedupeKey: `refund-manual-sent:${toId(rawRefund)}`,
    });
  }

  async notifyRefundSucceeded(rawRefund: any, rawBooking?: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking || rawRefund?.bookingId);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.PAYMENT_REFUNDED,
      title: "Hoàn tiền đã hoàn tất",
      message: `Khoản hoàn ${formatCurrency(rawRefund?.refundAmount)} cho mã đặt xe ${bookingCode(booking)} đã được xác nhận hoàn tất.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.REFUND,
      entityId: toId(rawRefund),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}?section=refund`,
      metadata: {
        bookingCode: bookingCode(booking),
        amount: Number(rawRefund?.refundAmount || 0),
      },
      dedupeKey: `refund-succeeded:${toId(rawRefund)}`,
    });
  }

  async notifyNoShow(rawBooking: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.BOOKING_NO_SHOW,
      title: "Booking được đánh dấu không nhận xe",
      message: `Mã đặt xe ${bookingCode(booking)} cho xe ${getBookingCarName(booking)} đã được chủ xe đánh dấu không nhận xe.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
      },
      dedupeKey: `booking-no-show:${toId(booking)}`,
    });
  }

  async notifyHandoverCompleted(rawBooking: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.HANDOVER_COMPLETED,
      title: "Xe đã được bàn giao",
      message: `Mã đặt xe ${bookingCode(booking)} cho xe ${getBookingCarName(booking)} đã chuyển sang trạng thái đang thuê.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
      },
      dedupeKey: `handover-completed:${toId(booking)}`,
    });
  }

  async notifyReturnReceived(rawBooking: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.RETURN_RECEIVED,
      title: "Chủ xe đã tiếp nhận xe trả",
      message: `Mã đặt xe ${bookingCode(booking)} đang ở bước kiểm tra sau thuê.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.RETURN_INSPECTION,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
      },
      dedupeKey: `return-received:${toId(booking)}`,
    });
  }

  async notifyReturnInspectionCleared(rawBooking: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.RETURN_INSPECTION_CLEARED,
      title: "Kiểm tra xe đã hoàn tất",
      message: `Mã đặt xe ${bookingCode(booking)} không còn khoản phí phát sinh cần xử lý.`,
      actorId,
     actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.RETURN_INSPECTION,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
      },
      dedupeKey: `return-cleared:${toId(booking)}`,
    });
  }

  async notifyBookingCompleted(rawBooking: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.BOOKING_COMPLETED,
      title: "Chuyến thuê hoàn tất, hãy để lại đánh giá",
      message: `Mã đặt xe ${bookingCode(booking)} đã hoàn tất. Chia sẻ trải nghiệm của bạn để BQDrive cải thiện dịch vụ.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING,
      entityId: toId(booking),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.LEAVE_REVIEW,
      actionUrl: `/bookings/${toId(booking)}?action=review`,
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
      },
      dedupeKey: `booking-completed:${toId(booking)}`,
    });
  }

  async notifyPaymentPaid(rawPayment: any, rawBooking?: any, actorId?: string) {
    if (rawPayment?.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
      await this.notifyExtraChargePaid(rawPayment.extraChargeId, rawPayment, actorId);
      return;
    }

    const booking = await this.hydrateBooking(rawBooking || rawPayment?.bookingId);
    const owner = await this.getOwnerRecipientFromBooking(booking);
    const renterId = toId(booking.userId || rawPayment?.userId);

    const typeMap: Record<string, NotificationTypeEnum> = {
      [PaymentTypeEnum.DEPOSIT]: NotificationTypeEnum.DEPOSIT_PAID,
      [PaymentTypeEnum.FULL]: NotificationTypeEnum.FULL_PAYMENT_PAID,
      [PaymentTypeEnum.REMAINING]: NotificationTypeEnum.REMAINING_PAYMENT_PAID,
    };
    const type = typeMap[String(rawPayment?.paymentType)] || NotificationTypeEnum.PAYMENT_SUCCESS;
    const paymentLabel =
      rawPayment?.paymentType === PaymentTypeEnum.DEPOSIT
        ? "tiền cọc"
        : rawPayment?.paymentType === PaymentTypeEnum.REMAINING
          ? "phần tiền còn lại"
          : "toàn bộ tiền thuê";

    const base = {
      type,
      entityType: NotificationEntityTypeEnum.PAYMENT,
      entityId: toId(rawPayment),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      metadata: {
        bookingCode: bookingCode(booking),
        carName: getBookingCarName(booking),
        amount: Number(rawPayment?.amount || 0),
        paymentType: String(rawPayment?.paymentType || ""),
      },
    };

    const inputs: NotificationInput[] = [];
    if (renterId) {
      inputs.push({
        recipientId: renterId,
        recipientRole: UserRoleEnum.USER,
        title: "Thanh toán thành công",
        message: `Bạn đã thanh toán ${paymentLabel} ${formatCurrency(rawPayment?.amount)} cho mã đặt xe ${bookingCode(booking)}.`,
        actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
        actionUrl: `/bookings/${toId(booking)}`,
        dedupeKey: `payment-paid:${toId(rawPayment)}:renter`,
        ...base,
      });
    }

    if (owner) {
      inputs.push({
        ...owner,
        title: "Khách đã thanh toán",
        message: `Mã đặt xe ${bookingCode(booking)} đã ghi nhận thanh toán ${paymentLabel} ${formatCurrency(rawPayment?.amount)}.`,
        actorId,
        actorRole: UserRoleEnum.USER,
        actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
        actionUrl: this.getOwnerActionUrl(booking),
        dedupeKey: `payment-paid:${toId(rawPayment)}:owner`,
        ...base,
      });
    }

    await this.createNotificationsSafely(inputs);
  }

  async notifyCashPaymentConfirmed(rawBooking: any, rawPayment: any, actorId?: string) {
    const booking = await this.hydrateBooking(rawBooking);
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.CASH_PAYMENT_CONFIRMED,
      title: "Chủ xe đã xác nhận nhận tiền",
      message: `Mã đặt xe ${bookingCode(booking)} đã ghi nhận thanh toán tiền mặt ${formatCurrency(rawPayment?.amount)}.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.PAYMENT,
      entityId: toId(rawPayment),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        amount: Number(rawPayment?.amount || 0),
      },
      dedupeKey: `cash-confirmed:${toId(rawPayment)}`,
    });
  }

  async notifyExtraChargeCreated(rawExtraCharge: any, actorId?: string) {
    const extraCharge =
      typeof rawExtraCharge === "object" && rawExtraCharge?.bookingId
        ? rawExtraCharge
        : await ExtraChargeModel.findById(rawExtraCharge).lean();
    if (!extraCharge) return;

    const booking = await this.hydrateBooking(extraCharge.bookingId);
    await this.createNotificationSafely({
      recipientId: toId(extraCharge.renterId || booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.EXTRA_CHARGE_CREATED,
      title: "Có phí phát sinh sau chuyến thuê",
      message: `Mã đặt xe ${bookingCode(booking)} có phí phát sinh ${formatCurrency(extraCharge.amount)} cần xử lý.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.EXTRA_CHARGE,
      entityId: toId(extraCharge),
      bookingId: toId(booking),
      carId: toId(extraCharge.carId || booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_EXTRA_CHARGE,
      actionUrl: `/bookings/${toId(booking)}?action=extra-charge`,
      metadata: {
        bookingCode: bookingCode(booking),
        amount: Number(extraCharge.amount || 0),
        extraChargeType: String(extraCharge.type || ""),
      },
      dedupeKey: `extra-charge-created:${toId(extraCharge)}`,
    });
  }

  async notifyExtraChargePaid(rawExtraCharge: any, rawPayment?: any, actorId?: string) {
    const extraCharge =
      typeof rawExtraCharge === "object" && rawExtraCharge?.bookingId
        ? rawExtraCharge
        : await ExtraChargeModel.findById(rawExtraCharge).lean();
    if (!extraCharge) return;

    const booking = await this.hydrateBooking(extraCharge.bookingId);
    const owner = await this.getOwnerRecipientFromBooking(booking);
    const base = {
      type: NotificationTypeEnum.EXTRA_CHARGE_PAID,
      entityType: NotificationEntityTypeEnum.EXTRA_CHARGE,
      entityId: toId(extraCharge),
      bookingId: toId(booking),
      carId: toId(extraCharge.carId || booking.carId),
      metadata: {
        bookingCode: bookingCode(booking),
        amount: Number(extraCharge.amount || 0),
        paymentId: toId(rawPayment),
      },
    };

    const inputs: NotificationInput[] = [
      {
        recipientId: toId(extraCharge.renterId || booking.userId),
        recipientRole: UserRoleEnum.USER,
        title: "Đã thanh toán phí phát sinh",
        message: `Phí phát sinh ${formatCurrency(extraCharge.amount)} của mã đặt xe ${bookingCode(booking)} đã được ghi nhận.`,
        actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
        actionUrl: `/bookings/${toId(booking)}`,
        dedupeKey: `extra-charge-paid:${toId(extraCharge)}:renter`,
        ...base,
      },
    ];

    if (owner) {
      inputs.push({
        ...owner,
        title: "Khách đã thanh toán phí phát sinh",
        message: `Mã đặt xe ${bookingCode(booking)} đã thanh toán phí phát sinh ${formatCurrency(extraCharge.amount)}.`,
        actorId,
        actorRole: UserRoleEnum.USER,
        actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
        actionUrl: this.getOwnerActionUrl(booking),
        dedupeKey: `extra-charge-paid:${toId(extraCharge)}:owner`,
        ...base,
      });
    }

    await this.createNotificationsSafely(inputs);
  }

  async notifyExtraChargeCancelled(rawExtraCharge: any, actorId?: string) {
    const extraCharge =
      typeof rawExtraCharge === "object" && rawExtraCharge?.bookingId
        ? rawExtraCharge
        : await ExtraChargeModel.findById(rawExtraCharge).lean();
    if (!extraCharge) return;

    const booking = await this.hydrateBooking(extraCharge.bookingId);
    await this.createNotificationSafely({
      recipientId: toId(extraCharge.renterId || booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.EXTRA_CHARGE_CANCELLED,
      title: "Phí phát sinh đã được hủy",
      message: `Phí phát sinh ${formatCurrency(extraCharge.amount)} của mã đặt xe ${bookingCode(booking)} đã được hủy.`,
      actorId,
      actorRole: UserRoleEnum.USER,

      entityType: NotificationEntityTypeEnum.EXTRA_CHARGE,
      entityId: toId(extraCharge),
      bookingId: toId(booking),
      carId: toId(extraCharge.carId || booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        amount: Number(extraCharge.amount || 0),
      },
      dedupeKey: `extra-charge-cancelled:${toId(extraCharge)}`,
    });
  }
  async notifyReviewCreated(rawReview: any, actorId?: string) {
  const owner: Recipient = {
    recipientId: toId(rawReview?.ownerId),
    recipientRole: UserRoleEnum.USER,
  };

  if (!owner.recipientId) return;

  await this.createNotificationSafely({
    ...owner,
    type: NotificationTypeEnum.REVIEW_CREATED,
    title: "Xe vừa nhận đánh giá mới",
    message: `${
      rawReview?.reviewerNameSnapshot || "Khách thuê"
    } đã đánh giá ${rawReview?.rating || 0}/5 cho xe ${
      rawReview?.carNameSnapshot || "BQDrive"
    }.`,
    actorId,
    actorRole: UserRoleEnum.USER,
    entityType: NotificationEntityTypeEnum.REVIEW,
    entityId: toId(rawReview),
    bookingId: toId(rawReview?.bookingId),
    carId: toId(rawReview?.carId),
    actionKey: NotificationActionKeyEnum.VIEW_REVIEW,
    actionUrl: "/consignment/reviews",
    metadata: {
      rating: Number(rawReview?.rating || 0),
      carName: String(rawReview?.carNameSnapshot || ""),
    },
    dedupeKey: `review-created:${toId(rawReview)}`,
  });
}
  async notifyCarApproved(rawCar: any, actorId?: string) {
    const car = await this.hydrateCar(rawCar);
    const owner = await this.getOwnerRecipientFromCar(car);
    if (!owner) return;

    await this.createNotificationSafely({
      ...owner,
      type: NotificationTypeEnum.CAR_APPROVED,
      title: "Xe đã được duyệt",
      message: `Xe ${getCarName(car)} đã được admin duyệt và có thể hiển thị trên hệ thống.`,
      actorId,
      actorRole: UserRoleEnum.ADMIN,
      entityType: NotificationEntityTypeEnum.CAR,
      entityId: toId(car),
      carId: toId(car),
      actionKey: NotificationActionKeyEnum.VIEW_CAR,
      actionUrl: this.getOwnerCarActionUrl(car),
      metadata: {
        carName: getCarName(car),
        licensePlate: String(car?.licensePlate || ""),
      },
      dedupeKey: `car-approved:${toId(car)}:${Date.now()}`,
    });
  }

  async notifyCarRejected(rawCar: any, reason?: string, actorId?: string) {
    const car = await this.hydrateCar(rawCar);
    const owner = await this.getOwnerRecipientFromCar(car);
    if (!owner) return;

    await this.createNotificationSafely({
      ...owner,
      type: NotificationTypeEnum.CAR_REJECTED,
      title: "Xe bị từ chối kiểm duyệt",
      message: `Xe ${getCarName(car)} bị từ chối${reason ? `: ${reason}` : "."}`,
      actorId,
      actorRole: UserRoleEnum.ADMIN,
      entityType: NotificationEntityTypeEnum.CAR,
      entityId: toId(car),
      carId: toId(car),
      actionKey: NotificationActionKeyEnum.VIEW_CAR,
      actionUrl: this.getOwnerCarActionUrl(car),
      metadata: {
        carName: getCarName(car),
        licensePlate: String(car?.licensePlate || ""),
        reason: reason || "",
      },
      dedupeKey: `car-rejected:${toId(car)}:${Date.now()}`,
    });
  }

  async notifyBookingExtensionRequested(
    extension: any,
    rawBooking: any,
    actorId?: string,
  ) {
    const booking = await this.hydrateBooking(rawBooking);
    const owner = await this.getOwnerRecipientFromBooking(booking);
    if (!owner) return;
    const isPlanConversion = extension?.requestType === "PLAN_CONVERSION";

    await this.createNotificationSafely({
      ...owner,
      type: NotificationTypeEnum.BOOKING_EXTENSION_REQUESTED,
      title: isPlanConversion
        ? "Khách yêu cầu chuyển sang gói ngày"
        : "Khách yêu cầu gia hạn chuyến thuê",
      message: `Booking ${bookingCode(booking)} yêu cầu ${isPlanConversion ? "chuyển từ gói giờ sang gói ngày" : "đổi giờ trả xe"} đến ${new Date(extension.requestedEndAt).toLocaleString("vi-VN")}.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING_EXTENSION,
      entityId: toId(extension),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: this.getOwnerActionUrl(booking),
      metadata: {
        bookingCode: bookingCode(booking),
        additionalAmount: Number(extension.additionalAmount || 0),
      },
      dedupeKey: `booking-extension-requested:${toId(extension)}`,
    });
  }

  async notifyBookingExtensionApproved(
    extension: any,
    rawBooking: any,
    actorId?: string,
  ) {
    const booking = await this.hydrateBooking(rawBooking);
    const isPlanConversion = extension?.requestType === "PLAN_CONVERSION";
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.BOOKING_EXTENSION_APPROVED,
      title: isPlanConversion
        ? "Yêu cầu chuyển gói đã được duyệt"
        : "Yêu cầu gia hạn đã được duyệt",
      message: `Vui lòng thanh toán online ${formatCurrency(extension.additionalAmount)} trước hạn để áp dụng ${isPlanConversion ? "gói thuê ngày và " : ""}thời gian trả xe mới.`,
      actorId,
      actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING_EXTENSION,
      entityId: toId(extension),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        additionalAmount: Number(extension.additionalAmount || 0),
      },
      dedupeKey: `booking-extension-approved:${toId(extension)}`,
    });
  }

  async notifyBookingExtensionRejected(
    extension: any,
    rawBooking: any,
    actorId?: string,
  ) {
    const booking = await this.hydrateBooking(rawBooking);
    const isPlanConversion = extension?.requestType === "PLAN_CONVERSION";
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.BOOKING_EXTENSION_REJECTED,
      title: isPlanConversion
        ? "Yêu cầu chuyển gói bị từ chối"
        : "Yêu cầu gia hạn bị từ chối",
      message: `Booking ${bookingCode(booking)} không được ${isPlanConversion ? "chuyển sang gói ngày" : "gia hạn"}${extension.rejectReason ? `: ${extension.rejectReason}` : "."}`,
      actorId,
    actorRole: UserRoleEnum.USER,
      entityType: NotificationEntityTypeEnum.BOOKING_EXTENSION,
      entityId: toId(extension),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: {
        bookingCode: bookingCode(booking),
        reason: String(extension.rejectReason || ""),
      },
      dedupeKey: `booking-extension-rejected:${toId(extension)}`,
    });
  }

  async notifyBookingExtensionPaid(extension: any, rawBooking: any) {
    const booking = await this.hydrateBooking(rawBooking);
    const owner = await this.getOwnerRecipientFromBooking(booking);
    const isPlanConversion = extension?.requestType === "PLAN_CONVERSION";
    const common = {
      type: NotificationTypeEnum.BOOKING_EXTENSION_APPLIED,
      title: isPlanConversion
        ? "Chuyển sang gói ngày đã được áp dụng"
        : "Gia hạn chuyến thuê đã được áp dụng",
      message: `Booking ${bookingCode(booking)} đã ${isPlanConversion ? "chuyển sang gói ngày và cập nhật thời gian trả" : "gia hạn"} đến ${new Date(extension.requestedEndAt).toLocaleString("vi-VN")}.`,
      entityType: NotificationEntityTypeEnum.BOOKING_EXTENSION,
      entityId: toId(extension),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      metadata: {
        bookingCode: bookingCode(booking),
        additionalAmount: Number(extension.additionalAmount || 0),
      },
    };

    const notifications: NotificationInput[] = [
      {
        ...common,
        recipientId: toId(booking.userId),
        recipientRole: UserRoleEnum.USER,
        actionUrl: `/bookings/${toId(booking)}`,
        dedupeKey: `booking-extension-applied:${toId(extension)}:renter`,
      },
    ];
    if (owner) {
      notifications.push({
        ...common,
        ...owner,
        actionUrl: this.getOwnerActionUrl(booking),
        dedupeKey: `booking-extension-applied:${toId(extension)}:owner`,
      });
    }
    await this.createNotificationsSafely(notifications);
  }

  async notifyBookingExtensionExpired(extension: any, rawBooking: any) {
    const booking = await this.hydrateBooking(rawBooking);
    const isPlanConversion = extension?.requestType === "PLAN_CONVERSION";
    await this.createNotificationSafely({
      recipientId: toId(booking.userId),
      recipientRole: UserRoleEnum.USER,
      type: NotificationTypeEnum.BOOKING_EXTENSION_EXPIRED,
      title: isPlanConversion
        ? "Yêu cầu chuyển gói đã hết hạn"
        : "Yêu cầu gia hạn đã hết hạn",
      message: `Yêu cầu ${isPlanConversion ? "chuyển gói" : "gia hạn"} booking ${bookingCode(booking)} đã hết thời gian thanh toán. Lịch trả xe cũ vẫn được giữ nguyên.`,
      entityType: NotificationEntityTypeEnum.BOOKING_EXTENSION,
      entityId: toId(extension),
      bookingId: toId(booking),
      carId: toId(booking.carId),
      actionKey: NotificationActionKeyEnum.VIEW_BOOKING,
      actionUrl: `/bookings/${toId(booking)}`,
      metadata: { bookingCode: bookingCode(booking) },
      dedupeKey: `booking-extension-expired:${toId(extension)}`,
    });
  }
}

export const notificationCenterService = new NotificationCenterService();
