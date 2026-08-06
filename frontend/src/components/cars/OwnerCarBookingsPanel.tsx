// Shared owner UI: per-car bookings for BUSINESS and USER consignment management.
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Truck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  GetOwnerCarBookingsParams,
  OwnerCarBookingGroup,
  OwnerCarBookingItem,
  OwnerCarBookingsResponse,
} from "../../types/ownerCarBooking";
import { getBookingStatusLabel } from "../../utils/display.util";

type OwnerCarBookingsPanelProps = {
  carId: string;
  enabled: boolean;
  loadBookings: (
    carId: string,
    params: GetOwnerCarBookingsParams,
  ) => Promise<OwnerCarBookingsResponse>;
  onOpenBooking: (bookingId: string) => void;
};

const GROUP_OPTIONS: Array<{
  value: OwnerCarBookingGroup;
  label: string;
  summaryKey: "all" | "active" | "upcoming" | "completed" | "cancelled";
  emptyText: string;
}> = [
  {
    value: "ALL",
    label: "Tất cả",
    summaryKey: "all",
    emptyText: "Xe chưa có booking nào.",
  },
  {
    value: "ACTIVE",
    label: "Đang diễn ra",
    summaryKey: "active",
    emptyText: "Xe không có chuyến đang diễn ra.",
  },
  {
    value: "UPCOMING",
    label: "Sắp tới",
    summaryKey: "upcoming",
    emptyText: "Xe chưa có lịch thuê sắp tới.",
  },
  {
    value: "HISTORY",
    label: "Hoàn thành",
    summaryKey: "completed",
    emptyText: "Xe chưa có chuyến hoàn thành.",
  },
  {
    value: "CANCELLED",
    label: "Đã hủy",
    summaryKey: "cancelled",
    emptyText: "Xe không có booking đã hủy.",
  },
];

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--"
    : date.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return "Không thể tải lịch thuê của xe.";
}

function getStatusClass(status: string) {
  if (
    ["IN_PROGRESS", "RETURN_INSPECTION", "AWAITING_EXTRA_CHARGE"].includes(
      status,
    )
  ) {
    return "bg-primary text-secondary";
  }

  if (status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (["CANCELLED", "REJECTED", "NO_SHOW"].includes(status)) {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }

  return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
}

function BookingRow({
  booking,
  onOpen,
}: {
  booking: OwnerCarBookingItem;
  onOpen: () => void;
}) {
  const isDelivery =
    booking.delivery?.deliveryType === "DELIVERY_TO_CUSTOMER";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[150px_minmax(160px,1fr)_minmax(230px,1.25fr)_minmax(180px,1fr)_140px] xl:items-center">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">
            Mã booking
          </p>
          <p className="mt-1 font-extrabold text-primary">
            {booking.bookingCode}
          </p>
          <span
            className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${getStatusClass(
              booking.status,
            )}`}
          >
            {getBookingStatusLabel(booking.status)}
          </span>
        </div>

        <div>
          <p className="text-xs font-bold uppercase text-slate-400">
            Khách thuê
          </p>
          <p className="mt-1 font-extrabold text-primary">
            {booking.renter?.name || "Khách thuê"}
          </p>
          {booking.renter?.email && (
            <p className="mt-1 break-all text-xs font-semibold text-slate-500">
              {booking.renter.email}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-400">
              Nhận xe
            </p>
            <p className="mt-1 text-sm font-extrabold text-primary">
              {formatDateTime(booking.startDate)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-400">
              Trả xe
            </p>
            <p className="mt-1 text-sm font-extrabold text-primary">
              {formatDateTime(booking.endDate)}
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-start gap-2 text-sm">
            <Truck size={17} className="mt-0.5 shrink-0 text-secondary" />
            <div>
              <p className="font-extrabold text-primary">
                {isDelivery ? "Giao xe tận nơi" : "Nhận tại vị trí xe"}
              </p>
              {(booking.delivery?.address ||
                booking.pickupAddressSnapshot) && (
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">
                  {booking.delivery?.address ||
                    booking.pickupAddressSnapshot}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-slate-400">Tổng</p>
              <p className="mt-1 font-extrabold text-primary">
                {formatCurrency(booking.totalPrice)}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Đã trả</p>
              <p className="mt-1 font-extrabold text-emerald-700">
                {formatCurrency(booking.paidAmount)}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Còn lại</p>
              <p className="mt-1 font-extrabold text-amber-700">
                {formatCurrency(booking.remainingAmount)}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 font-extrabold text-primary transition hover:bg-secondaryLight focus:outline-none focus:ring-4 focus:ring-secondary/30"
        >
          Xem booking
          <ExternalLink size={17} />
        </button>
      </div>
    </article>
  );
}

export default function OwnerCarBookingsPanel({
  carId,
  enabled,
  loadBookings,
  onOpenBooking,
}: OwnerCarBookingsPanelProps) {
  const [group, setGroup] = useState<OwnerCarBookingGroup>("ALL");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<OwnerCarBookingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadedRequestRef = useRef("");

  useEffect(() => {
    if (!enabled) return;

    const requestKey = `${carId}:${group}:${page}:${reloadKey}`;
    if (loadedRequestRef.current === requestKey) return;
    loadedRequestRef.current = requestKey;

    let active = true;

    loadBookings(carId, { group, page, limit: 10 })
      .then((response) => {
        if (active) setData(response);
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [carId, enabled, group, loadBookings, page, reloadKey]);

  const currentGroup =
    GROUP_OPTIONS.find((option) => option.value === group) || GROUP_OPTIONS[0];
  const pagination = data?.pagination;

  return (
    <div
      className={
        enabled
          ? "min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
          : "hidden"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase text-secondary">
            Lịch vận hành
          </p>
          <h4 className="mt-1 text-xl font-extrabold text-primary">
            Booking của xe
          </h4>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Theo dõi chuyến đang thuê, lịch sắp tới và lịch sử của riêng xe này.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError("");
            setReloadKey((value) => value + 1);
          }}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-primary transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          Tải lại
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
        {GROUP_OPTIONS.map((option) => {
          const active = group === option.value;
          const count = data?.summary?.[option.summaryKey] ?? 0;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (option.value === group) return;
                setLoading(true);
                setError("");
                setData(null);
                setGroup(option.value);
                setPage(1);
              }}
              className={`min-h-16 rounded-lg border px-3 py-2 text-left transition focus:outline-none focus:ring-4 focus:ring-secondary/20 ${
                active
                  ? "border-primary bg-primary text-white shadow-md"
                  : "border-slate-200 bg-white text-primary hover:border-secondary hover:bg-amber-50"
              }`}
            >
              <span className="block text-xs font-bold">{option.label}</span>
              <span
                className={`mt-1 block text-xl font-extrabold ${
                  active ? "text-secondary" : "text-primary"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading && !data && (
        <div className="mt-6 flex min-h-52 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500">
          <RefreshCw size={18} className="mr-2 animate-spin text-secondary" />
          Đang tải lịch thuê của xe...
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-center">
          <p className="font-bold text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError("");
              setReloadKey((value) => value + 1);
            }}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2 font-extrabold text-secondary"
          >
            Thử lại
          </button>
        </div>
      )}

      {!error && !loading && data?.bookings.length === 0 && (
        <div className="mt-6 flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
          <CalendarDays size={34} className="text-secondary" />
          <p className="mt-3 font-extrabold text-primary">
            {currentGroup.emptyText}
          </p>
        </div>
      )}

      {!error && data && data.bookings.length > 0 && (
        <div className={`mt-6 space-y-3 ${loading ? "opacity-60" : ""}`}>
          {data.bookings.map((booking) => (
            <BookingRow
              key={booking._id}
              booking={booking}
              onOpen={() => onOpenBooking(booking._id)}
            />
          ))}
        </div>
      )}

      {!error && pagination && pagination.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Trang lịch thuê trước"
            disabled={loading || pagination.page <= 1}
            onClick={() => {
              setLoading(true);
              setError("");
              setPage((value) => Math.max(value - 1, 1));
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-primary transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="min-w-24 text-center text-sm font-extrabold text-primary">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            aria-label="Trang lịch thuê tiếp theo"
            disabled={
              loading || pagination.page >= pagination.totalPages
            }
            onClick={() => {
              setLoading(true);
              setError("");
              setPage((value) =>
                Math.min(value + 1, pagination.totalPages),
              );
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-primary transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
