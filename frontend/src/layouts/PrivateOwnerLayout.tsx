import { Home, LogOut, UserCircle, WalletCards } from "lucide-react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import PrivateOwnerSidebar from "../components/private-owner/PrivateOwnerSidebar";
import { authService } from "../services/auth.service";

export default function PrivateOwnerLayout() {
  const navigate = useNavigate();
  const owner = authService.getCurrentUser();

  const handleLogout = () => {
    authService.logout();
    toast.success("Da dang xuat khoi dashboard ky gui xe");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <PrivateOwnerSidebar onLogout={handleLogout} />

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase text-secondary">
                BQDrive Ky gui xe
              </p>
              <h1 className="truncate text-xl font-extrabold text-primary">
                Quan ly xe ky gui
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="hidden min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50 hover:text-primary sm:inline-flex"
              >
                <Home size={18} />
                Ve trang chu
              </Link>

              <div className="hidden items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 md:flex">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-secondary">
                  <WalletCards size={22} />
                </div>
                <div className="max-w-[190px]">
                  <p className="truncate text-sm font-extrabold text-primary">
                    {owner?.name || "Nguoi dung"}
                  </p>
                  <p className="truncate text-xs font-semibold text-slate-500">
                    {owner?.email || "user@bqdrive.vn"}
                  </p>
                </div>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 md:hidden">
                <UserCircle size={24} />
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50 hover:text-primary lg:hidden"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">Dang xuat</span>
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