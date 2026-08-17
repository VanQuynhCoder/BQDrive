import mongoose from "mongoose";

import { ErrorHelper } from "../base/error";
import { UserRoleEnum } from "../constants/model.const";
import {
  SupportConversationModel,
  SupportConversationStatusEnum,
} from "../models/support-conversation/supportConversation.model";
import { SupportMessageModel } from "../models/support-message/supportMessage.model";

type SupportRole = UserRoleEnum.USER | UserRoleEnum.ADMIN;

function normalizeId(value: unknown) {
  return String(value || "");
}

function parseLimit(value: unknown) {
  return Math.min(Math.max(Number(value) || 100, 1), 100);
}

function toConversationDto(conversation: any) {
  const user = conversation.userId;

  return {
    _id: normalizeId(conversation._id),
    user: {
      _id: normalizeId(user?._id || conversation.userId),
      name: user?.name || "Người dùng BQDrive",
      avatar: user?.avatar || null,
      email: user?.email || "",
    },
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt || null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function toUserConversationDto(conversation: any) {
  return {
    _id: normalizeId(conversation._id),
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt || null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function toMessageDto(message: any) {
  const sender = message.senderId;
  const isAdmin = sender?.role === UserRoleEnum.ADMIN;

  return {
    _id: normalizeId(message._id),
    conversationId: normalizeId(message.conversationId),
    sender: {
      _id: isAdmin ? "BQDRIVE_SUPPORT" : normalizeId(sender?._id || message.senderId),
      name: isAdmin ? "BQDrive Support" : sender?.name || "Người dùng BQDrive",
      avatar: isAdmin ? null : sender?.avatar || null,
      role: isAdmin ? UserRoleEnum.ADMIN : UserRoleEnum.USER,
    },
    content: String(message.content || ""),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

class SupportChatService {
  private validateConversationId(conversationId: string) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      throw ErrorHelper.requestDataInvalid("Mã cuộc trò chuyện không hợp lệ");
    }
  }

  private validateContent(rawContent: unknown) {
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

    return content;
  }

  private async populateMessage(messageId: unknown) {
    const message = await SupportMessageModel.findById(messageId)
      .populate("senderId", "_id name avatar role")
      .lean();

    if (!message) {
      throw ErrorHelper.somethingWentWrong("Không thể tải tin nhắn vừa gửi");
    }

    return toMessageDto(message);
  }

  private async getOrCreateUserConversation(userId: string) {
    try {
      return await SupportConversationModel.findOneAndUpdate(
        { userId },
        {
          $setOnInsert: {
            userId,
            status: SupportConversationStatusEnum.OPEN,
            lastMessageAt: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        return SupportConversationModel.findOne({ userId });
      }

      throw error;
    }
  }

  async authorizeConversation(
    conversationId: string,
    actorId: string,
    role: SupportRole,
  ) {
    this.validateConversationId(conversationId);

    const conversation = await SupportConversationModel.findById(
      conversationId,
    ).lean();

    if (!conversation) {
      throw ErrorHelper.recordNotFound("Cuộc trò chuyện hỗ trợ không tồn tại");
    }

    if (
      role === UserRoleEnum.USER &&
      normalizeId(conversation.userId) !== actorId
    ) {
      throw ErrorHelper.permissionDeny();
    }

    return conversation;
  }

  async getMyConversation(userId: string, requestedLimit: unknown) {
    const conversation = await SupportConversationModel.findOne({ userId }).lean();

    if (!conversation) {
      return { conversation: null, messages: [] };
    }

    const messages = await this.getMessages(
      normalizeId(conversation._id),
      userId,
      UserRoleEnum.USER,
      requestedLimit,
    );

    return {
      conversation: toUserConversationDto(conversation),
      messages,
    };
  }

  async getAdminConversations() {
    const conversations = await SupportConversationModel.find({
      lastMessageAt: { $ne: null },
    })
      .sort({ lastMessageAt: -1 })
      .populate("userId", "_id name avatar email")
      .lean();

    return conversations.map(toConversationDto);
  }

  async getMessages(
    conversationId: string,
    actorId: string,
    role: SupportRole,
    requestedLimit: unknown,
  ) {
    await this.authorizeConversation(conversationId, actorId, role);
    const messages = await SupportMessageModel.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(parseLimit(requestedLimit))
      .populate("senderId", "_id name avatar role")
      .lean();

    return messages.reverse().map(toMessageDto);
  }

  async createUserMessage(userId: string, rawContent: unknown) {
    const content = this.validateContent(rawContent);
    const conversation = await this.getOrCreateUserConversation(userId);

    if (!conversation) {
      throw ErrorHelper.somethingWentWrong("Không thể tạo cuộc trò chuyện hỗ trợ");
    }

    const createdMessage = await SupportMessageModel.create({
      conversationId: conversation._id,
      senderId: userId,
      content,
    });

    const updatedConversation = await SupportConversationModel.findByIdAndUpdate(
      conversation._id,
      {
        $set: {
          status: SupportConversationStatusEnum.OPEN,
          lastMessageAt: createdMessage.createdAt || new Date(),
        },
      },
      { new: true },
    )
      .populate("userId", "_id name avatar email")
      .lean();

    if (!updatedConversation) {
      throw ErrorHelper.somethingWentWrong("Không thể cập nhật cuộc trò chuyện hỗ trợ");
    }

    return {
      conversation: toConversationDto(updatedConversation),
      message: await this.populateMessage(createdMessage._id),
    };
  }

  async createAdminMessage(
    conversationId: string,
    adminId: string,
    rawContent: unknown,
  ) {
    const content = this.validateContent(rawContent);
    const conversation = await this.authorizeConversation(
      conversationId,
      adminId,
      UserRoleEnum.ADMIN,
    );
    const createdMessage = await SupportMessageModel.create({
      conversationId: conversation._id,
      senderId: adminId,
      content,
    });

    const updatedConversation = await SupportConversationModel.findByIdAndUpdate(
      conversation._id,
      {
        $set: {
          status: SupportConversationStatusEnum.OPEN,
          lastMessageAt: createdMessage.createdAt || new Date(),
        },
      },
      { new: true },
    )
      .populate("userId", "_id name avatar email")
      .lean();

    if (!updatedConversation) {
      throw ErrorHelper.somethingWentWrong("Không thể cập nhật cuộc trò chuyện hỗ trợ");
    }

    return {
      conversation: toConversationDto(updatedConversation),
      message: await this.populateMessage(createdMessage._id),
    };
  }

  async updateStatus(conversationId: string, adminId: string, rawStatus: unknown) {
    if (
      rawStatus !== SupportConversationStatusEnum.OPEN &&
      rawStatus !== SupportConversationStatusEnum.CLOSED
    ) {
      throw ErrorHelper.requestDataInvalid("Trạng thái hỗ trợ không hợp lệ");
    }

    await this.authorizeConversation(
      conversationId,
      adminId,
      UserRoleEnum.ADMIN,
    );
    const conversation = await SupportConversationModel.findByIdAndUpdate(
      conversationId,
      { $set: { status: rawStatus } },
      { new: true },
    )
      .populate("userId", "_id name avatar email")
      .lean();

    if (!conversation) {
      throw ErrorHelper.recordNotFound("Cuộc trò chuyện hỗ trợ không tồn tại");
    }

    return toConversationDto(conversation);
  }
}

export const supportChatService = new SupportChatService();
