import mongoose from "mongoose";

import { ErrorHelper } from "../base/error";
import { BookingStatusEnum } from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { MessageModel } from "../models/message/message.model";

const CHAT_WRITE_ALLOWED = new Set<string>([
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
]);

type PopulatedSender = {
  _id: mongoose.Types.ObjectId;
  name?: string;
  avatar?: string;
};

function normalizeId(value: unknown) {
  return String(value || "");
}

function toMessageDto(message: any) {
  const sender = message.senderId as PopulatedSender;

  return {
    _id: normalizeId(message._id),
    bookingId: normalizeId(message.bookingId),
    sender: {
      _id: normalizeId(sender?._id || message.senderId),
      name: sender?.name || "Người dùng BQDrive",
      avatar: sender?.avatar || null,
    },
    content: String(message.content || ""),
    createdAt: message.createdAt,
  };
}

class BookingChatService {
  private validateBookingId(bookingId: string) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw ErrorHelper.requestDataInvalid("Mã booking không hợp lệ");
    }
  }

  async getParticipantBooking(bookingId: string, userId: string) {
    this.validateBookingId(bookingId);

    const booking = await BookingModel.findOne({
      _id: bookingId,
      isDeleted: { $ne: true },
    } as any)
      .select("_id userId ownerId status bookingCode carId")
      .lean();

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking không tồn tại");
    }

    const isParticipant =
      normalizeId(booking.userId) === userId ||
      normalizeId(booking.ownerId) === userId;

    if (!isParticipant) {
      throw ErrorHelper.permissionDeny();
    }

    return booking;
  }

  async getMessages(bookingId: string, userId: string, requestedLimit: number) {
    await this.getParticipantBooking(bookingId, userId);
    const limit = Math.min(Math.max(Number(requestedLimit) || 50, 1), 100);
    const messages = await MessageModel.find({ bookingId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("senderId", "_id name avatar")
      .lean();

    return messages.reverse().map(toMessageDto);
  }

  async createMessage(bookingId: string, userId: string, rawContent: unknown) {
    const booking = await this.getParticipantBooking(bookingId, userId);

    if (!CHAT_WRITE_ALLOWED.has(String(booking.status || ""))) {
      throw ErrorHelper.requestDataInvalid(
        booking.status === BookingStatusEnum.REQUESTED
          ? "Trò chuyện chỉ mở sau khi chủ xe duyệt booking."
          : "Booking đã đóng trò chuyện và chỉ cho phép xem lịch sử.",
      );
    }

    if (typeof rawContent !== "string") {
      throw ErrorHelper.requestDataInvalid("Nội dung tin nhắn không hợp lệ");
    }

    const content = rawContent.trim();

    if (!content) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập nội dung tin nhắn");
    }

    if (content.length > 2000) {
      throw ErrorHelper.requestDataInvalid(
        "Tin nhắn không được vượt quá 2000 ký tự",
      );
    }

    const createdMessage = await MessageModel.create({
      bookingId: booking._id,
      senderId: userId,
      content,
    });
    const message = await MessageModel.findById(createdMessage._id)
      .populate("senderId", "_id name avatar")
      .lean();

    if (!message) {
      throw ErrorHelper.somethingWentWrong("Không thể tải tin nhắn vừa gửi");
    }

    return toMessageDto(message);
  }
}

export const bookingChatService = new BookingChatService();
