import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  ShoppingCart,
  UserCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { authService } from "../services/auth.service";

type DashboardLink = {
  to: string;
  label: string;
};

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = authService.getCurrentUser();
  const role = user?.role;
  const isAdmin = role === "ADMIN";
  const isBusiness = role === "BUSINESS";
  const isUser = role === "USER";
  const canViewCustomerHistory = isUser;
  const canRentCars = isUser;
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  let dashboardLink: DashboardLink | null = null;
  if (isAdmin) {
    dashboardLink = { to: "/admin", label: "Quản Trị Viên" };
  } else if (isBusiness) {
    dashboardLink = { to: "/business", label: "Quản Lý Doanh Nghiệp" };
  }

  const accountMenuItemClass =
    "flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-primary transition duration-200 hover:bg-secondarySoft/45 active:scale-[0.98]";
  const navItemBase =
    "group relative inline-flex min-h-10 items-center px-3 font-semibold transition duration-200 before:absolute before:bottom-1.5 before:left-1/2 before:h-0.5 before:w-0 before:-translate-x-1/2 before:rounded-full before:bg-secondary before:transition-all before:duration-200 hover:-translate-y-0.5 hover:text-primary hover:before:w-6 active:translate-y-0 active:scale-95";
  const navItemMuted = `${navItemBase} text-muted`;
  const navItemActive = `${navItemBase} text-primary before:w-6`;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        accountMenuRef.current &&
        event.target instanceof Node &&
        !accountMenuRef.current.contains(event.target)
      ) {
        setIsAccountOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const closeAccountMenu = () => setIsAccountOpen(false);

  const handleLogout = () => {
    closeAccountMenu();
    authService.logout();
    toast.success("");
    navigate("/login");
  };

  const handleFindCarsClick = () => {
    if (location.pathname === "/") {
      document
        .getElementById("home-cars")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    navigate("/#home-cars");
  };

  return (
    <header className="fixed left-0 top-0 z-50 flex h-20 w-full items-center justify-between border-b border-border bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-5 lg:gap-8">
        <Link
          to="/"
          className="shrink-0 rounded-lg text-2xl font-extrabold text-primary transition duration-200 hover:-translate-y-0.5 hover:text-secondary active:translate-y-0 active:scale-95"
        >
          BQDrive
        </Link>

        <nav className="hidden items-center gap-1 xl:flex">
          <button
            type="button"
            className={
              location.pathname === "/" && location.hash === "#home-cars"
                ? navItemActive
                : `${navItemBase} text-primary`
            }
            onClick={handleFindCarsClick}
          >
            Tìm xe
          </button>
          <Link
            className={
              location.pathname === "/services" ? navItemActive : navItemMuted
            }
            to="/services"
          >
            Dịch vụ
          </Link>
          <Link
            className={
              location.pathname === "/about" ? navItemActive : navItemMuted
            }
            to="/about"
          >
            Về chúng tôi
          </Link>
          <a className={navItemMuted} href="#">
            Liên hệ
          </a>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {canRentCars && (
          <>
            {isUser && (
              <Link
                to="/consignment/cars"
                className="hidden min-h-10 items-center rounded-full bg-secondary px-4 py-2 text-sm font-extrabold text-primary transition duration-200 hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0 active:scale-95 lg:inline-flex"
              >
              Ký gửi xe
              </Link>
            )}

            <Link
              to="/cart"
              aria-label="Giỏ hàng"
              title="Giỏ hàng"
              className="flex h-10 w-10 items-center justify-center rounded-full text-primary transition duration-200 hover:-translate-y-0.5 hover:bg-secondarySoft/60 hover:text-secondary active:translate-y-0 active:scale-95"
            >
              <ShoppingCart size={24} />
            </Link>
          </>
        )}

        {dashboardLink && (
          <Link
            to={dashboardLink.to}
            className="hidden min-h-10 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-primaryDark hover:shadow-lg active:translate-y-0 active:scale-95 lg:inline-flex"
          >
            <LayoutDashboard size={18} className="text-secondary" />
            <span className="hidden 2xl:inline">{dashboardLink.label}</span>
            <span className="2xl:hidden">Dashboard</span>
          </Link>
        )}

        {user ? (
          <div ref={accountMenuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isAccountOpen}
              onClick={() => setIsAccountOpen((current) => !current)}
              className={`inline-flex h-10 items-center gap-2 rounded-full border px-2.5 text-primary transition duration-200 hover:-translate-y-0.5 hover:bg-secondarySoft/60 active:translate-y-0 active:scale-95 sm:px-3 lg:px-4 ${
                isAccountOpen
                  ? "border-secondary bg-secondarySoft/60 shadow-sm"
                  : "border-border"
              }`}
            >
              <UserCircle size={24} />
              <span className="hidden max-w-[150px] truncate text-sm font-bold sm:inline">
                {user.name}
              </span>
              <ChevronDown
                size={16}
                className={`hidden transition sm:block ${
                  isAccountOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isAccountOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-3 w-72 overflow-hidden rounded-2xl border border-border bg-white shadow-xl"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    Tài khoản
                  </p>
                  <p className="mt-1 truncate text-sm font-extrabold text-primary">
                    {user.name}
                  </p>
                </div>

                <div className="py-2">
                  {dashboardLink && (
                    <Link
                      to={dashboardLink.to}
                      role="menuitem"
                      onClick={closeAccountMenu}
                      className={`${accountMenuItemClass} lg:hidden`}
                    >
                      <LayoutDashboard size={18} className="text-secondary" />
                      {dashboardLink.label}
                    </Link>
                  )}

                  {isUser && (
                    <Link
                      to="/consignment/cars"
                      role="menuitem"
                      onClick={closeAccountMenu}
                      className={`${accountMenuItemClass} lg:hidden`}
                    >
                      <LayoutDashboard size={18} className="text-secondary" />
                      Ký gửi xe
                    </Link>
                  )}

                  {canViewCustomerHistory && (
                    <>
                      <Link
                        to="/my-contracts"
                        role="menuitem"
                        onClick={closeAccountMenu}
                        className={accountMenuItemClass}
                      >
                        <FileText size={18} className="text-secondary" />
                        Hợp đồng của tôi
                      </Link>

                      <Link
                        to="/my-payments"
                        role="menuitem"
                        onClick={closeAccountMenu}
                        className={accountMenuItemClass}
                      >
                        <CreditCard size={18} className="text-secondary" />
                        Lịch sử thanh toán
                      </Link>
                    </>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className={`${accountMenuItemClass} border-t border-border text-red-600 hover:bg-red-50`}
                  >
                    <LogOut size={18} />
                    Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link
              to="/register"
              className="hidden rounded-full border border-border px-5 py-2 font-semibold text-text transition duration-200 hover:-translate-y-0.5 hover:border-secondary hover:bg-secondarySoft/60 active:translate-y-0 active:scale-95 sm:inline-flex"
            >
              Đăng Ký
            </Link>

            <Link
              to="/login"
              className="hidden rounded-full bg-primary px-5 py-2 font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-primaryDark hover:shadow-lg active:translate-y-0 active:scale-95 sm:inline-flex"
            >
              Đang Nhập
            </Link>

            <Link
              to="/login"
              aria-label="Đăng Nhập"
              title="Đăng Nhập"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white transition duration-200 hover:-translate-y-0.5 hover:bg-primaryDark active:translate-y-0 active:scale-95 sm:hidden"
            >
              <UserCircle size={22} />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
