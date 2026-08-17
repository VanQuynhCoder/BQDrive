import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
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
  Milestone,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  ThumbsUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import Header from "../components/Header";
import Footer from "../components/Footer";
import RouteMap from "../components/maps/RouteMap";
import RelatedCars from "../components/cars/RelatedCars";
import CarPricingOverview from "../components/pricing/CarPricingOverview";
import {
  carService,
  type CarMileagePolicy,
  type CalendarUnavailableRange,
} from "../services/car.service";
import { cartService } from "../services/cart.service";
import {
  bookingService,
  type BookingPriceQuote,
} from "../services/booking.service";
import { holidayService, type PublicHoliday } from "../services/holiday.service";
import { authService } from "../services/auth.service";
import {
  reviewService,
  type CarReviewSummary,
  type ReviewCriteria,
} from "../services/review.service";
import {
  buildVietnamDateTime,
  getVietnamTodayDate,
} from "../utils/date.util";
import { formatAddressArea, formatPickupAddress } from "../utils/address.util";
import { normalizeImageUrl } from "../utils/image.util";
import type { CarPricing } from "../types/pricing";
import { hasPricingNumber } from "../utils/pricing.util";

type RentalAvailability =
  | "AVAILABLE"
  | "HELD_IN_CART"
  | "PENDING_CONFIRMATION"
  | "CLEANING";

function ReviewAvatar({
  name,
  avatar,
}: {
  name: string;
  avatar?: string;
}) {
  const imageUrl = normalizeImageUrl(avatar);
  const initial = name.trim().charAt(0).toUpperCase() || "K";

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-secondary/30 bg-secondarySoft text-base font-extrabold text-primary">
      {initial}
    </div>
  );
}

function OwnerIdentityImage({
  name,
  image,
}: {
  name: string;
  image?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = normalizeImageUrl(image);
  const initial = name.trim().charAt(0).toUpperCase() || "B";

  if (imageUrl && !imageFailed) {
    return (
      <img
        src={imageUrl}
        alt={`Ảnh đại diện ${name}`}
        onError={() => setImageFailed(true)}
        className="h-16 w-16 shrink-0 rounded-full border-2 border-white/20 bg-white object-cover shadow-sm"
      />
    );
  }

  return (
    <div
   className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-xl font-extrabold text-secondary"
      aria-label={`Ảnh đại diện ${name}`}
    >
      {initial}
    </div>
  );
}

const reviewCriteriaLabels: Array<{ key: keyof ReviewCriteria; label: string }> = [
  { key: "vehicleQuality", label: "Chất lượng xe cao" },
  { key: "cleanliness", label: "Xe sạch sẽ" },
  { key: "descriptionAccuracy", label: "Đúng như mô tả" },
  { key: "handoverService", label: "Nhận/trả xe nhanh gọn" },
  { key: "ownerAttitude", label: "Chủ xe hỗ trợ tốt" },
  { key: "punctuality", label: "Giao xe đúng giờ" },
];

type CarDetail = {
  _id: string;
  carCode?: string | null;
  name: string;
  licensePlate?: string;
  description: string;
  pricing?: CarPricing;
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit?: string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  currentOdometerKm?: number | null;
  mileagePolicy?: CarMileagePolicy | null;
  images?: string[];
  pickupAddress: string;
  pickupFormattedAddress?: string;
  pickupPlaceId?: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupProvince?: string;
  pickupDistrict?: string;
  pickupWard?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  deliveryEnabled?: boolean;
  deliveryBaseFee?: number;
  deliveryFeePerKm?: number;
  deliveryMaxDistanceKm?: number;
  deliveryNote?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
  brandId?: {
    _id?: string;
    name?: string;
  } | null;

  ownerId?: {
  name?: string;
  avatar?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
} | null;
  status?: string;
  rentalAvailability?: RentalAvailability;
  availabilityLabel?: string;
  isBookable?: boolean;
  unavailableReason?: string;
  cleaningUntil?: string;
  requiresScheduleCheck?: boolean;
  unavailableRanges?: UnavailableRange[];
  currentUserActiveBooking?: CurrentUserActiveBooking | null;
};

type UnavailableRange = CalendarUnavailableRange;

type CurrentUserActiveBooking = {
  _id: string;
  status: string;
  startDate?: string;
  endDate?: string;
  rentalMode?: RentalMode;
  totalPrice?: number;
  paidAmount: number;
  upfrontPaymentAmount: number;
  remainingAmount: number;
  paymentOption: string;
};

type RentalMode = "DAILY" | "HOURLY";

function hasNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function formatKilometers(value: number | null | undefined) {
  return hasNumber(value)
    ? `${new Intl.NumberFormat("vi-VN").format(value)} km`
    : "Chưa cập nhật";
}

function formatMileageRate(value: number | null | undefined) {
  return hasNumber(value)
    ? `${new Intl.NumberFormat("vi-VN").format(value)} đồng/km`
    : "Chưa thiết lập";
}

type HolidayDateInfo = {
  name: string;
  note?: string;
  type: string;
};

type WheelOption = {
  label: string;
  value: string | number;
  disabled: boolean;
};

type ApiError = {
  response?: {
    status: number;
    data?: {
      message?: string;
      data?: string;
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
const TIME_OPTIONS = buildTimeOptions("08:00", "22:00", 30); // Dropdown giờ mỗi 30 phút, từ 08:00 đến 22:00.
const HOURLY_RENTAL_MIN_HOURS = 4;
const HOURLY_RENTAL_MAX_HOURS = 24;
const HOURLY_DURATION_OPTIONS = Array.from(
  { length: HOURLY_RENTAL_MAX_HOURS - HOURLY_RENTAL_MIN_HOURS + 1 },
  (_, index) => HOURLY_RENTAL_MIN_HOURS + index,
);
const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]; // Header lịch bắt đầu từ thứ hai.
const DETAILED_PICKUP_STATUSES = [
  "OWNER_APPROVED",
  "PAYMENT_PENDING",
  "PAID",
  "IN_PROGRESS",
  "COMPLETED",
];

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN").format(price || 0) + "đ";
}

function buildTimeOptions(startTime: string, endTime: string, stepMinutes: number) {
  const options: string[] = [];
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;

  for (let value = startTotal; value <= endTotal; value += stepMinutes) {
    const hour = Math.floor(value / 60);
    const minute = value % 60;
    options.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }

  return options;
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes: number) {
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getHourlyRentalEnd(
  startDate: string,
  startTime: string,
  durationHours: number,
) {
  const parsedStartDate = parseDateValue(startDate);
  if (!parsedStartDate || !startTime || durationHours <= 0) return null;

  const totalMinutes = timeToMinutes(startTime) + durationHours * 60;
  const dayOffset = Math.floor(totalMinutes / 1440);
  const endDate = addDays(parsedStartDate, dayOffset);

  return {
    date: formatDateValue(endDate),
    time: minutesToTime(totalMinutes),
  };
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTimeValue(date: Date) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

function getBookingDateTimeParts(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    date: formatDateValue(date),
    time: formatTimeValue(date),
  };
}

function parseDateValue(value: string) {
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function getMonthEnd(monthDate: Date) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
}

function getMonthDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0,
  ).getDate();
  const mondayStartOffset = (firstDay.getDay() + 6) % 7;
  const cells: Array<Date | null> = Array.from({ length: mondayStartOffset }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function formatCalendarMonth(monthDate: Date) {
  return `Tháng ${monthDate.getMonth() + 1}/${monthDate.getFullYear()}`;
}

function formatRentalDate(value: string) {
  const date = parseDateValue(value);

  if (!date) return "--";

  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatRentalPickerSummary(
  rentalMode: RentalMode,
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string,
  rentalTime: number,
) {
  if (!startDate || !endDate) {
    return "Chưa chọn lịch thuê";
  }

  const unit = rentalMode === "HOURLY" ? "giờ" : "ngày";

  return `${startTime}, ${formatRentalDate(startDate)} - ${endTime}, ${formatRentalDate(
    endDate,
  )} | Thời gian thuê: ${rentalTime || 0} ${unit}`;
}

function isSameDateValue(left: string, right: string) {
  return Boolean(left && right && left === right);
}

function getHolidayDisplayText(holiday?: HolidayDateInfo) {
  if (!holiday) return "";

  return `Ngày lễ: ${holiday.name}${holiday.note ? ` - ${holiday.note}` : ""}`;
}

function getApiDateValue(value?: string) {
  if (!value) return "";

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return formatDateValue(date);
  }

  return parseDateValue(value) ? value : "";
}

function expandHolidayDateMap(holidays: PublicHoliday[]) {
  const map: Record<string, HolidayDateInfo> = {};

  holidays.forEach((holiday) => {
    const startValue = getApiDateValue(holiday.startDate || holiday.date);
    const endValue = getApiDateValue(holiday.endDate || holiday.startDate || holiday.date);
    const start = parseDateValue(startValue);
    const end = parseDateValue(endValue);

    if (!start || !end) return;

    for (
      let cursor = start;
      cursor.getTime() <= end.getTime();
      cursor = addDays(cursor, 1)
    ) {
      map[formatDateValue(cursor)] = {
        name: holiday.name,
        note: holiday.note,
        type: holiday.type || "HOLIDAY",
      };
    }
  });

  return map;
}

function getCurrentMinuteOfDay() {
  const now = new Date();

  return now.getHours() * 60 + now.getMinutes();
}

function TimeWheelPicker({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: WheelOption[];
  value: string | number;
  onChange: (value: string | number) => void;
}) {
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedOptionRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [value]);

  return (
    <section className="min-w-0">
      <h4 className="mb-3 text-center text-xl font-extrabold text-primary">
        {title}
      </h4>
      <div className="relative overflow-hidden rounded-lg bg-white">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-14 -translate-y-1/2 rounded-lg bg-secondarySoft/45" />
        <div className="relative z-10 max-h-44 snap-y snap-mandatory overflow-y-auto px-2 py-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={String(option.value)}
                ref={isSelected ? selectedOptionRef : undefined}
                type="button"
                disabled={option.disabled}
                onClick={() => onChange(option.value)}
                className={`relative flex min-h-12 w-full snap-center items-center justify-center rounded-lg text-lg font-extrabold transition ${
                  option.disabled
                    ? "cursor-not-allowed text-slate-300 line-through"
                    : isSelected
                      ? "bg-secondarySoft text-secondary"
                      : "text-slate-400 hover:bg-secondarySoft/50 hover:text-primary"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
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

  const start = new Date(buildVietnamDateTime(startDate, startTime));
  const end = new Date(buildVietnamDateTime(endDate, endTime));

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
      price: Number(car?.pricing?.basePricePerHour ?? 0),
      unit: "giờ",
      label: "Số giờ thuê",
      priceLabel: "Giá thuê theo giờ",
      modeLabel: "Thuê theo giờ",
    };
  }

  return {
    price: Number(car?.pricing?.basePricePerDay ?? 0),
    unit: "ngày",
    label: "Số ngày thuê",
    priceLabel: "Giá thuê theo ngày",
    modeLabel: "Thuê theo ngày",
  };
}

function getFuelTypeLabel(value?: string) {
  const labels: Record<string, string> = {
    GASOLINE: "Xăng",
    DIESEL: "Dầu",
    ELECTRIC: "Điện",
    HYBRID: "Hybrid",
  };

  return value ? labels[value] || value : "--";
}

function getTransmissionLabel(value?: string) {
  const labels: Record<string, string> = {
    AUTOMATIC: "Số tự động",
    MANUAL: "Số sàn",
  };

  return value ? labels[value] || value : "--";
}

function getQuoteUnitLabel(quote?: BookingPriceQuote | null) {
  return quote?.rentalMode === "HOURLY" ? "giờ" : "ngày";
}

function groupQuoteBreakdown(quote?: BookingPriceQuote | null) {
  if (!quote) return [];

  const groupMap = new Map<
    string,
    {
      label: string;
      type: string;
      holidayNames: string[];
      unitCount: number;
      unitPrice: number;
      price: number;
    }
  >();

  quote.breakdown.forEach((item) => {
    const key = `${item.priceType}-${item.finalPrice}`;
    const current = groupMap.get(key) || {
      label: item.label,
      type: item.priceType,
      holidayNames: [],
      unitCount: 0,
      unitPrice: item.finalPrice,
      price: 0,
    };

    current.unitCount += Number(item.unitCount || 1);
    current.price += Number(item.price || 0);

    groupMap.set(key, current);
  });

  return Array.from(groupMap.values());
}

function getQuoteSurchargeTotal(quote?: BookingPriceQuote | null) {
  if (!quote) return 0;

  return quote.breakdown.reduce(
    (sum, item) =>
      sum +
      Number(item.surchargeAmount || 0) * Number(item.unitCount || 1),
    0,
  );
}

function getQuoteBaseRentalSubtotal(quote?: BookingPriceQuote | null) {
  if (!quote) return 0;

  const rentalSubtotal = Number(
    quote.rentalSubtotal ?? quote.totalPrice ?? 0,
  );
  return Math.max(rentalSubtotal - getQuoteSurchargeTotal(quote), 0);
}

function calculateRentalTime(rentalMode: RentalMode, start: Date, end: Date) {
  const diffMs = end.getTime() - start.getTime();

  if (diffMs <= 0) return 0;

  if (rentalMode === "HOURLY") {
    return Math.ceil(diffMs / HOUR_MS);
  }

  return Math.max(1, Math.ceil(diffMs / HOUR_MS / 24));
}

function formatUnavailableRange(range: UnavailableRange) {
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return `Xe không khả dụng: từ ${formatter.format(start)} đến ${formatter.format(end)}`;
}

function findOverlappingUnavailableRange(
  ranges: UnavailableRange[] | undefined,
  start: Date,
  end: Date,
) {
  if (!ranges?.length) return undefined;

  return ranges.find((range) => {
    const unavailableStart = new Date(range.startDate);
    const unavailableEnd = new Date(range.endDate);

    if (
      Number.isNaN(unavailableStart.getTime()) ||
      Number.isNaN(unavailableEnd.getTime())
    ) {
      return false;
    }

    return start < unavailableEnd && end > unavailableStart;
  });
}

function doesRangeOverlapUnavailable(
  ranges: UnavailableRange[] | undefined,
  start: Date,
  end: Date,
) {
  if (!ranges?.length) return false;

  return ranges.some((range) => {
    const unavailableStart = new Date(range.startDate);
    const unavailableEnd = new Date(range.endDate);

    if (
      Number.isNaN(unavailableStart.getTime()) ||
      Number.isNaN(unavailableEnd.getTime())
    ) {
      return false;
    }

    return start < unavailableEnd && end > unavailableStart;
  });
}

function isDateInsideUnavailableRange(
  ranges: UnavailableRange[] | undefined,
  dateValue: string,
) {
  if (!ranges?.length || !dateValue) return false;

  const dayStart = new Date(`${dateValue}T00:00:00`);
  const dayEnd = new Date(`${dateValue}T23:59:59`);

  return doesRangeOverlapUnavailable(ranges, dayStart, dayEnd);
}

function isDateFullyUnavailable(
  ranges: UnavailableRange[] | undefined,
  dateValue: string,
) {
  if (!ranges?.length || !dateValue) return false;

  const businessStart = new Date(buildVietnamDateTime(dateValue, "08:00"));
  const businessEnd = new Date(buildVietnamDateTime(dateValue, "22:00"));

  return ranges.some((range) => {
    const start = new Date(range.startDate);
    const end = new Date(range.endDate);
    return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) &&
      start <= businessStart && end >= businessEnd;
  });
}

function isHourlyDateFullyUnavailable(
  ranges: UnavailableRange[] | undefined,
  dateValue: string,
) {
  const availableStartTimes = TIME_OPTIONS.filter((time) => {
    const end = getHourlyRentalEnd(dateValue, time, HOURLY_RENTAL_MIN_HOURS);
    if (!end || end.date !== dateValue || timeToMinutes(end.time) > timeToMinutes("22:00")) {
      return false;
    }

    return !doesRangeOverlapUnavailable(
      ranges,
      new Date(buildVietnamDateTime(dateValue, time)),
      new Date(buildVietnamDateTime(end.date, end.time)),
    );
  });

  return availableStartTimes.length === 0;
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

  if (typeof apiError.response?.data?.data === "string") {
    return apiError.response.data.data;
  }

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

function getAvailabilityInfo(car?: CarDetail | null, now = Date.now()) {
  const availability = car?.rentalAvailability || "AVAILABLE";

  if (availability === "CLEANING") {
    const cleaningUntil = car?.cleaningUntil
      ? new Date(car.cleaningUntil).getTime()
      : 0;

    if (cleaningUntil > now) {
      const formattedUntil = new Date(cleaningUntil).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      return {
        label: `Đang vệ sinh đến ${new Date(cleaningUntil).toLocaleTimeString(
          "vi-VN",
          { hour: "2-digit", minute: "2-digit" },
        )}`,
        badgeClass: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
        isBookable: car?.isBookable !== false,
        isCleaning: true,
        message:
          car?.unavailableReason ||
          `Xe vừa hoàn tất chuyến thuê và đang được vệ sinh đến ${formattedUntil}. Vui lòng chọn giờ nhận xe sau thời điểm này.`,
      };
    }
  }

  if (availability === "PENDING_CONFIRMATION") {
    return {
      label: car?.availabilityLabel || "Đang chờ xác nhận",
      badgeClass: "bg-amber-50 text-amber-700",
      isBookable: false,
      isCleaning: false,
      message:
        "Xe này đang có booking chờ chủ xe xác nhận, vui lòng chọn xe khác.",
    };
  }

  if (availability === "HELD_IN_CART") {
    return {
      label: car?.availabilityLabel || "Đang được giữ",
      badgeClass: "bg-sky-50 text-sky-700",
      isBookable: false,
      isCleaning: false,
      message: "Xe này đang được giữ trong giỏ hàng của người khác.",
    };
  }

  if (car?.requiresScheduleCheck) {
    return {
      label: car.availabilityLabel || "Kiểm tra lịch thuê",
      badgeClass: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
      isBookable: true,
      isCleaning: false,
      message: "Vui lòng chọn thời gian nhận và trả xe để kiểm tra lịch thuê.",
    };
  }

  return {
    label: car?.availabilityLabel || "Sẵn sàng",
    badgeClass:
      car?.isBookable === false
        ? "bg-white text-primary ring-1 ring-border"
        : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
    isBookable: car?.isBookable !== false,
    isCleaning: false,
    message: car?.unavailableReason || "",
  };
}

export default function CarDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [car, setCar] = useState<CarDetail | null>(null);
  const [priceQuote, setPriceQuote] = useState<BookingPriceQuote | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [rentalMode, setRentalMode] = useState<RentalMode>("DAILY");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [startTime, setStartTime] = useState(RENTAL_START_TIME);
  const [endTime, setEndTime] = useState(RENTAL_END_TIME);
  const [isRentalPickerOpen, setIsRentalPickerOpen] = useState(false); // Mở modal chọn lịch mới.
  const [pickerMonth, setPickerMonth] = useState(
    () => parseDateValue(getVietnamTodayDate()) || new Date(),
  ); // Tháng đang hiển thị trong lịch.
  const [calendarUnavailableRanges, setCalendarUnavailableRanges] = useState<UnavailableRange[]>([]);
  const [isCalendarAvailabilityLoading, setIsCalendarAvailabilityLoading] = useState(false);
  const [calendarAvailabilityError, setCalendarAvailabilityError] = useState("");
  const [calendarAvailabilityVersion, setCalendarAvailabilityVersion] = useState(0);
  const [holidayDateMap, setHolidayDateMap] = useState<Record<string, HolidayDateInfo>>({});
  const [activeHolidayDate, setActiveHolidayDate] = useState("");
  const [hourlyDuration, setHourlyDuration] = useState(4); // Mặc định thuê theo giờ tối thiểu 4 giờ.
  const [currentMinuteOfDay, setCurrentMinuteOfDay] = useState(getCurrentMinuteOfDay); // Dùng để khóa giờ đã qua trong ngày hiện tại.
  const [availabilityNow, setAvailabilityNow] = useState(() => Date.now());
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);
  const [isCartSubmitting, setIsCartSubmitting] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<CarReviewSummary | null>(null);
  const [helpfulLoadingReviewId, setHelpfulLoadingReviewId] = useState("");
  const [reviewSort, setReviewSort] =
    useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [reviewRatingFilter, setReviewRatingFilter] = useState(0);
  const [reviewFilterMode, setReviewFilterMode] =
    useState<"all" | "images" | "comment" | "reply">("all");

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryStart = getBookingDateTimeParts(params.get("startDate") || "");
    const queryEnd = getBookingDateTimeParts(params.get("endDate") || "");
    const queryRentalMode = params.get("rentalMode");

    if (!queryStart || !queryEnd) return;

    queueMicrotask(() => {
      setStartDate(queryStart.date);
      setStartTime(queryStart.time);
      setEndDate(queryEnd.date);
      setEndTime(queryEnd.time);

      if (queryRentalMode === "DAILY" || queryRentalMode === "HOURLY") {
        setRentalMode(queryRentalMode);
      }
    });
  }, [location.search]);

  useEffect(() => {
    if (!id) return;

    queueMicrotask(() => {
      setCar(null);
      setPriceQuote(null);
      setIsQuoteLoading(false);
    });

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

  useEffect(() => {
    if (!id) return;

    let active = true;
    queueMicrotask(() => {
      if (active) setReviewSummary(null);
    });
    reviewService
      .getCarReviews(id, {
        limit: 6,
        sort: reviewSort,
        rating: reviewRatingFilter || undefined,
        hasImages: reviewFilterMode === "images" || undefined,
        hasComment: reviewFilterMode === "comment" || undefined,
        hasReply: reviewFilterMode === "reply" || undefined,
      })
      .then((summary) => {
        if (active) setReviewSummary(summary);
      })
      .catch((error) => {
        console.warn("Không thể tải đánh giá xe", error);
        if (active) setReviewSummary(null);
      });

    return () => {
      active = false;
    };
  }, [id, reviewFilterMode, reviewRatingFilter, reviewSort]);

  const handleHelpfulToggle = async (
    reviewId: string,
    isHelpfulByMe: boolean,
  ) => {
    if (!authService.isLoggedIn()) {
      toast.error("Vui lòng đăng nhập để đánh dấu đánh giá hữu ích.");
      return;
    }

    if (authService.getRole() !== "USER") {
      toast.error("Chức năng này dành cho tài khoản người dùng.");
      return;
    }

    setHelpfulLoadingReviewId(reviewId);
    try {
      const updatedReview = isHelpfulByMe
        ? await reviewService.unmarkReviewHelpful(reviewId)
        : await reviewService.markReviewHelpful(reviewId);

      setReviewSummary((current) =>
        current
          ? {
              ...current,
              reviews: current.reviews.map((review) =>
                review.id === reviewId
                  ? {
                      ...review,
                      helpfulCount: Number(updatedReview.helpfulCount || 0),
                      isHelpfulByMe: !isHelpfulByMe,
                    }
                  : review,
              ),
            }
          : current,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setHelpfulLoadingReviewId("");
    }
  };

  const galleryImages = useMemo(() => getCarImages(car || undefined), [car]);

  useEffect(() => {
    if (!id || !startDate || !endDate || !startTime || !endTime) return;

    const start = new Date(buildVietnamDateTime(startDate, startTime));
    const end = new Date(buildVietnamDateTime(endDate, endTime));

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return;
    }

    let active = true;

    carService
      .getOneCar(id, {
        startDate: buildVietnamDateTime(startDate, startTime),
        endDate: buildVietnamDateTime(endDate, endTime),
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

  useEffect(() => {
    const booking = car?.currentUserActiveBooking;
    if (!booking || startDate || endDate) return;

    const bookingStart = getBookingDateTimeParts(booking.startDate);
    const bookingEnd = getBookingDateTimeParts(booking.endDate);

    if (!bookingStart || !bookingEnd) return;

    queueMicrotask(() => {
      setStartDate(bookingStart.date);
      setEndDate(bookingEnd.date);
      setStartTime(bookingStart.time);
      setEndTime(bookingEnd.time);

      if (booking.rentalMode === "DAILY" || booking.rentalMode === "HOURLY") {
        setRentalMode(booking.rentalMode);
      }
    });
  }, [car?.currentUserActiveBooking, startDate, endDate]);

  const openImageViewer = (index: number) => {
    setActiveImageIndex(index);
  };

  const closeImageViewer = useCallback(() => {
    setActiveImageIndex(null);
  }, []);

  useEffect(() => {
    if (!car?.cleaningUntil) return;

    const intervalId = window.setInterval(() => {
      setAvailabilityNow(Date.now());
    }, 30 * 1000);

    return () => window.clearInterval(intervalId);
  }, [car?.cleaningUntil]);

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

  const today = useMemo(() => getVietnamTodayDate(), []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentMinuteOfDay(getCurrentMinuteOfDay());
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isRentalPickerOpen) {
      queueMicrotask(() => {
        setActiveHolidayDate("");
      });
      return;
    }

    let active = true;
    const visibleStart = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
    const visibleEnd = getMonthEnd(addMonths(pickerMonth, 1));

    holidayService
      .getPublicHolidays({
        startDate: formatDateValue(visibleStart),
        endDate: formatDateValue(visibleEnd),
      })
      .then((holidays) => {
        if (active) {
          setHolidayDateMap(expandHolidayDateMap(holidays));
        }
      })
      .catch((error) => {
        console.warn("Không thể tải danh sách ngày lễ", error);
        if (active) {
          setHolidayDateMap({});
          setActiveHolidayDate("");
        }
      });

    return () => {
      active = false;
    };
  }, [isRentalPickerOpen, pickerMonth]);

  useEffect(() => {
    if (!id || !isRentalPickerOpen) return;

    let active = true;
    const visibleStart = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
    const visibleEnd = getMonthEnd(addMonths(pickerMonth, 1));

    setIsCalendarAvailabilityLoading(true);
    setCalendarAvailabilityError("");
    carService
      .getAvailabilityCalendar(id, {
        from: formatDateValue(visibleStart),
        to: formatDateValue(visibleEnd),
      })
      .then((ranges) => {
        if (active) setCalendarUnavailableRanges(ranges);
      })
      .catch(() => {
        if (active) {
          setCalendarUnavailableRanges([]);
          setCalendarAvailabilityError("Không thể tải lịch xe. Hệ thống sẽ kiểm tra lại khi bạn đặt xe.");
        }
      })
      .finally(() => {
        if (active) setIsCalendarAvailabilityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [calendarAvailabilityVersion, id, isRentalPickerOpen, pickerMonth]);

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
  const startingDailyPrice = car?.pricing?.basePricePerDay;
  const startingHourlyPrice = car?.pricing?.basePricePerHour;
  const primaryStartingPrice = supportedRentalModes.allowDailyRental
    ? startingDailyPrice
    : startingHourlyPrice;
  const primaryStartingUnit = supportedRentalModes.allowDailyRental
    ? "ngày"
    : "giờ";
  const availabilityInfo = getAvailabilityInfo(car, availabilityNow);
  const unavailableRanges = calendarUnavailableRanges;

  const rentalTime = useMemo(() => {
    if (!car || !startDate || !endDate || !startTime || !endTime) return 0;

    const start = new Date(buildVietnamDateTime(startDate, startTime));
    const end = new Date(buildVietnamDateTime(endDate, endTime));

    return calculateRentalTime(rentalMode, start, end);
  }, [car, rentalMode, startDate, endDate, startTime, endTime]);

  const totalPrice = priceQuote?.totalPrice ?? rentalTime * rentalInfo.price;

  const rentalValidationMessage = useMemo(
    () => getRentalValidationMessage(startDate, endDate, startTime, endTime),
    [startDate, endDate, startTime, endTime],
  );
  const unavailableRangeValidationMessage = useMemo(() => {
    if (!car || !startDate || !endDate || !startTime || !endTime) {
      return "";
    }

    const start = new Date(buildVietnamDateTime(startDate, startTime));
    const end = new Date(buildVietnamDateTime(endDate, endTime));

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "";
    }

    const overlappingRange = findOverlappingUnavailableRange(
      unavailableRanges,
      start,
      end,
    );

    if (!overlappingRange) return "";

    return "Khoảng thời gian đã chọn trùng với lịch thuê hiện có của xe.";
  }, [endDate, endTime, startDate, startTime, unavailableRanges]);
  const rentalModeValidationMessage = useMemo(() => {
    if (rentalMode === "DAILY" && !supportedRentalModes.allowDailyRental) {
      return "Xe không hỗ trợ thuê theo ngày";
    }

    if (rentalMode === "HOURLY" && !supportedRentalModes.allowHourlyRental) {
      return "Xe không hỗ trợ thuê theo giờ";
    }

    if (
      rentalMode === "HOURLY" &&
      rentalTime > 0 &&
      (rentalTime < HOURLY_RENTAL_MIN_HOURS ||
        rentalTime > HOURLY_RENTAL_MAX_HOURS)
    ) {
      return `Thuê theo giờ chỉ hỗ trợ từ ${HOURLY_RENTAL_MIN_HOURS} đến ${HOURLY_RENTAL_MAX_HOURS} giờ`;
    }

    return "";
  }, [rentalMode, rentalTime, supportedRentalModes.allowDailyRental, supportedRentalModes.allowHourlyRental]);

  useEffect(() => {
    if (
      !id ||
      !car ||
      !startDate ||
      !endDate ||
      !startTime ||
      !endTime ||
      rentalValidationMessage ||
      unavailableRangeValidationMessage ||
      rentalModeValidationMessage
    ) {
      queueMicrotask(() => {
        setPriceQuote(null);
        setIsQuoteLoading(false);
      });
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setIsQuoteLoading(true);
      setPriceQuote(null);
    });

    bookingService
      .quoteBooking({
        carId: id,
        startDate: buildVietnamDateTime(startDate, startTime),
        endDate: buildVietnamDateTime(endDate, endTime),
        rentalMode,
      })
      .then((quote) => {
        if (active) setPriceQuote(quote);
      })
      .catch(() => {
        if (active) setPriceQuote(null);
      })
      .finally(() => {
        if (active) setIsQuoteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    car,
    endDate,
    endTime,
    id,
    rentalMode,
    rentalModeValidationMessage,
    rentalValidationMessage,
    startDate,
    startTime,
    unavailableRangeValidationMessage,
  ]);

  const shouldShowRentalValidation =
    Boolean(startDate || endDate) && Boolean(rentalValidationMessage);

  const canSubmitRental =
    Boolean(car) &&
    availabilityInfo.isBookable &&
    rentalTime > 0 &&
    !rentalValidationMessage &&
    !unavailableRangeValidationMessage &&
    !rentalModeValidationMessage;

  const currentUserBooking = car?.currentUserActiveBooking || null;
  const currentUserBookingOutstanding = currentUserBooking
    ? Math.max(
        (currentUserBooking.totalPrice || 0) -
          (currentUserBooking.paidAmount || 0),
        0,
      )
    : 0;
  const canContinueCurrentBookingPayment =
    Boolean(currentUserBooking) &&
    currentUserBookingOutstanding > 0 &&
    [
      "OWNER_APPROVED",
      "PAYMENT_PENDING",
      "PAID",
      "IN_PROGRESS",
    ].includes(currentUserBooking?.status || "");
  const currentUserBookingActionPath = currentUserBooking
    ? canContinueCurrentBookingPayment
      ? `/bookings/${currentUserBooking._id}/payment`
      : `/bookings/${currentUserBooking._id}`
    : "";
  const currentUserBookingActionLabel = canContinueCurrentBookingPayment
    ? "Tiếp tục thanh toán"
    : "Xem booking của bạn";

  const currentUserBookingRentalTime =
    currentUserBooking?.startDate && currentUserBooking?.endDate
      ? calculateRentalTime(
          currentUserBooking.rentalMode || rentalMode,
          new Date(currentUserBooking.startDate),
          new Date(currentUserBooking.endDate),
        )
      : 0;
  const displayRentalTime =
    currentUserBookingRentalTime > 0 ? currentUserBookingRentalTime : rentalTime;
  const displayTotalPrice = currentUserBooking?.totalPrice || totalPrice;
  const quoteBreakdownGroups = groupQuoteBreakdown(priceQuote);
  const quoteSurchargeTotal = getQuoteSurchargeTotal(priceQuote);
  const quoteBaseRentalSubtotal = getQuoteBaseRentalSubtotal(priceQuote);
  const quoteUnitLabel = getQuoteUnitLabel(priceQuote);
  const hasRentalSelection = Boolean(startDate && endDate);

  const activeHolidayInfo = activeHolidayDate
    ? holidayDateMap[activeHolidayDate]
    : undefined;
  const hourlyStartTimeOptions = useMemo(
    () =>
      TIME_OPTIONS.filter((time) => {
        const endMinuteOfDay =
          (timeToMinutes(time) + hourlyDuration * 60) % 1440;

        return (
          endMinuteOfDay >= timeToMinutes("08:00") &&
          endMinuteOfDay <= timeToMinutes("22:00")
        );
      }),
    [hourlyDuration],
  );
  const rentalPickerSummary = formatRentalPickerSummary(
    rentalMode,
    startDate,
    endDate,
    startTime,
    endTime,
    rentalTime,
  );
  const canSaveRentalPicker =
    Boolean(startDate && endDate) &&
    !rentalValidationMessage &&
    !unavailableRangeValidationMessage &&
    !rentalModeValidationMessage; // Nút Lưu trong modal chỉ sáng khi ngày/giờ hợp lệ.
  const isPastTimeForDate = useCallback(
    (dateValue: string, time: string) =>
      isSameDateValue(dateValue, today) && timeToMinutes(time) <= currentMinuteOfDay,
    [currentMinuteOfDay, today],
  ); // Nếu chọn hôm nay thì các mốc giờ đã qua sẽ bị khóa.
  const dailyStartTimeOptions: WheelOption[] = TIME_OPTIONS.map((time) => ({
    label: time,
    value: time,
    disabled: isPastTimeForDate(startDate, time),
  }));
  const dailyEndTimeOptions: WheelOption[] = TIME_OPTIONS.map((time) => ({
    label: time,
    value: time,
    disabled:
      isPastTimeForDate(endDate, time) ||
      (isSameDateValue(startDate, endDate) &&
        timeToMinutes(time) <= timeToMinutes(startTime)),
  }));
  const isHourlySelectionUnavailable = useCallback(
    (dateValue: string, time: string, duration: number) => {
      const end = getHourlyRentalEnd(dateValue, time, duration);
      if (!end) return true;

      return doesRangeOverlapUnavailable(
        unavailableRanges,
        new Date(buildVietnamDateTime(dateValue, time)),
        new Date(buildVietnamDateTime(end.date, end.time)),
      );
    },
    [unavailableRanges],
  );
  const hourlyStartWheelOptions: WheelOption[] = hourlyStartTimeOptions.map((time) => ({
    label: time,
    value: time,
    disabled:
      isPastTimeForDate(startDate, time) ||
      isHourlySelectionUnavailable(startDate, time, hourlyDuration),
  }));
  const hourlyDurationWheelOptions: WheelOption[] = HOURLY_DURATION_OPTIONS.map((duration) => ({
    label: `${duration} giờ`,
    value: duration,
    disabled: Boolean(startDate) && isHourlySelectionUnavailable(startDate, startTime, duration),
  }));
  const firstEnabledDailyStartTime = dailyStartTimeOptions.find(
    (option) => !option.disabled,
  )?.value as string | undefined;
  const firstEnabledDailyEndTime = dailyEndTimeOptions.find(
    (option) => !option.disabled,
  )?.value as string | undefined;
  const firstEnabledHourlyStartTime = hourlyStartWheelOptions.find(
    (option) => !option.disabled,
  )?.value as string | undefined;

  useEffect(() => {
    if (rentalMode !== "HOURLY") return;

    // Gói thuê dài có thể trả vào ngày kế tiếp; giờ nhận và trả vẫn nằm trong khung 08:00-22:00.
    const nextStartTime = hourlyStartWheelOptions.some(
      (option) => option.value === startTime && !option.disabled,
    )
      ? startTime
      : firstEnabledHourlyStartTime;

    if (nextStartTime && nextStartTime !== startTime) {
      queueMicrotask(() => setStartTime(nextStartTime));
      return;
    }

    const nextEnd = nextStartTime
      ? getHourlyRentalEnd(startDate, nextStartTime, hourlyDuration)
      : null;
    if (
      nextEnd &&
      (endDate !== nextEnd.date || endTime !== nextEnd.time)
    ) {
      queueMicrotask(() => {
        setEndDate(nextEnd.date);
        setEndTime(nextEnd.time);
      });
    }
  }, [
    endDate,
    endTime,
    hourlyDuration,
    firstEnabledHourlyStartTime,
    hourlyStartTimeOptions,
    isPastTimeForDate,
    isHourlySelectionUnavailable,
    rentalMode,
    startDate,
    startTime,
  ]);

  useEffect(() => {
    if (rentalMode !== "DAILY") return;

    if (startDate && dailyStartTimeOptions.some((option) => option.value === startTime && option.disabled)) {
      if (firstEnabledDailyStartTime) {
        queueMicrotask(() => setStartTime(firstEnabledDailyStartTime));
      }
      return;
    }

    if (endDate && dailyEndTimeOptions.some((option) => option.value === endTime && option.disabled)) {
      if (firstEnabledDailyEndTime) {
        queueMicrotask(() => setEndTime(firstEnabledDailyEndTime));
      }
    }
  }, [
    dailyEndTimeOptions,
    dailyStartTimeOptions,
    endDate,
    endTime,
    firstEnabledDailyEndTime,
    firstEnabledDailyStartTime,
    rentalMode,
    startDate,
    startTime,
  ]);

  const isCalendarDateDisabled = (dateValue: string) => {
    if (dateValue < today) return true;

    return rentalMode === "DAILY"
      ? isDateFullyUnavailable(unavailableRanges, dateValue)
      : isHourlyDateFullyUnavailable(unavailableRanges, dateValue);
  };

  const isCalendarDateSelected = (dateValue: string) =>
    dateValue === startDate || dateValue === endDate;

  const isCalendarDateInRange = (dateValue: string) =>
    rentalMode === "DAILY" &&
    Boolean(startDate && endDate) &&
    dateValue > startDate &&
    dateValue < endDate;

  const handleRentalModeChange = (nextMode: RentalMode) => {
    setRentalMode(nextMode);

    if (nextMode === "HOURLY") {
      const nextEnd = getHourlyRentalEnd(
        startDate,
        startTime,
        hourlyDuration,
      );
      if (nextEnd) {
        setEndDate(nextEnd.date);
        setEndTime(nextEnd.time);
      }
    }
  };

  const handleCalendarDateClick = (dateValue: string) => {
    const holidayInfo = holidayDateMap[dateValue];

    if (holidayInfo) {
      setActiveHolidayDate(dateValue);
    } else {
      setActiveHolidayDate("");
    }

    if (isCalendarDateDisabled(dateValue)) {
      toast.error("Xe đã có lịch thuê trong thời gian này.");
      return;
    }

    if (rentalMode === "HOURLY") {
      // Ngày trả được tự động suy ra từ ngày nhận và số giờ thuê.
      const nextEnd = getHourlyRentalEnd(
        dateValue,
        startTime,
        hourlyDuration,
      );
      setStartDate(dateValue);
      if (nextEnd) {
        setEndDate(nextEnd.date);
        setEndTime(nextEnd.time);
      }
      return;
    }

    if (!startDate || (startDate && endDate)) {
      setStartDate(dateValue);
      setEndDate("");
      return;
    }

    if (dateValue < startDate) {
      setStartDate(dateValue);
      setEndDate("");
      return;
    }

    const proposedStart = new Date(buildVietnamDateTime(startDate, startTime));
    const proposedEnd = new Date(buildVietnamDateTime(dateValue, endTime));

    const overlappingRange = findOverlappingUnavailableRange(
      unavailableRanges,
      proposedStart,
      proposedEnd,
    );

    if (overlappingRange) {
      toast.error(
        "Khoảng thời gian đã chọn trùng với lịch thuê hiện có của xe.",
      );
      return;
    }

    setEndDate(dateValue);
  };

  const handleSaveRentalPicker = () => {
    if (!startDate || !endDate) {
      toast.error("Vui lòng chọn đầy đủ ngày nhận và ngày trả xe");
      return;
    }

    if (rentalValidationMessage || unavailableRangeValidationMessage || rentalModeValidationMessage) {
      toast.error(
        rentalValidationMessage || unavailableRangeValidationMessage || rentalModeValidationMessage,
      );
      return;
    }

    setIsRentalPickerOpen(false);
  };

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

    if (unavailableRangeValidationMessage) {
      toast.error(unavailableRangeValidationMessage);
      return false;
    }

    return true;
  };

  const handleStartDateChange = (value: string) => {
    if (isCalendarDateDisabled(value)) {
      toast.error("Ngày nhận xe nằm trong khoảng xe đã được thuê");
      setStartDate("");
      return;
    }

    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    if (isCalendarDateDisabled(value)) {
      toast.error("Ngày trả xe nằm trong khoảng xe đã được thuê");
      setEndDate("");
      return;
    }

    setEndDate(value);
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
        startDate: buildVietnamDateTime(startDate, startTime),
        endDate: buildVietnamDateTime(endDate, endTime),
        rentalMode,
      });

      toast.success("Đã thêm vào giỏ hàng");
      navigate("/cart");
    } catch (error: unknown) {
      setCalendarAvailabilityVersion((value) => value + 1);
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
      navigate("/booking-request", {
        state: {
          source: "direct",
          car: {
            _id: car._id,
            name: car.name,
            images: car.images,
            licensePlate: car.licensePlate,
            pickupLat: car.pickupLat ?? car.latitude,
            pickupLng: car.pickupLng ?? car.longitude,
            deliveryEnabled: car.deliveryEnabled,
            deliveryBaseFee: car.deliveryBaseFee,
            deliveryFeePerKm: car.deliveryFeePerKm,
            deliveryMaxDistanceKm: car.deliveryMaxDistanceKm,
            deliveryNote: car.deliveryNote,
          },
          bookingData: {
            carId: id,
            startDate: buildVietnamDateTime(startDate, startTime),
            endDate: buildVietnamDateTime(endDate, endTime),
            rentalMode,
            paymentOption: "DEPOSIT",
          },
          totalPrice,
        },
      });
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
              <div className="h-10 w-64 animate-pulse rounded-lg bg-soft" />
              <div className="h-[420px] animate-pulse rounded-lg bg-soft" />
              <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-28 animate-pulse rounded-lg bg-soft"
                  />
                ))}
              </div>
            </div>

            <div className="h-[520px] animate-pulse rounded-lg bg-soft" />
          </div>
        </main>
      </div>
    );
  }

  const brandName = car.brandId?.name || "BQDrive Select";
  const ownerName = car.ownerId?.name || "Chủ xe ký gửi";
  const ownerLabel = "Chủ xe ký gửi";
  const ownerImage = car.ownerId?.avatar;

  const canShowDetailedPickupAddress =
  DETAILED_PICKUP_STATUSES.includes(
    car.currentUserActiveBooking?.status || "",
  );
  const pickupArea = formatAddressArea(car);
  const pickupAddress = formatPickupAddress(car, {
    includeDetail: canShowDetailedPickupAddress,
    includeNote: canShowDetailedPickupAddress,
  });
  const pickupLat = car.pickupLat ?? car.latitude;
  const pickupLng = car.pickupLng ?? car.longitude;
  const description =
    car.description ||
    "Dòng xe được kiểm duyệt trên hệ thống BQDrive, phù hợp cho lịch trình cá nhân, công tác và di chuyển gia đình.";
  const fuelType = getFuelTypeLabel(car.fuelType);
  const transmission = getTransmissionLabel(car.transmission);
  const mileagePolicy = car.mileagePolicy;
  const hasMileagePolicy = Boolean(
    mileagePolicy &&
      [
        mileagePolicy.includedKmPerDay,
        mileagePolicy.includedKmPerHour,
        mileagePolicy.overageFeePerKm,
        mileagePolicy.graceKm,
      ].some(hasNumber),
  );

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
    {
      icon: Milestone,
      label: "ODO hiện tại",
      value: formatKilometers(car.currentOdometerKm),
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

        <section className="min-w-0 rounded-3xl border border-border bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.08)] md:p-7">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-10">
            <section>
              <div className="mb-6">
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
                  <p className="mt-3 text-base font-extrabold text-primary">
                    Biển số: {car.licensePlate || "Chưa cập nhật"}
                  </p>
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

            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="mb-5">
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Thông tin xe
                  </p>
                  <h2 className="mt-2 whitespace-nowrap text-2xl font-extrabold leading-tight text-primary md:text-3xl">
                    Thông số phục vụ chuyến đi
                  </h2>
                </div>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                  Các thông tin cơ bản giúp bạn chọn đúng dòng xe cho lịch trình
                  và ngân sách.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {vehicleSpecs.map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border bg-white p-4 transition hover:border-secondary/60"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                      <Icon size={22} />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-muted">
                      {label}
                    </p>
                    <p className="mt-1 break-words text-lg font-extrabold leading-snug text-primary">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-border pt-5">
                <p className="text-sm font-extrabold text-primary">
                  Chính sách kilomet
                </p>
                {!hasMileagePolicy ? (
                  <p className="mt-2 text-sm font-semibold text-muted">
                    Chưa thiết lập
                  </p>
                ) : (
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-muted">Giới hạn</dt>
                      <dd className="mt-1 font-extrabold text-primary">
                        {hasNumber(mileagePolicy?.includedKmPerDay)
                          ? `${new Intl.NumberFormat("vi-VN").format(
                              mileagePolicy.includedKmPerDay,
                            )} km/ngày`
                          : "Chưa thiết lập"}
                      </dd>
                    </div>
                    {hasNumber(mileagePolicy?.includedKmPerHour) && (
                      <div>
                        <dt className="text-muted">Giới hạn thuê giờ</dt>
                        <dd className="mt-1 font-extrabold text-primary">
                          {new Intl.NumberFormat("vi-VN").format(
                            mileagePolicy.includedKmPerHour,
                          )}{" "}
                          km/giờ
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-muted">Phí vượt</dt>
                      <dd className="mt-1 font-extrabold text-primary">
                        {formatMileageRate(mileagePolicy?.overageFeePerKm)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Miễn tính phí</dt>
                      <dd className="mt-1 font-extrabold text-primary">
                        {hasNumber(mileagePolicy?.graceKm)
                          ? `${new Intl.NumberFormat("vi-VN").format(
                              mileagePolicy.graceKm,
                            )} km`
                          : "Chưa thiết lập"}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm font-bold uppercase text-secondary">
                  Bảng giá
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-primary">
                  Giá cơ bản và phụ thu
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Giá cuối tuần và ngày lễ bên dưới là mức dự kiến. Tổng chính
                  thức được hệ thống chốt theo lịch thuê bạn chọn.
                </p>
              </div>
              <CarPricingOverview
                pricing={car.pricing}
                allowDailyRental={car.allowDailyRental}
                allowHourlyRental={car.allowHourlyRental}
                rentalUnit={car.rentalUnit}
                className="mt-5"
              />
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

          <aside className="lg:self-start">
            <div className="rounded-lg border border-border bg-white p-6 shadow-xl shadow-slate-900/10">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0 flex-1">
                  {!hasRentalSelection && (
                    <>
                      <p className="text-sm font-semibold text-muted">
                        Giá thuê từ
                      </p>
                      <div className="mt-1 flex items-end gap-2">
                        {hasPricingNumber(primaryStartingPrice) ? (
                          <>
                            <span className="text-3xl font-extrabold text-primary">
                              {formatPrice(primaryStartingPrice)}
                            </span>
                            <span className="pb-1 text-sm font-semibold text-muted">
                              / {primaryStartingUnit}
                            </span>
                          </>
                        ) : (
                          <span className="text-lg font-extrabold text-muted">
                            Chưa cập nhật giá
                          </span>
                        )}
                      </div>
                      {supportedRentalModes.allowDailyRental &&
                        supportedRentalModes.allowHourlyRental &&
                        hasPricingNumber(startingHourlyPrice) && (
                        <p className="mt-2 text-sm font-semibold text-muted">
                          Hoặc từ {formatPrice(startingHourlyPrice)} / giờ
                        </p>
                      )}
                      <p className="mt-3 rounded-lg bg-secondarySoft/60 px-3 py-2 text-sm font-semibold text-primary">
                        Chọn ngày thuê để xem giá chính xác.
                      </p>
                    </>
                  )}

                  {hasRentalSelection && isQuoteLoading && (
                    <div className="rounded-lg border border-border bg-white p-4 text-sm font-bold text-muted">
                      Đang tính giá áp dụng...
                    </div>
                  )}

                  {hasRentalSelection &&
                    !isQuoteLoading &&
                    priceQuote &&
                    priceQuote.appliedPriceType !== "MIXED" && (
                      <>
                        <p className="text-sm font-semibold text-muted">
                          Giá áp dụng cho ngày bạn chọn
                        </p>
                        <p className="mt-2 text-lg font-extrabold text-primary">
                          {priceQuote.appliedLabel}
                        </p>
                        <div className="mt-1 flex items-end gap-2">
                          <span className="text-3xl font-extrabold text-primary">
                            {formatPrice(
                              priceQuote.finalPrice ??
                                priceQuote.breakdown[0]?.finalPrice ??
                                rentalInfo.price,
                            )}
                          </span>
                          <span className="pb-1 text-sm font-semibold text-muted">
                            / {quoteUnitLabel}
                          </span>
                        </div>
                        {quoteBreakdownGroups[0]?.holidayNames.length > 0 && (
                          <p className="mt-2 text-sm font-semibold leading-6 text-muted">
                            Áp dụng cho: {quoteBreakdownGroups[0].holidayNames.join(", ")}
                          </p>
                        )}
                      </>
                    )}

                  {hasRentalSelection && !isQuoteLoading && !priceQuote && (
                    <p className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-primary">
                      Chọn lịch hợp lệ để xem giá áp dụng.
                    </p>
                  )}
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-sm font-bold ${availabilityInfo.badgeClass}`}
                >
                  {availabilityInfo.label}
                </span>
              </div>

              <div className="mt-6 space-y-4 border-y border-border py-5">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 shrink-0 text-secondary" size={20} />
                  <div>
                    <p className="font-bold text-primary">Địa điểm nhận xe</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-muted">
                      {pickupAddress}
                    </p>
                    {!canShowDetailedPickupAddress && (
                      <p className="mt-1 text-xs font-semibold leading-5 text-muted">
                        Khu vực công khai: {pickupArea}. Địa chỉ chi tiết chỉ mở khi booking hợp lệ.
                      </p>
                    )}
                    <div className="mt-4">
                      <RouteMap
                        destLat={pickupLat}
                        destLng={pickupLng}
                        height={280}
                        showAddress={false}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsRentalPickerOpen(true)}
                  className="w-full rounded-lg border border-border bg-white p-4 text-left shadow-sm transition hover:border-secondary hover:bg-secondarySoft/20"
                >
                  <span className="flex items-center gap-2 text-sm font-extrabold text-primary">
                    <CalendarDays size={18} className="text-secondary" />
                    Thời gian thuê xe
                  </span>
                  <span className="mt-4 grid gap-3 sm:grid-cols-2">
                    <span className="rounded-lg border border-border bg-white p-3">
                      <span className="block text-xs font-bold uppercase text-muted">
                        Nhận xe
                      </span>
                      <span className="mt-1 block text-sm font-extrabold text-primary">
                        {startDate
                          ? `${startTime}, ${formatRentalDate(startDate)}`
                          : "Chọn ngày nhận"}
                      </span>
                    </span>
                    <span className="rounded-lg border border-border bg-white p-3">
                      <span className="block text-xs font-bold uppercase text-muted">
                        Trả xe
                      </span>
                      <span className="mt-1 block text-sm font-extrabold text-primary">
                        {endDate
                          ? `${endTime}, ${formatRentalDate(endDate)}`
                          : "Chọn ngày trả"}
                      </span>
                    </span>
                  </span>
                  <span className="mt-3 block text-xs font-semibold text-muted">
                    {rentalMode === "HOURLY"
                      ? `Thuê theo giờ từ ${HOURLY_RENTAL_MIN_HOURS} đến ${HOURLY_RENTAL_MAX_HOURS} giờ, hiện chọn ${hourlyDuration} giờ`
                      : "Thuê theo ngày với giờ nhận và giờ trả dạng dropdown 30 phút"}
                  </span>
                </button>

                <div className="grid gap-3 sm:grid-cols-2">
                  {supportedRentalModes.allowDailyRental && (
                    <button
                      type="button"
                      onClick={() => handleRentalModeChange("DAILY")}
                      className={`min-h-12 rounded-lg border px-4 text-sm font-extrabold transition ${
                        rentalMode === "DAILY"
                          ? "border-secondary bg-secondary text-primary"
                          : "border-border bg-white text-primary hover:bg-secondarySoft/45"
                      }`}
                    >
                      Thuê theo ngày
                    </button>
                  )}

                  {supportedRentalModes.allowHourlyRental && (
                    <button
                      type="button"
                      onClick={() => handleRentalModeChange("HOURLY")}
                      className={`min-h-12 rounded-lg border px-4 text-sm font-extrabold transition ${
                        rentalMode === "HOURLY"
                          ? "border-secondary bg-secondary text-primary"
                          : "border-border bg-white text-primary hover:bg-secondarySoft/45"
                      }`}
                    >
                      Thuê theo giờ
                    </button>
                  )}
                </div>

                <div className="hidden gap-3 sm:grid-cols-2">
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
                        onChange={(e) => handleStartDateChange(e.target.value)}
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

                <div className="hidden gap-3 sm:grid-cols-2">
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
                        onChange={(e) => handleEndDateChange(e.target.value)}
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

                {availabilityInfo.isCleaning && availabilityInfo.message && (
                  <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-800">
                    <Clock size={17} className="mt-0.5 shrink-0" />
                    {availabilityInfo.message}
                  </p>
                )}

                {shouldShowRentalValidation && (
                  <p className="flex items-start gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold leading-6 text-primary">
                    <X size={17} className="mt-0.5 shrink-0" />
                    {rentalValidationMessage}
                  </p>
                )}

                {unavailableRangeValidationMessage && (
                  <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-700">
                    <X size={17} className="mt-0.5 shrink-0 text-red-600" />
                    {unavailableRangeValidationMessage}
                  </p>
                )}

                {rentalModeValidationMessage && (
                  <p className="flex items-start gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold leading-6 text-primary">
                    <X size={17} className="mt-0.5 shrink-0" />
                    {rentalModeValidationMessage}
                  </p>
                )}

                {unavailableRanges.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
                    <div className="flex items-start gap-2">
                      <X size={17} className="mt-0.5 shrink-0 text-red-600" />
                      <div>
                        <p className="font-extrabold">
                          Thời gian xe không khả dụng:
                        </p>
                        <ul className="mt-1 space-y-1">
                          {unavailableRanges.map((range) => {
                            const label = formatUnavailableRange(range);

                            if (!label) return null;

                            return (
                              <li key={`${range.startDate}-${range.endDate}`}>
                                - {label}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">{rentalInfo.label}</dt>
                  <dd className="font-bold text-primary">
                    {displayRentalTime} {rentalInfo.unit}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">
                    {priceQuote
                      ? priceQuote.appliedPriceType === "MIXED"
                        ? "Cách tính"
                        : "Giá áp dụng"
                      : rentalInfo.priceLabel}
                  </dt>
                  <dd className="font-bold text-primary">
                    {priceQuote
                      ? priceQuote.appliedPriceType === "MIXED"
                        ? "Theo từng loại ngày"
                        : formatPrice(
                            priceQuote.finalPrice ??
                              priceQuote.breakdown[0]?.finalPrice ??
                              rentalInfo.price,
                          )
                      : formatPrice(rentalInfo.price)}
                  </dd>
                </div>

                {!hasRentalSelection || isQuoteLoading || !priceQuote ? (
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
                      {formatPrice(displayTotalPrice)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {hasRentalSelection && !isQuoteLoading && priceQuote && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-sm font-extrabold text-primary">
                    Tóm tắt chi phí
                  </p>

                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-muted">
                        Tiền thuê xe
                      </span>
                      <span className="font-bold text-primary">
                        {formatPrice(quoteBaseRentalSubtotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-muted">
                        Phụ thu cuối tuần/ngày lễ
                      </span>
                      <span className="font-bold text-primary">
                        {formatPrice(quoteSurchargeTotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-muted">
                        Phí dịch vụ BQDrive
                      </span>
                      <span className="font-bold text-primary">
                        {formatPrice(priceQuote.platformFee || 0)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="font-semibold text-muted">
                          Phí bảo hiểm chuyến đi
                        </span>

                        {!!priceQuote.insuranceDays &&
                          !!priceQuote.insuranceFeePerDay && (
                            <p className="mt-0.5 text-xs font-semibold text-muted">
                              {formatPrice(priceQuote.insuranceFeePerDay)}
                              {" × "}
                              {priceQuote.insuranceDays} ngày
                            </p>
                          )}
                      </div>

                      <span className="font-bold text-primary">
                        {formatPrice(priceQuote.insuranceFee || 0)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-muted">
                        Phí giao xe
                      </span>
                      <span className="font-bold text-primary">
                        {formatPrice(priceQuote.deliveryFee || 0)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                      <span className="font-extrabold text-primary">
                        Tổng thanh toán
                      </span>
                      <span className="text-lg font-extrabold text-secondary">
                        {formatPrice(priceQuote.totalPrice)}
                      </span>
                    </div>

                    <div className="mt-3 rounded-lg bg-secondarySoft/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-extrabold text-primary">
                          Thanh toán giữ chỗ
                        </span>

                        <span className="font-extrabold text-primary">
                          {formatPrice(
                            priceQuote.upfrontPaymentAmount || 0,
                          )}
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-semibold leading-5 text-muted">
                        Bao gồm 50% tiền thuê xe (đã gồm phụ thu), phí dịch vụ
                        BQDrive và phí bảo hiểm chuyến đi.
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-muted">
                        Tiền thuê còn lại
                      </span>

                      <span className="font-bold text-primary">
                        {formatPrice(
                          Math.max(
                            priceQuote.totalPrice -
                              (priceQuote.upfrontPaymentAmount || 0),
                            0,
                          ),
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 space-y-3">
                {currentUserBooking ? (
                  <button
                    onClick={() => navigate(currentUserBookingActionPath)}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95"
                  >
                    <Wallet size={20} />
                    {currentUserBookingActionLabel}
                  </button>
                ) : (
                  <>
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
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-5 py-3 font-extrabold text-primary transition hover:border-secondary hover:bg-secondarySoft/45 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ShoppingCart size={20} />
                  {isCartSubmitting ? "Đang thêm..." : "Thêm vào giỏ hàng"}
                </button>
                  </>
                )}
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

            <section className="mt-5 rounded-xl border border-border bg-white p-5 shadow-sm">
              <div className="grid gap-3 text-center sm:grid-cols-3 lg:grid-cols-1">
                <div className="rounded-lg border border-border bg-slate-50 p-4">
                  <ShieldCheck className="mx-auto text-secondary" size={22} />
                  <p className="mt-2 text-xs font-semibold text-muted">Xe đã kiểm duyệt</p>
                </div>
                <div className="rounded-lg border border-border bg-slate-50 p-4">
                  <Headphones className="mx-auto text-secondary" size={22} />
                  <p className="mt-2 text-xs font-semibold text-muted">Hỗ trợ booking</p>
                </div>
                <div className="rounded-lg border border-border bg-slate-50 p-4">
                  <Wallet className="mx-auto text-secondary" size={22} />
                  <p className="mt-2 text-xs font-semibold text-muted">Chi phí minh bạch</p>
                </div>
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <p className="text-sm font-bold uppercase text-secondary">Dịch vụ đi kèm</p>
                <h2 className="mt-1 text-xl font-extrabold text-primary">
                  Thuê xe rõ ràng, dễ kiểm soát
                </h2>
                <div className="mt-4 space-y-3">
                  {serviceBenefits.map((benefit) => (
                    <div
                      key={benefit}
                      className="flex items-start gap-3 rounded-lg border border-border bg-slate-50 p-3"
                    >
                      <CheckCircle2 className="mt-0.5 shrink-0 text-secondary" size={19} />
                      <p className="text-sm font-semibold leading-6 text-primary">{benefit}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-lg bg-primary p-5 text-white">
                <div className="flex items-center gap-4">
                  <OwnerIdentityImage
                    key={ownerImage || ownerName}
                    name={ownerName}
                    image={ownerImage}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-white/65">{ownerLabel}</p>
                    <h3 className="mt-1 break-words text-xl font-extrabold">{ownerName}</h3>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  Chủ xe đã được BQDrive kiểm duyệt trước khi nhận đặt xe từ khách hàng.
                </p>
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-secondary">
                    <MapPin size={17} /> Khu vực nhận xe
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-white/80">{pickupAddress}</p>
                  {!canShowDetailedPickupAddress && (
                    <p className="mt-2 text-xs leading-5 text-white/55">
                      Địa chỉ chi tiết sẽ hiển thị sau khi booking được chủ xe duyệt.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </aside>
        </div>
        </section>

        <section className="mt-12 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Đánh giá từ khách thuê
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-primary">
                Trải nghiệm thực tế với xe
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted">
                Các nhận xét chỉ được tạo sau khi chuyến thuê đã hoàn tất.
              </p>
            </div>

            <div className="rounded-2xl bg-primary px-5 py-4 text-white">
              <div className="flex items-center gap-2 text-secondary">
                <Star size={22} fill="currentColor" />
                <span className="text-2xl font-extrabold">
                  {reviewSummary?.averageRating
                    ? `${reviewSummary.averageRating}/5`
                    : "--"}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-white/70">
                {reviewSummary?.reviewCount || 0} đánh giá
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {[0, 5, 4, 3, 2, 1].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setReviewRatingFilter(rating)}
                  className={`rounded-full px-3 py-2 text-sm font-extrabold transition ${
                    reviewRatingFilter === rating
                      ? "bg-primary text-secondary"
                      : "bg-white text-primary ring-1 ring-border hover:bg-secondarySoft"
                  }`}
                >
                  {rating ? `${rating} sao` : "Tất cả"}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:w-[420px]">
              <select
                value={reviewFilterMode}
                onChange={(event) =>
                  setReviewFilterMode(
                    event.target.value as "all" | "images" | "comment" | "reply",
                  )
                }
                className="h-11 rounded-lg border border-border bg-white px-3 font-bold text-primary outline-none focus:border-secondary"
              >
                <option value="all">Tất cả đánh giá</option>
                <option value="images">Có hình ảnh</option>
                <option value="comment">Có nhận xét</option>
                <option value="reply">Đã được chủ xe phản hồi</option>
              </select>
              <select
                value={reviewSort}
                onChange={(event) =>
                  setReviewSort(
                    event.target.value as "newest" | "oldest" | "highest" | "lowest",
                  )
                }
                className="h-11 rounded-lg border border-border bg-white px-3 font-bold text-primary outline-none focus:border-secondary"
              >
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="highest">Điểm cao nhất</option>
                <option value="lowest">Điểm thấp nhất</option>
              </select>
            </div>
          </div>

          {reviewSummary?.reviews?.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {reviewSummary.reviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-xl border border-border bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <ReviewAvatar
                        name={review.reviewerName || "Khách thuê"}
                        avatar={review.reviewerAvatar}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-primary">
                          {review.reviewerName || "Khách thuê"}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-muted">
                          {review.createdAt
                            ? new Date(review.createdAt).toLocaleDateString("vi-VN")
                            : "--"}
                          {review.isEdited ? " · Đã chỉnh sửa" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-secondary">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          size={16}
                          fill={index < review.rating ? "currentColor" : "none"}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-semibold leading-6 text-slate-700">
                    {review.comment || "Khách thuê không để lại nhận xét."}
                  </p>
                  <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                    Đã thuê xe trên BQDrive
                  </div>
                  {review.criteria && Object.keys(review.criteria).length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {reviewCriteriaLabels
                        .filter((item) => review.criteria?.[item.key])
                        .map((item) => (
                          <span
                            key={item.key}
                            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-extrabold text-primary"
                          >
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            {item.label}
                          </span>
                        ))}
                    </div>
                  )}
                  {review.images?.length ? (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {review.images.slice(0, 3).map((image, index) => (
                        <img
                          key={`${image}-${index}`}
                          src={image}
                          alt={`Ảnh đánh giá ${index + 1}`}
                          className="h-20 w-full rounded-lg border border-border object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  {review.ownerReply?.content && (
                    <div className="mt-4 rounded-xl border border-secondary/30 bg-white p-3">
                      <p className="text-xs font-bold uppercase text-secondary">
                        Phản hồi từ chủ xe
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-primary">
                        {review.ownerReply.content}
                      </p>
                    </div>
                  )}
                  <div className="mt-4 border-t border-slate-200 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        void handleHelpfulToggle(
                          review.id,
                          Boolean(review.isHelpfulByMe),
                        )
                      }
                      disabled={helpfulLoadingReviewId === review.id}
                      aria-pressed={Boolean(review.isHelpfulByMe)}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-extrabold transition disabled:cursor-wait disabled:opacity-60 ${
                        review.isHelpfulByMe
                          ? "border-secondary bg-secondarySoft text-primary"
                          : "border-slate-200 bg-white text-slate-600 hover:border-secondary hover:text-primary"
                      }`}
                    >
                      <ThumbsUp
                        size={16}
                        fill={review.isHelpfulByMe ? "currentColor" : "none"}
                      />
                      Hữu ích ({review.helpfulCount || 0})
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-slate-50 p-8 text-center">
              <Star size={34} className="mx-auto text-secondary" />
              <p className="mt-3 text-lg font-extrabold text-primary">
                Xe chưa có đánh giá nào.
              </p>
              <p className="mt-1 text-sm font-semibold text-muted">
                Đánh giá sẽ xuất hiện sau khi khách thuê hoàn tất chuyến đi.
              </p>
            </div>
          )}
        </section>

        <RelatedCars currentCar={car} />
      </main>

      {isRentalPickerOpen && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/45 px-0 sm:items-center sm:px-4">
          <div className="max-h-[92vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-lg">
            <div className="flex items-center border-b border-border px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setIsRentalPickerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-primary transition hover:border-secondary hover:bg-secondarySoft/45"
                aria-label="Đóng lịch"
                title="Đóng lịch"
              >
                <X size={20} />
              </button>

              <div className="ml-4 grid flex-1 grid-cols-2 rounded-lg bg-secondarySoft/45 p-1">
                {supportedRentalModes.allowDailyRental && (
                  <button
                    type="button"
                    onClick={() => handleRentalModeChange("DAILY")}
                    className={`min-h-10 rounded-md text-sm font-extrabold transition ${
                      rentalMode === "DAILY"
                        ? "bg-white text-primary shadow-sm"
                        : "text-muted hover:text-primary"
                    }`}
                  >
                    Thuê theo ngày
                  </button>
                )}

                {supportedRentalModes.allowHourlyRental && (
                  <button
                    type="button"
                    onClick={() => handleRentalModeChange("HOURLY")}
                    className={`min-h-10 rounded-md text-sm font-extrabold transition ${
                      rentalMode === "HOURLY"
                        ? "bg-white text-primary shadow-sm"
                        : "text-muted hover:text-primary"
                    }`}
                  >
                    Thuê theo giờ
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[calc(92vh-170px)] overflow-y-auto px-4 py-5 sm:px-6">
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPickerMonth(addMonths(pickerMonth, -1))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-primary transition hover:border-secondary hover:bg-secondarySoft/45"
                  aria-label="Tháng trước"
                  title="Tháng trước"
                >
                  <ChevronLeft size={20} />
                </button>
                <p className="text-sm font-bold text-muted">
                  {isCalendarAvailabilityLoading ? "Đang tải lịch xe..." : "Lịch xe được cập nhật theo thời gian thực"}
                </p>
                <button
                  type="button"
                  onClick={() => setPickerMonth(addMonths(pickerMonth, 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-primary transition hover:border-secondary hover:bg-secondarySoft/45"
                  aria-label="Tháng sau"
                  title="Tháng sau"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                {[pickerMonth, addMonths(pickerMonth, 1)].map((monthDate) => (
                  <section key={formatDateValue(monthDate)}>
                    <h3 className="mb-4 text-center text-xl font-extrabold text-primary">
                      {formatCalendarMonth(monthDate)}
                    </h3>
                    <div className="grid grid-cols-7 text-center text-xs font-extrabold text-muted">
                      {WEEKDAY_LABELS.map((label) => (
                        <span
                          key={label}
                          className={label === "CN" ? "text-secondary" : ""}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-7 gap-y-2">
                      {getMonthDays(monthDate).map((date, index) => {
                        if (!date) {
                          return <span key={`empty-${index}`} className="h-11" />;
                        }

                        const dateValue = formatDateValue(date);
                        const isDisabled = isCalendarDateDisabled(dateValue);
                        const isBusy = isDateInsideUnavailableRange(unavailableRanges, dateValue);
                        const isFullyBusy = isDateFullyUnavailable(unavailableRanges, dateValue);
                        const isPartialBusy = isBusy && !isFullyBusy;
                        const isSelected = isCalendarDateSelected(dateValue);
                        const isInRange = isCalendarDateInRange(dateValue);
                        const isSunday = date.getDay() === 0;
                        const holidayInfo = holidayDateMap[dateValue];
                        const isHoliday = Boolean(holidayInfo);
                        const holidayTitle = getHolidayDisplayText(holidayInfo);

                        return (
                          <button
                            key={dateValue}
                            type="button"
                            aria-disabled={isDisabled}
                            aria-label={isBusy ? `${formatRentalDate(dateValue)}: ${rentalMode === "HOURLY" && isPartialBusy ? "có một số khung giờ đã được đặt" : "xe đã có lịch thuê"}` : holidayTitle || formatRentalDate(dateValue)}
                            onClick={() => handleCalendarDateClick(dateValue)}
                            className={`group relative mx-auto flex h-11 w-11 items-center justify-center rounded-lg text-sm font-extrabold transition ${
                              isSelected
                                ? "bg-secondary text-primary shadow-sm"
                                : isInRange
                                  ? "bg-secondary/15 text-primary"
                                  : isBusy && isDisabled
                                    ? "cursor-not-allowed border border-red-200 bg-red-50 text-red-700"
                                    : isPartialBusy
                                      ? "border border-red-200 bg-red-50/70 text-red-700 hover:bg-red-100"
                                      : isDisabled && isHoliday
                                        ? "cursor-not-allowed border border-secondary/50 bg-white text-slate-400"
                                      : isDisabled
                                        ? "cursor-not-allowed bg-soft text-slate-300"
                                      : isHoliday
                                        ? "border border-secondary/60 bg-white text-primary hover:bg-secondarySoft/45"
                                        : isSunday
                                          ? "text-secondary hover:bg-secondarySoft/45"
                                          : "text-primary hover:bg-secondarySoft/45"
                            }`}
                            title={
                              isBusy
                                ? rentalMode === "HOURLY" && isPartialBusy
                                  ? "Ngày này có một số khung giờ đã được đặt."
                                  : "Xe đã có lịch thuê trong thời gian này."
                                : !holidayTitle && isDisabled
                                  ? "Không thể chọn ngày này"
                                  : undefined
                            }
                          >
                            <span>{date.getDate()}</span>
                            {isPartialBusy && (
                              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
                            )}
                            {isHoliday && (
                              <>
                                <span
                                  className={`absolute bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                                    isSelected ? "bg-primary" : "bg-secondary"
                                  }`}
                                />
                                <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-56 -translate-x-1/2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-bold leading-5 text-primary shadow-xl group-hover:block">
                                  {holidayTitle}
                                </span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-3 py-3 text-xs font-bold text-muted">
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded border border-border bg-soft" />
                  Ngày đã qua
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded border border-red-200 bg-red-50" />
                  Ngày đã có lịch thuê
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded border border-secondary/60 bg-secondarySoft" />
                  Ngày lễ
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded bg-secondary" />
                  Ngày đang chọn
                </span>
              </div>

              {rentalMode === "HOURLY" && (
                <p className="mt-2 text-xs font-semibold text-muted">
                  Ngày có chấm đỏ có một số khung giờ đã được đặt; các giờ trùng lịch sẽ bị khóa bên dưới.
                </p>
              )}

              {calendarAvailabilityError && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  {calendarAvailabilityError}
                </p>
              )}

              {activeHolidayInfo && (
                <div className="mt-3 rounded-lg border border-secondary/60 bg-secondarySoft px-4 py-3 text-sm font-semibold text-primary">
                  <p className="font-extrabold">
                    {getHolidayDisplayText(activeHolidayInfo)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Ngày lễ được ưu tiên cao hơn cuối tuần và ngày thường khi tính giá.
                  </p>
                </div>
              )}

              <div className="mt-6 rounded-lg border border-border bg-white p-4">
                {rentalMode === "DAILY" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TimeWheelPicker
                      title="Nhận xe"
                      options={dailyStartTimeOptions}
                      value={startTime}
                      onChange={(value) => setStartTime(String(value))}
                    />
                    <TimeWheelPicker
                      title="Trả xe"
                      options={dailyEndTimeOptions}
                      value={endTime}
                      onChange={(value) => setEndTime(String(value))}
                    />
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <TimeWheelPicker
                      title="Giờ nhận"
                      options={hourlyStartWheelOptions}
                      value={startTime}
                      onChange={(value) => {
                        const nextStartTime = String(value);
                        const nextEnd = getHourlyRentalEnd(
                          startDate,
                          nextStartTime,
                          hourlyDuration,
                        );
                        setStartTime(nextStartTime);
                        if (nextEnd) {
                          setEndDate(nextEnd.date);
                          setEndTime(nextEnd.time);
                        }
                      }}
                    />
                    <TimeWheelPicker
                      title="Số giờ thuê"
                      options={hourlyDurationWheelOptions}
                      value={hourlyDuration}
                      onChange={(value) => {
                        const nextDuration = Number(value);
                        const nextEnd = getHourlyRentalEnd(
                          startDate,
                          startTime,
                          nextDuration,
                        );
                        setHourlyDuration(nextDuration);
                        if (nextEnd) {
                          setEndDate(nextEnd.date);
                          setEndTime(nextEnd.time);
                        }
                      }}
                    />
                    <section>
                      <h4 className="mb-3 text-center text-xl font-extrabold text-primary">
                        Giờ trả
                      </h4>
                      <div className="relative overflow-hidden rounded-lg bg-white">
                        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-14 -translate-y-1/2 rounded-lg bg-secondarySoft/45" />
                        <div className="relative z-10 flex h-44 items-center justify-center text-lg font-extrabold text-secondary">
                          {endTime}
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </div>

              <div className="hidden">
                {rentalMode === "DAILY" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase text-muted">
                        Nhận xe
                      </span>
                      <span className="relative flex min-h-12 items-center rounded-lg border border-border bg-white shadow-sm transition focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
                        <Clock size={17} className="pointer-events-none ml-3 shrink-0 text-secondary" />
                        <select
                          value={startTime}
                          onChange={(event) => setStartTime(event.target.value)}
                          className="min-h-12 w-full appearance-none bg-transparent px-3 pr-10 text-sm font-extrabold text-primary outline-none"
                        >
                          {TIME_OPTIONS.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={18}
                          className="pointer-events-none absolute right-3 text-primary"
                        />
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase text-muted">
                        Trả xe
                      </span>
                      <span className="relative flex min-h-12 items-center rounded-lg border border-border bg-white shadow-sm transition focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
                        <Clock size={17} className="pointer-events-none ml-3 shrink-0 text-secondary" />
                        <select
                          value={endTime}
                          onChange={(event) => setEndTime(event.target.value)}
                          className="min-h-12 w-full appearance-none bg-transparent px-3 pr-10 text-sm font-extrabold text-primary outline-none"
                        >
                          {TIME_OPTIONS.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={18}
                          className="pointer-events-none absolute right-3 text-primary"
                        />
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase text-muted">
                        Giờ nhận
                      </span>
                      <span className="relative flex min-h-12 items-center rounded-lg border border-border bg-white shadow-sm transition focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
                        <Clock size={17} className="pointer-events-none ml-3 shrink-0 text-secondary" />
                        <select
                          value={startTime}
                          onChange={(event) => {
                            const nextStartTime = event.target.value;
                            const nextEnd = getHourlyRentalEnd(
                              startDate,
                              nextStartTime,
                              hourlyDuration,
                            );
                            setStartTime(nextStartTime);
                            if (nextEnd) {
                              setEndDate(nextEnd.date);
                              setEndTime(nextEnd.time);
                            }
                          }}
                          className="min-h-12 w-full appearance-none bg-transparent px-3 pr-10 text-sm font-extrabold text-primary outline-none"
                        >
                          {hourlyStartTimeOptions.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={18}
                          className="pointer-events-none absolute right-3 text-primary"
                        />
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase text-muted">
                        Số giờ thuê
                      </span>
                      <span className="relative flex min-h-12 items-center rounded-lg border border-border bg-white shadow-sm transition focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
                        <Clock size={17} className="pointer-events-none ml-3 shrink-0 text-secondary" />
                        <select
                          value={hourlyDuration}
                          onChange={(event) => {
                            const nextDuration = Number(event.target.value);
                            const nextEnd = getHourlyRentalEnd(
                              startDate,
                              startTime,
                              nextDuration,
                            );
                            setHourlyDuration(nextDuration);
                            if (nextEnd) {
                              setEndDate(nextEnd.date);
                              setEndTime(nextEnd.time);
                            }
                          }}
                          className="min-h-12 w-full appearance-none bg-transparent px-3 pr-10 text-sm font-extrabold text-primary outline-none"
                        >
                          {HOURLY_DURATION_OPTIONS.map((duration) => (
                            <option key={duration} value={duration}>
                              {duration} giờ
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={18}
                          className="pointer-events-none absolute right-3 text-primary"
                        />
                      </span>
                    </label>

                    <div>
                      <span className="mb-1 block text-xs font-bold uppercase text-muted">
                        Giờ trả
                      </span>
                      <div className="flex min-h-12 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-extrabold text-primary shadow-sm">
                        <Clock size={17} className="shrink-0 text-secondary" />
                        {endTime}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border bg-white px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold text-primary">
                    {rentalPickerSummary}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-muted">
                    {rentalMode === "HOURLY"
                      ? `Chọn ngày nhận và thời lượng từ ${HOURLY_RENTAL_MIN_HOURS} đến ${HOURLY_RENTAL_MAX_HOURS} giờ.`
                      : "Chọn ngày nhận và ngày trả, sau đó chọn giờ bằng dropdown."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveRentalPicker}
                  disabled={!canSaveRentalPicker}
                  className={`min-h-12 rounded-lg px-8 font-extrabold transition ${
                    canSaveRentalPicker
                      ? "bg-secondary text-primary hover:brightness-95"
                      : "cursor-not-allowed bg-slate-300 text-white"
                  }`}
                >
                  Lưu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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















