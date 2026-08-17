import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Headphones,
  Inbox,
  Loader2,
  RotateCcw,
  Send,
  UserCircle,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import toast from "react-hot-toast";

import { authService } from "../../services/auth.service";
import {
  supportService,
  type AdminSupportConversation,
  type SupportMessage,
  type SupportConversationStatus,
} from "../../services/support.service";
import { formatVietnamDateTime } from "../../utils/date.util";
import { normalizeImageUrl } from "../../utils/image.util";

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

function mergeMessages(current: SupportMessage[], incoming: SupportMessage[]) {
  const byId = new Map<string, SupportMessage>();

  [...current, ...incoming].forEach((message) => byId.set(message._id, message));

  return Array.from(byId.values()).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

function sortConversations(conversations: AdminSupportConversation[]) {
  return [...conversations].sort(
    (left, right) =>
      new Date(right.lastMessageAt || 0).getTime() -
      new Date(left.lastMessageAt || 0).getTime(),
  );
}

function upsertConversation(
  current: AdminSupportConversation[],
  incoming: AdminSupportConversation,
) {
  return sortConversations([
    incoming,
    ...current.filter((conversation) => conversation._id !== incoming._id),
  ]);
}

export default function AdminSupportPage() {
  const [conversations, setConversations] = useState<AdminSupportConversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [content, setContent] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const selectedIdRef = useRef("");
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation =
    conversations.find((conversation) => conversation._id === selectedId) || null;

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let active = true;

    void supportService
      .getAdminConversations()
      .then((data) => {
        if (!active) return;

        const sorted = sortConversations(data);
        setConversations(sorted);
        setSelectedId((current) => current || sorted[0]?._id || "");
      })
      .catch(() => {
        if (active) toast.error("Không thể tải danh sách hỗ trợ");
      })
      .finally(() => {
        if (active) setListLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const token = authService.getToken();

    if (!token) {
      setErrorMessage("Phiên đăng nhập không hợp lệ.");
      return;
    }

    const socket = io(`${getSocketOrigin()}/support`, {
      auth: { token },
    });
    socketRef.current = socket;

    const joinSelectedConversation = () => {
      if (!selectedIdRef.current) return;

      socket.emit("join_support_chat", {
        conversationId: selectedIdRef.current,
      });
    };

    const receiveConversationUpdate = (
      conversation: AdminSupportConversation,
    ) => {
      setConversations((current) => upsertConversation(current, conversation));
    };

    const receiveMessage = (message: SupportMessage) => {
      if (message.conversationId !== selectedIdRef.current) return;
      setMessages((current) => mergeMessages(current, [message]));
    };

    const handleConnectError = (error: Error) => {
      setErrorMessage(error.message || "Mất kết nối Support Chat.");
    };

    socket.on("connect", joinSelectedConversation);
    socket.on("support_conversation_updated", receiveConversationUpdate);
    socket.on("support_message", receiveMessage);
    socket.on("connect_error", handleConnectError);

    return () => {
      if (selectedIdRef.current) {
        socket.emit("leave_support_chat", {
          conversationId: selectedIdRef.current,
        });
      }
      socket.off("connect", joinSelectedConversation);
      socket.off("support_conversation_updated", receiveConversationUpdate);
      socket.off("support_message", receiveMessage);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    let active = true;
    const socket = socketRef.current;

    setMessages([]);
    setContent("");
    setErrorMessage("");
    setHistoryLoading(true);

    if (socket?.connected) {
      socket.emit("join_support_chat", { conversationId: selectedId });
    }

    void supportService
      .getAdminMessages(selectedId)
      .then((history) => {
        if (active && selectedIdRef.current === selectedId) {
          setMessages((current) => mergeMessages(current, history));
        }
      })
      .catch(() => {
        if (active) setErrorMessage("Không thể tải lịch sử hỗ trợ.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
      socket?.emit("leave_support_chat", { conversationId: selectedId });
    };
  }, [selectedId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const messageContent = content.trim();
    const socket = socketRef.current;

    if (!selectedId || !messageContent || !socket || sending) return;

    setSending(true);
    setErrorMessage("");
    socket.emit(
      "send_support_message",
      { conversationId: selectedId, content: messageContent },
      (response: SupportAcknowledgement) => {
        setSending(false);

        if (!response.ok) {
          setErrorMessage(response.message || "Không thể gửi phản hồi.");
          return;
        }

        setContent("");
      },
    );
  };

  const handleStatusChange = async (status: SupportConversationStatus) => {
    if (!selectedId || statusUpdating) return;

    setStatusUpdating(true);
    try {
      const conversation = await supportService.updateStatus(selectedId, status);
      setConversations((current) => upsertConversation(current, conversation));
      toast.success(status === "CLOSED" ? "Đã đóng hỗ trợ" : "Đã mở lại hỗ trợ");
    } catch {
      toast.error("Không thể cập nhật trạng thái hỗ trợ");
    } finally {
      setStatusUpdating(false);
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">BQDrive Support</p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">
          Hỗ trợ người dùng
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Tiếp nhận và phản hồi các vấn đề về tài khoản, booking, thanh toán và chuyến thuê.
        </p>
      </section>

      <section className="grid min-h-[680px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-primary">Conversation</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Mới cập nhật trước
                </p>
              </div>
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-white">
                {conversations.length}
              </span>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto p-3 lg:max-h-[620px]">
            {listLoading ? (
              <div className="flex min-h-36 items-center justify-center text-primary">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center px-5 text-center text-slate-500">
                <Inbox size={30} className="text-slate-300" />
                <p className="mt-3 text-sm font-bold">Chưa có yêu cầu hỗ trợ</p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conversation) => {
                  const active = conversation._id === selectedId;
                  const avatarUrl = normalizeImageUrl(conversation.user.avatar || "");

                  return (
                    <button
                      key={conversation._id}
                      type="button"
                      onClick={() => setSelectedId(conversation._id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-secondary bg-secondarySoft/60 shadow-sm"
                          : "border-transparent bg-white hover:border-slate-200"
                      }`}
                    >
                      <div className="flex gap-3">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={conversation.user.name}
                            className="h-11 w-11 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                            <UserCircle size={24} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-extrabold text-primary">
                              {conversation.user.name}
                            </p>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                                conversation.status === "OPEN"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {conversation.status === "OPEN" ? "Đang mở" : "Đã xử lý"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {conversation.user.email}
                          </p>
                          <p className="mt-2 text-[11px] font-semibold text-slate-400">
                            {formatVietnamDateTime(conversation.lastMessageAt || undefined, {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-h-[560px] min-w-0 flex-col">
          {!selectedConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondarySoft text-primary">
                <Headphones size={30} />
              </div>
              <p className="mt-4 text-lg font-extrabold text-primary">
                Chọn một cuộc trò chuyện
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Nội dung trao đổi với người dùng sẽ hiển thị tại đây.
              </p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-extrabold text-primary">
                      {selectedConversation.user.name}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                        selectedConversation.status === "OPEN"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {selectedConversation.status === "OPEN" ? "Đang mở" : "Đã xử lý"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {selectedConversation.user.email}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={statusUpdating}
                  onClick={() =>
                    void handleStatusChange(
                      selectedConversation.status === "OPEN" ? "CLOSED" : "OPEN",
                    )
                  }
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-primary transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {statusUpdating ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : selectedConversation.status === "OPEN" ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <RotateCcw size={17} />
                  )}
                  {selectedConversation.status === "OPEN" ? "Đóng hỗ trợ" : "Mở lại"}
                </button>
              </header>

              <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6">
                {historyLoading ? (
                  <div className="flex h-full items-center justify-center text-primary">
                    <Loader2 size={26} className="animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => {
                      const isAdminMessage = message.sender.role === "ADMIN";

                      return (
                        <div
                          key={message._id}
                          className={`flex ${isAdminMessage ? "justify-end" : "justify-start"}`}
                        >
                          <div className="max-w-[82%] sm:max-w-[70%]">
                            {!isAdminMessage && (
                              <p className="mb-1 px-1 text-xs font-extrabold text-primary">
                                {selectedConversation.user.name}
                              </p>
                            )}
                            <div
                              className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                                isAdminMessage
                                  ? "rounded-br-md bg-primary text-white"
                                  : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            </div>
                            <p
                              className={`mt-1 px-1 text-[11px] font-semibold text-slate-400 ${
                                isAdminMessage ? "text-right" : "text-left"
                              }`}
                            >
                              {formatVietnamDateTime(message.createdAt, {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
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

              <div className="border-t border-slate-200 bg-white p-4 sm:p-5">
                {errorMessage && (
                  <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {errorMessage}
                  </p>
                )}
                <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-secondary">
                  <textarea
                    value={content}
                    maxLength={2000}
                    rows={2}
                    onChange={(event) => setContent(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Nhập phản hồi..."
                    className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!content.trim() || sending}
                    className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-secondary px-3 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    <span className="hidden sm:inline">Gửi</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
