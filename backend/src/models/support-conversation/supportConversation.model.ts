import mongoose from "mongoose";

import { BaseDocument } from "../../base/baseModel";

export enum SupportConversationStatusEnum {
  OPEN = "OPEN",
  CLOSED = "CLOSED",
}

export type ISupportConversation = BaseDocument & {
  /** User mở cuộc hội thoại hỗ trợ với admin. */
  userId: mongoose.Types.ObjectId;
  /** Trạng thái mở/đóng của yêu cầu hỗ trợ. */
  status: SupportConversationStatusEnum;
  /** Thời điểm tin nhắn gần nhất, dùng sắp xếp/inbox. */
  lastMessageAt?: Date | null;
};

const supportConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: Object.values(SupportConversationStatusEnum),
      default: SupportConversationStatusEnum.OPEN,
      required: true,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

supportConversationSchema.index({ status: 1, lastMessageAt: -1 });

export const SupportConversationModel =
  mongoose.model<ISupportConversation>(
    "SupportConversation",
    supportConversationSchema,
  );
