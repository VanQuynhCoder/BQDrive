import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CalendarDays, Eye, FileText, Loader2, Search, X } from "lucide-react";

import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  ownerBookingHistoryService,
  type OwnerBookingHistoryItem,
  type OwnerBookingHistoryPayment,
} from "../../services/ownerBookingHistory.service";
import {
  getBookingStatusLabel,
  getContractStatusLabel,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from "../../utils/display.util";
import { formatVietnamDateTime } from "../../utils/date.util";
import { normalizeImageUrl } from "../../utils/image.util";

type OwnerBookingHistoryPageProps = {
  title: string;
  subtitle: string;
  carColumnLabel: string;
};

const statusTabs = [
  { label: "Tất cả", value: "ALL" },
  { label: "Đang xử lý", value: "REQUESTED" },
  { label: "Đang thuê", value: "IN_PROGRESS" },
  { label: "Hoàn tất", value: "COMPLETED" },
  { label: "Đã hủy", value: "CANCELLED" },
  { label: "No-show", value: "NO_SHOW" },
];

const paymentStatusOptions = [
  { label: "Tất cả thanh toán", value: "ALL" },
  { label: "Chưa thanh toán", value: "UNPAID" },
  { label: "Đã cọc", value: "DEPOSIT_PAID" },
  { label: "Một phần", value: "PARTIAL" },
  { label: "Đã thanh toán đủ", value: "PAID_FULL" },
  { label: "Chờ thanh toán", value: "PENDING" },
];

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return "--";

  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getStatusTone(status?: string) {
  const map: Record<string, "green" | "red" | "yellow" | "blue" | "gray"> = {
    REQUESTED: "yellow",
    PENDING: "yellow",
    OWNER_APPROVED: "blue",
    PAYMENT_PENDING: "yellow",
    WAITING_PAYMENT: "yellow",
    PAID: "green",
    CONFIRMED: "blue",
    IN_PROGRESS: "blue",
    COMPLETED: "green",
    CANCELLED: "gray",
    REJECTED: "red",
    NO_SHOW: "red",
  };

  return map[status || ""] || "gray";
}

function getPaymentSummaryLabel(status?: string) {
  const map: Record<string, string> = {
    UNPAID: "Chưa thanh toán",
    PENDING: "Chờ thanh toán",
    DEPOSIT_PAID: "Đã thanh toán cọc",
    PARTIAL: "Thanh toán một phần",
    PAID_FULL: "Đã thanh toán đủ",
    PAID: "Đã thanh toán đủ",
    FAILED: "Thất bại",
  };

  return map[status || ""] || status || "--";
}

function getPaymentSummaryTone(status?: string) {
  const map: Record<string, "green" | "red" | "yellow" | "blue" | "gray"> = {
    PAID_FULL: "green",
    PAID: "green",
    DEPOSIT_PAID: "blue",
    PARTIAL: "blue",
    PENDING: "yellow",
    UNPAID: "gray",
    FAILED: "red",
  };

  return map[status || ""] || "gray";
}

function PaymentRows({ payments }: { payments: OwnerBookingHistoryPayment[] }) {
  if (payments.length === 0) {
    return (
      <div className="rounded-lg bg-slate-50 px-4 py-5 text-sm font-bold text-slate-500">
        Chưa có giao dịch thanh toán.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Loại</th>
            <th className="px-4 py-3">Số tiền</th>
            <th className="px-4 py-3">Phương thức</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3">Thời gian</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td className="px-4 py-3 font-bold text-primary">
                {getPaymentTypeLabel(payment.paymentType)}
              </td>
              <td className="px-4 py-3 font-extrabold text-primary">
                {formatCurrency(payment.amount)}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {getPaymentMethodLabel(payment.method)}
              </td>
              <td className="px-4 py-3">
                {getPaymentStatusLabel(payment.status)}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {formatDateTime(payment.paidAt || payment.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-2 break-words font-extrabold text-primary">{value || "--"}</p>
    </div>
  );
}

function BookingHistoryDetailModal({
  booking,
  onClose,
}: {
  booking: OwnerBookingHistoryItem | null;
  onClose: () => void;
}) {
  if (!booking) return null;

  const carImage = normalizeImageUrl(booking.car?.image);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-primary/20 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 bg-primary px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase text-secondary">
              Chi tiết lịch sử booking
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-white">
              Booking #{booking.bookingCode}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white/75 transition hover:bg-white/10 hover:text-secondary"
            aria-label="Đóng"
          >
            <X size={22} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex h-44 items-center justify-center bg-slate-100">
                {carImage ? (
                  <img
                    src={carImage}
                    alt={booking.car?.name || "Xe"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <CalendarDays size={30} className="text-slate-300" />
                )}
              </div>
              <div className="p-4">
                <p className="text-xs font-bold uppercase text-secondary">Xe</p>
                <h3 className="mt-1 text-lg font-extrabold text-primary">
                  {booking.car?.name || "--"}
                </h3>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {booking.car?.plateNumber || "Chưa có biển số"}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailLine label="Khách thuê" value={booking.renter?.fullName} />
              <DetailLine label="Email khách thuê" value={booking.renter?.email} />
              <DetailLine label="Số điện thoại" value={booking.renter?.phone} />
              <DetailLine label="CCCD/CMND" value={booking.renter?.cccdNumber} />
              <DetailLine
                label="Bằng lái"
                value={booking.renter?.driverLicenseNumber}
              />
              <DetailLine
                label="Hình thức thuê"
                value={booking.rentalMode === "HOURLY" ? "Thuê theo giờ" : "Thuê theo ngày"}
              />
              <DetailLine label="Ngày nhận xe" value={formatDateTime(booking.startDate)} />
              <DetailLine label="Ngày trả xe" value={formatDateTime(booking.endDate)} />
              <DetailLine
                label="Địa điểm nhận xe"
                value={booking.pickupAddressSnapshot}
              />
              <DetailLine label="Địa điểm trả xe" value={booking.returnAddressSnapshot} />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <DetailLine label="Tổng tiền" value={formatCurrency(booking.pricing.totalPrice)} />
            <DetailLine label="Tiền cọc" value={formatCurrency(booking.pricing.depositAmount)} />
            <DetailLine label="Đã thanh toán" value={formatCurrency(booking.pricing.paidAmount)} />
            <DetailLine label="Còn lại" value={formatCurrency(booking.pricing.remainingAmount)} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-400">
                Trạng thái booking
              </p>
              <div className="mt-2">
                <AdminStatusBadge
                  tone={getStatusTone(booking.status)}
                  label={getBookingStatusLabel(booking.status)}
                />
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-400">
                Trạng thái thanh toán
              </p>
              <div className="mt-2">
                <AdminStatusBadge
                  tone={getPaymentSummaryTone(booking.paymentSummary.status)}
                  label={getPaymentSummaryLabel(booking.paymentSummary.status)}
                />
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-400">Hợp đồng</p>
              <p className="mt-2 font-extrabold text-primary">
                {booking.contract?.contractCode || "Chưa có hợp đồng"}
              </p>
              {booking.contract?.status && (
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {getContractStatusLabel(booking.contract.status)}
                </p>
              )}
            </div>
          </div>

          {booking.note && (
            <div className="mt-5 rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-400">Ghi chú</p>
              <p className="mt-2 font-semibold leading-7 text-primary">{booking.note}</p>
            </div>
          )}

          <div className="mt-6">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-primary">
              <FileText size={20} className="text-secondary" />
              Lịch sử thanh toán
            </h3>
            <PaymentRows payments={booking.payments || []} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OwnerBookingHistoryPage({
  title,
  subtitle,
  carColumnLabel,
}: OwnerBookingHistoryPageProps) {
  const [bookings, setBookings] = useState<OwnerBookingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("ALL");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedBooking, setSelectedBooking] =
    useState<OwnerBookingHistoryItem | null>(null);

  const params = useMemo(
    () => ({
      status,
      paymentStatus,
      keyword: keyword.trim(),
      fromDate,
      toDate,
      page,
      limit: 10,
    }),
    [fromDate, keyword, page, paymentStatus, status, toDate],
  );

  useEffect(() => {
    let active = true;

    ownerBookingHistoryService
      .getHistory(params)
      .then((data) => {
        if (!active) return;
        setBookings(data.bookings);
        setTotal(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
      })
      .catch(() => {
        if (active) toast.error("Không thể tải lịch sử booking");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [params]);

  const resetPage = (update: () => void) => {
    setPage(1);
    update();
  };

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">
          Lịch sử booking
        </p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">{title}</h2>
        <p className="mt-2 max-w-3xl text-slate-500">{subtitle}</p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px_160px]">
          <label className="relative block">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={keyword}
              onChange={(event) =>
                resetPage(() => setKeyword(event.target.value))
              }
              className="min-h-11 w-full rounded-lg border border-slate-200 pl-10 pr-4 font-semibold outline-none transition focus:border-secondary"
              placeholder="Tìm theo mã booking, xe, biển số, khách hàng..."
            />
          </label>

          <select
            value={paymentStatus}
            onChange={(event) =>
              resetPage(() => setPaymentStatus(event.target.value))
            }
            className="min-h-11 rounded-lg border border-slate-200 px-3 font-bold text-primary outline-none focus:border-secondary"
          >
            {paymentStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(event) => resetPage(() => setFromDate(event.target.value))}
            className="min-h-11 rounded-lg border border-slate-200 px-3 font-bold text-primary outline-none focus:border-secondary"
          />

          <input
            type="date"
            value={toDate}
            onChange={(event) => resetPage(() => setToDate(event.target.value))}
            className="min-h-11 rounded-lg border border-slate-200 px-3 font-bold text-primary outline-none focus:border-secondary"
          />
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => resetPage(() => setStatus(tab.value))}
              className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-extrabold transition ${
                status === tab.value
                  ? "bg-primary text-secondary"
                  : "bg-slate-100 text-slate-600 hover:bg-secondarySoft"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-xl font-extrabold text-primary">
              Danh sách booking
            </h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Đang hiển thị {bookings.length} / {total} booking
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1240px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Mã booking</th>
                <th className="px-5 py-4">Khách hàng</th>
                <th className="px-5 py-4">{carColumnLabel}</th>
                <th className="px-5 py-4">Ngày nhận</th>
                <th className="px-5 py-4">Ngày trả</th>
                <th className="px-5 py-4">Tổng tiền</th>
                <th className="px-5 py-4">Đã thanh toán</th>
                <th className="px-5 py-4">Còn lại</th>
                <th className="px-5 py-4">Booking</th>
                <th className="px-5 py-4">Thanh toán</th>
                <th className="px-5 py-4">Hợp đồng</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={12} className="px-5 py-8 text-center text-slate-500">
                    <Loader2 size={20} className="mx-auto mb-2 animate-spin text-secondary" />
                    Đang tải lịch sử booking...
                  </td>
                </tr>
              )}

              {!loading &&
                bookings.map((booking) => (
                  <tr key={booking.bookingId} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-extrabold text-primary">
                      #{booking.bookingCode}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-extrabold text-primary">
                        {booking.renter?.fullName || "--"}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {booking.renter?.phone || booking.renter?.email || "--"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-extrabold text-primary">
                        {booking.car?.name || "--"}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {booking.car?.plateNumber || "--"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDateTime(booking.startDate)}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDateTime(booking.endDate)}
                    </td>
                    <td className="px-5 py-4 font-extrabold text-primary">
                      {formatCurrency(booking.pricing.totalPrice)}
                    </td>
                    <td className="px-5 py-4 font-extrabold text-primary">
                      {formatCurrency(booking.pricing.paidAmount)}
                    </td>
                    <td className="px-5 py-4 font-extrabold text-primary">
                      {formatCurrency(booking.pricing.remainingAmount)}
                    </td>
                    <td className="px-5 py-4">
                      <AdminStatusBadge
                        tone={getStatusTone(booking.status)}
                        label={getBookingStatusLabel(booking.status)}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <AdminStatusBadge
                        tone={getPaymentSummaryTone(booking.paymentSummary.status)}
                        label={getPaymentSummaryLabel(booking.paymentSummary.status)}
                      />
                    </td>
                    <td className="px-5 py-4">
                      {booking.contract ? (
                        <div>
                          <p className="font-extrabold text-primary">
                            {booking.contract.contractCode}
                          </p>
                          <p className="text-xs font-bold text-slate-500">
                            {getContractStatusLabel(booking.contract.status)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-slate-400">--</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedBooking(booking)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 font-extrabold text-secondary transition hover:bg-primaryDark"
                        >
                          <Eye size={16} />
                          Chi tiết
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && bookings.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-5 py-10 text-center text-slate-500">
                    Chưa có lịch sử booking nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-slate-500">
            Trang {page} / {Math.max(totalPages, 1)}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              className="min-h-10 rounded-lg border border-slate-200 px-4 font-bold text-primary transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Trước
            </button>
            <button
              type="button"
              disabled={page >= totalPages || totalPages === 0}
              onClick={() => setPage((current) => current + 1)}
              className="min-h-10 rounded-lg bg-secondary px-4 font-extrabold text-primary transition hover:bg-secondaryLight disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sau
            </button>
          </div>
        </div>
      </section>

      <BookingHistoryDetailModal
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />
    </div>
  );
}
