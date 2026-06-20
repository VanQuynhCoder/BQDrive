import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  Car,
  ShieldCheck,
  Users,
} from "lucide-react";

import { adminService, type DashboardStats } from "../../services/admin.service";

const defaultStats: DashboardStats = {
  totalUsers: 0,
  totalBusinesses: 0,
  totalPrivateOwners: 0,
  totalCars: 0,
  pendingCars: 0,
  pendingBookings: 0,
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      adminService.getDashboardStats(),
      adminService.getUsers({ role: "USER" }),
    ])
      .then(([dashboard, privateOwners]) => {
        if (!active) return;

        setStats({
          ...defaultStats,
          ...dashboard,
          totalPrivateOwners: privateOwners.length,
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

  const cards = [
    {
      label: "Tổng User",
      value: stats.totalUsers,
      icon: Users,
      tone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Tổng Doanh nghiệp",
      value: stats.totalBusinesses,
      icon: BriefcaseBusiness,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Tổng Chủ xe tư nhân",
      value: stats.totalPrivateOwners || 0,
      icon: ShieldCheck,
      tone: "bg-purple-50 text-purple-700",
    },
    {
      label: "Tổng Xe",
      value: stats.totalCars,
      icon: Car,
      tone: "bg-slate-100 text-slate-700",
    },
    {
      label: "Xe chờ duyệt",
      value: stats.pendingCars,
      icon: BarChart3,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Booking đang xử lý",
      value: stats.pendingBookings || 0,
      icon: CalendarClock,
      tone: "bg-red-50 text-red-700",
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
          Theo dõi nhanh người dùng, doanh nghiệp, xe và booking đang cần xử lý.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-500">{label}</p>
                <p className="mt-3 text-4xl font-extrabold text-primary">
                  {loading ? "..." : value.toLocaleString("vi-VN")}
                </p>
              </div>
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-lg ${tone}`}
              >
                <Icon size={24} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-extrabold text-primary">
              Hàng đợi xử lý
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Ưu tiên kiểm tra xe chờ duyệt và booking đang pending để luồng
              vận hành không bị nghẽn.
            </p>
          </div>
          <div className="rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white">
            {stats.pendingCars + (stats.pendingBookings || 0)} mục cần chú ý
          </div>
        </div>
      </section>
    </div>
  );
}
