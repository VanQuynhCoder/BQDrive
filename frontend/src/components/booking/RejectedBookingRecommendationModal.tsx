import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CarFront, Clock3, MapPin, Star, X } from "lucide-react";
import { io } from "socket.io-client";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  bookingService,
  type RejectedBookingRecommendation,
} from "../../services/booking.service";
import { authService } from "../../services/auth.service";
import { getFirstCarImage } from "../../utils/image.util";
import { formatVietnamDateTime } from "../../utils/date.util";

const SHOWN_STORAGE_PREFIX = "bqdrive.rejected-recommendation-shown:";
const MODAL_DURATION_MS = 60_000;

function getSocketOrigin() {
  const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();

  try {
    return new URL(configuredApiUrl, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

function formatCurrency(value: number) {
  return `${Math.round(value || 0).toLocaleString("vi-VN")}đ`;
}

function formatDateTime(value: string) {
  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getCarLabel(value?: string) {
  const labels: Record<string, string> = {
    AUTOMATIC: "Số tự động",
    MANUAL: "Số sàn",
    GASOLINE: "Xăng",
    DIESEL: "Dầu diesel",
    ELECTRIC: "Điện",
    HYBRID: "Hybrid",
  };

  return labels[value || ""] || value || "--";
}

function isCustomerPath(pathname: string) {
  return ![
    "/admin",
    "/consignment",
    "/owner",
    "/private-owner",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

type RejectionNotification = {
  type?: string;
  bookingId?: string;
  metadata?: Record<string, unknown>;
};

export default function RejectedBookingRecommendationModal() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = authService.getCurrentUser();
  const isCustomer = user?.role === "USER" && isCustomerPath(location.pathname);
  const [recommendation, setRecommendation] =
    useState<RejectedBookingRecommendation | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const requestedBookingRef = useRef("");
  const handledQueryRef = useRef("");

  const queryBookingId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("recommendation") === "1"
      ? location.pathname.match(/^\/bookings\/([^/]+)$/)?.[1] || ""
      : "";
  }, [location.pathname, location.search]);

  const closeModal = useCallback(() => {
    setRecommendation(null);
    setExpiresAt(0);
  }, []);

  const openForBooking = useCallback(
    async (bookingId: string, automatic: boolean) => {
      if (!isCustomer || !bookingId || requestedBookingRef.current === bookingId) {
        return;
      }

      if (
        automatic &&
        sessionStorage.getItem(`${SHOWN_STORAGE_PREFIX}${bookingId}`) === "1"
      ) {
        return;
      }

      requestedBookingRef.current = bookingId;
      try {
        const result = await bookingService.getRecommendedCar(bookingId);
        if (!result) {
          if (!automatic) {
            toast("Hiện chưa có xe tương tự còn phù hợp trong thời gian này.", {
              icon: "🚗",
            });
          }
          return;
        }

        if (automatic) {
          sessionStorage.setItem(`${SHOWN_STORAGE_PREFIX}${bookingId}`, "1");
        }
        setRecommendation(result);
        setNow(Date.now());
        setExpiresAt(Date.now() + MODAL_DURATION_MS);
      } catch {
        if (!automatic) {
          toast.error("Không thể tải gợi ý xe lúc này. Vui lòng thử lại sau.");
        }
      } finally {
        requestedBookingRef.current = "";
      }
    },
    [isCustomer],
  );

  useEffect(() => {
    if (!isCustomer) return;

    const token = authService.getToken();
    if (!token) return;

    const socket = io(`${getSocketOrigin()}/notifications`, {
      auth: { token },
    });
    const handleRejected = (payload: { notification?: RejectionNotification }) => {
      const notification = payload?.notification;
      if (notification?.type !== "BOOKING_REJECTED" || !notification.bookingId) {
        return;
      }

      void openForBooking(notification.bookingId, true);
    };

    socket.on("booking_rejected", handleRejected);

    return () => {
      socket.off("booking_rejected", handleRejected);
      socket.disconnect();
    };
  }, [isCustomer, openForBooking]);

  useEffect(() => {
    if (!isCustomer || !queryBookingId || handledQueryRef.current === queryBookingId) {
      return;
    }

    handledQueryRef.current = queryBookingId;
    void openForBooking(queryBookingId, false);
  }, [isCustomer, openForBooking, queryBookingId]);

  useEffect(() => {
    if (!expiresAt) return;

    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= expiresAt) {
        setRecommendation(null);
        setExpiresAt(0);
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (!recommendation || !isCustomer) return null;

  const remainingSeconds = Math.max(
    0,
    Math.ceil((expiresAt - now) / 1000),
  );
  const remainingPercent = Math.max(
    0,
    Math.min(100, ((expiresAt - now) / MODAL_DURATION_MS) * 100),
  );
  const timerIsUrgent = remainingSeconds <= 15;
  const car = recommendation.car;
  const detailQuery = new URLSearchParams({
    startDate: recommendation.startDate,
    endDate: recommendation.endDate,
    rentalMode: recommendation.rentalMode,
  });

  const goToDetail = () => {
    closeModal();
    navigate(`/cars/${car._id}?${detailQuery.toString()}`);
  };

  const startNewBooking = () => {
    closeModal();
    navigate("/booking-request", {
      state: {
        source: "direct",
        car: {
          _id: car._id,
          name: car.name,
          images: car.images,
          seats: car.seats,
          transmission: car.transmission,
          fuelType: car.fuelType,
          pickupLat: car.pickupLat,
          pickupLng: car.pickupLng,
          pickupAddress: car.pickupLocation,
          deliveryEnabled: car.deliveryEnabled,
        },
        bookingData: {
          carId: car._id,
          startDate: recommendation.startDate,
          endDate: recommendation.endDate,
          rentalMode: recommendation.rentalMode,
          paymentOption: "DEPOSIT",
        },
        totalPrice: recommendation.estimatedTotal,
      },
    });
  };

  const showMoreCars = () => {
    closeModal();
    navigate(`/cars/search?${detailQuery.toString()}&seats=${car.seats}`);
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="rejected-booking-recommendation-title"
        className="relative max-h-[calc(100vh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-[2rem] border-2 border-white/90 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.32)] ring-1 ring-primary/10 sm:max-h-[calc(100vh-3rem)]"
      >
        <button
          type="button"
          aria-label="Đóng gợi ý xe"
          title="Đóng"
          onClick={closeModal}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-primary"
        >
          <X size={21} />
        </button>

        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="relative min-h-64 bg-slate-100 md:min-h-full">
            <img
              src={getFirstCarImage(car.images)}
              alt={car.name}
              className="h-full min-h-64 w-full object-cover md:absolute md:inset-0"
            />
            <div className="absolute left-4 top-4 rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold text-secondary">
              Gợi ý từ BQDrive
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-secondaryDark">
              Booking của bạn chưa được chủ xe chấp nhận
            </p>
            <h2
              id="rejected-booking-recommendation-title"
              className="mt-2 pr-10 text-2xl font-extrabold text-primary sm:text-3xl"
            >
              BQDrive gợi ý một lựa chọn tương tự
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              Đây chỉ là gợi ý tham khảo, không giữ xe và không tạo booking mới.
            </p>

            <div
              className={`mt-5 rounded-2xl border p-4 transition-colors ${
                timerIsUrgent
                  ? "border-red-200 bg-red-50"
                  : "border-secondary/60 bg-secondarySoft/45"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      timerIsUrgent
                        ? "bg-red-100 text-red-700"
                        : "bg-secondary text-primary"
                    }`}
                  >
                    <Clock3 size={21} />
                  </span>
                  <div>
                    <p
                      className={`text-xs font-extrabold uppercase tracking-[0.08em] ${
                        timerIsUrgent ? "text-red-700" : "text-secondaryDark"
                      }`}
                    >
                      Thời gian giữ gợi ý
                    </p>
                    <p className="mt-1 text-sm font-bold text-primary">
                      Hãy xem và quyết định trước khi hết thời gian
                    </p>
                  </div>
                </div>
                <div
                  className={`shrink-0 text-right ${
                    timerIsUrgent ? "text-red-700" : "text-primary"
                  }`}
                >
                  <p className="text-3xl font-black tabular-nums leading-none sm:text-4xl">
                    00:{String(remainingSeconds).padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-[11px] font-extrabold uppercase tracking-wide opacity-70">
                    còn lại
                  </p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-black/5">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    timerIsUrgent ? "bg-red-500" : "bg-secondary"
                  }`}
                  style={{ width: `${remainingPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  {car.brand?.name || "Xe ký gửi"}
                </p>
                <h3 className="mt-1 text-2xl font-extrabold text-primary">
                  {car.name}
                </h3>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-secondarySoft px-3 py-1.5 text-sm font-extrabold text-primary">
                <Star size={16} className="fill-secondary text-secondaryDark" />
                {recommendation.reviewSummary.averageRating > 0
                  ? recommendation.reviewSummary.averageRating.toFixed(1)
                  : "Mới"}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 text-sm font-bold text-slate-600 sm:grid-cols-4">
              <span className="rounded-xl bg-slate-50 px-3 py-2">{car.seats} chỗ</span>
              <span className="rounded-xl bg-slate-50 px-3 py-2">{getCarLabel(car.transmission)}</span>
              <span className="rounded-xl bg-slate-50 px-3 py-2">{getCarLabel(car.fuelType)}</span>
              <span className="rounded-xl bg-slate-50 px-3 py-2">{recommendation.rentalMode === "HOURLY" ? "Theo giờ" : "Theo ngày"}</span>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-secondary/30 bg-secondarySoft/30 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Giá cơ bản</p>
                <p className="mt-1 text-lg font-extrabold text-primary">
                  {formatCurrency(car.pricing.basePricePerUnit)}/{recommendation.rentalMode === "HOURLY" ? "giờ" : "ngày"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Tổng tiền thuê dự kiến</p>
                <p className="mt-1 text-lg font-extrabold text-primary">
                  {formatCurrency(recommendation.estimatedTotal)}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm font-semibold text-slate-600">
              <p className="flex items-start gap-2 rounded-xl border border-secondary/60 bg-secondarySoft/45 px-3 py-3 text-primary">
                <Clock3 size={18} className="mt-0.5 shrink-0 text-secondaryDark" />
                <span className="font-extrabold text-primary">
                  {formatDateTime(recommendation.startDate)} → {formatDateTime(recommendation.endDate)}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <MapPin size={18} className="mt-0.5 shrink-0 text-secondaryDark" />
                <span>{car.pickupLocation || "Địa điểm nhận xe theo thông tin xe"}</span>
              </p>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={goToDetail}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary px-4 py-3 font-extrabold text-primary transition hover:bg-slate-50"
              >
                Xem chi tiết
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                onClick={startNewBooking}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 font-extrabold text-primary transition hover:brightness-95"
              >
                <CarFront size={18} />
                Đặt xe này
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-extrabold">
              <button
                type="button"
                onClick={showMoreCars}
                className="text-primary underline decoration-secondary decoration-2 underline-offset-4 transition hover:text-secondaryDark"
              >
                Xem thêm xe tương tự
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-500 transition hover:text-primary"
              >
                Bỏ qua
              </button>
            </div>

            <p className="mt-5 text-center text-xs font-extrabold text-secondaryDark">
              Popup sẽ tự đóng khi đồng hồ về 00:00
            </p>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
