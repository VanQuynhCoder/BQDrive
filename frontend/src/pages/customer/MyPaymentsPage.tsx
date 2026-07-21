import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CarFront, CreditCard, Eye, Loader2, ReceiptText, X } from "lucide-react";

import Header from "../../components/Header";
import Footer from "../../components/Footer";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  paymentService,
  type BookingPaymentHistory,
  type PaymentHistoryItem,
} from "../../services/payment.service";
import {
  getBookingStatusLabel,
  getOwnerTypeLabel,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from "../../utils/display.util";
import { formatVietnamDateTime } from "../../utils/date.util";

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value?: string) {
  if (!value) return "--";

  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getStatusTone(status?: string) {
  const map: Record<string, "green" | "red" | "yellow" | "gray"> = {
    PENDING: "yellow",
    PAID: "green",
    FAILED: "red",
    REFUNDED: "gray",
  };

  return map[status || ""] || "gray";
}

function getSummaryTone(status?: string) {
  const map: Record<string, "green" | "red" | "yellow" | "gray"> = {
    PAID_FULL: "green",
    DEPOSIT_PAID: "yellow",
    PARTIAL: "yellow",
    PENDING: "yellow",
    UNPAID: "gray",
    REFUNDED: "gray",
  };

  return map[status || ""] || "gray";
}

function getSummaryLabel(status?: string) {
  const map: Record<string, string> = {
    PAID_FULL: "Đã thanh toán đủ",
    DEPOSIT_PAID: "Đã thanh toán cọc",
    PARTIAL: "Thanh toán một phần",
    PENDING: "Chờ thanh toán",
    UNPAID: "Chưa thanh toán",
    REFUNDED: "Đã hoàn tiền",
  };

  return map[status || ""] || getPaymentStatusLabel(status);
}

function getStatusLabel(status?: string) {
  const map: Record<string, string> = {
    PENDING: "Chờ thanh toán",
    PAID: "Đã thanh toán",
    FAILED: "Thanh toán thất bại",
    REFUNDED: "Đã hoàn tiền",
  };

  return map[status || ""] || getPaymentStatusLabel(status);
}

function formatShortId(id: string) {
  if (!id) return "--";

  const normalizedId = id.startsWith("#") ? id.slice(1) : id;

  return `#${normalizedId.slice(-8).toUpperCase()}`;
}

function getCarLabel(item: BookingPaymentHistory) {
  const car = item.car || {};
  const details = [car.brand, car.plateNumber].filter(Boolean).join(" • ");

  return {
    name: car.name || "Xe đã bị xóa hoặc không còn tồn tại",
    details: details || "Chưa có thông tin biển số/hãng xe",
  };
}

function getOwnerPrefix(type?: string) {
  return type === "USER" ? "Người ký gửi" : "Doanh nghiệp";
}

function PaymentHistoryDetailModal({
  history,
  onClose,
}: {
  history: BookingPaymentHistory;
  onClose: () => void;
}) {
  const carLabel = getCarLabel(history);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 px-0 sm:items-center sm:px-4">
      <div className="max-h-[92vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-lg">
        <div className="flex items-start justify-between gap-4 bg-primary px-5 py-5 text-white sm:px-6">
          <div>
            <p className="text-sm font-extrabold uppercase text-secondary">
              Chi tiết thanh toán
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">
              Booking {formatShortId(history.bookingCode || history.bookingId)}
            </h2>
            <p className="mt-2 text-sm font-semibold text-white/70">
              {getBookingStatusLabel(history.bookingStatus)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10"
            aria-label="Đóng"
            title="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-lg border border-border bg-white p-5">
              <div className="flex items-start gap-4">
                {history.car?.image ? (
                  <img
                    src={history.car.image}
                    alt={carLabel.name}
                    className="h-28 w-36 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-28 w-36 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                    <CarFront size={34} />
                  </div>
                )}
                <div>
                  <p className="text-xs font-extrabold uppercase text-secondary">
                    Thông tin xe
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-primary">
                    {carLabel.name}
                  </h3>
                  <p className="mt-2 text-sm font-semibold text-muted">
                    {carLabel.details}
                  </p>
                  <p className="mt-4 text-sm font-bold text-primary">
                    {getOwnerPrefix(history.owner?.type)}:{" "}
                    {history.owner?.name || "--"}
                  </p>
                  {history.owner?.phone && (
                    <p className="mt-1 text-sm font-semibold text-muted">
                      SĐT: {history.owner.phone}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-white p-5">
              <p className="text-xs font-extrabold uppercase text-secondary">
                Tóm tắt booking
              </p>
              <div className="mt-4 grid gap-3 text-sm">
                <SummaryRow label="Ngày nhận xe" value={formatDateTime(history.startDate || "")} />
                <SummaryRow label="Ngày trả xe" value={formatDateTime(history.endDate || "")} />
                <SummaryRow
                  label="Hình thức thuê"
                  value={history.rentalMode === "HOURLY" ? "Theo giờ" : "Theo ngày"}
                />
                <SummaryRow label="Tổng tiền thuê" value={formatCurrency(history.totalPrice)} strong />
                <SummaryRow label="Tiền cọc" value={formatCurrency(history.depositAmount)} />
                <SummaryRow label="Đã thanh toán" value={formatCurrency(history.paidAmount)} strong />
                <SummaryRow label="Còn lại" value={formatCurrency(history.remainingAmount)} strong />
              </div>
            </section>
          </div>

          <section className="mt-5 overflow-hidden rounded-lg border border-border bg-white">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <ReceiptText className="text-secondary" size={20} />
              <h3 className="text-lg font-extrabold text-primary">
                Các lần thanh toán
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[860px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Mã thanh toán</th>
                    <th className="px-5 py-4">Loại</th>
                    <th className="px-5 py-4">Số tiền</th>
                    <th className="px-5 py-4">Phương thức</th>
                    <th className="px-5 py-4">Trạng thái</th>
                    <th className="px-5 py-4">Thời gian</th>
                    <th className="px-5 py-4">Mã giao dịch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.payments.map((payment: PaymentHistoryItem) => (
                    <tr key={payment._id}>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatShortId(payment.paymentCode || payment._id)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-muted">
                        {getPaymentTypeLabel(payment.paymentType)}
                      </td>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-muted">
                        {getPaymentMethodLabel(payment.method)}
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={getStatusTone(payment.status)}
                          label={getStatusLabel(payment.status)}
                        />
                      </td>
                      <td className="px-5 py-4 text-muted">
                        {formatDateTime(payment.paidAt || payment.createdAt)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-muted">
                        {payment.transactionCode || "--"}
                      </td>
                    </tr>
                  ))}

                  {history.payments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-muted">
                        Booking này chưa có giao dịch thanh toán.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className={strong ? "font-extrabold text-primary" : "font-bold text-primary"}>
        {value}
      </span>
    </div>
  );
}

export default function MyPaymentsPage() {
  const [histories, setHistories] = useState<BookingPaymentHistory[]>([]);
  const [selectedHistory, setSelectedHistory] =
    useState<BookingPaymentHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    paymentService
      .getMyBookingPaymentHistory()
      .then((data) => {
        if (active) {
          setHistories(data);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("Không thể tải lịch sử thanh toán");
        toast.error("Không thể tải lịch sử thanh toán");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
        <section className="mb-8 rounded-lg bg-primary p-6 text-white md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <CreditCard size={24} />
            </div>
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Thanh toán
              </p>
              <h1 className="mt-2 text-4xl font-extrabold">
                Lịch sử thanh toán
              </h1>
              <p className="mt-3 max-w-2xl text-white/70">
                Theo dõi các khoản thanh toán đã tạo cho booking của bạn.
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Mã booking</th>
                  <th className="px-5 py-4">Xe thuê</th>
                  <th className="px-5 py-4">Chủ xe</th>
                  <th className="px-5 py-4">Tổng tiền</th>
                  <th className="px-5 py-4">Đã thanh toán</th>
                  <th className="px-5 py-4">Còn lại</th>
                  <th className="px-5 py-4">Trạng thái</th>
                  <th className="px-5 py-4">Số lần</th>
                  <th className="px-5 py-4">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-muted">
                      <span className="inline-flex items-center gap-2 font-bold">
                        <Loader2 size={18} className="animate-spin text-secondary" />
                        Đang tải lịch sử thanh toán...
                      </span>
                    </td>
                  </tr>
                )}

                {!loading && error && (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center font-semibold text-red-600">
                      {error}
                    </td>
                  </tr>
                )}

                {!loading &&
                  !error &&
                  histories.map((history) => {
                    const carLabel = getCarLabel(history);

                    return (
                    <tr
                      key={history.bookingId}
                      className="cursor-pointer hover:bg-secondarySoft/30"
                      onClick={() => setSelectedHistory(history)}
                    >
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatShortId(history.bookingCode || history.bookingId)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {history.car?.image ? (
                            <img
                              src={history.car.image}
                              alt={carLabel.name}
                              className="h-12 w-16 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-16 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                              <CarFront size={22} />
                            </div>
                          )}
                          <div>
                            <p className="font-extrabold text-primary">
                              {carLabel.name}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-muted">
                              {carLabel.details}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-extrabold text-primary">
                          {history.owner?.name || "--"}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-muted">
                          {getOwnerTypeLabel(history.owner?.type)}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatCurrency(history.totalPrice)}
                      </td>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatCurrency(history.paidAmount)}
                      </td>
                      <td className="px-5 py-4 font-extrabold text-secondary">
                        {formatCurrency(history.remainingAmount)}
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={getSummaryTone(history.paymentSummaryStatus)}
                          label={getSummaryLabel(history.paymentSummaryStatus)}
                        />
                      </td>
                      <td className="px-5 py-4 font-bold text-primary">
                        {history.paymentCount}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-extrabold text-white transition hover:bg-primary/90"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedHistory(history);
                          }}
                        >
                          <Eye size={16} />
                          Xem chi tiết
                        </button>
                      </td>
                    </tr>
                    );
                  })}

                {!loading && !error && histories.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-muted">
                      Bạn chưa có giao dịch thanh toán nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {selectedHistory && (
        <PaymentHistoryDetailModal
          history={selectedHistory}
          onClose={() => setSelectedHistory(null)}
        />
      )}

      <Footer />
    </div>
  );
}







