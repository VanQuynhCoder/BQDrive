import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";

import { UserRoleEnum } from "../constants/model.const";
import { TokenHelper } from "../helper/token.helper";
import { UserModel } from "../models/user/user.model";
import { bookingChatService } from "../services/booking-chat.service";
import { notificationCenterService } from "../services/notification-center.service";

type ChatPayload = {
  bookingId?: unknown;
  content?: unknown;
  senderId?: unknown;
};

type ChatAcknowledgement = (response: {
  ok: boolean;
  message?: string;
}) => void;

function getErrorMessage(error: unknown) {
  const info = (error as { info?: { message?: unknown; data?: unknown } })?.info;

  if (typeof info?.data === "string") return info.data;
  if (typeof info?.message === "string") return info.message;
  if (error instanceof Error && error.message) return error.message;
  return "Không thể xử lý yêu cầu trò chuyện";
}

function getAllowedOrigins() {
  return Array.from(
    new Set(
      [
        process.env.FRONTEND_URL,
        process.env.CLIENT_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ].filter((origin): origin is string => Boolean(origin)),
    ),
  );
}

async function getActiveBookingChatUserId(userId: unknown) {
  const user = await UserModel.findOne({
    _id: String(userId || ""),
    role: UserRoleEnum.USER,
    isDeleted: { $ne: true },
    isBlocked: { $ne: true },
  })
    .select("_id")
    .lean();

  if (!user) {
    throw new Error("Tài khoản đã bị khóa hoặc vô hiệu hóa");
  }

  return String(user._id);
}

async function assertActiveBookingChatSocketUser(socket: Socket) {
  try {
    const userId = await getActiveBookingChatUserId(socket.data.userId);
    socket.data.userId = userId;
    return userId;
  } catch (error) {
    // Socket đã kết nối trước lúc bị khóa/xóa không được tiếp tục gửi tin nhắn.
    socket.disconnect(true);
    throw error;
  }
}

export function initializeBookingChatSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (typeof token !== "string" || !token.trim()) {
        return next(new Error("Vui lòng đăng nhập để sử dụng trò chuyện"));
      }

      const decoded = TokenHelper.verifyToken(token) as {
        userId?: unknown;
      };
      socket.data.userId = await getActiveBookingChatUserId(decoded.userId);
      return next();
    } catch {
      return next(new Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn"));
    }
  });

  io.on("connection", (socket) => {
    socket.on(
      "join_booking_chat",
      async (payload: ChatPayload, acknowledge?: ChatAcknowledgement) => {
        try {
          const userId = await assertActiveBookingChatSocketUser(socket);
          const bookingId = String(payload?.bookingId || "");
          await bookingChatService.getParticipantBooking(
            bookingId,
            userId,
          );
          await socket.join(`booking:${bookingId}`);
          acknowledge?.({ ok: true });
        } catch (error) {
          acknowledge?.({ ok: false, message: getErrorMessage(error) });
        }
      },
    );

    socket.on("leave_booking_chat", async (payload: ChatPayload) => {
      const bookingId = String(payload?.bookingId || "");

      if (bookingId) {
        await socket.leave(`booking:${bookingId}`);
      }
    });

    socket.on(
      "send_booking_message",
      async (payload: ChatPayload, acknowledge?: ChatAcknowledgement) => {
        try {
          const userId = await assertActiveBookingChatSocketUser(socket);
          const bookingId = String(payload?.bookingId || "");
          const message = await bookingChatService.createMessage(
            bookingId,
            userId,
            payload?.content,
          );

          await socket.join(`booking:${bookingId}`);
          io.to(`booking:${bookingId}`).emit("booking_message", message);
          acknowledge?.({ ok: true });
          void notificationCenterService
            .notifyBookingMessage(
              { _id: bookingId },
              userId,
              message,
            )
            .catch((error) => {
              console.warn("[BookingChat] notification failed", error?.message || error);
            });
        } catch (error) {
          acknowledge?.({ ok: false, message: getErrorMessage(error) });
        }
      },
    );
  });

  return io;
}

export function initializeNotificationSocket(io: Server) {
  const notificationNamespace = io.of("/notifications");

  notificationNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (typeof token !== "string" || !token.trim()) {
        return next(new Error("Vui lòng đăng nhập để nhận thông báo"));
      }

      const decoded = TokenHelper.verifyToken(token) as { userId?: unknown };
      const userId = String(decoded.userId || "");
      const user = await UserModel.findOne({
        _id: userId,
        role: { $in: [UserRoleEnum.USER, UserRoleEnum.ADMIN] },
        isDeleted: { $ne: true },
        isBlocked: { $ne: true },
      })
        .select("_id role")
        .lean();

      if (!user) {
        return next(new Error("Tài khoản không thể nhận thông báo"));
      }

      socket.data.userId = String(user._id);
      return next();
    } catch {
      return next(new Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn"));
    }
  });

  notificationNamespace.on("connection", (socket) => {
    void socket.join(`user:${socket.data.userId}`);
  });

  return notificationNamespace;
}
