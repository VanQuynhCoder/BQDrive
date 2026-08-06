import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  History,
  Loader2,
  XCircle,
} from "lucide-react";

import {
  bookingExtensionService,
  type BookingExtension,
  type BookingExtensionPayment,
  type BookingExtensionQuote,
  type BookingExtensionStatus,
} from "../../services/bookingExtension.service";
import { paymentService } from "../../services/payment.service";
import { notifyNotificationSummaryChanged } from "../../services/notification.service";
import { formatVietnamDateTime } from "../../utils/date.util";
import { CASH_PAYMENT_UI_ENABLED } from "../../config/payment.config";

type BookingExtensionPanelProps = {
  bookingId: string;
  bookingStatus: string;
  startAt: string;
  currentEndAt: string;
  rentalMode?: string;
  mode: "RENTER" | "OWNER";
  onChanged?: () => Promise<void> | void;
};

const ACTIVE_STATUSES: BookingExtensionStatus[] = [
  "REQUESTED",
  "OWNER_APPROVED",
  "PAYMENT_PENDING",
];

const HOURLY_EXTENSION_MIN_HOURS = 2;
const HOURLY_BOOKING_MAX_TOTAL_HOURS = 8;
const HOURLY_BOOKING_MAX_DURATION_MESSAGE =
  "Thời lượng thuê theo giờ tối đa là 8 giờ. Vui lòng chuyển sang hình thức thuê theo ngày.";
const HOUR_MS = 60 * 60_000;

const STATUS_LABELS: Record<BookingExtensionStatus, string> = {
  REQUESTED: "Chờ chủ xe xử lý",
  OWNER_APPROVED: "Đã duyệt - chờ thanh toán",
  PAYMENT_PENDING: "Đang chờ thanh toán",
  PAID: "Đã thanh toán và kích hoạt",
  REJECTED: "Đã từ chối",
  CANCELLED: "Đã hủy",
  EXPIRED: "Đã hết hạn",
};

const STATUS_CLASSES: Record<BookingExtensionStatus, string> = {
  REQUESTED: "border-amber-200 bg-amber-50 text-amber-800",
  OWNER_APPROVED: "border-blue-200 bg-blue-50 text-blue-700",
  PAYMENT_PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-600",
  EXPIRED: "border-slate-200 bg-slate-50 text-slate-600",
};

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function toDateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function getDefaultRequestedEndAt(endAt: string, rentalMode?: string) {
  const end = new Date(endAt);
  const base = Number.isNaN(end.getTime()) ? new Date() : end;
  const increment = rentalMode === "HOURLY" ? 2 * 60 * 60_000 : 24 * 60 * 60_000;
  return toDateTimeLocal(new Date(base.getTime() + increment));
}

function getPayment(extension: BookingExtension) {
  return typeof extension.paymentId === "object" && extension.paymentId
    ? (extension.paymentId as BookingExtensionPayment)
    : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as {
        response?: { data?: { data?: unknown; message?: unknown } };
      }
    ).response;
    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getCountdown(deadline?: string, now = Date.now()) {
  if (!deadline) return "";
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(deadline).getTime() - now) / 1000),
  );
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(minutes = 0) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const days = Math.floor(safeMinutes / 1440);
  const hours = Math.floor((safeMinutes % 1440) / 60);
  const remainingMinutes = safeMinutes % 60;
  return [
    days ? `${days} ngày` : "",
    hours ? `${hours} giờ` : "",
    remainingMinutes ? `${remainingMinutes} phút` : "",
  ]
    .filter(Boolean)
    .join(" ") || "0 phút";
}

export default function BookingExtensionPanel({
  bookingId,
  bookingStatus,
  startAt,
  currentEndAt,
  rentalMode,
  mode,
  onChanged,
}: BookingExtensionPanelProps) {
  const [extensions, setExtensions] = useState<BookingExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestedEndAt, setRequestedEndAt] = useState(() =>
    getDefaultRequestedEndAt(currentEndAt, rentalMode),
  );
  const [quote, setQuote] = useState<BookingExtensionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MOMO" | "VNPAY">(
    "VNPAY",
  );
  const [now, setNow] = useState(0);

  const loadExtensions = useCallback(async () => {
    setLoading(true);
    try {
      setExtensions(await bookingExtensionService.listByBooking(bookingId));
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể tải lịch sử gia hạn."));
      setExtensions([]);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    queueMicrotask(() => void loadExtensions());
  }, [loadExtensions]);

  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setRequestedEndAt(getDefaultRequestedEndAt(currentEndAt, rentalMode));
      setQuote(null);
    });
  }, [currentEndAt, rentalMode]);

  const activeExtension = useMemo(
    () => extensions.find((item) => ACTIVE_STATUSES.includes(item.status)),
    [extensions],
  );
  const canRequest =
    mode === "RENTER" && bookingStatus === "IN_PROGRESS" && !activeExtension;
  const [requestedEndDate = ""] = requestedEndAt.split("T");
  const currentEndTime = new Date(currentEndAt).getTime();
  const bookingStartTime = new Date(startAt).getTime();
  const currentEndLocal = Number.isFinite(currentEndTime)
    ? toDateTimeLocal(new Date(currentEndTime))
    : "";
  const currentEndClock = currentEndLocal.split("T")[1] || "";
  const minimumDailyExtensionDays = Number.isFinite(currentEndTime)
    ? Math.max(1, Math.floor(Math.max(0, now - currentEndTime) / (24 * HOUR_MS)) + 1)
    : 1;
  const minimumDailyExtensionDate = Number.isFinite(currentEndTime)
    ? toDateTimeLocal(
        new Date(currentEndTime + minimumDailyExtensionDays * 24 * HOUR_MS),
      ).slice(0, 10)
    : "";
  const currentTotalBillableHours =
    Number.isFinite(currentEndTime) && Number.isFinite(bookingStartTime)
      ? Math.ceil((currentEndTime - bookingStartTime) / HOUR_MS)
      : HOURLY_BOOKING_MAX_TOTAL_HOURS;
  const maximumAdditionalHours = Math.max(
    0,
    HOURLY_BOOKING_MAX_TOTAL_HOURS - currentTotalBillableHours,
  );
  const hourlyExtensionOptions = Array.from(
    { length: Math.max(0, maximumAdditionalHours - HOURLY_EXTENSION_MIN_HOURS + 1) },
    (_, index) => HOURLY_EXTENSION_MIN_HOURS + index,
  );
  const selectedHourlyExtensionHours =
    rentalMode === "HOURLY" && Number.isFinite(currentEndTime)
      ? Math.round((new Date(requestedEndAt).getTime() - currentEndTime) / HOUR_MS)
      : 0;
  const hasValidRequestedEnd =
    rentalMode === "HOURLY"
      ? hourlyExtensionOptions.includes(selectedHourlyExtensionHours)
      : Boolean(requestedEndDate && currentEndClock);
  const getHourlyValidationMessage = (candidateTime: number) => {
    if (rentalMode !== "HOURLY") return "";

    const extensionBillableHours = Math.ceil(
      (candidateTime - currentEndTime) / HOUR_MS,
    );
    if (extensionBillableHours < HOURLY_EXTENSION_MIN_HOURS) {
      return "Mỗi lần gia hạn thuê theo giờ tối thiểu là 2 giờ.";
    }

    const totalBillableHours = Math.ceil(
      (candidateTime - bookingStartTime) / HOUR_MS,
    );
    if (
      !Number.isFinite(totalBillableHours) ||
      totalBillableHours > HOURLY_BOOKING_MAX_TOTAL_HOURS
    ) {
      return HOURLY_BOOKING_MAX_DURATION_MESSAGE;
    }

    return "";
  };
  const refreshAfterAction = async (bookingChanged = false) => {
    await loadExtensions();
    notifyNotificationSummaryChanged();
    if (bookingChanged) await onChanged?.();
  };

  const handleQuote = async () => {
    const nextEnd = new Date(requestedEndAt);
    if (
      !requestedEndAt ||
      Number.isNaN(nextEnd.getTime()) ||
      nextEnd <= new Date(currentEndAt) ||
      nextEnd <= new Date()
    ) {
      toast.error("Thời gian trả mới phải sau thời gian trả hiện tại.");
      return;
    }

    const hourlyValidationMessage = getHourlyValidationMessage(nextEnd.getTime());
    if (hourlyValidationMessage) {
      toast.error(hourlyValidationMessage);
      return;
    }

    setQuoteLoading(true);
    try {
      setQuote(
        await bookingExtensionService.quote(bookingId, nextEnd.toISOString()),
      );
    } catch (error) {
      setQuote(null);
      toast.error(getErrorMessage(error, "Không thể tính chi phí gia hạn."));
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleRequest = async () => {
    const nextEnd = new Date(requestedEndAt);
    if (
      !requestedEndAt ||
      Number.isNaN(nextEnd.getTime()) ||
      nextEnd <= new Date(currentEndAt) ||
      nextEnd <= new Date()
    ) {
      toast.error("Thời gian trả mới phải sau thời gian trả hiện tại.");
      return;
    }

    const hourlyValidationMessage = getHourlyValidationMessage(nextEnd.getTime());
    if (hourlyValidationMessage) {
      toast.error(hourlyValidationMessage);
      return;
    }

    setActionId("request");
    try {
      await bookingExtensionService.request(bookingId, nextEnd.toISOString());
      toast.success("Đã gửi yêu cầu gia hạn đến chủ xe.");
      setRequestFormOpen(false);
      setQuote(null);
      await refreshAfterAction();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể gửi yêu cầu gia hạn."));
    } finally {
      setActionId("");
    }
  };

  const handleCancel = async (extensionId: string) => {
    setActionId(extensionId);
    try {
      await bookingExtensionService.cancel(extensionId);
      toast.success("Đã hủy yêu cầu gia hạn.");
      await refreshAfterAction();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể hủy yêu cầu gia hạn."));
    } finally {
      setActionId("");
    }
  };

  const handleApprove = async (extensionId: string) => {
    setActionId(extensionId);
    try {
      await bookingExtensionService.approve(extensionId);
      toast.success("Đã duyệt yêu cầu gia hạn. Khách có 10 phút để thanh toán.");
      await refreshAfterAction();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể duyệt yêu cầu gia hạn."));
    } finally {
      setActionId("");
    }
  };

  const handleReject = async (extensionId: string) => {
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Vui lòng nhập lý do từ chối.");
      return;
    }
    setActionId(extensionId);
    try {
      await bookingExtensionService.reject(extensionId, reason);
      toast.success("Đã từ chối yêu cầu gia hạn.");
      setRejectingId("");
      setRejectReason("");
      await refreshAfterAction();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể từ chối yêu cầu gia hạn."));
    } finally {
      setActionId("");
    }
  };

  const handlePayment = async (extension: BookingExtension) => {
    if (
      extension.paymentDeadlineAt &&
      new Date(extension.paymentDeadlineAt).getTime() <= Date.now()
    ) {
      toast.error("Thời hạn thanh toán gia hạn đã kết thúc.");
      await loadExtensions();
      return;
    }

    setActionId(extension._id);
    try {
      if (paymentMethod === "CASH") {
        await paymentService.createPayment({
          extensionId: extension._id,
          method: "CASH",
          paymentType: "EXTENSION",
        });
        toast.success("Đã chọn tiền mặt. Chủ xe cần xác nhận đã nhận tiền.");
        await refreshAfterAction();
        return;
      }

      const result =
        paymentMethod === "MOMO"
          ? await paymentService.createMomoPayment({
              extensionId: extension._id,
              paymentType: "EXTENSION",
            })
          : await paymentService.createVnpayPayment({
              extensionId: extension._id,
              paymentType: "EXTENSION",
            });
      const payUrl = result?.payUrl || result?.momo?.payUrl;
      if (!payUrl) throw new Error("Không nhận được đường dẫn thanh toán.");
      window.location.assign(payUrl);
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể tạo thanh toán gia hạn."));
      setActionId("");
    }
  };

  const handleConfirmCash = async (extension: BookingExtension) => {
    const payment = getPayment(extension);
    if (!payment?._id) {
      toast.error("Chưa tìm thấy giao dịch tiền mặt cần xác nhận.");
      return;
    }
    setActionId(extension._id);
    try {
      await paymentService.updatePaymentStatus(payment._id, {
        status: "PAID",
        transactionCode: `CASH-EXT-${Date.now()}`,
      });
      toast.success("Đã xác nhận tiền gia hạn và cập nhật thời gian trả xe.");
      await refreshAfterAction(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể xác nhận tiền gia hạn."));
    } finally {
      setActionId("");
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase text-secondary">
            Gia hạn chuyến thuê
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-xl font-extrabold text-primary">
            <CalendarClock size={22} className="text-secondaryDark" />
            Thay đổi thời gian trả xe
          </h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Thời gian trả hiện tại: {formatDateTime(currentEndAt)}
          </p>
        </div>
        {canRequest && !requestFormOpen && (
          <button
            type="button"
            onClick={() => setRequestFormOpen(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 font-extrabold text-primary transition hover:brightness-95"
          >
            <CalendarClock size={18} /> Yêu cầu gia hạn
          </button>
        )}
      </div>

      {requestFormOpen && (
        <div className="mt-4 rounded-lg border border-secondary/35 bg-secondarySoft/30 p-4">
          <p className="text-sm font-extrabold text-primary">
            Thời gian trả xe mới
          </p>
          {rentalMode === "HOURLY" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block" htmlFor={`extension-hours-${bookingId}`}>
                <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">
                  Số giờ gia hạn
                </span>
                <span className="relative flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 transition focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
                  <Clock3 size={18} className="shrink-0 text-secondaryDark" />
                  <select
                    id={`extension-hours-${bookingId}`}
                    value={
                      hourlyExtensionOptions.includes(selectedHourlyExtensionHours)
                        ? selectedHourlyExtensionHours
                        : ""
                    }
                    disabled={hourlyExtensionOptions.length === 0}
                    onChange={(event) => {
                      const hours = Number(event.target.value);
                      setRequestedEndAt(
                        hours > 0
                          ? toDateTimeLocal(
                              new Date(currentEndTime + hours * HOUR_MS),
                            )
                          : "",
                      );
                      setQuote(null);
                    }}
                    className="min-h-11 min-w-0 flex-1 appearance-none bg-transparent pr-8 font-semibold text-primary outline-none disabled:text-slate-400"
                  >
                    {hourlyExtensionOptions.length === 0 ? (
                      <option value="">Không thể gia hạn thêm</option>
                    ) : (
                      hourlyExtensionOptions.map((hours) => (
                        <option key={hours} value={hours}>
                          Thêm {hours} giờ
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 text-slate-500" />
                </span>
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">
                  Thời gian trả mới
                </span>
                <div className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3">
                  <CalendarClock size={18} className="shrink-0 text-secondaryDark" />
                  <span className="font-semibold text-primary">
                    {hasValidRequestedEnd
                      ? formatDateTime(new Date(requestedEndAt).toISOString())
                      : "Chưa có thời gian phù hợp"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block" htmlFor={`extension-end-date-${bookingId}`}>
                <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">
                  Ngày trả mới
                </span>
                <span className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 transition focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
                  <CalendarDays size={18} className="shrink-0 text-secondaryDark" />
                  <input
                    id={`extension-end-date-${bookingId}`}
                    type="date"
                    min={minimumDailyExtensionDate}
                    value={requestedEndDate}
                    onChange={(event) => {
                      const nextDate = event.target.value;
                      setRequestedEndAt(
                        nextDate && currentEndClock
                          ? `${nextDate}T${currentEndClock}`
                          : "",
                      );
                      setQuote(null);
                    }}
                    className="min-w-0 flex-1 bg-transparent font-semibold text-primary outline-none"
                  />
                </span>
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">
                  Giờ trả giữ nguyên
                </span>
                <div className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3">
                  <Clock3 size={18} className="shrink-0 text-secondaryDark" />
                  <span className="font-semibold text-primary">
                    {currentEndClock || "--:--"}
                  </span>
                </div>
              </div>
            </div>
          )}
          {rentalMode === "HOURLY" && hourlyExtensionOptions.length === 0 && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              {HOURLY_BOOKING_MAX_DURATION_MESSAGE}
            </p>
          )}
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Hệ thống sẽ kiểm tra lịch trống và tính chi phí theo bảng giá đã chốt của booking.
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {rentalMode === "HOURLY"
              ? "Mỗi lần gia hạn tối thiểu 2 giờ và tổng thời lượng booking thuê theo giờ không được vượt quá 8 giờ."
              : "Booking thuê theo ngày: chỉ chọn ngày trả mới; giờ trả được giữ nguyên theo booking hiện tại."}
          </p>
          <button
            type="button"
            onClick={() => void handleQuote()}
            disabled={
              quoteLoading || actionId === "request" || !hasValidRequestedEnd
            }
            className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-secondary bg-white px-4 font-extrabold text-primary hover:bg-secondarySoft/30 disabled:opacity-60"
          >
            {quoteLoading && <Loader2 size={18} className="animate-spin" />}
            Xem chi phí dự kiến
          </button>
          {quote && (
            <div className="mt-3 grid gap-3 rounded-lg border border-secondary/40 bg-white p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Thời lượng gia hạn</p>
                <p className="mt-1 font-extrabold text-primary">
                  {formatDuration(quote.additionalDurationMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Chi phí dự kiến</p>
                <p className="mt-1 text-lg font-extrabold text-secondaryDark">
                  {formatCurrency(quote.additionalAmount)}
                </p>
              </div>
              <p className="text-sm font-semibold leading-6 text-slate-600 sm:col-span-2">
                Chủ xe cần duyệt yêu cầu. Thời gian trả mới chỉ có hiệu lực sau khi bạn thanh toán đủ khoản gia hạn.
              </p>
            </div>
          )}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setRequestFormOpen(false);
                setQuote(null);
              }}
              disabled={actionId === "request"}
              className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 font-bold text-primary hover:bg-slate-50 disabled:opacity-60"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void handleRequest()}
              disabled={actionId === "request" || !quote || !hasValidRequestedEnd}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-extrabold text-secondary hover:bg-primary/90 disabled:opacity-60"
            >
              {actionId === "request" && <Loader2 size={18} className="animate-spin" />}
              Gửi yêu cầu
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-5 flex min-h-24 items-center justify-center text-slate-500">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : extensions.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">
          Chưa có yêu cầu gia hạn nào cho booking này.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-primary">
            <History size={18} className="text-secondaryDark" /> Lịch sử gia hạn
          </div>
          {extensions.map((extension) => {
            const payment = getPayment(extension);
            const waitingPayment = ["OWNER_APPROVED", "PAYMENT_PENDING"].includes(
              extension.status,
            );
            const deadlineExpired = Boolean(
              extension.paymentDeadlineAt &&
                new Date(extension.paymentDeadlineAt).getTime() <= now,
            );

            return (
              <article key={extension._id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-extrabold ${STATUS_CLASSES[extension.status]}`}>
                      {STATUS_LABELS[extension.status]}
                    </span>
                    <p className="mt-3 text-sm font-semibold text-slate-600">
                      Từ <strong className="text-primary">{formatDateTime(extension.oldEndAt)}</strong>
                      {" "}đến <strong className="text-primary">{formatDateTime(extension.requestedEndAt)}</strong>
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Gửi lúc {formatDateTime(extension.requestedAt)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white px-4 py-3 text-left sm:text-right">
                    <p className="text-xs font-bold uppercase text-slate-400">Chi phí gia hạn</p>
                    <p className="mt-1 text-lg font-extrabold text-primary">
                      {formatCurrency(extension.additionalAmount)}
                    </p>
                  </div>
                </div>

                {extension.rejectReason && (
                  <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    Lý do từ chối: {extension.rejectReason}
                  </p>
                )}

                {waitingPayment && extension.paymentDeadlineAt && (
                  <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${deadlineExpired ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                    <Clock3 size={17} />
                    {deadlineExpired
                      ? "Đã hết thời gian thanh toán"
                      : `Còn ${getCountdown(extension.paymentDeadlineAt, now)} để thanh toán`}
                  </div>
                )}

                {mode === "OWNER" && extension.status === "REQUESTED" && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    {rejectingId === extension._id && (
                      <textarea
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="Nhập lý do từ chối yêu cầu gia hạn"
                        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
                      />
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (rejectingId === extension._id) {
                            void handleReject(extension._id);
                          } else {
                            setRejectingId(extension._id);
                            setRejectReason("");
                          }
                        }}
                        disabled={Boolean(actionId)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 font-extrabold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        <XCircle size={18} /> Từ chối
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApprove(extension._id)}
                        disabled={Boolean(actionId)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 font-extrabold text-primary hover:brightness-95 disabled:opacity-60"
                      >
                        {actionId === extension._id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        Duyệt gia hạn
                      </button>
                    </div>
                  </div>
                )}

                {mode === "RENTER" && extension.status === "REQUESTED" && (
                  <div className="mt-4 flex justify-end border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={() => void handleCancel(extension._id)}
                      disabled={Boolean(actionId)}
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-bold text-primary hover:bg-slate-100 disabled:opacity-60"
                    >
                      Hủy yêu cầu
                    </button>
                  </div>
                )}

                {mode === "RENTER" && waitingPayment && !deadlineExpired && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    {payment?.method === "CASH" && payment.status === "PENDING" ? (
                      CASH_PAYMENT_UI_ENABLED ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                          Đã chọn tiền mặt. Vui lòng thanh toán cho chủ xe trước khi hết thời hạn để được kích hoạt gia hạn.
                        </div>
                      ) : null
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="flex-1 text-sm font-extrabold text-primary">
                          Phương thức thanh toán
                          <select
                            value={paymentMethod}
                            onChange={(event) => setPaymentMethod(event.target.value as "CASH" | "MOMO" | "VNPAY")}
                            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-semibold outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
                          >
                            <option value="VNPAY">VNPay</option>
                            <option value="MOMO">MoMo</option>
                            {CASH_PAYMENT_UI_ENABLED && (
                              <option value="CASH">Tiền mặt</option>
                            )}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => void handlePayment(extension)}
                          disabled={Boolean(actionId)}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-extrabold text-secondary hover:bg-primary/90 disabled:opacity-60"
                        >
                          {actionId === extension._id ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                          Thanh toán {formatCurrency(extension.additionalAmount)}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {CASH_PAYMENT_UI_ENABLED &&
                  mode === "OWNER" &&
                  extension.status === "PAYMENT_PENDING" &&
                  payment?.method === "CASH" &&
                  payment.status === "PENDING" &&
                  !deadlineExpired && (
                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-slate-600">
                        Khách chọn thanh toán tiền mặt cho khoản gia hạn này.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleConfirmCash(extension)}
                        disabled={Boolean(actionId)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 font-extrabold text-primary hover:brightness-95 disabled:opacity-60"
                      >
                        {actionId === extension._id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        Xác nhận đã nhận tiền
                      </button>
                    </div>
                  )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
