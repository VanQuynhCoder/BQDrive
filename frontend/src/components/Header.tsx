import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  ShoppingCart,
  UserCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { authService } from "../services/auth.service";
import {
  bookingService,
  PAYMENT_TODOS_REFRESH_EVENT,
  type PaymentTodo,
} from "../services/booking.service";
import NotificationBadge from "./NotificationBadge";
import NotificationBell from "./NotificationBell";
import { useNotificationSummary } from "../hooks/useNotificationSummary";

type DashboardLink = {
  to: string;
  label: string;
};

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatShortDate(value?: string) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => authService.getCurrentUser());
  const role = user?.role;
  const isAdmin = role === "ADMIN";
  const isBusiness = role === "BUSINESS";
  const isUser = role === "USER";
  const canViewCustomerHistory = isUser;
  const canRentCars = isUser;
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isPaymentTodosOpen, setIsPaymentTodosOpen] = useState(false);
  const [paymentTodos, setPaymentTodos] = useState<PaymentTodo[]>([]);
  const [loadingPaymentTodos, setLoadingPaymentTodos] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const paymentTodosRef = useRef<HTMLDivElement>(null);
  const { getCount } = useNotificationSummary({ enabled: Boolean(user) });
  const consignmentBadgeCount = getCount([
    "consignmentPendingCars",
    "consignmentApprovedCars",
    "consignmentRejectedCars",
    "consignmentBookingRequests",
    "consignmentPaidAwaitingHandover",
    "consignmentInProgressNeedReceiveReturn",
    "consignmentReturnInspectionPending",
    "consignmentCompleteBookingRequired",
    "consignmentPendingExtraCharges",
    "consignmentCashConfirmationRequired",
  ]);
  const contractBadgeCount = getCount([
    "bookingOwnerApproved",
    "returnDueSoon",
    "rejectedBookings",
    "renterPendingExtraCharges",
    "completedNeedReview",
  ]);
  const paymentBadgeCount = getCount("remainingPaymentDue");
  const taskBadgeCount = contractBadgeCount + paymentBadgeCount;

  let dashboardLink: DashboardLink | null = null;
  if (isAdmin) {
    dashboardLink = { to: "/admin", label: "Quản trị viên" };
  } else if (isBusiness) {
    dashboardLink = { to: "/business", label: "Quản lý doanh nghiệp" };
  }

  const accountMenuItemClass =
    "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-primary transition duration-200 hover:bg-secondarySoft/45 active:scale-[0.98]";
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

      if (
        paymentTodosRef.current &&
        event.target instanceof Node &&
        !paymentTodosRef.current.contains(event.target)
      ) {
        setIsPaymentTodosOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchPaymentTodos = async () => {
    if (!authService.isLoggedIn() || authService.getRole() !== "USER") {
      setPaymentTodos([]);
      return [];
    }

    setLoadingPaymentTodos(true);
    try {
      const todos = await bookingService.getMyPaymentTodos();
      setPaymentTodos(todos);
      return todos;
    } catch {
      setPaymentTodos([]);
      return [];
    } finally {
      setLoadingPaymentTodos(false);
    }
  };

  useEffect(() => {
    const syncUser = () => setUser(authService.getCurrentUser());

    window.addEventListener("storage", syncUser);
    window.addEventListener("bqdrive:user-updated", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("bqdrive:user-updated", syncUser);
    };
  }, []);

  useEffect(() => {
    if (isUser) {
      queueMicrotask(() => {
        void fetchPaymentTodos();
      });
    }
  }, [isUser, location.pathname, location.search]);

  useEffect(() => {
    const refreshPaymentTodos = () => {
      if (authService.getRole() === "USER") {
        void fetchPaymentTodos();
      }
    };

    window.addEventListener(PAYMENT_TODOS_REFRESH_EVENT, refreshPaymentTodos);
    window.addEventListener("focus", refreshPaymentTodos);

    return () => {
      window.removeEventListener(PAYMENT_TODOS_REFRESH_EVENT, refreshPaymentTodos);
      window.removeEventListener("focus", refreshPaymentTodos);
    };
  }, []);

  const closeAccountMenu = () => setIsAccountOpen(false);
  const closePaymentTodos = () => setIsPaymentTodosOpen(false);

  const handleLogout = () => {
    closeAccountMenu();
    closePaymentTodos();
    setPaymentTodos([]);
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

  const handleContinuePaymentClick = async () => {
    const todos = await fetchPaymentTodos();

    if (todos.length === 1) {
      closePaymentTodos();
      navigate(`/bookings/${todos[0].bookingId}`);
      return;
    }

    setIsPaymentTodosOpen((current) => !current);
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
                className="relative hidden min-h-10 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-extrabold text-primary transition duration-200 hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0 active:scale-95 lg:inline-flex"
              >
                Ký gửi xe
                <NotificationBadge count={consignmentBadgeCount} />
              </Link>
            )}

            {isUser && paymentTodos.length > 0 && (
              <div ref={paymentTodosRef} className="relative">
                <button
                  type="button"
                  onClick={handleContinuePaymentClick}
                  className="relative hidden min-h-10 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-secondary shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-primaryDark active:translate-y-0 active:scale-95 md:inline-flex"
                >
                  <CreditCard size={18} />
                  <span>Tiếp tục thanh toán</span>
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-extrabold text-white">
                    {paymentTodos.length}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label="Tiếp tục thanh toán"
                  title="Tiếp tục thanh toán"
                  onClick={handleContinuePaymentClick}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-secondary transition duration-200 hover:-translate-y-0.5 hover:bg-primaryDark active:translate-y-0 active:scale-95 md:hidden"
                >
                  <CreditCard size={22} />
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-extrabold text-white">
                    {paymentTodos.length}
                  </span>
                </button>

                {isPaymentTodosOpen && paymentTodos.length > 1 && (
                  <div className="absolute right-0 mt-3 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-white shadow-xl">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                        Cần thanh toán
                      </p>
                      <p className="mt-1 text-sm font-extrabold text-primary">
                        {paymentTodos.length} booking còn số tiền phải trả
                      </p>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto py-2">
                      {paymentTodos.map((todo) => (
                        <button
                          key={todo.bookingId}
                          type="button"
                          onClick={() => {
                            closePaymentTodos();
                            navigate(`/bookings/${todo.bookingId}`);
                          }}
                          className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-secondarySoft/45"
                        >
                          <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                            {todo.carImage ? (
                              <img
                                src={todo.carImage}
                                alt={todo.carName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-secondary">
                                <CreditCard size={20} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="line-clamp-1 font-extrabold text-primary">
                                {todo.carName}
                              </p>
                              <span className="shrink-0 rounded-full bg-secondarySoft px-2 py-0.5 text-xs font-extrabold text-primary">
                                #{todo.bookingCode}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-semibold text-muted">
                              {todo.licensePlate || "Chưa có biển số"} · Nhận {formatShortDate(todo.startDate)}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-muted">
                              Chủ xe: {todo.ownerName || "--"}
                            </p>
                            <p className="mt-2 font-extrabold text-red-600">
                              Còn phải thanh toán: {formatCurrency(todo.remainingAmount)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {loadingPaymentTodos && (
                      <p className="border-t border-border px-4 py-3 text-sm font-semibold text-muted">
                        Đang cập nhật danh sách...
                      </p>
                    )}
                  </div>
                )}
              </div>
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

        {user && <NotificationBell enabled={Boolean(user)} />}

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
                      <span className="flex min-w-0 items-center gap-3">
                        <LayoutDashboard
                          size={18}
                          className="text-secondary"
                        />
                        <span className="truncate">{dashboardLink.label}</span>
                      </span>
                    </Link>
                  )}

                  {isUser && (
                    <Link
                      to="/consignment/cars"
                      role="menuitem"
                      onClick={closeAccountMenu}
                      className={`${accountMenuItemClass} lg:hidden`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <LayoutDashboard
                          size={18}
                          className="text-secondary"
                        />
                        <span>Ký gửi xe</span>
                      </span>
                      <NotificationBadge count={consignmentBadgeCount} />
                    </Link>
                  )}

                  {canViewCustomerHistory && (
                    <>
                      <Link
                        to="/tasks"
                        role="menuitem"
                        onClick={closeAccountMenu}
                        className={accountMenuItemClass}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <ClipboardList size={18} className="text-secondary" />
                          <span>Việc cần làm</span>
                        </span>
                        <NotificationBadge count={taskBadgeCount} />
                      </Link>

                      <Link
                        to="/profile"
                        role="menuitem"
                        onClick={closeAccountMenu}
                        className={accountMenuItemClass}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <UserCircle size={18} className="text-secondary" />
                          <span>Hồ sơ của tôi</span>
                        </span>
                      </Link>

                      <Link
                        to="/my-contracts"
                        role="menuitem"
                        onClick={closeAccountMenu}
                        className={accountMenuItemClass}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <FileText size={18} className="text-secondary" />
                          <span>Hợp đồng của tôi</span>
                        </span>
                        <NotificationBadge count={contractBadgeCount} />
                      </Link>

                      <Link
                        to="/my-payments"
                        role="menuitem"
                        onClick={closeAccountMenu}
                        className={accountMenuItemClass}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <CreditCard size={18} className="text-secondary" />
                          <span>Lịch sử thanh toán</span>
                        </span>
                        <NotificationBadge count={paymentBadgeCount} />
                      </Link>
                    </>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className={`${accountMenuItemClass} border-t border-border text-slate-800 hover:bg-secondarySoft/60`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <LogOut size={18} />
                      <span>Đăng xuất</span>
                    </span>
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
              Đăng ký
            </Link>

            <Link
              to="/login"
              className="hidden rounded-full bg-primary px-5 py-2 font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-primaryDark hover:shadow-lg active:translate-y-0 active:scale-95 sm:inline-flex"
            >
              Đăng nhập
            </Link>

            <Link
              to="/login"
              aria-label="Đăng nhập"
              title="Đăng nhập"
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





