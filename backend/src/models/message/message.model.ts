import mongoose from "mongoose";

import { BaseDocument } from "../../base/baseModel";

export type IMessage = BaseDocument & {
  /** Booking làm ngữ cảnh của cuộc trao đổi renter/chủ xe. */
  bookingId: mongoose.Types.ObjectId;
  /** User gửi tin nhắn. */
  senderId: mongoose.Types.ObjectId;
  /** Nội dung tin nhắn đã chuẩn hóa. */
  content: string;
};

const messageSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
  },
  { timestamps: true },
);

messageSchema.index({ bookingId: 1, createdAt: -1 });

export const MessageModel = mongoose.model<IMessage>("Message", messageSchema);
