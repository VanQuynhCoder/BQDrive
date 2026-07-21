import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  MessageSquareReply,
  MessageSquareText,
  Send,
  ShieldAlert,
  Star,
} from "lucide-react";
import toast from "react-hot-toast";

import {
  reviewService,
  type OwnerReviewStatistics,
  type ReviewCriteria,
  type ReviewItem,
} from "../../services/review.service";
import { getFirstCarImage, normalizeImageUrl } from "../../utils/image.util";

type OwnerReviewsPageProps = {
  title: string;
  subtitle: string;
};

const criteriaLabels: Array<{ key: keyof ReviewCriteria; label: string }> = [
  { key: "vehicleQuality", label: "Chất lượng xe" },
  { key: "cleanliness", label: "Sạch sẽ" },
  { key: "descriptionAccuracy", label: "Đúng mô tả" },
  { key: "handoverService", label: "Nhận/trả xe" },
  { key: "ownerAttitude", label: "Phục vụ" },
  { key: "punctuality", label: "Đúng giờ" },
];

function RenterAvatar({ review }: { review: ReviewItem }) {
  const name = review.renterName || review.reviewerName || "Khách thuê";
  const avatar = normalizeImageUrl(review.renterAvatar || review.reviewerAvatar);
  const initial = name.trim().charAt(0).toUpperCase() || "K";

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="h-11 w-11 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-secondary/30 bg-secondarySoft text-sm font-extrabold text-primary">
      {initial}
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") return response.data.message;
  }

  return fallback;
}

function getCriteriaLabel(key: keyof ReviewCriteria) {
  const labels: Record<keyof ReviewCriteria, string> = {
    vehicleQuality: "Chất lượng xe cao",
    cleanliness: "Xe sạch sẽ",
    descriptionAccuracy: "Đúng như mô tả",
    handoverService: "Nhận/trả xe nhanh gọn",
    ownerAttitude: "Chủ xe hỗ trợ tốt",
    punctuality: "Giao xe đúng giờ",
  };

  return labels[key];
}

export default function OwnerReviewsPage({
  title,
  subtitle,
}: OwnerReviewsPageProps) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [statistics, setStatistics] = useState<OwnerReviewStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyTarget, setReplyTarget] = useState<ReviewItem | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [reportTarget, setReportTarget] = useState<ReviewItem | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadReviews = useCallback(async () => {
    try {
      setLoading(true);
      const [items, nextStats] = await Promise.all([
        reviewService.getOwnerReviews(),
        reviewService.getOwnerReviewStatistics(),
      ]);
      setReviews(items);
      setStatistics(nextStats);
    } catch {
      toast.error("Không thể tải danh sách đánh giá");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadReviews();
    });
  }, [loadReviews]);

  const averageRating = useMemo(() => {
    if (statistics) return statistics.averageRating;
    if (!reviews.length) return 0;
    const total = reviews.reduce(
      (sum, review) => sum + Number(review.rating || 0),
      0,
    );
    return Number((total / reviews.length).toFixed(1));
  }, [reviews, statistics]);

  const openReply = (review: ReviewItem) => {
    setReplyTarget(review);
    setReplyContent(review.ownerReply?.content || "");
  };

  const submitReply = async () => {
    if (!replyTarget || submitting) return;
    if (!replyContent.trim()) {
      toast.error("Vui lòng nhập nội dung phản hồi");
      return;
    }

    try {
      setSubmitting(true);
      await reviewService.replyReview(replyTarget.id, replyContent);
      toast.success("Đã lưu phản hồi đánh giá");
      setReplyTarget(null);
      setReplyContent("");
      await loadReviews();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể lưu phản hồi"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReport = async () => {
    if (!reportTarget || submitting) return;
    if (!reportReason.trim()) {
      toast.error("Vui lòng nhập lý do báo cáo");
      return;
    }

    try {
      setSubmitting(true);
      await reviewService.reportReview(reportTarget.id, reportReason);
      toast.success("Đã gửi báo cáo cho admin");
      setReportTarget(null);
      setReportReason("");
      await loadReviews();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể báo cáo đánh giá"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-secondary">Đánh giá</p>
        <h1 className="mt-2 text-4xl font-extrabold text-primary">{title}</h1>
        <p className="mt-2 max-w-3xl text-muted">{subtitle}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-5">
        <SummaryCard label="Tổng đánh giá" value={reviews.length.toString()} />
        <SummaryCard
          label="Điểm trung bình"
          value={averageRating ? `${averageRating}/5` : "--"}
        />
        <SummaryCard
          label="5 sao"
          value={(statistics?.fiveStarCount || 0).toString()}
        />
        <SummaryCard
          label="1-2 sao"
          value={(statistics?.lowRatingCount || 0).toString()}
        />
        <SummaryCard
          label="Chưa phản hồi"
          value={(statistics?.unrepliedCount || 0).toString()}
        />
      </div>

      <section className="rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-2xl font-extrabold text-primary">
            Danh sách đánh giá
          </h2>
          <p className="mt-1 text-sm font-semibold text-muted">
            Chủ xe có thể phản hồi hoặc báo cáo đánh giá vi phạm, không thể sửa
            nội dung của khách.
          </p>
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
                className="grid gap-5 p-5 xl:grid-cols-[300px_minmax(0,1fr)_210px]"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={getFirstCarImage(
                      review.carImage ? [review.carImage] : undefined,
                    )}
                    alt={review.carName || "Xe"}
                    className="h-24 w-32 rounded-xl object-cover"
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
                    {review.status === "REPORTED" && (
                      <span className="mt-2 inline-flex rounded-full bg-red-50 px-2 py-1 text-xs font-extrabold text-red-700">
                        Đã báo cáo
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex min-w-0 items-center gap-3">
                    <RenterAvatar review={review} />
                    <div className="min-w-0">
                      <p className="truncate font-extrabold text-primary">
                        {review.renterName || "Khách thuê"}
                      </p>
                      {review.renterEmail && (
                        <p className="truncate text-sm font-semibold text-muted">
                          {review.renterEmail}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
                    {review.comment || "Khách thuê không để lại nhận xét."}
                  </p>

                  {review.criteria && Object.keys(review.criteria).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {criteriaLabels
                        .filter((item) => review.criteria?.[item.key])
                        .map((item) => (
                          <span
                            key={item.key}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-extrabold text-primary"
                          >
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            {getCriteriaLabel(item.key)}
                          </span>
                        ))}
                    </div>
                  )}

                  {review.images?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {review.images.map((image, index) => (
                        <a
                          key={`${image}-${index}`}
                          href={image}
                          target="_blank"
                          rel="noreferrer"
                          className="block"
                        >
                          <img
                            src={image}
                            alt={`Ảnh đánh giá ${index + 1}`}
                            className="h-20 w-28 rounded-lg border border-border object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-muted">
                      <ImageIcon size={14} />
                      Không có ảnh đánh giá
                    </p>
                  )}

                  {review.ownerReply?.content && (
                    <div className="mt-4 rounded-xl border border-secondary/30 bg-secondarySoft/30 p-4">
                      <p className="text-xs font-bold uppercase text-secondary">
                        Phản hồi của bạn
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-primary">
                        {review.ownerReply.content}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-start gap-3 xl:items-end">
                  <div className="flex items-center gap-1 text-secondary">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={index}
                        size={18}
                        fill={index < review.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                    <CheckCircle2 size={14} />
                    Đã thuê xe
                  </span>
                  {Number(review.rating) <= 2 && (
                    <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold text-red-700">
                      <AlertTriangle size={14} />
                      Cần chú ý
                    </span>
                  )}
                  <p className="text-sm font-semibold text-muted">
                    {review.createdAt
                      ? new Date(review.createdAt).toLocaleString("vi-VN")
                      : "--"}
                  </p>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <button
                      type="button"
                      onClick={() => openReply(review)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-extrabold text-secondary transition hover:brightness-110"
                    >
                      <MessageSquareReply size={16} />
                      {review.ownerReply?.content ? "Sửa phản hồi" : "Phản hồi"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReportTarget(review);
                        setReportReason(review.report?.reason || "");
                      }}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-extrabold text-red-700 transition hover:bg-red-100"
                    >
                      <ShieldAlert size={16} />
                      Báo cáo
                    </button>
                  </div>
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

      {replyTarget && (
        <ReviewActionModal
          title="Phản hồi đánh giá"
          subtitle={`Booking #${replyTarget.bookingCode || "--"} - ${replyTarget.carName || "Xe"}`}
          value={replyContent}
          placeholder="Cảm ơn bạn đã góp ý. Chúng tôi sẽ cải thiện..."
          confirmText="Lưu phản hồi"
          submitting={submitting}
          onChange={setReplyContent}
          onClose={() => setReplyTarget(null)}
          onSubmit={submitReply}
        />
      )}

      {reportTarget && (
        <ReviewActionModal
          title="Báo cáo đánh giá"
          subtitle="Admin sẽ xem xét và quyết định ẩn hoặc giữ nguyên đánh giá."
          value={reportReason}
          placeholder="Nhập lý do báo cáo: lộ thông tin cá nhân, spam, sai sự thật..."
          confirmText="Gửi báo cáo"
          submitting={submitting}
          onChange={setReportReason}
          onClose={() => setReportTarget(null)}
          onSubmit={submitReport}
          danger
        />
      )}
    </div>
  );
}

function ReviewActionModal({
  title,
  subtitle,
  value,
  placeholder,
  confirmText,
  submitting,
  danger,
  onChange,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  value: string;
  placeholder: string;
  confirmText: string;
  submitting: boolean;
  danger?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 px-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-primary px-6 py-5">
          <h2 className="text-2xl font-extrabold text-secondary">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-white/70">{subtitle}</p>
        </div>
        <div className="p-6">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value.slice(0, 1000))}
            rows={6}
            placeholder={placeholder}
            className="w-full rounded-xl border border-border px-4 py-3 font-semibold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/15"
          />
          <p className="mt-1 text-right text-xs font-semibold text-muted">
            {value.length}/1000
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-border bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-border bg-white px-5 py-2 font-extrabold text-primary transition hover:bg-slate-100"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2 font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              danger
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-secondary text-primary hover:brightness-95"
            }`}
          >
            <Send size={17} />
            {confirmText}
          </button>
        </div>
      </div>
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
