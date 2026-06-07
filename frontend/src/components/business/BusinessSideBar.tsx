import {
  BarChart3,
  CalendarDays,
  Car,
  CreditCard,
  LogOut,
  Store,
  UserCog,
} from "lucide-react";
import { NavLink } from "react-router-dom";

type BusinessSideBarProps = {
  onLogout: () => void;
};

const navItems = [
  { label: "Dashboard", to: "/business", icon: BarChart3, end: true },
  { label: "Quản lý xe", to: "/business/cars", icon: Car },
  { label: "Booking", to: "/business/bookings", icon: CalendarDays },
  { label: "Thanh toán", to: "/business/payments", icon: CreditCard },
  { label: "Hồ sơ", to: "/business/profile", icon: UserCog },
];

export default function BusinessSideBar({ onLogout }: BusinessSideBarProps) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 border-r border-slate-800 bg-primary text-white lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-primary">
              <Store size={24} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold">BQDrive</h1>
              <p className="text-sm font-semibold text-white/55">
                Business Console
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition ${
                  isActive
                    ? "bg-secondary text-primary shadow-lg shadow-black/10"
                    : "text-white/72 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold text-white/72 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut size={19} />
            Đăng xuất
          </button>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-3 py-2 shadow-2xl lg:hidden">
        <div className="flex gap-2 overflow-x-auto">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-w-[92px] flex-col items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-extrabold transition ${
                  isActive
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-600"
                }`
              }
            >
              <Icon size={18} />
              <span className="whitespace-nowrap">{label}</span>
            </NavLink>
          ))}

          <button
            type="button"
            onClick={onLogout}
            className="flex min-w-[92px] flex-col items-center justify-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-600"
          >
            <LogOut size={18} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </nav>
    </>
  );
}
