import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CarFront,
  Clock,
  CreditCard,
  Fuel,
  Gauge,
  Headphones,
  ShieldCheck,
  ShoppingBag,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { cartService } from "../services/cart.service";
import { getFirstCarImage } from "../utils/image.util";
import { formatVietnamDateTime } from "../utils/date.util";

type CartCar = {
  _id?: string;
  name?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  rentalUnit?: string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
};

type CartItem = {
  _id: string;
  carId?: CartCar;
  startDate: string;
  endDate: string;
  rentalMode?: string;
  totalPrice?: number;
  expiredAt?: string;
  status?: string;
};

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN").format(price || 0) + "đ";
}

function formatDateTime(date: string) {
  return formatVietnamDateTime(date, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  const apiError = error as ApiError;

  if (typeof apiError.response?.data?.message === "string") {
    return apiError.response.data.message;
  }

  return fallback;
}

const HOUR_MS = 1000 * 60 * 60;

function getRentalInfo(car: CartCar | undefined, rentalMode?: string) {
  if (rentalMode === "HOURLY" || (!rentalMode && car?.rentalUnit === "HOUR")) {
    return {
      price: car?.pricePerHour || 0,
      unit: "giờ",
      label: "Số giờ thuê",
      modeLabel: "Thuê theo giờ",
    };
  }

  return {
    price: car?.pricePerDay || 0,
    unit: "ngày",
    label: "Số ngày thuê",
    modeLabel: "Thuê theo ngày",
  };
}

function calculateRentalTime(rentalMode: string | undefined, start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();

  if (diffMs <= 0) return 0;

  if (rentalMode === "HOURLY") {
    return Math.ceil(diffMs / HOUR_MS);
  }

  return Math.max(1, Math.ceil(diffMs / HOUR_MS / 24));
}

function getSpecLabel(value?: string) {
  const labels: Record<string, string> = {
    ELECTRIC: "Điện",
    GASOLINE: "Xăng",
    DIESEL: "Diesel",
    AUTOMATIC: "Tự động",
    MANUAL: "Số sàn",
  };

  return value ? labels[value] || value : "Đang cập nhật";
}

export default function CartPage() {
  const navigate = useNavigate();

  const [carts, setCarts] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingCartId, setSubmittingCartId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    cartService
      .getMyCart()
      .then((data) => {
        const now = Date.now();
        if (active) {
          setCarts(
            (data as CartItem[]).filter(
              (item) =>
                (!item.status || item.status === "ACTIVE") &&
                (!item.expiredAt ||
                  new Date(item.expiredAt).getTime() > now),
            ),
          );
        }
      })
      .catch((error: unknown) => {
        toast.error(getErrorMessage(error, "Không thể tải giỏ hàng"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshCart = async () => {
    const data = await cartService.getMyCart();
    const now = Date.now();
    setCarts(
      (data as CartItem[]).filter(
        (item) =>
          (!item.status || item.status === "ACTIVE") &&
          (!item.expiredAt || new Date(item.expiredAt).getTime() > now),
      ),
    );
  };

  useEffect(() => {
    const activeExpiries = carts
      .map((item) => (item.expiredAt ? new Date(item.expiredAt).getTime() : 0))
      .filter((time) => time > Date.now());

    if (activeExpiries.length === 0) return;

    const nextExpiry = Math.min(...activeExpiries);
    const timeoutId = window.setTimeout(() => {
      refreshCart().catch(console.log);
    }, Math.max(nextExpiry - Date.now() + 250, 250));

    return () => window.clearTimeout(timeoutId);
  }, [carts]);

  const handleRemove = async (id: string) => {
    if (!confirm("Bạn muốn xóa xe này khỏi giỏ hàng?")) return;

    try {
      await cartService.removeFromCart(id);
      await refreshCart();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Xóa thất bại"));
    }
  };

  const handleCheckout = async (cartId: string) => {
    if (submittingCartId) return;

    try {
      setSubmittingCartId(cartId);
      const booking = await cartService.bookingFromCart(cartId);
      toast.success("Đã gửi yêu cầu đặt xe, vui lòng chờ chủ xe xác nhận");
      navigate(`/bookings/${booking._id}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Không thể tạo booking từ giỏ hàng"));
      await refreshCart().catch(console.log);
    } finally {
      setSubmittingCartId(null);
    }
  };

  const subtotal = carts.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const vat = subtotal * 0.1;
  const total = subtotal + vat;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-7xl px-6 pt-32">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              {[1, 2].map((item) => (
                <div
                  key={item}
                  className="h-40 animate-pulse rounded-lg bg-soft"
                />
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-lg bg-soft" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
        <section className="mb-8 rounded-lg bg-primary p-6 text-white md:p-8">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px] md:items-end">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Giỏ hàng
              </p>
              <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">
                Kiểm tra xe trước khi thanh toán
              </h1>
              <p className="mt-4 max-w-2xl leading-7 text-white/70">
                Xem lại lịch nhận trả, đơn giá và tổng chi phí của các xe đã
                chọn trong hệ thống BQDrive.
              </p>
            </div>

            <div className="rounded-lg border border-white/15 bg-white/10 p-4">
              <div className="flex items-start gap-3">
                <Timer className="mt-1 shrink-0 text-secondary" size={22} />
                <div>
                  <p className="font-extrabold">Giữ xe tạm 10 phút</p>
                  <p className="mt-1 text-sm leading-6 text-white/65">
                    Xe có thể tự hết hạn nếu chưa hoàn tất booking trong thời
                    gian giữ chỗ.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-5">
            {carts.length === 0 && (
              <div className="rounded-lg border border-border bg-white p-10 text-center shadow-sm md:p-16">
                <ShoppingBag
                  size={58}
                  className="mx-auto mb-5 text-secondary"
                />

                <h2 className="text-3xl font-extrabold text-primary">
                  Giỏ hàng đang trống
                </h2>

                <p className="mx-auto mt-3 max-w-md text-muted">
                  Hãy chọn thêm một chiếc xe phù hợp với lịch trình của bạn.
                </p>

                <Link
                  to="/"
                  className="mt-8 inline-flex min-h-12 items-center justify-center rounded-lg bg-secondary px-7 py-3 font-extrabold text-primary"
                >
                  Tìm xe ngay
                </Link>
              </div>
            )}

            {carts.map((item) => {
              const car = item.carId;
              const rental = getRentalInfo(car, item.rentalMode);
              const rentalTime = calculateRentalTime(
                item.rentalMode,
                item.startDate,
                item.endDate,
              );

              return (
                <article
                  key={item._id}
                  className="rounded-lg border border-border bg-white p-4 shadow-sm transition hover:shadow-lg md:p-5"
                >
                  <div className="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
                    <img
                      src={getFirstCarImage(car?.images)}
                      alt={car?.name || "Xe thuê"}
                      className="h-44 w-full rounded-lg object-cover md:h-full"
                    />

                    <div className="min-w-0">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="mb-3 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-extrabold text-emerald-700">
                              <ShieldCheck size={15} />
                              Đã kiểm duyệt
                            </span>
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">
                              {rental.modeLabel}
                            </span>
                          </div>

                          <h2 className="text-2xl font-extrabold text-primary">
                            {car?.name || "Xe BQDrive"}
                          </h2>
                        </div>

                        <div className="shrink-0 md:text-right">
                          <p className="text-sm font-semibold text-muted">
                            Thành tiền
                          </p>
                          <p className="text-2xl font-extrabold text-secondary">
                            {formatPrice(item.totalPrice || 0)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 border-y border-border py-4 text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
                        <span className="flex items-center gap-2">
                          <Users size={17} className="text-secondary" />
                          {car?.seats || 4} chỗ
                        </span>
                        <span className="flex items-center gap-2">
                          <Fuel size={17} className="text-secondary" />
                          {getSpecLabel(car?.fuelType)}
                        </span>
                        <span className="flex items-center gap-2">
                          <Gauge size={17} className="text-secondary" />
                          {getSpecLabel(car?.transmission)}
                        </span>
                        <span className="font-semibold text-primary">
                          {formatPrice(rental.price)} / {rental.unit}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="grid gap-3 text-sm sm:grid-cols-3">
                          <div>
                            <p className="mb-1 flex items-center gap-2 font-semibold text-muted">
                              <CalendarDays
                                size={17}
                                className="text-secondary"
                              />
                              Nhận xe
                            </p>
                            <p className="font-bold text-primary">
                              {formatDateTime(item.startDate)}
                            </p>
                          </div>

                          <div>
                            <p className="mb-1 flex items-center gap-2 font-semibold text-muted">
                              <CalendarDays
                                size={17}
                                className="text-secondary"
                              />
                              Trả xe
                            </p>
                            <p className="font-bold text-primary">
                              {formatDateTime(item.endDate)}
                            </p>
                          </div>

                          <div>
                            <p className="mb-1 flex items-center gap-2 font-semibold text-muted">
                              <Clock size={17} className="text-secondary" />
                              {rental.label}
                            </p>
                            <p className="font-bold text-primary">
                              {rentalTime} {rental.unit}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemove(item._id)}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-extrabold text-red-600 transition hover:bg-red-100"
                        >
                          <Trash2 size={17} />
                          Xóa khỏi giỏ
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}

            <Link
              to="/"
              className="inline-flex items-center gap-2 font-extrabold text-primary transition hover:text-secondary"
            >
              <ArrowLeft size={18} />
              Tiếp tục tìm thêm xe
            </Link>
          </section>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-lg bg-primary p-6 text-white shadow-xl shadow-slate-900/15">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Tóm tắt
                  </p>
                  <h2 className="mt-1 text-3xl font-extrabold">
                    Chi phí thuê xe
                  </h2>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-secondary">
                  <CreditCard size={24} />
                </div>
              </div>

              <div className="my-6 space-y-4 border-y border-white/15 py-6">
                <div className="flex justify-between gap-4">
                  <span className="text-white/70">
                    Tạm tính ({carts.length} xe)
                  </span>
                  <span className="font-bold">{formatPrice(subtotal)}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-white/70">Thuế VAT 10%</span>
                  <span className="font-bold">{formatPrice(vat)}</span>
                </div>
              </div>

              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xl font-extrabold">Tổng thanh toán</p>
                  <p className="mt-1 text-sm text-white/60">
                    Đã bao gồm các chi phí hiển thị
                  </p>
                </div>

                <p className="text-right text-4xl font-extrabold text-secondary">
                  {formatPrice(total)}
                </p>
              </div>

              <button
                onClick={() => carts[0] && handleCheckout(carts[0]._id)}
                disabled={carts.length === 0 || Boolean(submittingCartId)}
                className="mt-7 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CreditCard size={21} />
                {submittingCartId ? "Đang tạo booking..." : "Gửi yêu cầu đặt xe"}
              </button>
            </div>

            <div className="mt-5 space-y-4 rounded-lg border border-border bg-white p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 text-secondary" size={21} />
                <div>
                  <h4 className="font-extrabold text-primary">
                    Thanh toán bảo mật
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Booking được xử lý trong hệ thống BQDrive.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Headphones className="mt-0.5 text-secondary" size={21} />
                <div>
                  <h4 className="font-extrabold text-primary">
                    Hỗ trợ khi cần
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Đồng hành trong quá trình xác nhận và nhận xe.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CarFront className="mt-0.5 text-secondary" size={21} />
                <div>
                  <h4 className="font-extrabold text-primary">
                    Xe đã chọn rõ lịch
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Mỗi xe hiển thị đủ thời gian thuê và thành tiền.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
