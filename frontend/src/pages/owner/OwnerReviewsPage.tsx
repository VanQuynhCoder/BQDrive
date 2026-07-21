import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Star } from "lucide-react";
import toast from "react-hot-toast";

import {
  reviewService,
  type ReviewItem,
} from "../../services/review.service";
import { getFirstCarImage } from "../../utils/image.util";

type OwnerReviewsPageProps = {
  title: string;
  subtitle: string;
};

export default function OwnerReviewsPage({
  title,
  subtitle,
}: OwnerReviewsPageProps) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    reviewService
      .getOwnerReviews()
      .then((items) => {
        if (active) setReviews(items);
      })
      .catch(() => {
        toast.error("Không thể tải danh sách đánh giá");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;
    const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return Number((total / reviews.length).toFixed(1));
  }, [reviews]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-secondary">Đánh giá</p>
        <h1 className="mt-2 text-4xl font-extrabold text-primary">{title}</h1>
        <p className="mt-2 max-w-3xl text-muted">{subtitle}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Tổng đánh giá" value={reviews.length.toString()} />
        <SummaryCard
          label="Điểm trung bình"
          value={averageRating ? `${averageRating}/5` : "--"}
        />
        <SummaryCard label="Hiển thị" value="Chỉ xe của bạn" />
      </div>

      <section className="rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-2xl font-extrabold text-primary">
            Danh sách đánh giá
          </h2>
        </div>

        {loading ? (
          <div className="space-y-4 p-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : reviews.length ? (
          <div className="divide-y divide-border">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="grid gap-4 p-5 lg:grid-cols-[280px_minmax(0,1fr)_180px]"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={getFirstCarImage(
                      review.carImage ? [review.carImage] : undefined,
                    )}
                    alt={review.carName || "Xe"}
                    className="h-20 w-28 rounded-xl object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold text-primary">
                      {review.carName || "Xe"}
                    </p>
                    <p className="text-sm font-semibold text-muted">
                      {review.licensePlate || "--"}
                    </p>
                    <p className="text-xs font-bold uppercase text-secondary">
                      Booking #{review.bookingCode || "--"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="font-extrabold text-primary">
                    {review.renterName || "Khách thuê"}
                  </p>
                  {review.renterEmail && (
                    <p className="text-sm font-semibold text-muted">
                      {review.renterEmail}
                    </p>
                  )}
                  <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
                    {review.comment || "Khách thuê không để lại nhận xét."}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-2 lg:items-end">
                  <div className="flex items-center gap-1 text-secondary">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={index}
                        size={18}
                        fill={index < review.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                  <p className="text-sm font-semibold text-muted">
                    {review.createdAt
                      ? new Date(review.createdAt).toLocaleString("vi-VN")
                      : "--"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center">
            <MessageSquareText size={42} className="mx-auto text-secondary" />
            <h2 className="mt-3 text-2xl font-extrabold text-primary">
              Chưa có đánh giá nào
            </h2>
            <p className="mt-2 text-sm font-semibold text-muted">
              Khi khách thuê hoàn tất chuyến đi và gửi đánh giá, danh sách sẽ
              hiển thị tại đây.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="mt-2 text-3xl font-extrabold text-primary">{value}</p>
    </div>
  );
}
