import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  X,
  UserX,
  XCircle,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  BookingNextAction,
  BookingTimeline,
} from "../../components/booking/BookingTimeline";
import ExtraChargeManager from "../../components/booking/ExtraChargeManager";
import {
  privateOwnerService,
  type PrivateOwnerBooking,
} from "../../services/privateOwner.service";
import { notifyNotificationSummaryChanged } from "../../services/notification.service";
import { getBookingTimelineView } from "../../utils/bookingTimeline.util";
import { formatVietnamDateTime } from "../../utils/date.util";
import { normalizeImageUrl } from "../../utils/image.util";

type BookingAction =
  | "confirm"
  | "reject"
  | "handover"
  | "confirm-remaining"
  | "complete"
  | "no-show";
type DocumentPreviewTarget = {
  label: string;
  value: string;
};
const OWNER_REVIEW_STATUSES = ["REQUESTED", "PENDING"]; // Booking chờ chủ xe duyệt
const READY_TO_HANDOVER_STATUSES = [
  "PAID",
  "OWNER_APPROVED",
  "PAYMENT_PENDING",
  "WAITING_PAYMENT",
  "CONFIRMED",
]; // Booking đã duyệt/đã thanh toán, có thể bàn giao hoặc xử lý no-show
const PICKUP_GRACE_MINUTES = 30;

function formatDateTime(value?: string) {
  if (!value) return "--";

  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getStatusBadge(status?: string) {
  if (status === "REQUESTED") return { label: "Chờ chủ xe duyệt", tone: "yellow" as const };
  if (status === "OWNER_APPROVED") return { label: "Đã duyệt", tone: "blue" as const };
  if (status === "PAYMENT_PENDING") return { label: "Đang thanh toán", tone: "yellow" as const };
  if (status === "PAID") return { label: "Đã thanh toán", tone: "green" as const };

  const map: Record<
    string,
    { label: string; tone: "green" | "red" | "yellow" | "blue" | "gray" }
  > = {
    PENDING: { label: "Chờ xác nhận", tone: "yellow" },
    CONFIRMED: { label: "Đã xác nhận", tone: "blue" },
    IN_PROGRESS: { label: "Đang thuê", tone: "blue" },
    COMPLETED: { label: "Hoàn tất", tone: "green" },
    CANCELLED: { label: "Đã hủy", tone: "gray" },
    REJECTED: { label: "Từ chối", tone: "red" },
    NO_SHOW: { label: "Không nhận xe", tone: "red" },
  };

  return map[status || ""] || { label: status || "--", tone: "gray" };
}

function getPaymentBadge(booking: PrivateOwnerBooking) {
  const paidAmount = booking.paidAmount || 0;
  const remainingAmount = booking.remainingAmount || 0;

  if (remainingAmount <= 0 && paidAmount > 0) {
    return { label: "Đã thanh toán", tone: "green" as const };
  }

  if (paidAmount > 0) {
    return { label: "Đã cọc", tone: "blue" as const };
  }

  return { label: "Chưa thanh toán", tone: "yellow" as const };
}

function getRemainingCollectionAmount(booking: PrivateOwnerBooking) {
  const totalPrice = booking.totalPrice || 0;
  const paidAmount = booking.paidAmount || 0;
  const remainingAmount = booking.remainingAmount || 0;

  return Math.max(remainingAmount || totalPrice - paidAmount, 0);
}

function getHandoverButtonLabel(booking: PrivateOwnerBooking) {
  const remainingAmount = getRemainingCollectionAmount(booking);
  const paidAmount = booking.paidAmount || 0;

  if (remainingAmount > 0 && paidAmount > 0 && hasPendingManualPayment(booking)) {
    return "Giao xe và thu phần còn lại";
  }

  if (remainingAmount > 0 && paidAmount > 0) {
    return "Bàn giao xe (còn tiền)";
  }

  if (remainingAmount > 0) {
    return "Giao xe và nhận tiền";
  }

  return "Bàn giao xe";
}

function hasPendingManualPayment(booking: PrivateOwnerBooking) {
  return (
    booking.payment?.status === "PENDING" &&
    booking.payment.method === "CASH"
  );
}

function canHandoverBooking(booking: PrivateOwnerBooking) {
  return (
    READY_TO_HANDOVER_STATUSES.includes(booking.status || "") &&
    ((booking.paidAmount || 0) > 0 || hasPendingManualPayment(booking))
  );
}

function canConfirmRemainingCash(booking: PrivateOwnerBooking) {
  const remainingAmount = getRemainingCollectionAmount(booking);
  const paidAmount = booking.paidAmount || 0;

  return (
    remainingAmount > 0 &&
    paidAmount > 0 &&
    !["COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"].includes(
      booking.status || "",
    )
  );
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function BookingSummaryCard({
  booking,
  onPreviewDocument,
}: {
  booking: PrivateOwnerBooking;
  onPreviewDocument: (document: DocumentPreviewTarget) => void;
}) {
  const car = booking.carId;
  const customer = booking.userId;
  const renterInfo = booking.renterInfo;
  const status = getStatusBadge(booking.status);
  const payment = getPaymentBadge(booking);
  const carImage = normalizeImageUrl(car?.images?.find(Boolean));
  const timeline = getBookingTimelineView({
    status: booking.status,
    perspective: "OWNER",
    startDate: booking.startDate,
    totalPrice: booking.totalPrice,
    paidAmount: booking.paidAmount,
    remainingAmount: booking.remainingAmount,
  });
  const remainingCollectionAmount = getRemainingCollectionAmount(booking);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 bg-slate-50 p-4 sm:flex-row">
        <div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white sm:w-44">
          {carImage ? (
            <img
              src={carImage}
              alt={car?.name || "Xe"}
              className="h-full w-full object-cover"
            />
          ) : (
            <CalendarDays size={28} className="text-slate-300" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="line-clamp-2 text-lg font-extrabold uppercase text-primary">
              {car?.name || "Xe"}
            </h4>
            <AdminStatusBadge tone={status.tone} label={status.label} />
          </div>
          <p className="mt-1 text-sm font-bold text-slate-500">
            {car?.licensePlate || "Chưa có biển số"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminStatusBadge tone={payment.tone} label={payment.label} />
            <AdminStatusBadge
              tone="gray"
              label={`Tổng tiền ${formatCurrency(booking.totalPrice)}`}
            />
            {remainingCollectionAmount > 0 && (
              <AdminStatusBadge
                tone="yellow"
                label={`Còn lại cần thu ${formatCurrency(remainingCollectionAmount)}`}
              />
            )}
          </div>
          {remainingCollectionAmount > 0 && (booking.paidAmount || 0) > 0 && (
            <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-bold leading-5 text-slate-700">
              Khách đã thanh toán cọc. Phần còn lại có thể thanh toán online
              trên hệ thống hoặc trả trực tiếp khi nhận xe; chỉ ghi nhận đủ khi
              chủ xe xác nhận đã thu.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 border-t border-slate-200 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">
            Khách hàng
          </p>
          <p className="mt-1 font-extrabold text-primary">
            {renterInfo?.fullName || customer?.name || "--"}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {renterInfo?.email || customer?.email || "--"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {renterInfo?.phone || customer?.phone || "Chưa có số điện thoại"}
          </p>
          <p className="mt-2 text-xs font-bold text-slate-500">
            CCCD/CMND:{" "}
            <span className="text-primary">{renterInfo?.cccdNumber || "--"}</span>
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Bằng lái:{" "}
            <span className="text-primary">
              {renterInfo?.driverLicenseNumber || "--"}
            </span>
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase text-slate-400">
            Lịch thuê
          </p>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="font-bold text-slate-500">Nhận xe</span>
              <span className="text-right font-extrabold text-primary">
                {formatDateTime(booking.startDate)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="font-bold text-slate-500">Trả xe</span>
              <span className="text-right font-extrabold text-primary">
                {formatDateTime(booking.endDate)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-200 p-4">
        <div>
          <p className="mb-3 text-xs font-bold uppercase text-slate-400">
            Timeline xử lý
          </p>
          <BookingTimeline timeline={timeline} compact />
        </div>
        <BookingNextAction timeline={timeline} />
      </div>

      <div className="grid gap-3 border-t border-slate-200 p-4 text-sm sm:grid-cols-3">
        <DocumentPreview
          label="CCCD mặt trước"
          value={renterInfo?.cccdFrontImage}
          onPreview={onPreviewDocument}
        />
        <DocumentPreview
          label="CCCD mặt sau"
          value={renterInfo?.cccdBackImage}
          onPreview={onPreviewDocument}
        />
        <DocumentPreview
          label="Bằng lái xe"
          value={renterInfo?.driverLicenseImage}
          onPreview={onPreviewDocument}
        />
      </div>

      {renterInfo?.note && (
        <div className="border-t border-slate-200 p-4">
          <p className="text-xs font-bold uppercase text-slate-400">Ghi chú</p>
          <p className="mt-1 text-sm font-semibold text-primary">{renterInfo.note}</p>
        </div>
      )}
    </div>
  );
}

function isPickupOverdue(booking: PrivateOwnerBooking) {
  if (!READY_TO_HANDOVER_STATUSES.includes(booking.status || "")) return false;

  const pickupTime = new Date(booking.startDate).getTime();
  if (Number.isNaN(pickupTime)) return false;

  return Date.now() > pickupTime + PICKUP_GRACE_MINUTES * 60 * 1000;
}

function DocumentPreview({
  label,
  value,
  onPreview,
}: {
  label: string;
  value?: string;
  onPreview: (document: DocumentPreviewTarget) => void;
}) {
  const imageUrl = normalizeImageUrl(value);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold uppercase text-slate-400">{label}</p>
      {imageUrl ? (
        <button
          type="button"
          onClick={() => onPreview({ label, value: imageUrl })}
          className="group relative block h-28 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left focus:outline-none focus:ring-2 focus:ring-secondary"
          aria-label={`Xem ảnh ${label}`}
        >
          <img src={imageUrl} alt={label} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
          <span className="absolute inset-0 flex items-center justify-center bg-primary/0 opacity-0 transition group-hover:bg-primary/45 group-hover:opacity-100">
            <span className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-extrabold text-primary shadow-lg">
              <Eye size={15} />
              Xem ảnh
            </span>
          </span>
        </button>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-400">
          Chưa có ảnh
        </div>
      )}
    </div>
  );
}

function DocumentImageModal({
  document,
  onClose,
}: {
  document: DocumentPreviewTarget | null;
  onClose: () => void;
}) {
  if (!document) return null;

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-primary/20 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 bg-primary px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase text-secondary">Hồ sơ khách thuê</p>
            <h3 className="mt-1 text-lg font-extrabold text-white">{document.label}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white/75 transition hover:bg-white/10 hover:text-secondary"
            aria-label="Đóng ảnh"
          >
            <X size={22} />
          </button>
        </div>
        <div className="min-h-0 overflow-auto bg-slate-100 p-4">
          <img
            src={document.value}
            alt={document.label}
            className="mx-auto max-h-[74vh] w-auto max-w-full rounded-lg bg-white object-contain shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return fallback;
}

export default function PrivateOwnerBookingsPage() {
  const [bookings, setBookings] = useState<PrivateOwnerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [action, setAction] = useState<{
    type: BookingAction;
    booking: PrivateOwnerBooking;
  } | null>(null);
  const [noShowReason, setNoShowReason] = useState("");
  const [previewDocument, setPreviewDocument] = useState<DocumentPreviewTarget | null>(null);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      setBookings(await privateOwnerService.getMyBookings());
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể tải danh sách booking"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    privateOwnerService
      .getMyBookings()
      .then((data) => {
        if (active) setBookings(data);
      })
      .catch((error) => {
        toast.error(getErrorMessage(error, "Không thể tải danh sách booking"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const openAction = (type: BookingAction, booking: PrivateOwnerBooking) => {
    setNoShowReason("");
    setAction({ type, booking });
  };

  const closeAction = () => {
    if (submitting) return;
    setNoShowReason("");
    setAction(null);
  };

  const confirmAction = async () => {
    if (!action) return;

    setSubmitting(true);
    try {
      if (action?.type === "confirm") {
        await privateOwnerService.confirmBooking(action.booking._id);
        toast.success("Đã xác nhận booking");
      }

      if (action?.type === "reject") {
        await privateOwnerService.rejectBooking(action.booking._id);
        toast.success("Đã từ chối booking");
      }

      if (action?.type === "handover") {
        await privateOwnerService.handoverBooking(action.booking._id);
        toast.success("Đã bàn giao xe");
      }

      if (action?.type === "confirm-remaining") {
        await privateOwnerService.confirmRemainingCash(action.booking._id);
        toast.success("Đã xác nhận thu phần còn lại");
      }

      if (action?.type === "complete") {
        await privateOwnerService.completeBooking(action.booking._id);
        toast.success("Đã hoàn tất booking");
      }

      if (action?.type === "no-show") {
        await privateOwnerService.noShowBooking(
          action.booking._id,
          noShowReason.trim() || undefined,
        );
        toast.success("Đã đánh dấu No Show, tiền cọc không hoàn lại");
      }

      closeAction();
      await fetchBookings();
      notifyNotificationSummaryChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, "Thao tác booking thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle =
    action?.type === "confirm"
      ? "Xác nhận booking"
      : action?.type === "reject"
        ? "Từ chối booking"
        : action?.type === "handover"
          ? "Giao xe / Đã nhận tiền"
        : action?.type === "confirm-remaining"
          ? "Xác nhận đã thu phần còn lại"
      : action?.type === "complete"
        ? "Hoàn tất booking"
        : "Đánh dấu không nhận xe";

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">
          Lịch thuê xe
        </p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">
          Booking
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Theo dõi booking phát sinh từ xe của bạn, xác nhận lịch thuê và xử lý
          các trường hợp khách không đến nhận xe.
        </p>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Mã booking</th>
                <th className="px-5 py-4">Khách hàng</th>
                <th className="px-5 py-4">Xe</th>
                <th className="px-5 py-4">Ngày nhận xe</th>
                <th className="px-5 py-4">Ngày trả xe</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Thanh toán</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    Đang tải danh sách booking...
                  </td>
                </tr>
              )}

              {!loading &&
                bookings.map((booking) => {
                  const status = getStatusBadge(booking.status);
                  const payment = getPaymentBadge(booking);
                  const canHandover = canHandoverBooking(booking);
                  const pickupOverdue = isPickupOverdue(booking);
                  const canMarkNoShow =
                    READY_TO_HANDOVER_STATUSES.includes(booking.status || "") &&
                    pickupOverdue;
                  const remainingCollectionAmount =
                    getRemainingCollectionAmount(booking);
                  const canComplete =
                    booking.status === "IN_PROGRESS" &&
                    remainingCollectionAmount <= 0;
                  const canConfirmRemaining =
                    canConfirmRemainingCash(booking);

                  return (
                    <tr key={booking._id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-extrabold text-primary">
                        #{booking._id.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-extrabold text-primary">
                          {booking.renterInfo?.fullName || booking.userId.name || "--"}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {booking.renterInfo?.email || booking.userId.email || "--"}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {booking.carId.name || "--"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDateTime(booking.startDate)}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDateTime(booking.endDate)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-start gap-2">
                          <AdminStatusBadge
                            tone={status.tone}
                            label={status.label}
                          />
                          {pickupOverdue && (
                            <AdminStatusBadge
                              tone="red"
                              label="Đã quá giờ nhận xe"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-start gap-2">
                          <AdminStatusBadge
                            tone={payment.tone}
                            label={payment.label}
                          />
                          {remainingCollectionAmount > 0 && (
                            <span className="text-xs font-bold text-slate-500">
                              Còn lại cần thu:{" "}
                              <span className="text-primary">
                                {formatCurrency(remainingCollectionAmount)}
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {OWNER_REVIEW_STATUSES.includes(booking.status || "") && (
                            <button
                              type="button"
                              onClick={() => openAction("confirm", booking)}
                              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 font-extrabold text-primary transition hover:bg-secondaryLight"
                            >
                              <Clock3 size={16} />
                              Xác nhận
                            </button>
                          )}

                          {OWNER_REVIEW_STATUSES.includes(booking.status || "") && (
                            <button
                              type="button"
                              onClick={() => openAction("reject", booking)}
                              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-extrabold text-slate-800 transition hover:bg-slate-200"
                            >
                              <XCircle size={16} />
                              Từ chối
                            </button>
                          )}

                          {canHandover && (
                            <button
                              type="button"
                              onClick={() => openAction("handover", booking)}
                              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-extrabold text-secondary transition hover:bg-primaryDark"
                            >
                              <CheckCircle2 size={16} />
                              {getHandoverButtonLabel(booking)}
                            </button>
                          )}

                          {canConfirmRemaining && (
                            <button
                              type="button"
                              onClick={() =>
                                openAction("confirm-remaining", booking)
                              }
                              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 font-extrabold text-primary transition hover:bg-secondaryLight"
                            >
                              <CheckCircle2 size={16} />
                              Xác nhận đã thu{" "}
                              {formatCurrency(remainingCollectionAmount)}
                            </button>
                          )}

                          {canComplete && (
                            <button
                              type="button"
                              onClick={() => openAction("complete", booking)}
                              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-extrabold text-secondary transition hover:bg-primaryDark"
                            >
                              <CheckCircle2 size={16} />
                              Hoàn tất
                            </button>
                          )}

                          {booking.status === "IN_PROGRESS" && !canComplete && (
                            <span
                              className="max-w-48 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold leading-5 text-slate-600"
                              title="Booking còn số tiền chưa thanh toán, không thể hoàn tất."
                            >
                              Còn tiền chưa thanh toán
                            </span>
                          )}

                          {canMarkNoShow && (
                            <button
                              type="button"
                              onClick={() => openAction("no-show", booking)}
                              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 font-extrabold text-white transition hover:bg-primaryDark"
                            >
                              <UserX size={16} />
                              Không nhận xe
                            </button>
                          )}

                          {!OWNER_REVIEW_STATUSES.includes(booking.status || "") &&
                            !READY_TO_HANDOVER_STATUSES.includes(booking.status || "") &&
                            booking.status !== "IN_PROGRESS" &&
                            !canConfirmRemaining && (
                              <span className="text-sm font-semibold text-slate-400">
                                --
                              </span>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && bookings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    Chưa có booking nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AdminModal
        open={!!action}
        title={modalTitle}
        description={
          action
            ? `Booking #${action.booking._id.slice(-8).toUpperCase()} - ${
                action.booking.carId.name || "Xe"
              }`
            : undefined
        }
        confirmText={
          action?.type === "confirm"
            ? "Xác nhận booking"
            : action?.type === "reject"
              ? "Từ chối"
              : action?.type === "handover"
                ? getHandoverButtonLabel(action.booking)
            : action?.type === "confirm-remaining"
              ? "Xác nhận đã thu"
            : action?.type === "complete"
              ? "Hoàn tất"
              : "Không nhận xe"
        }
        danger={action?.type === "no-show" || action?.type === "reject"}
        loading={submitting}
        onClose={closeAction}
        onConfirm={confirmAction}
      >
        {action && (
          <BookingSummaryCard
            booking={action.booking}
            onPreviewDocument={setPreviewDocument}
          />
        )}

        {action && (
          <ExtraChargeManager
            bookingId={action.booking._id}
            bookingStatus={action.booking.status}
          />
        )}

        {action?.type === "confirm-remaining" && (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm font-semibold leading-6 text-slate-800">
            Xác nhận này dùng cho trường hợp khách thanh toán tiền mặt trực
            tiếp. Sau khi xác nhận, booking sẽ ghi nhận đã thu{" "}
            <span className="font-extrabold text-primary">
              {formatCurrency(getRemainingCollectionAmount(action.booking))}
            </span>{" "}
            và trạng thái thanh toán chuyển sang đã thanh toán đủ.
          </div>
        )}

        {action?.type === "no-show" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 text-sm font-semibold leading-6 text-slate-800">
              Bạn chắc chắn muốn đánh dấu khách không nhận xe? Booking sẽ
              chuyển sang No-show và xe được mở lại. Hệ thống không tự hoàn
              tiền hoặc xóa payment đã ghi nhận.
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Ghi chú No Show
              </span>
              <textarea
                value={noShowReason}
                onChange={(event) => setNoShowReason(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-secondary"
                placeholder="Khách không đến nhận xe, không liên hệ được khách..."
              />
            </label>
          </div>
        )}

        {submitting && (
          <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500">
            <Loader2 size={16} className="animate-spin text-secondary" />
            Đang xử lý booking...
          </div>
        )}
      </AdminModal>

      <DocumentImageModal
        document={previewDocument}
        onClose={() => setPreviewDocument(null)}
      />
    </div>
  );
}











