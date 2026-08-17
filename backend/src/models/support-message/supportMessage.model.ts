import mongoose from "mongoose";

import { BaseDocument } from "../../base/baseModel";

export type ISupportMessage = BaseDocument & {
  /** Cuộc hội thoại hỗ trợ chứa tin nhắn này. */
  conversationId: mongoose.Types.ObjectId;
  /** User/admin thực tế gửi tin nhắn. */
  senderId: mongoose.Types.ObjectId;
  /** Nội dung yêu cầu hoặc phản hồi hỗ trợ. */
  content: string;
};

const supportMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportConversation",
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

supportMessageSchema.index({ conversationId: 1, createdAt: -1 });

export const SupportMessageModel = mongoose.model<ISupportMessage>(
  "SupportMessage",
  supportMessageSchema,
);
