import { Home, LogOut, UserCircle } from "lucide-react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import AdminSidebar from "../components/admin/AdminSidebar";
import { authService } from "../services/auth.service";

export default function AdminLayout() {
  const navigate = useNavigate();
  const admin = authService.getCurrentUser();

  const handleLogout = () => {
    authService.logout();
    toast.success("Đã đăng xuất khỏi trang quản trị");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <AdminSidebar onLogout={handleLogout} />

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                BQDrive Admin
              </p>
              <h1 className="text-xl font-extrabold text-primary">
                Bảng điều khiển quản trị
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold text-slate-700 transition hover:bg-slate-50 hover:text-primary sm:px-4"
              >
                <Home size={18} />
                <span className="hidden sm:inline">Về trang chủ</span>
              </Link>

              <div className="hidden items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 md:flex">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
                  <UserCircle size={24} />
                </div>
                <div className="max-w-[180px]">
                  <p className="truncate text-sm font-extrabold text-primary">
                    {admin.name || "Admin"}
                  </p>
                  <p className="truncate text-xs font-semibold text-slate-500">
                    {admin.email || "admin@bqdrive.vn"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50 hover:text-primary"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 pb-28 pt-6 md:px-6 lg:px-8 lg:pb-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}




