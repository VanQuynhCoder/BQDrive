import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Headphones, Loader2, Send, X } from "lucide-react";
import { io, type Socket } from "socket.io-client";

import { authService } from "../../services/auth.service";
import {
  supportService,
  type SupportMessage,
} from "../../services/support.service";
import { formatVietnamDateTime } from "../../utils/date.util";

type SupportChatPanelProps = {
  open: boolean;
  onClose: () => void;
};

type SupportAcknowledgement = {
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
  return "Không thể tải cuộc trò chuyện hỗ trợ.";
}

function mergeMessages(current: SupportMessage[], incoming: SupportMessage[]) {
  const byId = new Map<string, SupportMessage>();

  [...current, ...incoming].forEach((message) => byId.set(message._id, message));

  return Array.from(byId.values()).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export default function SupportChatPanel({ open, onClose }: SupportChatPanelProps) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;
    let joinedConversationId = "";
    const token = authService.getToken();

    setMessages([]);
    setContent("");
    setErrorMessage("");
    setLoading(true);

    if (!token) {
      setLoading(false);
      setErrorMessage("Vui lòng đăng nhập lại để sử dụng hỗ trợ.");
      return () => {
        active = false;
      };
    }

    const socket = io(`${getSocketOrigin()}/support`, {
      auth: { token },
    });
    socketRef.current = socket;

    const joinConversation = () => {
      if (!joinedConversationId) return;

      socket.emit(
        "join_support_chat",
        { conversationId: joinedConversationId },
        (response: SupportAcknowledgement) => {
          if (active && !response.ok) {
            setErrorMessage(response.message || "Không thể mở cuộc trò chuyện hỗ trợ.");
          }
        },
      );
    };

    const receiveMessage = (message: SupportMessage) => {
      if (!active) return;

      if (!joinedConversationId) joinedConversationId = message.conversationId;
      if (message.conversationId !== joinedConversationId) return;

      setMessages((current) => mergeMessages(current, [message]));
    };

    const handleConnectError = (error: Error) => {
      if (active) {
        setErrorMessage(error.message || "Mất kết nối hỗ trợ.");
      }
    };

    socket.on("connect", joinConversation);
    socket.on("support_message", receiveMessage);
    socket.on("connect_error", handleConnectError);

    void supportService
      .getMyConversation()
      .then((data) => {
        if (!active) return;

        setMessages(data.messages);
        joinedConversationId = data.conversation?._id || "";

        if (socket.connected) joinConversation();
      })
      .catch((error) => {
        if (active) setErrorMessage(getApiErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (joinedConversationId) {
        socket.emit("leave_support_chat", {
          conversationId: joinedConversationId,
        });
      }
      socket.off("connect", joinConversation);
      socket.off("support_message", receiveMessage);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  if (!open) return null;

  const handleSend = () => {
    const messageContent = content.trim();
    const socket = socketRef.current;

    if (!messageContent || !socket || sending || loading) return;

    setSending(true);
    setErrorMessage("");
    socket.emit(
      "send_support_message",
      { content: messageContent },
      (response: SupportAcknowledgement) => {
        setSending(false);

        if (!response.ok) {
          setErrorMessage(response.message || "Không thể gửi tin nhắn.");
          return;
        }

        setContent("");
      },
    );
  };

  return createPortal(
    <section
      aria-label="BQDrive Support"
      className="fixed inset-x-3 bottom-3 z-[80] flex h-[min(620px,calc(100vh-6rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[390px]"
    >
      <header className="flex items-center justify-between bg-primary px-5 py-4 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Headphones size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold">BQDrive Support</h2>
            <p className="text-xs font-semibold text-white/65">
              Hỗ trợ khách hàng
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng hỗ trợ"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <X size={21} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
        {loading ? (
          <div className="flex h-full items-center justify-center text-primary">
            <Loader2 size={26} className="animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondarySoft text-primary">
              <Headphones size={26} />
            </div>
            <p className="mt-4 font-extrabold text-primary">
              Bạn cần BQDrive hỗ trợ vấn đề gì?
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Hãy mô tả vấn đề về tài khoản, booking hoặc thanh toán. BQDrive sẽ phản hồi tại đây.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isUserMessage = message.sender.role === "USER";

              return (
                <div
                  key={message._id}
                  className={`flex ${isUserMessage ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[84%]">
                    {!isUserMessage && (
                      <p className="mb-1 px-1 text-xs font-extrabold text-primary">
                        BQDrive Support
                      </p>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                        isUserMessage
                          ? "rounded-br-md bg-primary text-white"
                          : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                    <p
                      className={`mt-1 px-1 text-[11px] font-semibold text-slate-400 ${
                        isUserMessage ? "text-right" : "text-left"
                      }`}
                    >
                      {formatVietnamDateTime(message.createdAt, {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messageEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white p-4">
        {errorMessage && (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {errorMessage}
          </p>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-secondary">
          <textarea
            value={content}
            maxLength={2000}
            rows={1}
            disabled={loading}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Nhập nội dung..."
            className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!content.trim() || sending || loading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Gửi tin nhắn"
          >
            {sending ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
          </button>
        </div>
      </div>
    </section>,
    document.body,
  );
}
