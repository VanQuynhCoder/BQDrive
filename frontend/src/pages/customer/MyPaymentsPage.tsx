import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CreditCard, Loader2 } from "lucide-react";

import Header from "../../components/Header";
import Footer from "../../components/Footer";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  paymentService,
  type CustomerPayment,
  type CustomerPaymentBooking,
} from "../../services/payment.service";
import {
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

function getStatusLabel(status?: string) {
  const map: Record<string, string> = {
    PENDING: "Chờ thanh toán",
    PAID: "Đã thanh toán",
    FAILED: "Thanh toán thất bại",
    REFUNDED: "Đã hoàn tiền",
  };

  return map[status || ""] || getPaymentStatusLabel(status);
}

function getBookingId(payment: CustomerPayment) {
  if (payment.bookingId && typeof payment.bookingId === "object") {
    return (payment.bookingId as CustomerPaymentBooking)._id || "";
  }

  return typeof payment.bookingId === "string" ? payment.bookingId : "";
}

function formatShortId(id?: string) {
  if (!id) return "--";

  return `#${id.slice(-8).toUpperCase()}`;
}

export default function MyPaymentsPage() {
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    paymentService
      .getMyPayments()
      .then((data) => {
        if (active) setPayments(data);
      })
      .catch(() => {
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
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Mã thanh toán</th>
                  <th className="px-5 py-4">Booking</th>
                  <th className="px-5 py-4">Số tiền</th>
                  <th className="px-5 py-4">Phương thức</th>
                  <th className="px-5 py-4">Loại thanh toán</th>
                  <th className="px-5 py-4">Trạng thái</th>
                  <th className="px-5 py-4">Ngày thanh toán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-muted">
                      <span className="inline-flex items-center gap-2 font-bold">
                        <Loader2 size={18} className="animate-spin text-secondary" />
                        Đang tải lịch sử thanh toán...
                      </span>
                    </td>
                  </tr>
                )}

                {!loading &&
                  payments.map((payment) => (
                    <tr key={payment._id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatShortId(payment._id)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {formatShortId(getBookingId(payment))}
                      </td>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {getPaymentMethodLabel(payment.method)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {getPaymentTypeLabel(payment.paymentType)}
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={getStatusTone(payment.status)}
                          label={getStatusLabel(payment.status)}
                        />
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDateTime(payment.paidAt || payment.createdAt)}
                      </td>
                    </tr>
                  ))}

                {!loading && payments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-muted">
                      Bạn chưa có lịch sử thanh toán.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
