import type { Server, Socket } from "socket.io";

import { UserRoleEnum } from "../constants/model.const";
import { TokenHelper } from "../helper/token.helper";
import { UserModel } from "../models/user/user.model";
import { supportChatService } from "../services/support-chat.service";

type SupportPayload = {
  conversationId?: unknown;
  content?: unknown;
  userId?: unknown;
  senderId?: unknown;
  role?: unknown;
};

type SupportAcknowledgement = (response: {
  ok: boolean;
  message?: string;
}) => void;

function getErrorMessage(error: unknown) {
  const info = (error as { info?: { message?: unknown; data?: unknown } })?.info;

  if (typeof info?.data === "string") return info.data;
  if (typeof info?.message === "string") return info.message;
  if (error instanceof Error && error.message) return error.message;
  return "Không thể xử lý yêu cầu hỗ trợ";
}

type ActiveSupportSocketUser = {
  userId: string;
  role: UserRoleEnum;
};

async function getActiveSupportSocketUser(userId: unknown) {
  const user = await UserModel.findOne({
    _id: String(userId || ""),
    role: { $in: [UserRoleEnum.USER, UserRoleEnum.ADMIN] },
    isDeleted: { $ne: true },
    isBlocked: { $ne: true },
  })
    .select("_id role")
    .lean();

  if (!user) {
    throw new Error("Tài khoản đã bị khóa hoặc vô hiệu hóa");
  }

  return {
    userId: String(user._id),
    role: user.role as UserRoleEnum,
  } satisfies ActiveSupportSocketUser;
}

async function assertActiveSupportSocketUser(socket: Socket) {
  try {
    const user = await getActiveSupportSocketUser(socket.data.userId);
    socket.data.userId = user.userId;
    socket.data.role = user.role;
    return user;
  } catch (error) {
    // Socket cũ phải mất quyền ngay khi tài khoản bị khóa hoặc xóa mềm.
    socket.disconnect(true);
    throw error;
  }
}

export function initializeSupportChatSocket(io: Server) {
  const supportNamespace = io.of("/support");

  supportNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (typeof token !== "string" || !token.trim()) {
        return next(new Error("Vui lòng đăng nhập để sử dụng hỗ trợ"));
      }

      const decoded = TokenHelper.verifyToken(token) as { userId?: unknown };
      const user = await getActiveSupportSocketUser(decoded.userId);
      socket.data.userId = user.userId;
      socket.data.role = user.role;
      return next();
    } catch {
      return next(new Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn"));
    }
  });

  supportNamespace.on("connection", (socket) => {
    if (socket.data.role === UserRoleEnum.ADMIN) {
      void socket.join("support:admins");
    }

    socket.on(
      "join_support_chat",
      async (payload: SupportPayload, acknowledge?: SupportAcknowledgement) => {
        try {
          const activeUser = await assertActiveSupportSocketUser(socket);
          const conversationId = String(payload?.conversationId || "");
          await supportChatService.authorizeConversation(
            conversationId,
            activeUser.userId,
            activeUser.role,
          );
          await socket.join(`support:${conversationId}`);
          acknowledge?.({ ok: true });
        } catch (error) {
          acknowledge?.({ ok: false, message: getErrorMessage(error) });
        }
      },
    );

    socket.on(
      "leave_support_chat",
      async (payload: SupportPayload, acknowledge?: SupportAcknowledgement) => {
        try {
          const activeUser = await assertActiveSupportSocketUser(socket);
          const conversationId = String(payload?.conversationId || "");
          await supportChatService.authorizeConversation(
            conversationId,
            activeUser.userId,
            activeUser.role,
          );
          await socket.leave(`support:${conversationId}`);
          acknowledge?.({ ok: true });
        } catch (error) {
          acknowledge?.({ ok: false, message: getErrorMessage(error) });
        }
      },
    );

    socket.on(
      "send_support_message",
      async (payload: SupportPayload, acknowledge?: SupportAcknowledgement) => {
        try {
          const activeUser = await assertActiveSupportSocketUser(socket);
          const result =
            activeUser.role === UserRoleEnum.ADMIN
              ? await supportChatService.createAdminMessage(
                  String(payload?.conversationId || ""),
                  activeUser.userId,
                  payload?.content,
                )
              : await supportChatService.createUserMessage(
                  activeUser.userId,
                  payload?.content,
                );
          const conversationId = result.conversation._id;

          await socket.join(`support:${conversationId}`);
          supportNamespace
            .to(`support:${conversationId}`)
            .emit("support_message", result.message);
          supportNamespace
            .to("support:admins")
            .emit("support_conversation_updated", result.conversation);
          acknowledge?.({ ok: true });
        } catch (error) {
          acknowledge?.({ ok: false, message: getErrorMessage(error) });
        }
      },
    );
  });
}
