// Thành phần thống kê đánh giá dùng trong bảng điều khiển.
import { Link } from "react-router-dom";
import {
  type LucideIcon,
  MessageSquareText,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { RatedCar } from "../../services/admin.service";
import { getFirstCarImage } from "../../utils/image.util";

type ReviewSectionConfig = {
  title: string;
  subtitle: string;
  emptyText: string;
};

type DashboardReviewSectionsProps = {
  topRatedCars?: RatedCar[];
  lowRatedCars?: RatedCar[];
  mostReviewedCars?: RatedCar[];
  labels?: {
    top?: ReviewSectionConfig;
    low?: ReviewSectionConfig;
    most?: ReviewSectionConfig;
  };
};

const defaultLabels = {
  top: {
    title: "Xe được đánh giá cao",
    subtitle: "Các xe đạt điểm trung bình từ 4,0/5 trở lên.",
    emptyText: "Chưa có xe nào đạt từ 4,0/5 trở lên.",
  },
  low: {
    title: "Xe cần cải thiện đánh giá",
    subtitle: "Các xe có điểm trung bình dưới 3,5/5.",
    emptyText: "Không có xe nào dưới 3,5/5.",
  },
  most: {
    title: "Xe được đánh giá nhiều nhất",
    subtitle: "Các xe có nhiều phản hồi từ khách thuê.",
    emptyText: "Chưa có lượt đánh giá nào.",
  },
};

function formatRating(value?: number) {
  return Number(value || 0).toFixed(1);
}

const HIGH_RATING_THRESHOLD = 4;
const IMPROVEMENT_RATING_THRESHOLD = 3.5;

function ReviewList({
  cars,
  config,
  icon: Icon,
  scrollable = false,
}: {
  cars: RatedCar[];
  config: ReviewSectionConfig;
  icon: LucideIcon;
  scrollable?: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary">
          <Icon size={22} />
        </div>
        <div>
          <h3 className="text-lg font-extrabold text-primary">
            {config.title}
          </h3>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {config.subtitle}
          </p>
        </div>
      </div>

      <div
        className={`mt-5 space-y-3 ${
          scrollable && cars.length > 0
            ? "max-h-[300px] overflow-y-auto overscroll-contain pr-2 [scrollbar-color:#eab308_#f1f5f9] [scrollbar-width:thin]"
            : ""
        }`}
      >
        {cars.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
            {config.emptyText}
          </div>
        ) : (
          cars.slice(0, 5).map((car, index) => (
            <Link
              key={car.carId}
              to={`/cars/${car.carId}`}
              className="group flex gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-secondary hover:shadow-sm"
            >
              <img
                src={getFirstCarImage(car.image ? [car.image] : [])}
                alt={car.carName}
                className="h-16 w-20 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-primary">
                      {index + 1}. {car.carName}
                    </p>
                    <p className="truncate text-xs font-bold text-slate-400">
                      {car.licensePlate || "Chưa cập nhật biển số"}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-secondarySoft px-2 py-1 text-xs font-extrabold text-primary">
                    <Star size={13} className="fill-secondary text-secondary" />
                    {formatRating(car.averageRating)}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                  <span>{car.ownerName || "Chủ xe"}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquareText size={13} className="text-secondary" />
                    {car.reviewCount} đánh giá
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

export default function DashboardReviewSections({
  topRatedCars = [],
  lowRatedCars = [],
  mostReviewedCars = [],
  labels,
}: DashboardReviewSectionsProps) {
  const filteredTopRatedCars = topRatedCars.filter(
    (car) =>
      car.reviewCount > 0 && car.averageRating >= HIGH_RATING_THRESHOLD,
  );
  const filteredLowRatedCars = lowRatedCars.filter(
    (car) =>
      car.reviewCount > 0 &&
      car.averageRating < IMPROVEMENT_RATING_THRESHOLD,
  );
  const filteredMostReviewedCars = mostReviewedCars.filter(
    (car) => car.reviewCount > 0,
  );
  const mergedLabels = {
    top: labels?.top || defaultLabels.top,
    low: labels?.low || defaultLabels.low,
    most: labels?.most || defaultLabels.most,
  };

  return (
    <section className="grid gap-6 xl:grid-cols-3">
      <ReviewList
        cars={filteredTopRatedCars}
        config={mergedLabels.top}
        icon={TrendingUp}
      />
      <ReviewList
        cars={filteredLowRatedCars}
        config={mergedLabels.low}
        icon={TrendingDown}
      />
      <ReviewList
        cars={filteredMostReviewedCars}
        config={mergedLabels.most}
        icon={MessageSquareText}
        scrollable
      />
    </section>
  );
}
