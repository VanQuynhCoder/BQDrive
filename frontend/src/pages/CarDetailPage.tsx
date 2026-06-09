import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  CarFront,
  CheckCircle2,
  ChevronRight,
  Clock,
  Fuel,
  Gauge,
  Headphones,
  KeyRound,
  MapPin,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { carService } from "../services/car.service";
import { cartService } from "../services/cart.service";
import { bookingService } from "../services/booking.service";
import { authService } from "../services/auth.service";

type RentalAvailability =
  | "AVAILABLE"
  | "HELD_IN_CART"
  | "PENDING_CONFIRMATION";

type CarDetail = {
  _id?: string;
  name: string;
  description?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit?: string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
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
};

type RentalMode = "DAILY" | "HOURLY";

type ApiError = {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
};

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1549924231-f129b911e442?q=80&w=1400",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1400",
  "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?q=80&w=1400",
  "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=1400",
  "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=1400",
];

const RENTAL_START_TIME = "08:00";
const RENTAL_END_TIME = "18:00";
const HOUR_MS = 1000 * 60 * 60;

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN").format(price || 0) + "đ";
}

function buildDateTime(date: string, time: string) {
  return `${date}T${time}:00`;
}

function getRentalValidationMessage(
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string,
) {
  if (!startDate || !endDate) {
    return "Vui lòng chọn ngày nhận và ngày trả xe";
  }

  if (!startTime || !endTime) {
    return "Vui lòng chọn giờ nhận và giờ trả xe";
  }

  const start = new Date(buildDateTime(startDate, startTime));
  const end = new Date(buildDateTime(endDate, endTime));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Thời gian thuê xe không hợp lệ";
  }

  if (start <= new Date()) {
    return "Thời gian nhận xe phải lớn hơn thời gian hiện tại";
  }

  if (start >= end) {
    return "Thời gian nhận xe phải nhỏ hơn thời gian trả xe";
  }

  return "";
}

function getRentalModes(car?: CarDetail | null) {
  const allowDailyRental =
    typeof car?.allowDailyRental === "boolean"
      ? car.allowDailyRental
      : car?.rentalUnit !== "HOUR";
  const allowHourlyRental =
    typeof car?.allowHourlyRental === "boolean"
      ? car.allowHourlyRental
      : car?.rentalUnit === "HOUR";

  return { allowDailyRental, allowHourlyRental };
}

function getRentalInfo(car: CarDetail | null | undefined, rentalMode: RentalMode) {
  if (rentalMode === "HOURLY") {
    return {
      price: Number(car?.pricePerHour || 0),
      unit: "giờ",
      label: "Số giờ thuê",
      priceLabel: "Giá thuê theo giờ",
      modeLabel: "Thuê theo giờ",
    };
  }

  return {
    price: Number(car?.pricePerDay || 0),
    unit: "ngày",
    label: "Số ngày thuê",
    priceLabel: "Giá thuê theo ngày",
    modeLabel: "Thuê theo ngày",
  };
}

function calculateRentalTime(rentalMode: RentalMode, start: Date, end: Date) {
  const diffMs = end.getTime() - start.getTime();

  if (diffMs <= 0) return 0;

  if (rentalMode === "HOURLY") {
    return Math.ceil(diffMs / HOUR_MS);
  }

  return Math.max(1, Math.ceil(diffMs / HOUR_MS / 24));
}

function getCarImages(car?: CarDetail) {
  const images = Array.isArray(car?.images)
    ? car.images.filter(
        (image: unknown): image is string =>
          typeof image === "string" && image.trim().length > 0,
      )
    : [];

  return images.length > 0 ? images : FALLBACK_IMAGES;
}

function getErrorMessage(error: unknown) {
  const apiError = error as ApiError;

  if (typeof apiError.response?.data?.message === "string") {
    return apiError.response.data.message;
  }

  return "Có lỗi xảy ra";
}

function isAuthenticationError(error: unknown) {
  const apiError = error as ApiError;
  const message = apiError.response?.data?.message;

  return (
    apiError.response?.status === 401 ||
    message === "Token không hợp lệ" ||
    message === "Vui lòng đăng nhập"
  );
}

function getAvailabilityInfo(car?: CarDetail | null) {
  const availability = car?.rentalAvailability || "AVAILABLE";

  if (availability === "PENDING_CONFIRMATION") {
    return {
      label: car?.availabilityLabel || "Đang chờ xác nhận",
      badgeClass: "bg-amber-50 text-amber-700",
      isBookable: false,
      message:
        "Xe này đang có booking chờ chủ xe xác nhận, vui lòng chọn xe khác.",
    };
  }

  if (availability === "HELD_IN_CART") {
    return {
      label: car?.availabilityLabel || "Đang được giữ",
      badgeClass: "bg-sky-50 text-sky-700",
      isBookable: false,
      message: "Xe này đang được giữ trong giỏ hàng của người khác.",
    };
  }

  return {
    label: car?.availabilityLabel || "Sẵn sàng",
    badgeClass:
      car?.isBookable === false
        ? "bg-red-50 text-red-700"
        : "bg-emerald-50 text-emerald-700",
    isBookable: car?.isBookable !== false,
    message: car?.unavailableReason || "",
  };
}

export default function CarDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [car, setCar] = useState<CarDetail | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [rentalMode, setRentalMode] = useState<RentalMode>("DAILY");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [startTime, setStartTime] = useState(RENTAL_START_TIME);
  const [endTime, setEndTime] = useState(RENTAL_END_TIME);
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);
  const [isCartSubmitting, setIsCartSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;

    carService
      .getOneCar(id)
      .then((nextCar) => {
        setCar(nextCar);
        const modes = getRentalModes(nextCar);
        setRentalMode(
          modes.allowDailyRental || !modes.allowHourlyRental
            ? "DAILY"
            : "HOURLY",
        );
      })
      .catch(console.log);
  }, [id]);

  const galleryImages = useMemo(() => getCarImages(car || undefined), [car]);

  useEffect(() => {
    if (!id || !startDate || !endDate || !startTime || !endTime) return;

    const start = new Date(buildDateTime(startDate, startTime));
    const end = new Date(buildDateTime(endDate, endTime));

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return;
    }

    let active = true;

    carService
      .getOneCar(id, {
        startDate: buildDateTime(startDate, startTime),
        endDate: buildDateTime(endDate, endTime),
        rentalMode,
      })
      .then((nextCar) => {
        if (active) setCar(nextCar);
      })
      .catch(console.log);

    return () => {
      active = false;
    };
  }, [id, startDate, endDate, startTime, endTime, rentalMode]);

  const openImageViewer = (index: number) => {
    setActiveImageIndex(index);
  };

  const closeImageViewer = useCallback(() => {
    setActiveImageIndex(null);
  }, []);

  const showPreviousImage = useCallback(() => {
    setActiveImageIndex((current) => {
      if (current === null) return current;
      return current === 0 ? galleryImages.length - 1 : current - 1;
    });
  }, [galleryImages.length]);

  const showNextImage = useCallback(() => {
    setActiveImageIndex((current) => {
      if (current === null) return current;
      return current === galleryImages.length - 1 ? 0 : current + 1;
    });
  }, [galleryImages.length]);

  useEffect(() => {
    if (activeImageIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImageViewer();
      if (event.key === "ArrowLeft") showPreviousImage();
      if (event.key === "ArrowRight") showNextImage();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeImageIndex, closeImageViewer, showNextImage, showPreviousImage]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const supportedRentalModes = getRentalModes(car);
  const rentalInfo = car
    ? getRentalInfo(car, rentalMode)
    : {
        price: 0,
        unit: "ngày",
        label: "Số ngày thuê",
        priceLabel: "Giá thuê theo ngày",
        modeLabel: "Thuê theo ngày",
      };

  const availabilityInfo = getAvailabilityInfo(car);

  const rentalTime = useMemo(() => {
    if (!car || !startDate || !endDate || !startTime || !endTime) return 0;

    const start = new Date(buildDateTime(startDate, startTime));
    const end = new Date(buildDateTime(endDate, endTime));

    return calculateRentalTime(rentalMode, start, end);
  }, [car, rentalMode, startDate, endDate, startTime, endTime]);

  const totalPrice = rentalTime * rentalInfo.price;

  const rentalValidationMessage = useMemo(
    () => getRentalValidationMessage(startDate, endDate, startTime, endTime),
    [startDate, endDate, startTime, endTime],
  );
  const rentalModeValidationMessage = useMemo(() => {
    if (rentalMode === "DAILY" && !supportedRentalModes.allowDailyRental) {
      return "Xe khong ho tro thue theo ngay";
    }

    if (rentalMode === "HOURLY" && !supportedRentalModes.allowHourlyRental) {
      return "Xe khong ho tro thue theo gio";
    }

    if (rentalMode === "HOURLY" && rentalTime > 0 && (rentalTime < 2 || rentalTime > 24)) {
      return "Thue theo gio chi ho tro tu 2 den 24 gio";
    }

    return "";
  }, [rentalMode, rentalTime, supportedRentalModes.allowDailyRental, supportedRentalModes.allowHourlyRental]);

  const shouldShowRentalValidation =
    Boolean(startDate || endDate) && Boolean(rentalValidationMessage);

  const canSubmitRental =
    Boolean(car) &&
    availabilityInfo.isBookable &&
    rentalTime > 0 &&
    !rentalValidationMessage &&
    !rentalModeValidationMessage;

  const validateBeforeSubmit = () => {
    if (!availabilityInfo.isBookable) {
      toast.error(availabilityInfo.message || "Xe hiện không thể đặt");
      return false;
    }

    if (rentalValidationMessage) {
      toast.error(rentalValidationMessage);
      return false;
    }

    if (rentalModeValidationMessage) {
      toast.error(rentalModeValidationMessage);
      return false;
    }

    return true;
  };

  const redirectToLogin = () => {
    authService.logout();
    toast.error("Vui lòng đăng nhập");
    navigate("/login");
  };

  const validateAuthentication = () => {
    if (authService.isLoggedIn()) {
      return true;
    }

    redirectToLogin();
    return false;
  };

  const handleAddToCart = async () => {
    if (isCartSubmitting) return;

    try {
      if (!id || !car || !validateBeforeSubmit() || !validateAuthentication()) return;

      setIsCartSubmitting(true);
      await cartService.addToCart({
        carId: id,
        startDate: buildDateTime(startDate, startTime),
        endDate: buildDateTime(endDate, endTime),
        rentalMode,
      });

      toast.success("Đã thêm vào giỏ hàng");
      navigate("/cart");
    } catch (error: unknown) {
      if (isAuthenticationError(error)) {
        redirectToLogin();
        return;
      }

      toast.error(getErrorMessage(error));
    } finally {
      setIsCartSubmitting(false);
    }
  };

  const handleBooking = async () => {
    if (isBookingSubmitting) return;

    try {
      if (!id || !car || !validateBeforeSubmit() || !validateAuthentication()) return;

      setIsBookingSubmitting(true);
      const booking = await bookingService.createBooking({
        carId: id,
        startDate: buildDateTime(startDate, startTime),
        endDate: buildDateTime(endDate, endTime),
        rentalMode,
      });

      toast.success("Đặt xe thành công");
      navigate(`/bookings/${booking._id}`);
    } catch (error: unknown) {
      if (isAuthenticationError(error)) {
        redirectToLogin();
        return;
      }

      toast.error(getErrorMessage(error));
    } finally {
      setIsBookingSubmitting(false);
    }
  };

  if (!car) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-background">
        <Header />

        <main className="mx-auto max-w-7xl px-6 pb-20 pt-32">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
            <div className="space-y-6">
              <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200" />
              <div className="h-[420px] animate-pulse rounded-lg bg-slate-200" />
              <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-28 animate-pulse rounded-lg bg-slate-200"
                  />
                ))}
              </div>
            </div>

            <div className="h-[520px] animate-pulse rounded-lg bg-slate-200" />
          </div>
        </main>
      </div>
    );
  }

  const brandName = car.brandId?.name || "BQDrive Select";
  const businessName = car.businessId?.businessName || "Đối tác BQDrive";
  const description =
    car.description ||
    "Dòng xe được kiểm duyệt trên hệ thống BQDrive, phù hợp cho lịch trình cá nhân, công tác và di chuyển gia đình.";
  const fuelType = car.fuelType || "Xăng";
  const transmission = car.transmission || "Tự động";

  const previewImages = galleryImages.slice(1, 5);
  const hiddenImageCount = Math.max(galleryImages.length - 5, 0);
  const activeImage =
    activeImageIndex !== null ? galleryImages[activeImageIndex] : undefined;

  const vehicleSpecs = [
    {
      icon: Users,
      label: "Số chỗ",
      value: `${car.seats || 4} chỗ`,
    },
    {
      icon: Fuel,
      label: "Nhiên liệu",
      value: fuelType,
    },
    {
      icon: Gauge,
      label: "Hộp số",
      value: transmission,
    },
    {
      icon: Clock,
      label: "Hình thức",
      value: rentalInfo.modeLabel,
    },
  ];

  const serviceBenefits = [
    "Xe đã được kiểm duyệt trước khi hiển thị",
    "Bảng giá minh bạch theo thời gian thuê",
    "Hỗ trợ xác nhận và xử lý booking nhanh",
    "Thông tin đơn vị cho thuê rõ ràng",
  ];

  const rentalSteps = [
    {
      icon: CalendarCheck2,
      title: "Chọn lịch",
      text: "Chốt ngày giờ nhận và trả xe theo nhu cầu di chuyển.",
    },
    {
      icon: KeyRound,
      title: "Xác nhận",
      text: "BQDrive gửi yêu cầu đến đơn vị cho thuê để giữ lịch.",
    },
    {
      icon: CarFront,
      title: "Nhận xe",
      text: "Kiểm tra xe, giấy tờ và bắt đầu hành trình đúng lịch.",
    },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link to="/" className="transition hover:text-primary">
              Trang chủ
            </Link>
            <ChevronRight size={16} />
            <span>{brandName}</span>
            <ChevronRight size={16} />
            <span className="font-bold text-primary">{car.name}</span>
          </nav>

          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-primary transition hover:text-secondary"
          >
            <ArrowLeft size={17} />
            Quay lại danh sách xe
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-10">
            <section>
              <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
                <div>
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold ${availabilityInfo.badgeClass}`}
                    >
                      <BadgeCheck size={17} />
                      {availabilityInfo.label}
                    </span>

                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
                      <Sparkles size={17} />
                      {brandName}
                    </span>
                  </div>

                  <h1 className="max-w-4xl text-4xl font-extrabold leading-tight text-primary md:text-5xl">
                    {car.name}
                  </h1>
                </div>

                <div className="grid gap-3 text-center sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-white p-4">
                    <ShieldCheck className="mx-auto text-secondary" size={22} />
                    <p className="mt-2 text-xs font-semibold text-muted">
                      Kiểm duyệt
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-white p-4">
                    <Headphones className="mx-auto text-secondary" size={22} />
                    <p className="mt-2 text-xs font-semibold text-muted">
                      Hỗ trợ
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-white p-4">
                    <Wallet className="mx-auto text-secondary" size={22} />
                    <p className="mt-2 text-xs font-semibold text-muted">
                      Minh bạch
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-5 md:grid-rows-2">
                <button
                  type="button"
                  onClick={() => openImageViewer(0)}
                  className={`group relative h-80 overflow-hidden rounded-lg text-left outline-none ring-0 transition focus:ring-4 focus:ring-secondary/25 ${
                    previewImages.length > 0
                      ? "md:col-span-3 md:row-span-2 md:h-[520px]"
                      : "md:col-span-5 md:row-span-2 md:h-[520px]"
                  }`}
                >
                  <img
                    src={galleryImages[0]}
                    alt={car.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-5 text-white">
                    <p className="text-sm font-semibold text-white/80">
                      Từ {formatPrice(rentalInfo.price)} / {rentalInfo.unit}
                    </p>
                    <p className="mt-1 text-2xl font-extrabold">{car.name}</p>
                  </div>
                </button>

                {previewImages.map((image, index) => {
                  const originalIndex = index + 1;
                  const showMoreOverlay =
                    index === previewImages.length - 1 && hiddenImageCount > 0;

                  return (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => openImageViewer(originalIndex)}
                    className="group relative h-36 overflow-hidden rounded-lg outline-none transition focus:ring-4 focus:ring-secondary/25 md:h-full"
                  >
                    <img
                      src={image}
                      alt={`${car.name} ${originalIndex + 1}`}
                      className="h-full w-full object-cover transition duration-300 hover:scale-105"
                    />
                    {showMoreOverlay && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-2xl font-extrabold text-white">
                        +{hiddenImageCount}
                      </div>
                    )}
                  </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Thông tin xe
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold text-primary">
                    Thông số phục vụ chuyến đi
                  </h2>
                </div>

                <p className="max-w-xl text-sm leading-6 text-muted">
                  Các thông tin cơ bản giúp bạn chọn đúng dòng xe cho lịch trình
                  và ngân sách.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                {vehicleSpecs.map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border bg-white p-5"
                  >
                    <Icon className="text-secondary" size={24} />
                    <p className="mt-4 text-sm text-muted">{label}</p>
                    <p className="mt-1 text-lg font-extrabold text-primary">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-white p-6">
              <p className="text-sm font-bold uppercase text-secondary">
                Mô tả
              </p>
              <h2 className="mt-1 text-2xl font-extrabold text-primary">
                Thông tin chi tiết về xe
              </h2>
              <p className="mt-4 whitespace-pre-line text-base leading-8 text-muted">
                {description}
              </p>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <p className="text-sm font-bold uppercase text-secondary">
                  Dịch vụ đi kèm
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-primary">
                  Trải nghiệm thuê xe rõ ràng, dễ kiểm soát
                </h2>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {serviceBenefits.map((benefit) => (
                    <div
                      key={benefit}
                      className="flex items-start gap-3 rounded-lg border border-border bg-white p-4"
                    >
                      <CheckCircle2
                        className="mt-0.5 shrink-0 text-emerald-600"
                        size={20}
                      />
                      <p className="text-sm font-semibold leading-6 text-primary">
                        {benefit}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-primary p-6 text-white">
                <Building2 className="text-secondary" size={32} />
                <p className="mt-5 text-sm text-white/65">Đơn vị cho thuê</p>
                <h3 className="mt-1 text-2xl font-extrabold">
                  {businessName}
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  Đối tác đã được BQDrive kiểm duyệt trước khi nhận đặt xe từ
                  khách hàng.
                </p>
              </div>
            </section>

            <section>
              <div className="mb-5">
                <p className="text-sm font-bold uppercase text-secondary">
                  Quy trình
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-primary">
                  Ba bước để hoàn tất thuê xe
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {rentalSteps.map(({ icon: Icon, title, text }, index) => (
                  <div
                    key={title}
                    className="rounded-lg border border-border bg-white p-5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-primary">
                        <Icon size={22} />
                      </div>

                      <span className="text-sm font-extrabold text-muted">
                        0{index + 1}
                      </span>
                    </div>

                    <h3 className="mt-5 text-lg font-extrabold text-primary">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-lg border border-border bg-white p-6 shadow-xl shadow-slate-900/10">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-sm font-semibold text-muted">
                    Giá thuê từ
                  </p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-3xl font-extrabold text-primary">
                      {formatPrice(rentalInfo.price)}
                    </span>
                    <span className="pb-1 text-sm font-semibold text-muted">
                      / {rentalInfo.unit}
                    </span>
                  </div>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-sm font-bold ${availabilityInfo.badgeClass}`}
                >
                  {availabilityInfo.label}
                </span>
              </div>

              <div className="mt-6 space-y-4 border-y border-border py-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {supportedRentalModes.allowDailyRental && (
                    <button
                      type="button"
                      onClick={() => setRentalMode("DAILY")}
                      className={`min-h-12 rounded-lg border px-4 text-sm font-extrabold transition ${
                        rentalMode === "DAILY"
                          ? "border-secondary bg-secondary text-primary"
                          : "border-border bg-white text-primary hover:bg-soft"
                      }`}
                    >
                      Thuê theo ngày
                    </button>
                  )}

                  {supportedRentalModes.allowHourlyRental && (
                    <button
                      type="button"
                      onClick={() => setRentalMode("HOURLY")}
                      className={`min-h-12 rounded-lg border px-4 text-sm font-extrabold transition ${
                        rentalMode === "HOURLY"
                          ? "border-secondary bg-secondary text-primary"
                          : "border-border bg-white text-primary hover:bg-soft"
                      }`}
                    >
                      Thuê theo giờ
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-primary">
                      Ngày nhận
                    </span>
                    <span className="flex min-h-12 items-center gap-2 rounded-lg border border-border px-3 transition focus-within:border-secondary">
                      <CalendarDays
                        size={18}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        type="date"
                        min={today}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-primary">
                      Giờ nhận
                    </span>
                    <span className="flex min-h-12 items-center gap-2 rounded-lg border border-border px-3 transition focus-within:border-secondary">
                      <Clock size={18} className="shrink-0 text-secondary" />
                      <input
                        type="time"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                    </span>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-primary">
                      Ngày trả
                    </span>
                    <span className="flex min-h-12 items-center gap-2 rounded-lg border border-border px-3 transition focus-within:border-secondary">
                      <CalendarDays
                        size={18}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        type="date"
                        min={startDate || today}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-primary">
                      Giờ trả
                    </span>
                    <span className="flex min-h-12 items-center gap-2 rounded-lg border border-border px-3 transition focus-within:border-secondary">
                      <Clock size={18} className="shrink-0 text-secondary" />
                      <input
                        type="time"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                      />
                    </span>
                  </label>
                </div>

                <p className="flex items-start gap-2 text-sm leading-6 text-muted">
                  <Clock size={17} className="mt-0.5 shrink-0 text-secondary" />
                  Thời gian nhận/trả xe linh hoạt theo lịch bạn chọn.
                </p>

                {!availabilityInfo.isBookable && (
                  <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-700">
                    <Clock size={17} className="mt-0.5 shrink-0" />
                    {availabilityInfo.message}
                  </p>
                )}

                {shouldShowRentalValidation && (
                  <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-600">
                    <X size={17} className="mt-0.5 shrink-0" />
                    {rentalValidationMessage}
                  </p>
                )}

                {rentalModeValidationMessage && (
                  <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-600">
                    <X size={17} className="mt-0.5 shrink-0" />
                    {rentalModeValidationMessage}
                  </p>
                )}
              </div>

              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">{rentalInfo.label}</dt>
                  <dd className="font-bold text-primary">
                    {rentalTime} {rentalInfo.unit}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">{rentalInfo.priceLabel}</dt>
                  <dd className="font-bold text-primary">
                    {formatPrice(rentalInfo.price)}
                  </dd>
                </div>

                <div className="flex items-end justify-between gap-4 border-t border-border pt-4">
                  <dt>
                    <span className="block text-base font-extrabold text-primary">
                      Tổng tiền
                    </span>
                    <span className="text-xs text-muted">
                      Chưa bao gồm phí phát sinh nếu có
                    </span>
                  </dt>
                  <dd className="text-2xl font-extrabold text-secondary">
                    {formatPrice(totalPrice)}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 space-y-3">
                <button
                  onClick={handleBooking}
                  disabled={!canSubmitRental || isBookingSubmitting}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Wallet size={20} />
                  {isBookingSubmitting ? "Đang đặt xe..." : "Đặt xe ngay"}
                </button>

                <button
                  onClick={handleAddToCart}
                  disabled={!canSubmitRental || isCartSubmitting}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-5 py-3 font-extrabold text-primary transition hover:bg-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ShoppingCart size={20} />
                  {isCartSubmitting ? "Đang thêm..." : "Thêm vào giỏ hàng"}
                </button>
              </div>

              <div className="mt-6 space-y-3 border-t border-border pt-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    className="mt-0.5 shrink-0 text-secondary"
                    size={20}
                  />
                  <div>
                    <p className="font-bold text-primary">Thanh toán bảo mật</p>
                    <p className="text-sm text-muted">
                      Booking được lưu và xử lý trong hệ thống BQDrive.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 shrink-0 text-secondary" size={20} />
                  <div>
                    <p className="font-bold text-primary">Nhận xe theo lịch</p>
                    <p className="text-sm text-muted">
                      Đơn vị cho thuê sẽ xác nhận thông tin trước khi bàn giao.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {activeImage && activeImageIndex !== null && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 px-4 py-6 backdrop-blur-sm">
          <button
            type="button"
            onClick={closeImageViewer}
            className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Đóng ảnh"
            title="Đóng ảnh"
          >
            <X size={22} />
          </button>

          <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col">
            <div className="mb-4 flex items-center justify-between gap-4 text-white">
              <p className="text-sm font-bold uppercase text-secondary">
                {car.name}
              </p>
              <p className="text-sm font-extrabold">
                {activeImageIndex + 1} / {galleryImages.length}
              </p>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
              {galleryImages.length > 1 && (
                <button
                  type="button"
                  onClick={showPreviousImage}
                  className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                  aria-label="Ảnh trước"
                  title="Ảnh trước"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              <img
                src={activeImage}
                alt={`${car.name} ${activeImageIndex + 1}`}
                className="max-h-[72vh] w-auto max-w-full object-contain"
              />

              {galleryImages.length > 1 && (
                <button
                  type="button"
                  onClick={showNextImage}
                  className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                  aria-label="Ảnh tiếp theo"
                  title="Ảnh tiếp theo"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>

            {galleryImages.length > 1 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {galleryImages.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => setActiveImageIndex(index)}
                    className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      index === activeImageIndex
                        ? "border-secondary"
                        : "border-white/20 opacity-70 hover:opacity-100"
                    }`}
                    aria-label={`Xem ảnh ${index + 1}`}
                  >
                    <img
                      src={image}
                      alt={`${car.name} thumbnail ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
