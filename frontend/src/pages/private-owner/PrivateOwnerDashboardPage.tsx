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
  WalletCards,
} from "lucide-react";

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

  const processingBookings =
    (dashboard?.pendingBookings || 0) + (dashboard?.confirmedBookings || 0);

  const statCards = [
    {
      label: "Tổng xe",
      value: dashboard?.totalCars || 0,
      detail: `${dashboard?.rejectedCars || 0} xe bị từ chối`,
      icon: Car,
    },
    {
      label: "Xe chờ duyệt",
      value: dashboard?.pendingCars || 0,
      detail: "Xe mới hoặc vừa cập nhật",
      icon: Clock3,
    },
    {
      label: "Xe đang hoạt động",
      value: dashboard?.approvedCars || 0,
      detail: "Đang hiển thị cho khách hàng",
      icon: CheckCircle2,
    },
    {
      label: "Booking đang xử lý",
      value: processingBookings,
      detail: `${dashboard?.pendingBookings || 0} chờ xác nhận`,
      icon: CalendarCheck,
    },
    {
      label: "Doanh thu tháng",
      value: formatCurrency(dashboard?.revenueThisMonth),
      detail: "Tính trên thanh toán đã thanh toán",
      icon: CreditCard,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-secondary">
            Chủ xe tư nhân
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary">
            Tổng quan vận hành
          </h2>
          <p className="mt-2 max-w-2xl text-slate-500">
            Theo dõi xe, booking và doanh thu phát sinh từ đội xe cá nhân của
            bạn trên BQDrive.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-700">
          <ShieldCheck size={18} />
          {dashboard?.profile?.isApproved ? "Đã được duyệt" : "Đang khởi tạo"}
        </div>
      </section>

      {loading ? (
        <section className="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <Loader2 size={28} className="animate-spin text-secondary" />
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-secondary">
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

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">Hôm nay</p>
                  <p className="mt-2 text-lg font-extrabold text-primary">
                    {formatCurrency(dashboard?.revenueToday)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">
                    Tháng này
                  </p>
                  <p className="mt-2 text-lg font-extrabold text-primary">
                    {formatCurrency(dashboard?.revenueThisMonth)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">
                    Tổng doanh thu
                  </p>
                  <p className="mt-2 text-lg font-extrabold text-primary">
                    {formatCurrency(dashboard?.totalRevenue)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-extrabold text-primary">
                Booking cần chú ý
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Booking chờ xác nhận cần duyệt, booking đã xác nhận cần theo dõi bàn giao xe.
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
                    {dashboard?.pendingBookings || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-emerald-600" />
                    <span className="font-bold text-slate-600">
                      Đã xác nhận
                    </span>
                  </div>
                  <span className="text-xl font-extrabold text-primary">
                    {dashboard?.confirmedBookings || 0}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
