import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Building2,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CircleDashed,
  Clock3,
  CreditCard,
  Fuel,
  Gauge,
  Hash,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { bookingService } from "../services/booking.service";
import { getFirstCarImage } from "../utils/image.util";
import { formatVietnamDateTime } from "../utils/date.util";

type BookingStatus =
  | "REQUESTED"
  | "OWNER_APPROVED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "PENDING"
  | "WAITING_PAYMENT"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "CANCELLED"
  | "REJECTED"
  | "COMPLETED"
  | "NO_SHOW"
  | string;

type BookingCar = {
  _id?: string;
  name?: string;
  licensePlate?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  rentalUnit?: string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
};

type BookingBusiness = {
  businessName?: string;
  phone?: string;
  address?: string;
};

type Booking = {
  _id: string;
  carId?: BookingCar;
  businessId?: BookingBusiness;
  startDate: string;
  endDate: string;
  rentalMode?: string;
  totalPrice?: number;
  depositAmount?: number;
  remainingAmount?: number;
  paidAmount?: number;
  paymentOption?: "DEPOSIT" | "FULL" | string;
  status?: BookingStatus;
  cancelReason?: string;
  noShowReason?: string;
  note?: string;
};

function formatPrice(price?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price || 0);
}

function formatDateTime(date?: string) {
  if (!date) return "--";

  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "--";

  return formatVietnamDateTime(date, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getShortId(id?: string) {
  return id ? `#${id.slice(-8).toUpperCase()}` : "--";
}

function getRentalInfo(car: BookingCar | undefined, rentalMode?: string) {
  if (rentalMode === "HOURLY" || (!rentalMode && car?.rentalUnit === "HOUR")) {
    return {
      price: car?.pricePerHour || 0,
      unit: "giờ",
      label: "Số giờ thuê",
      mode: "Thuê theo giờ",
    };
  }

  return {
    price: car?.pricePerDay || 0,
    unit: "ngày",
    label: "Số ngày thuê",
    mode: "Thuê theo ngày",
  };
}

const HOUR_MS = 1000 * 60 * 60;

function calculateRentalTime(rentalMode: string | undefined, start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();

  if (Number.isNaN(diffMs) || diffMs <= 0) return 0;

  if (rentalMode === "HOURLY") {
    return Math.ceil(diffMs / HOUR_MS);
  }

  return Math.max(1, Math.ceil(diffMs / HOUR_MS / 24));
}

function getSpecLabel(value?: string) {
  const labels: Record<string, string> = {
    ELECTRIC: "Điện",
    GASOLINE: "Xăng",
    DIESEL: "Diesel",
    HYBRID: "Hybrid",
    AUTOMATIC: "Tự động",
    MANUAL: "Số sàn",
  };

  return value ? labels[value] || value : "--";
}

function getStatusInfo(status?: BookingStatus) {
  const value = status || "PENDING";

  if (value === "OWNER_APPROVED") {
    return {
      label: "Chủ xe đã duyệt",
      detail: "Chủ xe đã đồng ý cho thuê. Bạn có thể tạo hợp đồng và thanh toán.",
      badgeClass: "bg-blue-50 text-blue-700",
      panelClass: "border-blue-100 bg-blue-50 text-blue-700",
      icon: BadgeCheck,
    };
  }

  if (value === "PAYMENT_PENDING" || value === "WAITING_PAYMENT") {
    return {
      label: "Chờ thanh toán",
      detail: "Bạn đã bắt đầu thanh toán, hệ thống đang chờ kết quả hoặc ghi nhận thanh toán.",
      badgeClass: "bg-amber-50 text-amber-700",
      panelClass: "border-amber-100 bg-amber-50 text-amber-700",
      icon: CreditCard,
    };
  }

  if (value === "PAID") {
    return {
      label: "Đã thanh toán",
      detail: "Booking đã được thanh toán và lịch thuê đã được giữ chính thức.",
      badgeClass: "bg-emerald-50 text-emerald-700",
      panelClass: "border-emerald-100 bg-emerald-50 text-emerald-700",
      icon: CheckCircle2,
    };
  }

  if (value === "CONFIRMED") {
    return {
      label: "Đã xác nhận",
      detail: "Chủ xe đã xác nhận lịch thuê.",
      badgeClass: "bg-blue-50 text-blue-700",
      panelClass: "border-blue-100 bg-blue-50 text-blue-700",
      icon: BadgeCheck,
    };
  }

  if (value === "COMPLETED") {
    return {
      label: "Hoàn tất",
      detail: "Chuyến thuê đã hoàn tất.",
      badgeClass: "bg-emerald-50 text-emerald-700",
      panelClass: "border-emerald-100 bg-emerald-50 text-emerald-700",
      icon: CheckCircle2,
    };
  }

  if (value === "CANCELLED") {
    return {
      label: "Đã hủy",
      detail: "Booking này đã được hủy.",
      badgeClass: "bg-red-50 text-red-700",
      panelClass: "border-red-100 bg-red-50 text-red-700",
      icon: XCircle,
    };
  }

  if (value === "NO_SHOW") {
    return {
      label: "Không nhận xe",
      detail: "Booking được đánh dấu khách không nhận xe.",
      badgeClass: "bg-red-50 text-red-700",
      panelClass: "border-red-100 bg-red-50 text-red-700",
      icon: Ban,
    };
  }

  return {
    label: "Chờ xác nhận",
    detail: "Booking đang chờ chủ xe xác nhận.",
    badgeClass: "bg-amber-50 text-amber-700",
    panelClass: "border-amber-100 bg-amber-50 text-amber-700",
    icon: CircleDashed,
  };
}

function getPaymentInfo(booking: Booking) {
  const totalPrice = booking.totalPrice || 0;
  const paidAmount = booking.paidAmount || 0;
  const depositAmount =
    booking.depositAmount || (booking.paymentOption === "DEPOSIT" ? Math.round(totalPrice * 0.3) : 0);
  const remainingAfterDeposit =
    booking.remainingAmount || Math.max(totalPrice - depositAmount, 0);
  const outstandingAmount = Math.max(totalPrice - paidAmount, 0);

  if (totalPrice > 0 && paidAmount >= totalPrice) {
    return {
      label: "Đã thanh toán đủ",
      detail: "Không còn số tiền cần thanh toán.",
      badgeClass: "bg-emerald-50 text-emerald-700",
      nextAmount: 0,
      totalPrice,
      paidAmount,
      depositAmount,
      remainingAfterDeposit,
      outstandingAmount,
    };
  }

  if (paidAmount > 0) {
    return {
      label: "Đã thanh toán một phần",
      detail: "Còn lại phần thanh toán sau cùng.",
      badgeClass: "bg-blue-50 text-blue-700",
      nextAmount: remainingAfterDeposit,
      totalPrice,
      paidAmount,
      depositAmount,
      remainingAfterDeposit,
      outstandingAmount,
    };
  }

  return {
    label: "Chưa thanh toán",
    detail:
      booking.paymentOption === "FULL"
        ? "Booking chọn thanh toán toàn bộ."
        : "Booking chọn thanh toán cọc.",
    badgeClass: "bg-amber-50 text-amber-700",
    nextAmount: booking.paymentOption === "FULL" ? totalPrice : depositAmount,
    totalPrice,
    paidAmount,
    depositAmount,
    remainingAfterDeposit,
    outstandingAmount,
  };
}

function canPayBooking(booking: Booking, nextAmount: number) {
  return (
    nextAmount > 0 &&
    [
      "OWNER_APPROVED", // Chủ xe đã duyệt nên khách được thanh toán
      "PAYMENT_PENDING", // Đang chờ thanh toán, cho phép quay lại thanh toán
      "PAID", // Đã trả cọc, có thể thanh toán phần còn lại nếu còn tiền
      "CONFIRMED", // Trạng thái cũ
      "WAITING_PAYMENT", // Trạng thái cũ
      "IN_PROGRESS",
    ].includes(
      booking.status || "",
    )
  );
}

function canCancelBooking(booking: Booking) {
  return ["REQUESTED", "OWNER_APPROVED", "PENDING", "CONFIRMED"].includes(
    booking.status || "",
  );
}

export default function BookingDetailPage() {
  const { id } = useParams();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const fetchBooking = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      const foundBooking = (await bookingService.getMyBooking(id)) as Booking;
      setBooking(foundBooking || null);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: unknown } } }).response
          ?.data?.message === "string"
          ? String(
              (error as { response?: { data?: { message?: unknown } } }).response
                ?.data?.message,
            )
          : "Không thể tải booking";

      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  const handleCancel = async () => {
    if (!booking || cancelSubmitting) return;
    if (!window.confirm("Bạn có chắc muốn hủy booking này?")) return;

    try {
      setCancelSubmitting(true);
      await bookingService.cancelBooking(booking._id, "Khách hàng hủy booking");
      toast.success("Đã hủy booking");
      await fetchBooking();
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: unknown } } }).response
          ?.data?.message === "string"
          ? String(
              (error as { response?: { data?: { message?: unknown } } }).response
                ?.data?.message,
            )
          : "Hủy booking thất bại";

      toast.error(message);
    } finally {
      setCancelSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-background">
        <Header />
        <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
          <div className="mb-8 h-24 animate-pulse rounded-lg bg-soft" />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <div className="h-72 animate-pulse rounded-lg bg-soft" />
              <div className="h-56 animate-pulse rounded-lg bg-soft" />
            </div>
            <div className="h-96 animate-pulse rounded-lg bg-soft" />
          </div>
        </main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-background">
        <Header />
        <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
          <div className="rounded-lg border border-border bg-white p-10 text-center shadow-sm">
            <ReceiptText size={48} className="mx-auto text-secondary" />
            <h1 className="mt-4 text-2xl font-extrabold text-primary">
              Không tìm thấy booking
            </h1>
            <p className="mx-auto mt-2 max-w-md text-muted">
              Booking này không tồn tại hoặc không thuộc tài khoản hiện tại.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary"
            >
              Về trang chủ
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const car = booking.carId;
  const rental = getRentalInfo(car, booking.rentalMode);
  const rentalTime = calculateRentalTime(
    booking.rentalMode,
    booking.startDate,
    booking.endDate,
  );
  const statusInfo = getStatusInfo(booking.status);
  const paymentInfo = getPaymentInfo(booking);
  const StatusIcon = statusInfo.icon;
  const paymentProgress = paymentInfo.totalPrice
    ? Math.min(100, Math.round((paymentInfo.paidAmount / paymentInfo.totalPrice) * 100))
    : 0;
  const showPaymentAction = canPayBooking(booking, paymentInfo.nextAmount);
  const showCancelAction = canCancelBooking(booking);

  const timeline = [
    {
      key: "PENDING",
      label: "Gửi yêu cầu",
      active: [
        "PENDING",
        "REQUESTED",
        "OWNER_APPROVED",
        "PAYMENT_PENDING",
        "PAID",
        "WAITING_PAYMENT",
        "CONFIRMED",
        "IN_PROGRESS",
        "COMPLETED",
      ].includes(booking.status || ""),
    },
    {
      key: "CONFIRMED",
      label: "Xác nhận",
      active: [
        "WAITING_PAYMENT",
        "OWNER_APPROVED",
        "PAYMENT_PENDING",
        "PAID",
        "CONFIRMED",
        "IN_PROGRESS",
        "COMPLETED",
      ].includes(booking.status || ""),
    },
    {
      key: "COMPLETED",
      label: "Hoàn tất",
      active: booking.status === "COMPLETED",
    },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              to="/"
              className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-primary transition hover:text-secondary"
            >
              <ArrowLeft size={17} />
              Về trang chủ
            </Link>
            <p className="flex items-center gap-2 text-sm font-bold uppercase text-secondary">
              <Hash size={16} />
              Booking {getShortId(booking._id)}
            </p>
            <h1 className="mt-2 text-4xl font-extrabold text-primary md:text-5xl">
              Chi tiết đặt xe
            </h1>
          </div>

          <div className={`inline-flex items-center gap-2 rounded-lg border px-4 py-3 font-extrabold ${statusInfo.panelClass}`}>
            <StatusIcon size={20} />
            {statusInfo.label}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_370px]">
          <section className="space-y-6">
            <article className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
              <div className="grid gap-0 md:grid-cols-[320px_minmax(0,1fr)]">
                <div className="relative min-h-72 overflow-hidden">
                  <img
                    src={getFirstCarImage(car?.images)}
                    alt={car?.name || "Xe thuê"}
                    className="h-full w-full object-cover"
                  />
                  <span className={`absolute left-4 top-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-extrabold ${statusInfo.badgeClass}`}>
                    <StatusIcon size={15} />
                    {statusInfo.label}
                  </span>
                </div>

                <div className="p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase text-secondary">
                        Xe đã đặt
                      </p>
                      <h2 className="mt-1 text-3xl font-extrabold text-primary">
                        {car?.name || "Xe BQDrive"}
                      </h2>
                      <p className="mt-2 text-muted">
                        {car?.licensePlate || "Biển số đang cập nhật"}
                      </p>
                    </div>

                    <div className="shrink-0 md:text-right">
                      <p className="text-sm font-semibold text-muted">
                        Tổng tiền
                      </p>
                      <p className="text-2xl font-extrabold text-secondary">
                        {formatPrice(booking.totalPrice)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2 lg:grid-cols-4">
                    <InfoLine icon={CalendarDays} label="Nhận xe" value={formatDateTime(booking.startDate)} />
                    <InfoLine icon={CalendarDays} label="Trả xe" value={formatDateTime(booking.endDate)} />
                    <InfoLine icon={Clock3} label={rental.label} value={`${rentalTime} ${rental.unit}`} />
                    <InfoLine icon={Wallet} label="Đơn giá" value={`${formatPrice(rental.price)} / ${rental.unit}`} />
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
                    <SpecLine icon={CarFront} value={`${car?.seats || "--"} chỗ`} />
                    <SpecLine icon={Fuel} value={getSpecLabel(car?.fuelType)} />
                    <SpecLine icon={Gauge} value={getSpecLabel(car?.transmission)} />
                    <SpecLine icon={ShieldCheck} value={rental.mode} />
                  </div>
                </div>
              </div>
            </article>

            <section className="rounded-lg border border-border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Tiến trình
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold text-primary">
                    Trạng thái booking
                  </h2>
                </div>

                <p className="max-w-lg text-sm font-semibold leading-6 text-muted">
                  {statusInfo.detail}
                </p>
              </div>

              {["CANCELLED", "NO_SHOW"].includes(booking.status || "") ? (
                <div className={`mt-6 rounded-lg border p-4 text-sm font-semibold leading-6 ${statusInfo.panelClass}`}>
                  {booking.cancelReason || booking.noShowReason || statusInfo.detail}
                </div>
              ) : false ? (
                <div className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-50 px-5 py-3 text-center font-extrabold text-amber-700">
                  <Clock3 size={20} />
                  {"PENDING" === "PENDING"
                    ? "Chá» chá»§ xe xÃ¡c nháº­n"
                    : "ChÆ°a thá»ƒ thanh toÃ¡n"}
                </div>
              ) : (
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {timeline.map((item, index) => (
                    <div
                      key={item.key}
                      className={`rounded-lg border p-4 ${
                        item.active
                          ? "border-secondary bg-amber-50 text-primary"
                          : "border-border bg-white text-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-extrabold">0{index + 1}</span>
                        {item.active ? (
                          <CheckCircle2 size={20} className="text-secondary" />
                        ) : (
                          <CircleDashed size={20} />
                        )}
                      </div>
                      <p className="mt-4 font-extrabold">{item.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-white p-6 shadow-sm">
              <p className="text-sm font-bold uppercase text-secondary">
                Đơn vị cho thuê
              </p>
              <div className="mt-4 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary">
                  <Building2 size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-primary">
                    {booking.businessId?.businessName || "Đối tác BQDrive"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {booking.businessId?.address || "Thông tin địa chỉ đang được cập nhật."}
                  </p>
                  {booking.businessId?.phone && (
                    <p className="mt-1 text-sm font-semibold text-primary">
                      {booking.businessId.phone}
                    </p>
                  )}
                </div>
              </div>
            </section>
          </section>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-lg border border-border bg-white p-6 shadow-xl shadow-slate-900/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Thanh toán
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold text-primary">
                    Tóm tắt chi phí
                  </h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${paymentInfo.badgeClass}`}>
                  {paymentInfo.label}
                </span>
              </div>

              <div className="mt-6 h-2 overflow-hidden rounded-full bg-secondarySoft/45">
                <div
                  className="h-full rounded-full bg-secondary transition-all"
                  style={{ width: `${paymentProgress}%` }}
                />
              </div>

              <div className="my-6 space-y-4 border-y border-border py-5 text-sm">
                <SummaryRow label="Mã booking" value={getShortId(booking._id)} />
                <SummaryRow label="Hình thức" value={booking.paymentOption === "FULL" ? "Thanh toán toàn bộ" : "Thanh toán cọc"} />
                <SummaryRow label="Tổng tiền" value={formatPrice(paymentInfo.totalPrice)} />
                {booking.paymentOption !== "FULL" && (
                  <SummaryRow label="Tiền cọc" value={formatPrice(paymentInfo.depositAmount)} />
                )}
                <SummaryRow label="Đã thanh toán" value={formatPrice(paymentInfo.paidAmount)} />
                <SummaryRow label="Còn phải thanh toán" value={formatPrice(paymentInfo.outstandingAmount)} strong />
              </div>

              {showPaymentAction ? (
                <Link
                  to={`/bookings/${booking._id}/payment`}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95"
                >
                  <CreditCard size={20} />
                  Thanh toán {formatPrice(paymentInfo.nextAmount)}
                </Link>
              ) : paymentInfo.nextAmount > 0 ? (
                <div className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-50 px-5 py-3 text-center font-extrabold text-amber-700">
                  <Clock3 size={20} />
                  {booking.status === "PENDING"
                    ? "Chờ chủ xe xác nhận"
                    : "Chưa thể thanh toán"}
                </div>
              ) : (
                <div className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-50 px-5 py-3 font-extrabold text-emerald-700">
                  <CheckCircle2 size={20} />
                  Không cần thanh toán
                </div>
              )}

              {showCancelAction && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelSubmitting}
                  className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-5 py-3 font-extrabold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelSubmitting ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <XCircle size={20} />
                  )}
                  Hủy booking
                </button>
              )}

              <p className="mt-4 rounded-lg border border-secondary/20 bg-secondarySoft/25 px-4 py-3 text-sm font-semibold leading-6 text-muted">
                {paymentInfo.detail}
              </p>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-sm font-semibold text-muted">
        <Icon size={17} className="shrink-0 text-secondary" />
        {label}
      </p>
      <p className="mt-1 break-words font-extrabold text-primary">{value}</p>
    </div>
  );
}

function SpecLine({
  icon: Icon,
  value,
}: {
  icon: typeof CarFront;
  value: string;
}) {
  return (
    <p className="flex items-center gap-2 font-semibold">
      <Icon size={17} className="shrink-0 text-secondary" />
      {value}
    </p>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong ? "text-base font-extrabold text-primary" : "text-muted"
      }`}
    >
      <span>{label}</span>
      <span className="text-right font-extrabold text-primary">{value}</span>
    </div>
  );
}
