import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
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
  privateOwnerService,
  type PrivateOwnerDashboard,
} from "../../services/privateOwner.service";

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

export default function PrivateOwnerDashboardPage() {
  const [dashboard, setDashboard] = useState<PrivateOwnerDashboard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    privateOwnerService
      .getDashboard()
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch(() => {
        toast.error("Không thể tải dashboard chủ xe");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const overview = dashboard?.overview || dashboard;
  const totalCars =
    overview?.totalConsignmentCars ??
    dashboard?.totalConsignmentCars ??
    overview?.totalCars ??
    0;
  const paidRevenue =
    overview?.totalPaidRevenue ??
    dashboard?.totalPaidRevenue ??
    dashboard?.totalRevenue ??
    0;
  const processingBookings =
    (overview?.pendingBookings || 0) + (overview?.confirmedBookings || 0);

  const statCards = [
    {
      label: "Tổng xe ký gửi",
      value: formatNumber(totalCars),
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
      detail: "Xe ký gửi đang phát sinh chuyến thuê",
      icon: ShieldCheck,
    },
    {
      label: "Booking từ xe của bạn",
      value: formatNumber(overview?.totalBookings),
      detail: `${formatNumber(processingBookings)} booking đang xử lý`,
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
            Ký gửi xe
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary">
            Tổng quan vận hành
          </h2>
          <p className="mt-2 max-w-2xl text-slate-500">
            Theo dõi xe ký gửi, booking, doanh thu và đánh giá phát sinh từ xe
            bạn sở hữu trên BQDrive.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-lg border border-secondary/40 bg-secondarySoft px-4 py-3 text-sm font-extrabold text-primary">
          <ShieldCheck size={18} />
          Tài khoản USER ký gửi
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
                    Tổng hợp thanh toán thành công từ booking của xe ký gửi.
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
              <h3 className="text-xl font-extrabold text-primary">
                Booking cần chú ý
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Chỉ bao gồm booking phát sinh từ xe ký gửi mà bạn sở hữu.
              </p>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <Clock3 size={20} className="text-amber-600" />
                    <span className="font-bold text-slate-600">
                      Chờ xác nhận
                    </span>
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
            labels={{
              top: {
                title: "Xe ký gửi được đánh giá cao",
                subtitle: "Xe của bạn có phản hồi tốt nhất từ khách thuê.",
                emptyText: "Chưa có xe ký gửi nào có đánh giá.",
              },
              low: {
                title: "Xe ký gửi cần cải thiện",
                subtitle: "Các xe cần theo dõi thêm về trải nghiệm thuê.",
                emptyText: "Chưa có dữ liệu cần cải thiện.",
              },
              most: {
                title: "Xe ký gửi được đánh giá nhiều",
                subtitle: "Các xe nhận nhiều phản hồi nhất.",
                emptyText: "Chưa có lượt đánh giá nào.",
              },
            }}
          />
        </>
      )}
    </div>
  );
}
