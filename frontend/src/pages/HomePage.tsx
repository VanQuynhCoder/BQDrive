import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CarFront,
  CheckCircle2,
  Clock,
  Headphones,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import CarCard from "../components/CarCard";
import { authService } from "../services/auth.service";
import { bookingService } from "../services/booking.service";
import { cartService } from "../services/cart.service";
import { carService } from "../services/car.service";
import { buildVietnamDateTime } from "../utils/date.util";

type RentalAvailability =
  | "AVAILABLE"
  | "HELD_IN_CART"
  | "PENDING_CONFIRMATION";

type HomeCar = {
  _id?: string;
  id?: number;
  name: string;
  pricePerDay?: number;
  pricePerHour?: number;
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit?: string;
  seats: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
  image?: string;
  brandId?: {
    name?: string;
  };
  businessId?: {
    businessName?: string;
  };
  rentalAvailability?: RentalAvailability;
  availabilityLabel?: string;
  isBookable?: boolean;
  unavailableReason?: string;
  holdingCartId?: string;
  holdExpiredAt?: string;
  resumeBookingId?: string;
  resumeExpiresAt?: string;
};

type HomeBooking = {
  _id: string;
  carId?: string | { _id?: string };
  status?: string;
  paidAmount?: number;
  createdAt?: string;
};

type HomeCart = {
  _id: string;
  carId?: string | { _id?: string };
  status?: string;
  expiredAt?: string;
};

const heroImage =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1800";

const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME = "18:00";
const BOOKING_HOLD_MINUTES = 10;
const BOOKING_HOLD_MS = BOOKING_HOLD_MINUTES * 60 * 1000;

const serviceHighlights = [
  {
    icon: ShieldCheck,
    title: "Xe được kiểm duyệt",
    text: "Danh sách xe hiển thị sau khi được kiểm tra thông tin và trạng thái.",
  },
  {
    icon: Headphones,
    title: "Hỗ trợ nhanh",
    text: "Luồng đặt xe, xác nhận và theo dõi booking được xử lý rõ ràng.",
  },
  {
    icon: BadgeDollarSign,
    title: "Giá minh bạch",
    text: "Hiển thị đơn giá theo giờ hoặc theo ngày trước khi khách đặt xe.",
  },
];

const rentalSteps = [
  {
    icon: Search,
    title: "Tìm xe",
    text: "Chọn dòng xe phù hợp với lịch trình, ngân sách và số chỗ cần dùng.",
  },
  {
    icon: CalendarCheck2,
    title: "Đặt lịch",
    text: "Chọn thời gian nhận trả xe và gửi yêu cầu giữ lịch trên hệ thống.",
  },
  {
    icon: CheckCircle2,
    title: "Xác nhận",
    text: "Đơn vị cho thuê kiểm tra lịch trống và xác nhận booking.",
  },
  {
    icon: CarFront,
    title: "Nhận xe",
    text: "Kiểm tra xe, hoàn tất thủ tục và bắt đầu hành trình đúng lịch.",
  },
];

export default function HomePage() {
  const location = useLocation();
  const [cars, setCars] = useState<HomeCar[]>([]);
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [pickupTime, setPickupTime] = useState(DEFAULT_START_TIME);
  const [returnTime, setReturnTime] = useState(DEFAULT_END_TIME);
  const [appliedSchedule, setAppliedSchedule] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    async function loadHomeCars() {
      try {
        const homeCars = (await carService.getHomeCars(
          appliedSchedule || undefined,
        )) as HomeCar[];
        let myBookings: HomeBooking[] = [];
        let myCarts: HomeCart[] = [];

        if (authService.isLoggedIn()) {
          try {
            [myBookings, myCarts] = await Promise.all([
              bookingService.getMyBookings() as Promise<HomeBooking[]>,
              cartService.getMyCart() as Promise<HomeCart[]>,
            ]);
          } catch (error) {
            console.log(error);
          }
        }

        const resumableBookingByCarId = new Map<
          string,
          { bookingId: string; expiresAt: string }
        >();
        const activeCartByCarId = new Map<
          string,
          { cartId: string; expiredAt: string }
        >();
        const now = Date.now();

        myCarts.forEach((cart) => {
          if (cart.status && cart.status !== "ACTIVE") return;
          if (!cart.expiredAt || new Date(cart.expiredAt).getTime() <= now) {
            return;
          }

          const carId =
            typeof cart.carId === "string" ? cart.carId : cart.carId?._id;

          if (carId && !activeCartByCarId.has(carId)) {
            activeCartByCarId.set(carId, {
              cartId: cart._id,
              expiredAt: cart.expiredAt,
            });
          }
        });

        myBookings.forEach((booking) => {
          if (!["REQUESTED", "PENDING"].includes(booking.status || "")) return; // REQUESTED là trạng thái mới chờ chủ xe duyệt, PENDING là dữ liệu cũ

          const paidAmount = booking.paidAmount || 0;
          if (paidAmount > 0) return;

          const createdAt = booking.createdAt
            ? new Date(booking.createdAt).getTime()
            : 0;
          if (createdAt > 0 && createdAt + BOOKING_HOLD_MS <= now) return;

          const carId =
            typeof booking.carId === "string"
              ? booking.carId
              : booking.carId?._id;

          if (carId && !resumableBookingByCarId.has(carId)) {
            resumableBookingByCarId.set(carId, {
              bookingId: booking._id,
              expiresAt:
                createdAt > 0
                  ? new Date(createdAt + BOOKING_HOLD_MS).toISOString()
                  : "",
            });
          }
        });

        const carsWithResumeAction = homeCars.map((car) => {
          const carId = car._id || String(car.id || "");
          const activeCart = activeCartByCarId.get(carId);
          const resumeBooking = resumableBookingByCarId.get(carId);

          if (activeCart) {
            return {
              ...car,
              holdingCartId: activeCart.cartId,
              holdExpiredAt: activeCart.expiredAt,
            };
          }

          return resumeBooking
            ? {
                ...car,
                resumeBookingId: resumeBooking.bookingId,
                resumeExpiresAt: resumeBooking.expiresAt,
              }
            : car;
        });

        if (active) setCars(carsWithResumeAction);
      } catch (error) {
        console.log(error);
      }
    }

    loadHomeCars();

    return () => {
      active = false;
    };
  }, [appliedSchedule]);

  useEffect(() => {
    if (!location.hash) return;

    window.setTimeout(() => {
      document
        .getElementById(location.hash.slice(1))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [location.hash]);

  const handleSearchCars = () => {
    if (!pickupDate || !returnDate) {
      setAppliedSchedule(null);
      return;
    }

    setAppliedSchedule({
      startDate: buildVietnamDateTime(pickupDate, pickupTime),
      endDate: buildVietnamDateTime(returnDate, returnTime),
    });
  };

  const availableCarCount = useMemo(
    () =>
      cars.filter(
        (car) =>
          car.isBookable !== false &&
          (car.rentalAvailability || "AVAILABLE") === "AVAILABLE",
      ).length,
    [cars],
  );

  const stats = useMemo(
    () => [
      {
        value: `${availableCarCount}+`,
        label: "xe sẵn sàng",
      },
      {
        value: "Linh hoạt",
        label: "giờ nhận/trả xe",
      },
      {
        value: "10 phút",
        label: "giữ xe trong giỏ hàng",
      },
    ],
    [availableCarCount],
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />

      <main className="pt-20">
        <section className="relative overflow-hidden bg-primary text-white">
          <img
            src={heroImage}
            alt="Dịch vụ thuê xe BQDrive"
            className="absolute inset-0 h-full w-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-black/55" />

          <div className="relative mx-auto grid min-h-[650px] max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_430px]">
            <div className="min-w-0 max-w-3xl">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur">
                  <Sparkles size={17} />
                  Thuê xe linh hoạt cho mọi lịch trình
                </span>

                <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-extrabold text-primary">
                  <ShieldCheck size={17} />
                  Đối tác kiểm duyệt
                </span>
              </div>

              <h1 className="text-5xl font-extrabold leading-tight md:text-7xl">
                BQDrive
              </h1>

              <p className="mt-6 max-w-2xl break-words text-lg leading-8 text-white/80">
                Nền tảng thuê xe kết nối khách hàng với doanh nghiệp và cá
                nhân cho thuê xe uy tín, giúp đặt lịch nhanh, giá rõ ràng và
                theo dõi booking thuận tiện.
              </p>

              <div className="mt-9 grid max-w-2xl gap-3 sm:grid-cols-3">
                {stats.map((item) => (
                  <div
                    key={item.label}
                    className="border-l-2 border-secondary pl-4"
                  >
                    <p className="text-2xl font-extrabold text-secondary">
                      {item.value}
                    </p>
                    <p className="mt-1 text-sm text-white/70">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 max-w-full rounded-lg bg-white p-5 text-primary shadow-2xl shadow-black/25 lg:w-full">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Tìm xe nhanh
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold">
                    Chọn lịch trình
                  </h2>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                  <Search size={24} />
                </div>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Địa điểm</span>
                  <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                    <MapPin size={19} className="shrink-0 text-secondary" />
                    <input
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      placeholder="Bạn muốn đi đâu?"
                    />
                  </span>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">
                      Ngày nhận
                    </span>
                    <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                      <CalendarDays
                        size={19}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        className="w-full min-w-0 flex-1 bg-transparent outline-none"
                        type="date"
                        value={pickupDate}
                        onChange={(event) => setPickupDate(event.target.value)}
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">
                      Giờ nhận
                    </span>
                    <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                      <Clock
                        size={19}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        className="w-full min-w-0 flex-1 bg-transparent outline-none"
                        type="time"
                        value={pickupTime}
                        onChange={(event) => setPickupTime(event.target.value)}
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">
                      Ngày trả
                    </span>
                    <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                      <CalendarDays
                        size={19}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        className="w-full min-w-0 flex-1 bg-transparent outline-none"
                        type="date"
                        value={returnDate}
                        onChange={(event) => setReturnDate(event.target.value)}
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">
                      Giờ trả
                    </span>
                    <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                      <Clock
                        size={19}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        className="w-full min-w-0 flex-1 bg-transparent outline-none"
                        type="time"
                        value={returnTime}
                        onChange={(event) => setReturnTime(event.target.value)}
                      />
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleSearchCars}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary transition hover:brightness-95"
                >
                  <Search size={20} />
                  Tìm xe phù hợp
                </button>

                <div className="grid gap-3 border-t border-border pt-4 text-sm text-muted sm:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <Clock size={17} className="text-secondary" />
                    Giờ nhận/trả linh hoạt
                  </p>
                  <p className="flex items-center gap-2">
                    <Building2 size={17} className="text-secondary" />
                    Đối tác BQDrive
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-white">
          <div className="mx-auto grid max-w-7xl gap-4 px-6 py-8 md:grid-cols-3">
            {serviceHighlights.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                  <Icon size={24} />
                </div>

                <div>
                  <h3 className="font-extrabold text-primary">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id="home-cars"
          className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 md:py-20"
        >
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Đội xe nổi bật
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-primary md:text-4xl">
                Xe đã sẵn sàng cho chuyến đi của bạn
              </h2>
              <p className="mt-3 max-w-2xl leading-7 text-muted">
                Những dòng xe được duyệt trên hệ thống, có thông tin giá và đơn
                vị cho thuê rõ ràng.
              </p>
            </div>

            <Link
              to="/"
              className="inline-flex items-center gap-2 font-extrabold text-primary transition hover:text-secondary"
            >
              Xem tất cả
              <ArrowRight size={18} />
            </Link>
          </div>

          {cars.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {cars.map((car) => (
                <CarCard key={car._id || car.id} car={car} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-white p-10 text-center">
              <CarFront size={44} className="mx-auto text-secondary" />
              <h3 className="mt-4 text-2xl font-extrabold text-primary">
                Đang tải danh sách xe
              </h3>
              <p className="mt-2 text-muted">
                Hệ thống đang lấy các xe mới nhất đã được duyệt.
              </p>
            </div>
          )}
        </section>

        <section className="bg-white py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-8 max-w-3xl">
              <p className="text-sm font-bold uppercase text-secondary">
                Quy trình thuê xe
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-primary md:text-4xl">
                Cách thức thuê xe trên BQDrive chỉ với 4 bước đơn giản
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {rentalSteps.map(({ icon: Icon, title, text }, index) => (
                <div
                  key={title}
                  className="rental-step-card relative min-h-[250px] overflow-hidden rounded-lg border border-border bg-white p-6"
                  style={
                    {
                      "--step-delay": `${index * 1.25}s`,
                    } as CSSProperties
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="rental-step-icon relative flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Icon size={23} />
                    </div>
                    <span className="relative text-base font-extrabold text-secondary">
                      0{index + 1}
                    </span>
                  </div>

                  <h3 className="mt-6 text-xl font-extrabold text-primary">
                    {title}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-8 rounded-lg bg-primary p-6 text-white md:grid-cols-[minmax(0,1fr)_360px] md:p-10">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Dành cho đối tác
              </p>
              <h2 className="mt-2 text-3xl font-extrabold">
                Quản lý xe cho thuê trên cùng một hệ thống
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-white/70">
                BQDrive hỗ trợ doanh nghiệp và cá nhân đăng xe, nhận booking và
                theo dõi trạng thái thuê xe theo từng lịch trình.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              {["Đăng xe chờ duyệt", "Nhận booking", "Theo dõi thanh toán"].map(
                (item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2
                      size={20}
                      className="shrink-0 text-secondary"
                    />
                    <span className="font-bold">{item}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
