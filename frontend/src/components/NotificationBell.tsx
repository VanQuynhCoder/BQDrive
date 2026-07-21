import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  Car,
  CheckCheck,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Star,
  Trash2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import NotificationBadge from "./NotificationBadge";
import {
  NOTIFICATION_CENTER_REFRESH_EVENT,
  notificationService,
  type PersistentNotification,
} from "../services/notification.service";

type NotificationBellProps = {
  enabled?: boolean;
  className?: string;
  buttonClassName?: string;
  centerPath?: string;
};

function getNotificationIcon(type: string) {
  if (type.includes("PAYMENT") || type.includes("DEPOSIT")) return CircleDollarSign;
  if (type.includes("CAR")) return Car;
  if (type.includes("REVIEW")) return Star;
  if (type.includes("CONTRACT")) return FileText;
  if (type.includes("BOOKING") || type.includes("HANDOVER") || type.includes("RETURN")) {
    return ClipboardCheck;
  }
  return BellRing;
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function NotificationBell({
  enabled = true,
  className = "",
  buttonClassName = "",
  centerPath = "/notifications",
}: NotificationBellProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PersistentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    try {
      const data = await notificationService.getNotifications({
        page: 1,
        limit: 8,
      });
      setItems(data.items || []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refresh();
    }, 0);

    const handleRefresh = () => void refresh();
    window.addEventListener(NOTIFICATION_CENTER_REFRESH_EVENT, handleRefresh);

    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener(NOTIFICATION_CENTER_REFRESH_EVENT, handleRefresh);
    };
  }, [refresh]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadLabel = useMemo(() => {
    if (unreadCount <= 0) return "Không có thông báo chưa đọc";
    return `${unreadCount} thông báo chưa đọc`;
  }, [unreadCount]);

  const handleNotificationClick = async (notification: PersistentNotification) => {
    try {
      if (!notification.isRead) {
        await notificationService.markRead(notification._id);
      }

      setOpen(false);
      if (notification.actionUrl) {
        navigate(notification.actionUrl);
      }
    } catch {
      toast.error("Không thể mở thông báo lúc này");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      await refresh();
    } catch {
      toast.error("Không thể đánh dấu tất cả thông báo");
    }
  };

  if (!enabled) return null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label="Thông báo"
        title="Thông báo"
        onClick={() => {
          setOpen((current) => !current);
          void refresh();
        }}
        className={`relative flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-primary transition hover:border-secondary hover:bg-secondarySoft/60 ${buttonClassName}`}
      >
        <Bell size={21} />
        <NotificationBadge
          count={unreadCount}
          className="absolute -right-1 -top-1"
          title={unreadLabel}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-[80] mt-3 w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-primary px-4 py-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-secondary">
                Thông báo
              </p>
              <p className="mt-1 text-sm font-extrabold text-white">
                {unreadLabel}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-extrabold text-secondary transition hover:bg-white/15"
              >
                <CheckCheck size={15} />
                Đọc hết
              </button>
            )}
          </div>

          {items.length ? (
            <div className="max-h-[430px] overflow-y-auto py-2">
              {items.map((notification) => {
                const Icon = getNotificationIcon(notification.type);

                return (
                  <div
                    key={notification._id}
                    className={`group flex items-start gap-3 px-4 py-3 transition ${
                      notification.isRead
                        ? "hover:bg-slate-50"
                        : "bg-secondarySoft/40 hover:bg-secondarySoft/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary">
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="block flex-1 text-sm font-extrabold leading-5 text-primary">
                            {notification.title}
                          </span>
                          {!notification.isRead && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                          )}
                        </span>
                        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
                          {notification.message}
                        </span>
                        <span className="mt-2 block text-xs font-bold text-slate-400">
                          {formatTime(notification.createdAt)}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      aria-label="Xóa thông báo"
                      title="Xóa thông báo"
                      onClick={async () => {
                        try {
                          await notificationService.deleteNotification(notification._id);
                          await refresh();
                        } catch {
                          toast.error("Không thể xóa thông báo");
                        }
                      }}
                      className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 group-hover:flex"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <BellRing size={34} className="mx-auto text-secondary" />
              <p className="mt-3 text-sm font-extrabold text-primary">
                Chưa có thông báo nào.
              </p>
              {loading && (
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  Đang cập nhật...
                </p>
              )}
            </div>
          )}

          <div className="border-t border-border p-3">
            <Link
              to={centerPath}
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center justify-center rounded-lg bg-secondary px-4 py-2 text-sm font-extrabold text-primary transition hover:bg-secondaryDark"
            >
              Xem tất cả thông báo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
