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
    subtitle: "Sắp xếp theo điểm trung bình tốt nhất.",
    emptyText: "Chưa có xe nào đủ dữ liệu đánh giá.",
  },
  low: {
    title: "Xe cần cải thiện đánh giá",
    subtitle: "Các xe có điểm trung bình thấp hơn để chủ xe theo dõi.",
    emptyText: "Chưa có dữ liệu đánh giá thấp.",
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

function ReviewList({
  cars,
  config,
  icon: Icon,
}: {
  cars: RatedCar[];
  config: ReviewSectionConfig;
  icon: LucideIcon;
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

      <div className="mt-5 space-y-3">
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
  const mergedLabels = {
    top: labels?.top || defaultLabels.top,
    low: labels?.low || defaultLabels.low,
    most: labels?.most || defaultLabels.most,
  };

  return (
    <section className="grid gap-6 xl:grid-cols-3">
      <ReviewList
        cars={topRatedCars}
        config={mergedLabels.top}
        icon={TrendingUp}
      />
      <ReviewList
        cars={lowRatedCars}
        config={mergedLabels.low}
        icon={TrendingDown}
      />
      <ReviewList
        cars={mostReviewedCars}
        config={mergedLabels.most}
        icon={MessageSquareText}
      />
    </section>
  );
}
