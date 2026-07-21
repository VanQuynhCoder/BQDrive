import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Car,
  CheckCheck,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import Header from "../../components/Header";
import Footer from "../../components/Footer";
import {
  NOTIFICATION_CENTER_REFRESH_EVENT,
  notificationService,
  type PersistentNotification,
} from "../../services/notification.service";

type NotificationCenterPageProps = {
  embedded?: boolean;
  title?: string;
  subtitle?: string;
};

type FilterKey =
  | "ALL"
  | "BOOKING"
  | "PAYMENT"
  | "CAR"
  | "EXTRA_CHARGE"
  | "REVIEW";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "ALL", label: "Tất cả" },
  { key: "BOOKING", label: "Booking" },
  { key: "PAYMENT", label: "Thanh toán" },
  { key: "CAR", label: "Xe" },
  { key: "EXTRA_CHARGE", label: "Phí phát sinh" },
  { key: "REVIEW", label: "Đánh giá" },
];

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

function getGroupKey(notification: PersistentNotification): FilterKey {
  const type = notification.type || "";
  const entityType = notification.entityType || "";

  if (type.includes("EXTRA_CHARGE") || entityType === "EXTRA_CHARGE") {
    return "EXTRA_CHARGE";
  }

  if (type.includes("PAYMENT") || type.includes("DEPOSIT") || entityType === "PAYMENT") {
    return "PAYMENT";
  }

  if (type.includes("CAR") || entityType === "CAR") return "CAR";
  if (type.includes("REVIEW") || entityType === "REVIEW") return "REVIEW";
  if (type.includes("BOOKING") || type.includes("HANDOVER") || type.includes("RETURN")) {
    return "BOOKING";
  }

  return "ALL";
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getDateBucket(value?: string) {
  if (!value) return "Cũ hơn";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Cũ hơn";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Hôm nay";
  if (sameDay(date, yesterday)) return "Hôm qua";
  return "Cũ hơn";
}

export default function NotificationCenterPage({
  embedded = false,
  title = "Thông báo",
  subtitle = "Theo dõi lịch sử thông báo nghiệp vụ của bạn trên BQDrive.",
}: NotificationCenterPageProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<PersistentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tab, setTab] = useState<"ALL" | "UNREAD">("ALL");
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchNotifications = useCallback(
    async (nextPage = 1) => {
      setLoading(true);
      setError("");
      try {
        const data = await notificationService.getNotifications({
          page: nextPage,
          limit: 20,
          isRead: tab === "UNREAD" ? false : undefined,
        });
        setItems(data.items || []);
        setUnreadCount(Number(data.unreadCount || 0));
        setPage(data.pagination?.page || nextPage);
        setTotalPages(data.pagination?.totalPages || 1);
      } catch {
        setError("Không thể tải danh sách thông báo.");
      } finally {
        setLoading(false);
      }
    },
    [tab],
  );

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchNotifications(1);
    }, 0);

    return () => window.clearTimeout(initialFetch);
  }, [tab, fetchNotifications]);

  useEffect(() => {
    const handleRefresh = () => void fetchNotifications(1);
    window.addEventListener(NOTIFICATION_CENTER_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(NOTIFICATION_CENTER_REFRESH_EVENT, handleRefresh);
    };
  }, [fetchNotifications]);

  const filteredItems = useMemo(() => {
    if (filter === "ALL") return items;
    return items.filter((item) => getGroupKey(item) === filter);
  }, [filter, items]);

  const groupedItems = useMemo(() => {
    return filteredItems.reduce<Record<string, PersistentNotification[]>>(
      (result, item) => {
        const bucket = getDateBucket(item.createdAt);
        result[bucket] = [...(result[bucket] || []), item];
        return result;
      },
      {},
    );
  }, [filteredItems]);

  const handleItemClick = async (notification: PersistentNotification) => {
    try {
      if (!notification.isRead) {
        await notificationService.markRead(notification._id);
      }

      if (notification.actionUrl) {
        navigate(notification.actionUrl);
      } else {
        await fetchNotifications(page);
      }
    } catch {
      toast.error("Không thể mở thông báo");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      await fetchNotifications(1);
    } catch {
      toast.error("Không thể đánh dấu tất cả thông báo");
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      await fetchNotifications(page);
    } catch {
      toast.error("Không thể xóa thông báo");
    }
  };

  const content = (
    <main
      className={
        embedded
          ? ""
          : "mx-auto w-full max-w-6xl px-4 py-10 md:px-6 lg:px-8"
      }
    >
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-secondary">
              Notification Center
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-primary">
              {title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
              {subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl bg-primary px-4 py-3 text-white">
              <p className="text-xs font-bold uppercase text-secondary">
                Chưa đọc
              </p>
              <p className="text-2xl font-extrabold">{unreadCount}</p>
            </div>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount <= 0 || loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2 font-extrabold text-primary transition hover:bg-secondaryDark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck size={18} />
              Đọc hết
            </button>
            <button
              type="button"
              onClick={() => fetchNotifications(page)}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2 font-extrabold text-primary transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
              Làm mới
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {[
              { key: "ALL", label: "Tất cả" },
              { key: "UNREAD", label: "Chưa đọc" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key as "ALL" | "UNREAD")}
                className={`min-h-10 rounded-lg px-4 text-sm font-extrabold transition ${
                  tab === item.key
                    ? "bg-primary text-secondary shadow-sm"
                    : "text-slate-500 hover:text-primary"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`min-h-10 rounded-full border px-4 text-sm font-extrabold transition ${
                  filter === item.key
                    ? "border-secondary bg-secondary text-primary"
                    : "border-border bg-white text-slate-500 hover:border-secondary hover:text-primary"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 min-h-[320px]">
          {loading && !items.length ? (
            <div className="flex min-h-[260px] items-center justify-center text-slate-500">
              <Loader2 size={24} className="mr-2 animate-spin text-secondary" />
              Đang tải thông báo...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
              <p className="font-bold text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => fetchNotifications(1)}
                className="mt-4 rounded-xl bg-primary px-4 py-2 font-extrabold text-secondary"
              >
                Thử lại
              </button>
            </div>
          ) : filteredItems.length ? (
            <div className="space-y-6">
              {["Hôm nay", "Hôm qua", "Cũ hơn"].map((bucket) => {
                const bucketItems = groupedItems[bucket] || [];
                if (!bucketItems.length) return null;

                return (
                  <div key={bucket}>
                    <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.08em] text-slate-400">
                      {bucket}
                    </h2>
                    <div className="space-y-3">
                      {bucketItems.map((notification) => {
                        const Icon = getNotificationIcon(notification.type);

                        return (
                          <article
                            key={notification._id}
                            className={`rounded-2xl border p-4 transition ${
                              notification.isRead
                                ? "border-border bg-white hover:bg-slate-50"
                                : "border-secondary/50 bg-secondarySoft/35"
                            }`}
                          >
                            <div className="flex items-start gap-4">
                              <button
                                type="button"
                                onClick={() => handleItemClick(notification)}
                                className="flex min-w-0 flex-1 items-start gap-4 text-left"
                              >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-secondary">
                                  <Icon size={21} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="text-base font-extrabold text-primary">
                                      {notification.title}
                                    </span>
                                    {!notification.isRead && (
                                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-extrabold text-white">
                                        Mới
                                      </span>
                                    )}
                                  </span>
                                  <span className="mt-1 block text-sm font-semibold leading-6 text-slate-500">
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
                                onClick={() => handleDelete(notification._id)}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-slate-400 transition hover:border-red-100 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-slate-50 px-4 text-center">
              <BellRing size={40} className="text-secondary" />
              <p className="mt-3 text-lg font-extrabold text-primary">
                Chưa có thông báo phù hợp.
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Các sự kiện mới như booking, thanh toán, phí phát sinh và đánh giá sẽ xuất hiện tại đây.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-5">
          <button
            type="button"
            onClick={() => fetchNotifications(Math.max(page - 1, 1))}
            disabled={page <= 1 || loading}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white font-extrabold text-primary transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹
          </button>
          <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-extrabold text-primary">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => fetchNotifications(Math.min(page + 1, totalPages))}
            disabled={page >= totalPages || loading}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white font-extrabold text-primary transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </section>
    </main>
  );

  if (embedded) return content;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      {content}
      <Footer />
    </div>
  );
}
