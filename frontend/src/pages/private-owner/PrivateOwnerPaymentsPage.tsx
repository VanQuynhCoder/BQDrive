import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CreditCard, Loader2, Wallet, WalletCards } from "lucide-react";

import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  privateOwnerService,
  type PrivateOwnerPayment,
} from "../../services/privateOwner.service";

type PaymentFilter = "ALL" | "PENDING" | "PAID" | "FAILED" | "REFUNDED";

const filterOptions: Array<{ label: string; value: PaymentFilter }> = [
  { label: "Tất cả", value: "ALL" },
  { label: "Chờ thanh toán", value: "PENDING" },
  { label: "Đã thanh toán", value: "PAID" },
  { label: "Thất bại", value: "FAILED" },
  { label: "Hoàn tiền", value: "REFUNDED" },
];

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value?: string) {
  if (!value) return "--";

  return new Date(value).toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function isSameDay(date: Date, compare: Date) {
  return (
    date.getFullYear() === compare.getFullYear() &&
    date.getMonth() === compare.getMonth() &&
    date.getDate() === compare.getDate()
  );
}

function isSameMonth(date: Date, compare: Date) {
  return (
    date.getFullYear() === compare.getFullYear() &&
    date.getMonth() === compare.getMonth()
  );
}

function getStatusBadge(status?: string) {
  const map: Record<
    string,
    { label: string; tone: "green" | "red" | "yellow" | "gray" }
  > = {
    PENDING: { label: "Chờ thanh toán", tone: "yellow" },
    PAID: { label: "Đã thanh toán", tone: "green" },
    FAILED: { label: "Thanh toán thất bại", tone: "red" },
    REFUNDED: { label: "Đã hoàn tiền", tone: "gray" },
  };

  return map[status || ""] || { label: status || "--", tone: "gray" };
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

export default function PrivateOwnerPaymentsPage() {
  const [payments, setPayments] = useState<PrivateOwnerPayment[]>([]);
  const [filter, setFilter] = useState<PaymentFilter>("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    privateOwnerService
      .getMyPayments()
      .then((data) => {
        if (active) setPayments(data);
      })
      .catch((error) => {
        toast.error(getErrorMessage(error, "Không thể tải danh sách thanh toán"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const paidPayments = useMemo(
    () => payments.filter((payment) => payment.status === "PAID"),
    [payments],
  );

  const revenueStats = useMemo(() => {
    const now = new Date();

    return paidPayments.reduce(
      (acc, payment) => {
        const date = new Date(payment.paidAt || payment.createdAt || "");
        const amount = payment.amount || 0;

        acc.total += amount;
        if (Number.isNaN(date.getTime())) return acc;

        if (isSameDay(date, now)) acc.today += amount;
        if (isSameMonth(date, now)) acc.month += amount;

        return acc;
      },
      { today: 0, month: 0, total: 0 },
    );
  }, [paidPayments]);

  const filteredPayments = useMemo(() => {
    if (filter === "ALL") return payments;
    return payments.filter((payment) => payment.status === filter);
  }, [filter, payments]);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">
          Doanh thu cá nhân
        </p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">
          Thanh toán
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Theo dõi trạng thái thanh toán và doanh thu từ các booking thuộc xe
          của bạn.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">
                Doanh thu hôm nay
              </p>
              <p className="mt-2 text-2xl font-extrabold text-primary">
                {formatCurrency(revenueStats.today)}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-secondary">
              <Wallet size={22} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">
                Doanh thu tháng
              </p>
              <p className="mt-2 text-2xl font-extrabold text-primary">
                {formatCurrency(revenueStats.month)}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-secondary">
              <WalletCards size={22} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">
                Tổng doanh thu
              </p>
              <p className="mt-2 text-2xl font-extrabold text-primary">
                {formatCurrency(revenueStats.total)}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-secondary">
              <CreditCard size={22} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`rounded-lg px-4 py-2 text-sm font-extrabold transition ${
                filter === item.value
                  ? "bg-secondary text-primary"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Mã thanh toán</th>
                <th className="px-5 py-4">Booking</th>
                <th className="px-5 py-4">Khách hàng</th>
                <th className="px-5 py-4">Số tiền</th>
                <th className="px-5 py-4">Phương thức</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={18} className="animate-spin text-secondary" />
                      Đang tải thanh toán...
                    </span>
                  </td>
                </tr>
              )}

              {!loading &&
                filteredPayments.map((payment) => {
                  const status = getStatusBadge(payment.status);

                  return (
                    <tr key={payment._id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-extrabold text-primary">
                        #{payment._id.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {payment.bookingId
                          ? `#${payment.bookingId._id.slice(-8).toUpperCase()}`
                          : "--"}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-extrabold text-primary">
                          {payment.userId?.name || "--"}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {payment.userId?.email || "--"}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {payment.method || "--"}
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={status.tone}
                          label={status.label}
                        />
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDateTime(payment.paidAt || payment.createdAt)}
                      </td>
                    </tr>
                  );
                })}

              {!loading && filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    Không có thanh toán phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
