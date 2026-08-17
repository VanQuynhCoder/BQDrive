import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { io, type Socket } from "socket.io-client";

import {
  bookingService,
  type BookingChatMessage,
} from "../../services/booking.service";
import { authService } from "../../services/auth.service";
import { formatVietnamDateTime } from "../../utils/date.util";

const CHAT_WRITE_ALLOWED = new Set([
  "OWNER_APPROVED",
  "PAYMENT_PENDING",
  "PAID",
  "IN_PROGRESS",
  "RETURN_INSPECTION",
  "AWAITING_EXTRA_CHARGE",
]);

const CHAT_READ_ONLY = new Set([
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
  "NO_SHOW",
]);

export function canOpenBookingChat(status?: string) {
  return CHAT_WRITE_ALLOWED.has(status || "") || CHAT_READ_ONLY.has(status || "");
}

export function isBookingChatReadOnly(status?: string) {
  return CHAT_READ_ONLY.has(status || "");
}

type BookingChatPanelProps = {
  open: boolean;
  onClose?: () => void;
  bookingId: string;
  bookingCode?: string;
  carName?: string;
  counterpartName: string;
  currentUserId: string;
  readOnly: boolean;
  variant?: "drawer" | "embedded";
  listenWhenClosed?: boolean;
  onNewMessage?: () => void;
};

type ChatAcknowledgement = {
  ok: boolean;
  message?: string;
};

function getSocketOrigin() {
  const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();

  try {
    return new URL(configuredApiUrl, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

function getApiErrorMessage(error: unknown) {
  const response = (
    error as {
      response?: { data?: { data?: unknown; message?: unknown } };
    }
  )?.response;

  if (typeof response?.data?.data === "string") return response.data.data;
  if (typeof response?.data?.message === "string") return response.data.message;
  return "Không thể tải lịch sử trò chuyện.";
}

function mergeMessages(
  current: BookingChatMessage[],
  incoming: BookingChatMessage[],
) {
  const messagesById = new Map<string, BookingChatMessage>();

  [...current, ...incoming].forEach((message) => {
    messagesById.set(message._id, message);
  });

  return Array.from(messagesById.values()).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export default function BookingChatPanel({
  open,
  onClose,
  bookingId,
  bookingCode,
  carName,
  counterpartName,
  currentUserId,
  readOnly,
  variant = "drawer",
  listenWhenClosed = false,
  onNewMessage,
}: BookingChatPanelProps) {
  const [messages, setMessages] = useState<BookingChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open && !listenWhenClosed) return;

    let active = true;
    const token = authService.getToken();

    if (open) {
      setMessages([]);
      setContent("");
      setErrorMessage("");
      setLoading(true);

      void bookingService
        .getBookingChatMessages(bookingId)
        .then((history) => {
          if (active) {
            setMessages((current) => mergeMessages(current, history));
          }
        })
        .catch((error) => {
          if (active) setErrorMessage(getApiErrorMessage(error));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    if (!token) {
      setErrorMessage("Vui lòng đăng nhập lại để sử dụng trò chuyện.");
      return () => {
        active = false;
      };
    }

    const socket = io(getSocketOrigin(), {
      auth: { token },
    });
    socketRef.current = socket;

    const joinRoom = () => {
      socket.emit(
        "join_booking_chat",
        { bookingId },
        (response: ChatAcknowledgement) => {
          if (!active) return;
          setErrorMessage(response.ok ? "" : response.message || "Không thể mở trò chuyện.");
        },
      );
    };

    const receiveMessage = (message: BookingChatMessage) => {
      if (!active || message.bookingId !== bookingId) return;

      if (!open) {
        if (message.sender._id !== currentUserId) onNewMessage?.();
        return;
      }

      setMessages((current) => mergeMessages(current, [message]));
    };

    const handleConnectError = (error: Error) => {
      if (active) {
        setErrorMessage(error.message || "Mất kết nối trò chuyện.");
      }
    };

    socket.on("connect", joinRoom);
    socket.on("booking_message", receiveMessage);
    socket.on("connect_error", handleConnectError);

    return () => {
      active = false;
      socket.emit("leave_booking_chat", { bookingId });
      socket.off("connect", joinRoom);
      socket.off("booking_message", receiveMessage);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [bookingId, currentUserId, listenWhenClosed, onNewMessage, open]);

  useEffect(() => {
    if (open) {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  if (!open) return null;

  const handleSend = () => {
    const normalizedContent = content.trim();
    const socket = socketRef.current;

    if (readOnly || !normalizedContent || sending) return;

    if (!socket?.connected) {
      setErrorMessage("Mất kết nối trò chuyện. Vui lòng chờ kết nối lại.");
      return;
    }

    setSending(true);
    setErrorMessage("");
    socket.timeout(10000).emit(
      "send_booking_message",
      { bookingId, content: normalizedContent },
      (timeoutError: Error | null, response?: ChatAcknowledgement) => {
        setSending(false);

        if (timeoutError) {
          setErrorMessage("Gửi tin nhắn quá thời gian chờ. Vui lòng thử lại.");
          return;
        }

        if (!response?.ok) {
          setErrorMessage(response?.message || "Không thể gửi tin nhắn.");
          return;
        }

        setContent("");
      },
    );
  };

  const chatPanel = (
    <aside
      role={variant === "drawer" ? "dialog" : "region"}
      aria-modal={variant === "drawer" ? "true" : undefined}
      aria-label="Trò chuyện chuyến thuê"
      className={`relative flex w-full flex-col overflow-hidden bg-white ${
        variant === "embedded"
          ? "h-[460px] rounded-lg border border-border shadow-sm"
          : "h-[min(720px,calc(100vh-2rem))] max-w-sm rounded-2xl border border-white/20 shadow-2xl"
      }`}
    >
        <header className={`flex items-start justify-between gap-4 bg-primary text-white ${variant === "embedded" ? "px-4 py-4" : "px-5 py-5"}`}>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-secondary">
              <MessageCircle size={16} /> Trò chuyện chuyến thuê
            </p>
            <h2 className={`mt-2 truncate font-extrabold ${variant === "embedded" ? "text-lg" : "text-xl"}`}>{counterpartName}</h2>
            <p className="mt-1 truncate text-sm font-semibold text-white/70">
              {[carName, bookingCode].filter(Boolean).join(" · ")}
            </p>
          </div>
          {variant === "drawer" && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/75 transition hover:bg-white/10 hover:text-white"
              aria-label="Đóng"
            >
              <X size={22} />
            </button>
          )}
        </header>

        {readOnly && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-800">
            Booking đã kết thúc. Bạn chỉ có thể xem lịch sử trò chuyện.
          </div>
        )}

        {errorMessage && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-slate-500">
              <Loader2 size={18} className="animate-spin text-secondaryDark" />
              Đang tải trò chuyện...
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="mx-auto mt-12 max-w-xs text-center">
              <MessageCircle size={36} className="mx-auto text-slate-300" />
              <p className="mt-3 font-extrabold text-primary">Chưa có tin nhắn</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                Trao đổi thời gian nhận xe và các thông tin cần thiết cho chuyến thuê.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {messages.map((message) => {
              const isMine = message.sender._id === currentUserId;

              return (
                <div
                  key={message._id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${
                      isMine
                        ? "rounded-br-md bg-primary text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-primary"
                    }`}
                  >
                    {!isMine && (
                      <p className="mb-1 text-xs font-extrabold text-secondaryDark">
                        {message.sender.name}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6">
                      {message.content}
                    </p>
                    <p className={`mt-1 text-right text-[11px] font-semibold ${isMine ? "text-white/60" : "text-slate-400"}`}>
                      {formatVietnamDateTime(message.createdAt, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div ref={messageEndRef} />
        </div>

        {!readOnly && (
          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-secondary">
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                rows={2}
                maxLength={2000}
                placeholder="Nhập tin nhắn..."
                className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm font-semibold text-primary outline-none"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!content.trim() || sending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Gửi tin nhắn"
              >
                {sending ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
              </button>
            </div>
            <p className="mt-2 text-right text-xs font-semibold text-slate-400">
              {content.length}/2000
            </p>
          </div>
        )}
    </aside>
  );

  if (variant === "embedded") return chatPanel;

  return createPortal(
    <div className="fixed inset-0 z-[6000] flex items-center justify-end bg-slate-950/40 p-3 backdrop-blur-[2px] sm:p-4">
      <button
        type="button"
        aria-label="Đóng trò chuyện"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      {chatPanel}
    </div>,
    document.body,
  );
}
