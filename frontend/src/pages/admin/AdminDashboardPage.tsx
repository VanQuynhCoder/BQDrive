import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  Car,
  Loader2,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";

import DashboardReviewSections from "../../components/dashboard/DashboardReviewSections";
import { adminService, type DashboardStats } from "../../services/admin.service";

const defaultStats: DashboardStats = {
  totalUsers: 0,
  totalBusinesses: 0,
  totalPrivateOwners: 0,
  totalConsignmentOwners: 0,
  totalCars: 0,
  pendingCars: 0,
  pendingConsignmentCars: 0,
  pendingBusinessCars: 0,
  pendingBookings: 0,
};

function formatNumber(value?: number) {
  return (value || 0).toLocaleString("vi-VN");
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    adminService
      .getDashboardStats()
      .then((dashboard) => {
        if (!active) return;

        setStats({
          ...defaultStats,
          ...dashboard,
          totalConsignmentOwners:
            dashboard?.totalConsignmentOwners ??
            dashboard?.totalPrivateOwners ??
            0,
        });
      })
      .catch(() => {
        toast.error("Không thể tải thống kê dashboard");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const overview = stats.overview || stats;
  const pendingWork =
    (overview.pendingCars || 0) + (overview.pendingBookings || 0);

  const cards = [
    {
      label: "Tổng User",
      value: formatNumber(overview.totalUsers),
      detail: "Tài khoản người dùng",
      icon: Users,
      tone: "bg-primary text-secondary",
    },
    {
      label: "Tổng doanh nghiệp",
      value: formatNumber(overview.totalBusinesses),
      detail: "Đối tác đang quản lý",
      icon: BriefcaseBusiness,
      tone: "bg-secondarySoft text-primary",
    },
    {
      label: "USER có xe ký gửi",
      value: formatNumber(overview.totalConsignmentOwners),
      detail: "Chủ xe ký gửi cá nhân",
      icon: ShieldCheck,
      tone: "bg-slate-100 text-primary",
    },
    {
      label: "Tổng xe",
      value: formatNumber(overview.totalCars),
      detail: `${formatNumber(overview.approvedCars)} xe đã duyệt`,
      icon: Car,
      tone: "bg-slate-100 text-slate-700",
    },
    {
      label: "Xe chờ duyệt",
      value: formatNumber(overview.pendingCars),
      detail: `${formatNumber(stats.pendingBusinessCars)} doanh nghiệp, ${formatNumber(stats.pendingConsignmentCars)} ký gửi`,
      icon: BarChart3,
      tone: "bg-secondarySoft text-primary",
    },
    {
      label: "Tổng booking",
      value: formatNumber(overview.totalBookings),
      detail: `${formatNumber(overview.completedBookings)} booking hoàn tất`,
      icon: CalendarCheck,
      tone: "bg-slate-100 text-primary",
    },
    {
      label: "Đánh giá",
      value: formatNumber(overview.totalReviews),
      detail: `Điểm trung bình ${(overview.averageRating || 0).toFixed(1)}/5`,
      icon: Star,
      tone: "bg-secondarySoft text-primary",
    },
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">Tổng quan</p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">
          Dashboard quản trị BQDrive
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Theo dõi người dùng, doanh nghiệp, xe, booking và đánh giá trên toàn
          hệ thống. Admin chỉ xem số liệu vận hành, không can thiệp thanh toán
          của chủ xe.
        </p>
      </section>

      {loading ? (
        <section className="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <Loader2 size={28} className="animate-spin text-secondary" />
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ label, value, detail, icon: Icon, tone }) => (
              <div
                key={label}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-500">{label}</p>
                    <p className="mt-2 text-2xl font-extrabold text-primary">
                      {value}
                    </p>
                  </div>
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tone}`}
                  >
                    <Icon size={22} />
                  </div>
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-500">
                  {detail}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xl font-extrabold text-primary">
              Hàng đợi xử lý
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Ưu tiên kiểm tra xe chờ duyệt và các booking đang chờ để luồng
              vận hành không bị nghẽn.
            </p>
            <div className="mt-5 rounded-lg bg-primary p-5 text-white">
              <p className="text-sm font-bold text-secondary">
                Tổng mục cần chú ý
              </p>
              <p className="mt-2 text-4xl font-extrabold">
                {formatNumber(pendingWork)}
              </p>
            </div>
          </section>

          <DashboardReviewSections
            topRatedCars={stats.topRatedCars}
            lowRatedCars={stats.lowRatedCars}
            mostReviewedCars={stats.mostReviewedCars}
          />
        </>
      )}
    </div>
  );
}
