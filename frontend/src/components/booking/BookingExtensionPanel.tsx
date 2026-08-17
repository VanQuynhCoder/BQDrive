import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Repeat2,
  XCircle,
} from "lucide-react";

import {
  bookingExtensionService,
  type BookingExtension,
  type BookingExtensionQuote,
  type BookingExtensionRequestType,
  type BookingExtensionStatus,
} from "../../services/bookingExtension.service";
import { paymentService } from "../../services/payment.service";
import { notifyNotificationSummaryChanged } from "../../services/notification.service";
import { formatVietnamDateTime } from "../../utils/date.util";

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
const HOURLY_BOOKING_MAX_TOTAL_HOURS = 24;
const HOURLY_BOOKING_MAX_DURATION_MESSAGE =
  "Tổng thời lượng của booking thuê theo giờ không được vượt quá 24 giờ.";
const HOUR_MS = 60 * 60_000;
const BOOKING_EXTENSION_REQUEST_MIN_LEAD_MS = 30 * 60_000;

const STATUS_LABELS: Record<BookingExtensionStatus, string> = {
  REQUESTED: "Đang chờ chủ xe xác nhận",
  OWNER_APPROVED: "Chủ xe đã chấp nhận yêu cầu",
  PAYMENT_PENDING: "Đang chờ thanh toán",
  APPLIED: "Đã áp dụng",
  REJECTED: "Chủ xe đã từ chối yêu cầu",
  CANCELLED: "Yêu cầu đã được hủy",
  EXPIRED: "Yêu cầu gia hạn đã hết hạn",
};

const STATUS_CLASSES: Record<BookingExtensionStatus, string> = {
  REQUESTED: "border-amber-200 bg-amber-50 text-amber-800",
  OWNER_APPROVED: "border-blue-200 bg-blue-50 text-blue-700",
  PAYMENT_PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  APPLIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-600",
  EXPIRED:
    "border-red-300 bg-red-50 text-red-800 shadow-sm ring-1 ring-red-200/80",
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

function getRequestType(extension: BookingExtension) {
  return extension.requestType === "PLAN_CONVERSION"
    ? "PLAN_CONVERSION"
    : "EXTENSION";
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

function formatRentalMode(mode?: string) {
  if (mode === "HOURLY") return "Theo giờ";
  if (mode === "DAILY") return "Theo ngày";
  return "--";
}

function getExtensionStatusLabel(extension: BookingExtension) {
  if (extension.status === "APPLIED") {
    return getRequestType(extension) === "PLAN_CONVERSION"
      ? "Chuyển sang gói ngày đã được áp dụng"
      : "Gia hạn đã được áp dụng";
  }
  return STATUS_LABELS[extension.status];
}

function getPopulatedPayment(extension?: BookingExtension) {
  return extension?.paymentId && typeof extension.paymentId === "object"
    ? extension.paymentId
    : undefined;
}

function QuoteValue({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p
        className={`mt-1 font-extrabold ${
          emphasis ? "text-lg text-secondaryDark" : "text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
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
  const [requestType, setRequestType] =
    useState<BookingExtensionRequestType>("EXTENSION");
  const [requestedEndAt, setRequestedEndAt] = useState(() =>
    getDefaultRequestedEndAt(currentEndAt, rentalMode),
  );
  const [quote, setQuote] = useState<BookingExtensionQuote | null>(null);
  const [dailyAlternativeQuote, setDailyAlternativeQuote] =
    useState<BookingExtensionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"MOMO" | "VNPAY">(
    "VNPAY",
  );
  const [now, setNow] = useState(0);
  const deadlineRefreshKeysRef = useRef(new Set<string>());
  const paymentSubmittingIdsRef = useRef(new Set<string>());

  const clearQuotes = () => {
    setQuote(null);
    setDailyAlternativeQuote(null);
  };

  const loadExtensions = useCallback(async () => {
    setLoading(true);
    try {
      setExtensions(await bookingExtensionService.listByBooking(bookingId));
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể tải lịch sử gia hạn."));
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
      setRequestType("EXTENSION");
      clearQuotes();
    });
  }, [currentEndAt, rentalMode]);

  const activeExtension = useMemo(
    () => extensions.find((item) => ACTIVE_STATUSES.includes(item.status)),
    [extensions],
  );
  const currentEndTime = new Date(currentEndAt).getTime();
  const hasCurrentRentalTimeRemaining =
    now > 0 && Number.isFinite(currentEndTime) && now < currentEndTime;
  const hasExtensionRequestWindow =
    hasCurrentRentalTimeRemaining &&
    currentEndTime - now > BOOKING_EXTENSION_REQUEST_MIN_LEAD_MS;
  const canRequest =
    mode === "RENTER" &&
    bookingStatus === "IN_PROGRESS" &&
    hasExtensionRequestWindow &&
    !activeExtension;
  const isPlanConversion =
    rentalMode === "HOURLY" && requestType === "PLAN_CONVERSION";
  const [requestedEndDate = "", requestedEndClock = ""] =
    requestedEndAt.split("T");
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
    rentalMode === "HOURLY" && !isPlanConversion && Number.isFinite(currentEndTime)
      ? Math.round((new Date(requestedEndAt).getTime() - currentEndTime) / HOUR_MS)
      : 0;
  const hasValidRequestedEnd =
    rentalMode === "HOURLY" && !isPlanConversion
      ? hourlyExtensionOptions.includes(selectedHourlyExtensionHours)
      : Boolean(
          requestedEndDate &&
            (isPlanConversion ? requestedEndClock : currentEndClock),
        );
  const getHourlyValidationMessage = (candidateTime: number) => {
    if (rentalMode !== "HOURLY" || isPlanConversion) return "";

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
  const activePayment = getPopulatedPayment(activeExtension);
  const dailyAlternativeSavings =
    !isPlanConversion &&
    quote &&
    dailyAlternativeQuote &&
    dailyAlternativeQuote.additionalAmount < quote.additionalAmount
      ? quote.additionalAmount - dailyAlternativeQuote.additionalAmount
      : 0;
  const activePaymentMethod =
    activePayment?.status === "PENDING" &&
    (activePayment.method === "MOMO" || activePayment.method === "VNPAY")
      ? activePayment.method
      : undefined;

  useEffect(() => {
    if (!activePaymentMethod) return;
    queueMicrotask(() => setPaymentMethod(activePaymentMethod));
  }, [activePaymentMethod]);

  useEffect(() => {
    if (now <= 0) return;
    const reachedDeadline = extensions.find(
      (extension) =>
        ACTIVE_STATUSES.includes(extension.status) &&
        extension.paymentDeadlineAt &&
        new Date(extension.paymentDeadlineAt).getTime() <= now,
    );
    if (!reachedDeadline?.paymentDeadlineAt) return;

    const refreshKey = `${reachedDeadline._id}:${reachedDeadline.paymentDeadlineAt}`;
    if (deadlineRefreshKeysRef.current.has(refreshKey)) return;
    deadlineRefreshKeysRef.current.add(refreshKey);
    queueMicrotask(() => void loadExtensions());
  }, [extensions, loadExtensions, now]);

  const refreshAfterAction = async (bookingChanged = false) => {
    await loadExtensions();
    notifyNotificationSummaryChanged();
    if (bookingChanged && onChanged) {
      try {
        await onChanged();
      } catch {
        toast.error(
          "Yêu cầu đã được áp dụng nhưng chưa thể làm mới thông tin booking.",
        );
      }
    }
  };

  const hasValidRequestTiming = () => {
    const endTime = new Date(currentEndAt).getTime();
    const currentTime = Date.now();
    if (!Number.isFinite(endTime) || currentTime >= endTime) {
      setRequestFormOpen(false);
      clearQuotes();
      toast.error(
        "Chuyến thuê đã đến thời gian trả xe và không thể gia hạn thêm.",
      );
      return false;
    }
    if (endTime - currentTime <= BOOKING_EXTENSION_REQUEST_MIN_LEAD_MS) {
      setRequestFormOpen(false);
      clearQuotes();
      toast.error(
        "Không thể gửi yêu cầu gia hạn trong 30 phút cuối trước giờ trả xe.",
      );
      return false;
    }
    return true;
  };

  const handleQuote = async () => {
    if (!hasValidRequestTiming()) return;
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
      const nextQuote = await bookingExtensionService.quote(
        bookingId,
        nextEnd.toISOString(),
        requestType,
      );
      setQuote(nextQuote);
      setDailyAlternativeQuote(null);

      if (rentalMode === "HOURLY" && requestType === "EXTENSION") {
        try {
          const alternativeQuote = await bookingExtensionService.quote(
            bookingId,
            nextEnd.toISOString(),
            "PLAN_CONVERSION",
          );
          setDailyAlternativeQuote(alternativeQuote);
        } catch {
          // Xe có thể chưa có bảng giá ngày; khi đó không hiển thị gợi ý.
          setDailyAlternativeQuote(null);
        }
      }
    } catch (error) {
      clearQuotes();
      toast.error(getErrorMessage(error, "Không thể tính chi phí gia hạn."));
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleRequest = async () => {
    if (!hasValidRequestTiming()) return;
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
      await bookingExtensionService.request(
        bookingId,
        nextEnd.toISOString(),
        requestType,
      );
      toast.success(
        isPlanConversion
          ? "Đã gửi yêu cầu chuyển sang gói ngày đến chủ xe."
          : "Đã gửi yêu cầu gia hạn đến chủ xe.",
      );
      setRequestFormOpen(false);
      clearQuotes();
      await refreshAfterAction();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể gửi yêu cầu gia hạn."));
    } finally {
      setActionId("");
    }
  };

  const handleCancel = async (extension: BookingExtension) => {
    setActionId(extension._id);
    try {
      await bookingExtensionService.cancel(extension._id);
      toast.success(
        getRequestType(extension) === "PLAN_CONVERSION"
          ? "Đã hủy yêu cầu chuyển gói."
          : "Đã hủy yêu cầu gia hạn.",
      );
      await refreshAfterAction();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể hủy yêu cầu gia hạn."));
    } finally {
      setActionId("");
    }
  };

  const handleApprove = async (extension: BookingExtension) => {
    setActionId(extension._id);
    try {
      const approvedExtension = await bookingExtensionService.approve(
        extension._id,
      );
      toast.success(
        approvedExtension.status === "APPLIED"
          ? "Yêu cầu chuyển gói 0 đồng đã được áp dụng thành công."
          : `Đã duyệt yêu cầu ${getRequestType(extension) === "PLAN_CONVERSION" ? "chuyển gói" : "gia hạn"}. Khách có 10 phút để thanh toán online.`,
      );
      await refreshAfterAction(approvedExtension.status === "APPLIED");
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể duyệt yêu cầu gia hạn."));
    } finally {
      setActionId("");
    }
  };

  const handleReject = async (extension: BookingExtension) => {
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Vui lòng nhập lý do từ chối.");
      return;
    }
    setActionId(extension._id);
    try {
      await bookingExtensionService.reject(extension._id, reason);
      toast.success(
        getRequestType(extension) === "PLAN_CONVERSION"
          ? "Đã từ chối yêu cầu chuyển gói."
          : "Đã từ chối yêu cầu gia hạn.",
      );
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
    if (paymentSubmittingIdsRef.current.has(extension._id)) return;
    if (
      extension.paymentDeadlineAt &&
      new Date(extension.paymentDeadlineAt).getTime() <= Date.now()
    ) {
      toast.error(
        `Thời hạn thanh toán ${getRequestType(extension) === "PLAN_CONVERSION" ? "chuyển gói" : "gia hạn"} đã kết thúc.`,
      );
      await loadExtensions();
      return;
    }

    paymentSubmittingIdsRef.current.add(extension._id);
    setActionId(extension._id);
    try {
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
      paymentSubmittingIdsRef.current.delete(extension._id);
      toast.error(getErrorMessage(error, "Không thể tạo thanh toán gia hạn."));
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
            <CalendarClock size={18} /> Gia hạn / chuyển gói
          </button>
        )}
      </div>

      {mode === "RENTER" &&
        bookingStatus === "IN_PROGRESS" &&
        now > 0 &&
        !activeExtension &&
        hasCurrentRentalTimeRemaining &&
        !hasExtensionRequestWindow && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Không thể gửi yêu cầu gia hạn trong 30 phút cuối trước giờ trả xe.
          </p>
        )}

      {mode === "RENTER" &&
        bookingStatus === "IN_PROGRESS" &&
        now > 0 &&
        !activeExtension &&
        !hasCurrentRentalTimeRemaining && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Chuyến thuê đã đến thời gian trả xe và không thể gia hạn thêm.
          </p>
        )}

      {requestFormOpen && hasExtensionRequestWindow && (
        <div className="mt-4 rounded-lg border border-secondary/35 bg-secondarySoft/30 p-4">
          {rentalMode === "HOURLY" && (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setRequestType("EXTENSION");
                  setRequestedEndAt(
                    toDateTimeLocal(
                      new Date(currentEndTime + HOURLY_EXTENSION_MIN_HOURS * HOUR_MS),
                    ),
                  );
                  clearQuotes();
                }}
                className={`min-h-12 rounded-lg border px-4 text-left text-sm font-extrabold transition ${
                  !isPlanConversion
                    ? "border-secondary bg-white text-primary ring-2 ring-secondary/20"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                }`}
              >
                <Clock3 size={18} className="mr-2 inline text-secondaryDark" />
                Gia hạn theo giờ
              </button>
              <button
                type="button"
                onClick={() => {
                  setRequestType("PLAN_CONVERSION");
                  setRequestedEndAt(
                    toDateTimeLocal(new Date(currentEndTime + 24 * HOUR_MS)),
                  );
                  clearQuotes();
                }}
                className={`min-h-12 rounded-lg border px-4 text-left text-sm font-extrabold transition ${
                  isPlanConversion
                    ? "border-secondary bg-white text-primary ring-2 ring-secondary/20"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                }`}
              >
                <Repeat2 size={18} className="mr-2 inline text-secondaryDark" />
                Chuyển sang gói ngày
              </button>
            </div>
          )}
          <p className="text-sm font-extrabold text-primary">
            Thời gian trả xe mới
          </p>
          {rentalMode === "HOURLY" && !isPlanConversion ? (
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
                      clearQuotes();
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
          ) : isPlanConversion ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label
                className="block"
                htmlFor={`conversion-end-date-${bookingId}`}
              >
                <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">
                  Ngày trả mới
                </span>
                <span className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 transition focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
                  <CalendarDays
                    size={18}
                    className="shrink-0 text-secondaryDark"
                  />
                  <input
                    id={`conversion-end-date-${bookingId}`}
                    type="date"
                    min={currentEndLocal.slice(0, 10)}
                    value={requestedEndDate}
                    onChange={(event) => {
                      const nextDate = event.target.value;
                      setRequestedEndAt(
                        nextDate && requestedEndClock
                          ? `${nextDate}T${requestedEndClock}`
                          : "",
                      );
                      clearQuotes();
                    }}
                    className="min-w-0 flex-1 bg-transparent font-semibold text-primary outline-none"
                  />
                </span>
              </label>

              <label
                className="block"
                htmlFor={`conversion-end-time-${bookingId}`}
              >
                <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">
                  Giờ trả mới
                </span>
                <span className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 transition focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
                  <Clock3
                    size={18}
                    className="shrink-0 text-secondaryDark"
                  />
                  <input
                    id={`conversion-end-time-${bookingId}`}
                    type="time"
                    value={requestedEndClock}
                    onChange={(event) => {
                      const nextTime = event.target.value;
                      setRequestedEndAt(
                        requestedEndDate && nextTime
                          ? `${requestedEndDate}T${nextTime}`
                          : "",
                      );
                      clearQuotes();
                    }}
                    className="min-w-0 flex-1 bg-transparent font-semibold text-primary outline-none"
                  />
                </span>
              </label>
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
                      clearQuotes();
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
          {rentalMode === "HOURLY" &&
            !isPlanConversion &&
            hourlyExtensionOptions.length === 0 && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              {HOURLY_BOOKING_MAX_DURATION_MESSAGE}
            </p>
          )}
          <p className="mt-2 text-sm font-semibold text-slate-600">
            {isPlanConversion
              ? "Toàn bộ chuyến thuê sẽ được tính lại theo gói ngày dựa trên bảng giá đã chốt khi đặt xe."
              : "Hệ thống sẽ kiểm tra lịch trống và tính chi phí theo bảng giá đã chốt của booking."}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {isPlanConversion
              ? "Chuyển gói chỉ có hiệu lực sau khi chủ xe duyệt; nếu có chênh lệch tăng, khách cần thanh toán online thành công."
              : rentalMode === "HOURLY"
              ? "Mỗi lần gia hạn tối thiểu 2 giờ và tổng thời lượng booking thuê theo giờ không được vượt quá 24 giờ."
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
            <div className="mt-3 rounded-lg border border-secondary/40 bg-white p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-secondaryDark">
                {isPlanConversion ? "Chi phí chuyển gói" : "Chi phí gia hạn"}
              </p>
              {isPlanConversion ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <QuoteValue
                    label="Gói hiện tại"
                    value={formatRentalMode(quote.sourceRentalMode)}
                  />
                  <QuoteValue
                    label="Gói sau chuyển"
                    value={formatRentalMode(quote.targetRentalMode)}
                  />
                  <QuoteValue
                    label="Thời gian trả hiện tại"
                    value={formatDateTime(quote.oldEndAt)}
                  />
                  <QuoteValue
                    label="Thời gian trả mới"
                    value={formatDateTime(quote.requestedEndAt)}
                  />
                  <QuoteValue
                    label="Tổng giá sau chuyển"
                    value={
                      quote.appliedConvertedTotal === undefined
                        ? "--"
                        : formatCurrency(quote.appliedConvertedTotal)
                    }
                  />
                  <QuoteValue
                    label="Cần thanh toán thêm"
                    value={formatCurrency(quote.additionalAmount)}
                    emphasis
                  />
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <QuoteValue
                    label="Thời gian trả hiện tại"
                    value={formatDateTime(quote.oldEndAt)}
                  />
                  <QuoteValue
                    label="Thời gian trả mới"
                    value={formatDateTime(quote.requestedEndAt)}
                  />
                  <QuoteValue
                    label="Thời lượng gia hạn"
                    value={formatDuration(quote.additionalDurationMinutes)}
                  />
                  <QuoteValue
                    label="Cần thanh toán thêm"
                    value={formatCurrency(quote.additionalAmount)}
                    emphasis
                  />
                </div>
              )}
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                {quote.additionalAmount === 0
                  ? "Chủ xe cần duyệt yêu cầu. Sau khi duyệt và kiểm tra cuối thành công, gói thuê sẽ được áp dụng ngay mà không tạo thanh toán."
                  : isPlanConversion
                    ? "Chủ xe cần duyệt yêu cầu. Gói ngày và thời gian trả mới chỉ có hiệu lực sau khi bạn thanh toán online thành công."
                    : "Chủ xe cần duyệt yêu cầu. Thời gian trả mới chỉ có hiệu lực sau khi bạn thanh toán online thành công."}
              </p>
              {dailyAlternativeSavings > 0 && dailyAlternativeQuote && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-extrabold text-emerald-800">
                    Gợi ý tiết kiệm chi phí
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-emerald-700">
                    Quý khách có thể cân nhắc chuyển sang gói ngày. Phương án này
                    dự kiến tiết kiệm khoảng {formatCurrency(dailyAlternativeSavings)}
                    so với gia hạn theo giờ cho cùng thời gian trả xe.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestType("PLAN_CONVERSION");
                      setRequestedEndAt(
                        toDateTimeLocal(new Date(dailyAlternativeQuote.requestedEndAt)),
                      );
                      setQuote(dailyAlternativeQuote);
                      setDailyAlternativeQuote(null);
                    }}
                    className="mt-2 font-extrabold text-emerald-800 underline decoration-emerald-400 underline-offset-4 hover:text-emerald-950"
                  >
                    Xem phương án gói ngày
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setRequestFormOpen(false);
                clearQuotes();
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
          Chưa có yêu cầu gia hạn hoặc chuyển gói nào cho booking này.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-primary">
            <History size={18} className="text-secondaryDark" /> Lịch sử gia hạn và chuyển gói
          </div>
          {extensions.map((extension) => {
            const extensionRequestType = getRequestType(extension);
            const isConversion = extensionRequestType === "PLAN_CONVERSION";
            const waitingPayment = ["OWNER_APPROVED", "PAYMENT_PENDING"].includes(
              extension.status,
            );
            const requiresPayment =
              waitingPayment && Number(extension.additionalAmount || 0) > 0;
            const pendingPayment = getPopulatedPayment(extension);
            const hasPendingPayment = pendingPayment?.status === "PENDING";
            const deadlineExpired = Boolean(
              extension.paymentDeadlineAt &&
                new Date(extension.paymentDeadlineAt).getTime() <= now,
            );

            const isExpired = extension.status === "EXPIRED";

            return (
              <article
                key={extension._id}
                className={`rounded-lg border p-4 ${
                  isExpired
                    ? "border-red-200 bg-red-50/60 shadow-sm shadow-red-100"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-extrabold ${STATUS_CLASSES[extension.status]}`}>
                      {getExtensionStatusLabel(extension)}
                    </span>
                    <span className="ml-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-600">
                      {isConversion ? "Chuyển giờ → ngày" : "Gia hạn"}
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
                    <p className="text-xs font-bold uppercase text-slate-400">
                      {isConversion ? "Chi phí chuyển gói" : "Chi phí gia hạn"}
                    </p>
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

                {requiresPayment && extension.paymentDeadlineAt && (
                  <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${deadlineExpired ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                    <Clock3 size={17} />
                    {deadlineExpired
                      ? "Đã hết thời gian thanh toán"
                      : `Còn ${getCountdown(extension.paymentDeadlineAt, now)} để thanh toán`}
                  </div>
                )}

                {isExpired && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-100 px-3 py-2 text-sm font-extrabold text-red-800">
                    <Clock3 size={17} className="mt-0.5 shrink-0" />
                    <span>Yêu cầu đã hết hạn, thời gian trả xe cũ vẫn được giữ nguyên.</span>
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
                        placeholder={`Nhập lý do từ chối ${isConversion ? "chuyển gói" : "gia hạn"}`}
                        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
                      />
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (rejectingId === extension._id) {
                            void handleReject(extension);
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
                        onClick={() => void handleApprove(extension)}
                        disabled={Boolean(actionId)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 font-extrabold text-primary hover:brightness-95 disabled:opacity-60"
                      >
                        {actionId === extension._id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        {isConversion ? "Duyệt chuyển gói" : "Duyệt gia hạn"}
                      </button>
                    </div>
                  </div>
                )}

                {mode === "RENTER" && extension.status === "REQUESTED" && (
                  <div className="mt-4 flex justify-end border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={() => void handleCancel(extension)}
                      disabled={Boolean(actionId)}
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-bold text-primary hover:bg-slate-100 disabled:opacity-60"
                    >
                      Hủy yêu cầu
                    </button>
                  </div>
                )}

                {mode === "RENTER" && requiresPayment && !deadlineExpired && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="flex-1 text-sm font-extrabold text-primary">
                        Phương thức thanh toán online
                        <select
                          value={paymentMethod}
                          onChange={(event) =>
                            setPaymentMethod(
                              event.target.value as "MOMO" | "VNPAY",
                            )
                          }
                          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-semibold outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
                        >
                          <option value="VNPAY">VNPay</option>
                          <option value="MOMO">MoMo</option>
                        </select>
                        {hasPendingPayment && (
                          <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">
                            Giao dịch đang chờ sẽ được tiếp tục nếu bạn giữ nguyên phương thức thanh toán.
                          </span>
                        )}
                      </label>
                      <button
                        type="button"
                        onClick={() => void handlePayment(extension)}
                        disabled={Boolean(actionId)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-extrabold text-secondary hover:bg-primary/90 disabled:opacity-60"
                      >
                        {actionId === extension._id ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                        {hasPendingPayment ? "Tiếp tục thanh toán" : "Thanh toán"}{" "}
                        {formatCurrency(extension.additionalAmount)}
                      </button>
                    </div>
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
