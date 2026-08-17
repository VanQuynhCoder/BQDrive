// Thành phần hiển thị hiệu quả hoạt động của xe ký gửi.
import {
  Activity,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Star,
  WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  OwnerCarPerformanceRange,
  OwnerCarPerformanceResponse,
} from "../../types/ownerCarPerformance";

type OwnerCarPerformancePanelProps = {
  carId: string;
  enabled: boolean;
  loadPerformance: (
    carId: string,
    range: OwnerCarPerformanceRange,
  ) => Promise<OwnerCarPerformanceResponse>;
};

const RANGE_OPTIONS: Array<{
  value: OwnerCarPerformanceRange;
  label: string;
}> = [
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày" },
  { value: "this_month", label: "Tháng này" },
  { value: "all", label: "Toàn thời gian" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
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

  return "Không thể tổng hợp hiệu quả của xe.";
}

function MetricCard({
  label,
  value,
  icon,
  emphasis = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <article
      className={`min-w-0 rounded-lg border p-4 ${
        emphasis
          ? "border-primary bg-primary text-white"
          : "border-slate-200 bg-white text-primary"
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          emphasis
            ? "bg-white/10 text-secondary"
            : "bg-amber-50 text-secondary"
        }`}
      >
        {icon}
      </div>
      <p
        className={`mt-4 text-xs font-extrabold uppercase ${
          emphasis ? "text-white/65" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 break-words text-xl font-extrabold ${
          emphasis ? "text-secondary" : "text-primary"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function DataRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${
        strong ? "border-t border-slate-200 pt-4" : ""
      }`}
    >
      <dt className="text-sm font-semibold text-slate-500">{label}</dt>
      <dd
        className={`text-right font-extrabold ${
          strong ? "text-lg text-primary" : "text-primary"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function OwnerCarPerformancePanel({
  carId,
  enabled,
  loadPerformance,
}: OwnerCarPerformancePanelProps) {
  const [range, setRange] =
    useState<OwnerCarPerformanceRange>("this_month");
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<OwnerCarPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const currentRequestRef = useRef("");

  useEffect(() => {
    if (!enabled) return;

    const requestKey = `${carId}:${range}:${reloadKey}`;
    if (currentRequestRef.current === requestKey) return;
    currentRequestRef.current = requestKey;
    setLoading(true);
    setError("");

    loadPerformance(carId, range)
      .then((response) => {
        if (currentRequestRef.current !== requestKey) return;
        setData(response);
      })
      .catch((requestError: unknown) => {
        if (currentRequestRef.current !== requestKey) return;
        setData(null);
        setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (currentRequestRef.current === requestKey) {
          setLoading(false);
        }
      });
  }, [carId, enabled, loadPerformance, range, reloadKey]);

  const rangeLabel = data?.range.startDate
    ? `${formatDate(data.range.startDate)} - ${formatDate(data.range.endDate)}`
    : "Toàn bộ dữ liệu";

  return (
    <div
      className={
        enabled
          ? "min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6"
          : "hidden"
      }
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase text-secondary">
            Hiệu quả theo từng xe
          </p>
          <h4 className="mt-1 text-xl font-extrabold text-primary">
            Vận hành và tài chính thực tế
          </h4>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Chỉ tổng hợp giao dịch đã ghi nhận và dữ liệu thuộc riêng xe này.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-white p-1 sm:flex"
            aria-label="Khoảng thời gian thống kê"
          >
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  if (option.value === range) return;
                  setData(null);
                  setRange(option.value);
                }}
                className={`min-h-10 rounded-md px-3 text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-secondary ${
                  range === option.value
                    ? "bg-primary text-secondary"
                    : "text-slate-600 hover:bg-slate-100 hover:text-primary"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Tải lại hiệu quả xe"
            title="Tải lại"
            disabled={loading}
            onClick={() => setReloadKey((value) => value + 1)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-lg border border-slate-200 bg-white text-primary transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="mt-6 flex min-h-56 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center text-sm font-bold text-slate-500">
          <RefreshCw size={18} className="mr-2 animate-spin text-secondary" />
          Đang tổng hợp hiệu quả của xe...
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-center">
          <p className="font-bold text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2 font-extrabold text-secondary"
          >
            Thử lại
          </button>
        </div>
      )}

      {!error && data && (
        <div className={loading ? "opacity-60" : ""}>
          <div className="mt-4 text-sm font-semibold text-slate-500">
            Khoảng thống kê:{" "}
            <span className="font-extrabold text-primary">{rangeLabel}</span>
          </div>

          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="Chuyến hoàn thành"
              value={data.operations.completedTrips}
              icon={<CheckCircle2 size={20} />}
            />
            <MetricCard
              label="Đang vận hành"
              value={data.operations.activeTrips}
              icon={<Activity size={20} />}
            />
            <MetricCard
              label="Lịch sắp tới"
              value={data.operations.upcomingBookings}
              icon={<CalendarClock size={20} />}
            />
            <MetricCard
              label="Tổng thực thu"
              value={formatCurrency(data.finance.netCollected)}
              icon={<Banknote size={20} />}
              emphasis
            />
            <MetricCard
              label="Đang chờ thu"
              value={formatCurrency(data.finance.pendingCollection)}
              icon={<WalletCards size={20} />}
            />
            <MetricCard
              label="Lượt đánh giá"
              value={data.reviews.reviewCount}
              icon={<Star size={20} />}
            />
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-secondary">
                  <Banknote size={20} />
                </div>
                <div>
                  <h5 className="font-extrabold text-primary">
                    Tài chính của xe
                  </h5>
                  <p className="text-xs font-semibold text-slate-500">
                    Các khoản đã thu và đã hoàn trong kỳ.
                  </p>
                </div>
              </div>

              <dl className="mt-4">
                <DataRow
                  label="Tiền thuê đã thu"
                  value={formatCurrency(data.finance.rentalRevenue)}
                />
                <DataRow
                  label="Phụ phí đã thu"
                  value={formatCurrency(data.finance.extraChargeCollected)}
                />
                <DataRow
                  label="Tiền đã hoàn"
                  value={formatCurrency(data.finance.refundedAmount)}
                />
                <DataRow
                  label="Tổng thực thu"
                  value={formatCurrency(data.finance.netCollected)}
                  strong
                />
                <DataRow
                  label="Đang chờ thu"
                  value={formatCurrency(data.finance.pendingCollection)}
                />
              </dl>

              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                Tổng thực thu = Tiền thuê + Phụ phí - Hoàn tiền.
              </p>
              {data.finance.netCollected < 0 && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                  Tổng thực thu âm vì khoản hoàn tiền trong kỳ lớn hơn số tiền
                  đã thu trong cùng khoảng thời gian.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-secondary">
                  <Clock3 size={20} />
                </div>
                <div>
                  <h5 className="font-extrabold text-primary">
                    Hiệu quả vận hành
                  </h5>
                  <p className="text-xs font-semibold text-slate-500">
                    Booking được phân loại theo trạng thái hiện tại.
                  </p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <DataRow
                  label="Tổng booking"
                  value={data.operations.totalBookings}
                />
                <DataRow
                  label="Hoàn thành"
                  value={data.operations.completedTrips}
                />
                <DataRow
                  label="Đang diễn ra"
                  value={data.operations.activeTrips}
                />
                <DataRow
                  label="Sắp tới"
                  value={data.operations.upcomingBookings}
                />
                <DataRow
                  label="Đã hủy"
                  value={data.operations.cancelledBookings}
                />
                <DataRow
                  label="Bị từ chối"
                  value={data.operations.rejectedBookings}
                />
                <DataRow
                  label="Không nhận xe"
                  value={data.operations.noShowBookings}
                />
              </dl>
            </section>
          </div>

          <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase text-secondary">
                  Đánh giá
                </p>
                <h5 className="mt-1 font-extrabold text-primary">
                  Phản hồi gần đây
                </h5>
              </div>
              {data.reviews.reviewCount > 0 && (
                <div className="flex items-center gap-2 text-primary">
                  <Star
                    size={20}
                    className="fill-secondary text-secondary"
                  />
                  <span className="text-xl font-extrabold">
                    {data.reviews.averageRating}/5
                  </span>
                  <span className="text-sm font-semibold text-slate-500">
                    ({data.reviews.reviewCount} lượt)
                  </span>
                </div>
              )}
            </div>

            {data.reviews.reviewCount === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center font-semibold text-slate-500">
                Xe chưa có đánh giá nào.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {data.reviews.recentReviews.map((review) => (
                  <article
                    key={review._id}
                    className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-primary">
                          {review.reviewerName}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {formatDate(review.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 font-extrabold text-primary">
                        <Star
                          size={16}
                          className="fill-secondary text-secondary"
                        />
                        {review.rating}/5
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-4 text-sm font-semibold leading-6 text-slate-600">
                      {review.comment || "Khách thuê không để lại nhận xét."}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
