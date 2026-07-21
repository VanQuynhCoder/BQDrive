import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  BarChart3,
  CalendarCheck,
  Car,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  ShieldCheck,
  Star,
  WalletCards,
} from "lucide-react";

import DashboardReviewSections from "../../components/dashboard/DashboardReviewSections";
import {
  businessService,
  type BusinessDashboard,
} from "../../services/business.service";

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatNumber(value?: number) {
  return (value || 0).toLocaleString("vi-VN");
}

export default function BusinessDashboardPage() {
  const [dashboard, setDashboard] = useState<BusinessDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    businessService
      .getDashboard()
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch(() => {
        toast.error("Không thể tải dashboard doanh nghiệp");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const overview = dashboard?.overview || dashboard;
  const paidRevenue =
    overview?.totalPaidRevenue ??
    dashboard?.totalPaidRevenue ??
    dashboard?.totalRevenue ??
    0;

  const statCards = [
    {
      label: "Tổng xe",
      value: formatNumber(overview?.totalCars),
      detail: `${formatNumber(overview?.approvedCars)} xe đã duyệt`,
      icon: Car,
    },
    {
      label: "Xe chờ duyệt",
      value: formatNumber(overview?.pendingCars),
      detail: `${formatNumber(overview?.rejectedCars)} xe bị từ chối`,
      icon: Clock3,
    },
    {
      label: "Xe đang thuê",
      value: formatNumber(overview?.rentedCars),
      detail: "Xe đang phát sinh chuyến thuê",
      icon: ShieldCheck,
    },
    {
      label: "Booking",
      value: formatNumber(overview?.totalBookings),
      detail: `${formatNumber(overview?.pendingBookings)} booking chờ xác nhận`,
      icon: CalendarCheck,
    },
    {
      label: "Đang thuê",
      value: formatNumber(overview?.inProgressBookings),
      detail: `${formatNumber(overview?.completedBookings)} booking hoàn tất`,
      icon: CheckCircle2,
    },
    {
      label: "Doanh thu đã thanh toán",
      value: formatCurrency(paidRevenue),
      detail: "Chỉ tính payment PAID",
      icon: CreditCard,
    },
    {
      label: "Lượt đánh giá",
      value: formatNumber(overview?.totalReviews),
      detail: `Điểm trung bình ${(overview?.averageRating || 0).toFixed(1)}/5`,
      icon: Star,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-secondary">
            Điều hành doanh nghiệp
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary">
            Tổng quan vận hành
          </h2>
          <p className="mt-2 max-w-2xl text-slate-500">
            Theo dõi xe, booking, doanh thu và đánh giá của doanh nghiệp trên
            BQDrive.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-lg border border-secondary/40 bg-secondarySoft px-4 py-3 text-sm font-extrabold text-primary">
          <ShieldCheck size={18} />
          {dashboard?.profile?.isApproved ? "Đã được duyệt" : "Đang chờ duyệt"}
        </div>
      </section>

      {loading ? (
        <section className="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <Loader2 size={28} className="animate-spin text-secondary" />
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {statCards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.label}
                  className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-500">
                        {card.label}
                      </p>
                      <p className="mt-2 text-2xl font-extrabold text-primary">
                        {card.value}
                      </p>
                    </div>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary">
                      <Icon size={22} />
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-500">
                    {card.detail}
                  </p>
                </div>
              );
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-primary">
                    Dòng tiền
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Tổng hợp thanh toán đã ghi nhận thành công.
                  </p>
                </div>
                <WalletCards size={24} className="text-secondary" />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">
                    Đã thanh toán
                  </p>
                  <p className="mt-2 text-lg font-extrabold text-primary">
                    {formatCurrency(dashboard?.paymentStats?.paidAmount)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">Đang chờ</p>
                  <p className="mt-2 text-lg font-extrabold text-primary">
                    {formatCurrency(dashboard?.paymentStats?.pendingAmount)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">
                    Đã hoàn tiền
                  </p>
                  <p className="mt-2 text-lg font-extrabold text-primary">
                    {formatCurrency(dashboard?.paymentStats?.refundedAmount)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">
                    Giao dịch lỗi
                  </p>
                  <p className="mt-2 text-lg font-extrabold text-primary">
                    {formatNumber(dashboard?.paymentStats?.failedCount)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-primary">
                    Booking đang xử lý
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Booking chờ xác nhận cần duyệt, booking đang thuê cần theo
                    dõi bàn giao và hoàn tất.
                  </p>
                </div>
                <BarChart3 size={24} className="text-secondary" />
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <Clock3 size={20} className="text-amber-600" />
                    <span className="font-bold text-slate-600">Chờ xác nhận</span>
                  </div>
                  <span className="text-xl font-extrabold text-primary">
                    {formatNumber(overview?.pendingBookings)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-secondary" />
                    <span className="font-bold text-slate-600">Đang thuê</span>
                  </div>
                  <span className="text-xl font-extrabold text-primary">
                    {formatNumber(overview?.inProgressBookings)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <DashboardReviewSections
            topRatedCars={dashboard?.topRatedCars}
            lowRatedCars={dashboard?.lowRatedCars}
            mostReviewedCars={dashboard?.mostReviewedCars}
          />
        </>
      )}
    </div>
  );
}
