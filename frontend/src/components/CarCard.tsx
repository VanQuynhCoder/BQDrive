import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock,
  CreditCard,
  Fuel,
  Gauge,
  ShieldCheck,
  Users,
} from "lucide-react";

type RentalAvailability =
  | "AVAILABLE"
  | "HELD_IN_CART"
  | "PENDING_CONFIRMATION";

type CarCardProps = {
  car: {
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
};

const fallbackImage =
  "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1200";

function formatPrice(price: number) {
  return `${new Intl.NumberFormat("vi-VN").format(price || 0)}đ`;
}

function getRentalPrice(car: CarCardProps["car"]) {
  const allowDailyRental =
    typeof car.allowDailyRental === "boolean"
      ? car.allowDailyRental
      : car.rentalUnit !== "HOUR";
  const allowHourlyRental =
    typeof car.allowHourlyRental === "boolean"
      ? car.allowHourlyRental
      : car.rentalUnit === "HOUR";

  if (!allowDailyRental && allowHourlyRental) {
    return {
      price: car.pricePerHour || 0,
      unit: "giờ",
      label: "Thuê theo giờ",
    };
  }

  return {
    price: car.pricePerDay || 0,
    unit: "ngày",
    label: "Thuê theo ngày",
  };
}

function getSpecLabel(value?: string) {
  const labels: Record<string, string> = {
    ELECTRIC: "Điện",
    GASOLINE: "Xăng",
    DIESEL: "Diesel",
    HYBRID: "Hybrid",
    AUTOMATIC: "Tự động",
    MANUAL: "Số sàn",
  };

  return value ? labels[value] || value : "Đang cập nhật";
}

function getPrimaryImage(car: CarCardProps["car"]) {
  const uploadedImage = Array.isArray(car.images)
    ? car.images.find((image) => typeof image === "string" && image.trim())
    : "";

  return uploadedImage || car.image || fallbackImage;
}

function getAvailabilityInfo(car: CarCardProps["car"], now: number) {
  const isHolding =
    Boolean(car.holdingCartId) &&
    Boolean(car.holdExpiredAt) &&
    new Date(car.holdExpiredAt || "").getTime() > now;

  if (isHolding) {
    return {
      icon: Clock,
      label: "Bạn đang giữ xe",
      badgeClass: "bg-sky-50 text-sky-700",
      isBookable: false,
    };
  }

  const canResume =
    Boolean(car.resumeBookingId) &&
    (!car.resumeExpiresAt ||
      new Date(car.resumeExpiresAt || "").getTime() > now);

  if (canResume) {
    return {
      icon: CreditCard,
      label: "Tiếp tục thanh toán",
      badgeClass: "bg-sky-50 text-sky-700",
      isBookable: false,
    };
  }

  const availability = car.rentalAvailability || "AVAILABLE";

  if (availability === "PENDING_CONFIRMATION") {
    return {
      icon: Clock,
      label: car.availabilityLabel || "Đang chờ xác nhận",
      badgeClass: "bg-amber-50 text-amber-700",
      isBookable: false,
    };
  }

  if (availability === "HELD_IN_CART") {
    return {
      icon: Clock,
      label: car.availabilityLabel || "Đang được giữ",
      badgeClass: "bg-sky-50 text-sky-700",
      isBookable: false,
    };
  }

  if (car.isBookable === false) {
    return {
      icon: Clock,
      label: car.availabilityLabel || "Không khả dụng",
      badgeClass: "bg-red-50 text-red-700",
      isBookable: false,
    };
  }

  return {
    icon: ShieldCheck,
    label: car.availabilityLabel || "Sẵn sàng",
    badgeClass: "bg-emerald-50 text-emerald-700",
    isBookable: true,
  };
}

export default function CarCard({ car }: CarCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const rental = getRentalPrice(car);
  const carId = car._id || car.id;
  const image = getPrimaryImage(car);
  const availability = getAvailabilityInfo(car, now);
  const AvailabilityIcon = availability.icon;
  const canOpenCart =
    Boolean(car.holdingCartId) &&
    Boolean(car.holdExpiredAt) &&
    new Date(car.holdExpiredAt || "").getTime() > now;
  const resumeExpiresAt = car.resumeExpiresAt
    ? new Date(car.resumeExpiresAt).getTime()
    : 0;
  const isResumeExpired = resumeExpiresAt > 0 && resumeExpiresAt <= now;
  const canResumePayment =
    !canOpenCart && Boolean(car.resumeBookingId) && !isResumeExpired;
  const canOpenDetail =
    !canOpenCart &&
    !canResumePayment &&
    availability.isBookable &&
    Boolean(carId);
  const canInteract = canOpenCart || canResumePayment || canOpenDetail;

  useEffect(() => {
    if (!car.holdExpiredAt && !car.resumeExpiresAt) return;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [car.holdExpiredAt, car.resumeExpiresAt]);

  return (
    <article
      className={`group overflow-hidden rounded-lg border border-border bg-white shadow-sm transition ${
        canInteract ? "hover:-translate-y-1 hover:shadow-xl" : ""
      }`}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={image}
          alt={car.name}
          onError={(event) => {
            event.currentTarget.src = fallbackImage;
          }}
          className={`h-full w-full object-cover transition duration-500 ${
            canInteract ? "group-hover:scale-105" : "opacity-80 grayscale-[0.15]"
          }`}
        />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-extrabold ${availability.badgeClass}`}
          >
            <AvailabilityIcon size={15} />
            {availability.label}
          </span>

          {car.brandId?.name && (
            <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-primary backdrop-blur">
              {car.brandId.name}
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-xl font-extrabold text-primary">
              {car.name}
            </h3>
            <p className="mt-1 truncate text-sm text-muted">
              {car.businessId?.businessName || "Đối tác BQDrive"}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-lg font-extrabold text-secondary">
              {formatPrice(rental.price)}
            </p>
            <p className="text-sm font-semibold text-muted">/ {rental.unit}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-y border-border py-4 text-sm text-muted">
          <span className="flex items-center gap-2">
            <Users size={17} className="text-secondary" />
            {car.seats} chỗ
          </span>
          <span className="flex items-center gap-2">
            <Fuel size={17} className="text-secondary" />
            {getSpecLabel(car.fuelType)}
          </span>
          <span className="flex items-center gap-2">
            <Gauge size={17} className="text-secondary" />
            {getSpecLabel(car.transmission)}
          </span>
          <span className="font-semibold text-primary">{rental.label}</span>
        </div>

        {canOpenCart ? (
          <Link
            to="/cart"
            className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95"
          >
            <CreditCard size={18} />
            Xem giỏ hàng
          </Link>
        ) : canResumePayment ? (
          <Link
            to={`/bookings/${car.resumeBookingId}/payment`}
            className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95"
          >
            <CreditCard size={18} />
            Tiếp tục thanh toán
          </Link>
        ) : canOpenDetail ? (
          <Link
            to={`/cars/${carId}`}
            className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-extrabold text-white transition hover:bg-primaryDark"
          >
            Xem chi tiết
            <ArrowRight size={18} />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="mt-5 flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border bg-soft px-5 py-3 font-extrabold text-muted"
          >
            Tạm thời không khả dụng
          </button>
        )}
      </div>
    </article>
  );
}
