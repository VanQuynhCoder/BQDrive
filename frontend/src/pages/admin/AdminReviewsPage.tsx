import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Eye,
  EyeOff,
  Loader2,
  MessageSquareText,
  Search,
  Star,
  ThumbsUp,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  adminService,
  type AdminReview,
} from "../../services/admin.service";
import { normalizeImageUrl } from "../../utils/image.util";

const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "VISIBLE", label: "Đang hiển thị" },
  { value: "REPORTED", label: "Bị báo cáo" },
  { value: "HIDDEN", label: "Đã ẩn" },
];

const STATUS_META: Record<
  string,
  { label: string; tone: "green" | "yellow" | "gray" }
> = {
  VISIBLE: { label: "Đang hiển thị", tone: "green" },
  REPORTED: { label: "Bị báo cáo", tone: "yellow" },
  HIDDEN: { label: "Đã ẩn", tone: "gray" },
};

const CRITERIA_LABELS: Record<string, string> = {
  vehicleQuality: "Chất lượng xe",
  cleanliness: "Sạch sẽ",
  descriptionAccuracy: "Đúng mô tả",
  handoverService: "Nhận/trả xe",
  ownerAttitude: "Phục vụ",
  punctuality: "Đúng giờ",
};

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown } } })
      .response;
    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }
  return "Không thể xử lý đánh giá. Vui lòng thử lại.";
}

function ReviewerAvatar({ review }: { review: AdminReview }) {
  const avatar = normalizeImageUrl(review.renterAvatar || "");
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={review.renterName}
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondarySoft text-sm font-black text-primary">
      {review.renterName.trim().charAt(0).toUpperCase() || "K"}
    </span>
  );
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminReview | null>(null);
  const [mode, setMode] = useState<"hide" | "show" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setLoading(true);
    });
    adminService
      .getAdminReviews(status)
      .then((data) => {
        if (active) setReviews(data);
      })
      .catch((error) => {
        if (active) toast.error(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status]);

  const visibleReviews = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    if (!keyword) return reviews;
    return reviews.filter((review) =>
      [
        review.renterName,
        review.renterEmail,
        review.carName,
        review.licensePlate,
        review.bookingCode,
        review.comment,
      ].some((value) => String(value || "").toLocaleLowerCase("vi").includes(keyword)),
    );
  }, [reviews, search]);

  const closeModal = () => {
    setSelected(null);
    setMode(null);
    setReason("");
  };

  const openAction = (review: AdminReview, action: "hide" | "show") => {
    setSelected(review);
    setMode(action);
    setReason(review.report?.reason || "");
  };

  const handleConfirm = async () => {
    if (!selected || !mode) return;
    const normalizedReason = reason.trim();
    if (mode === "hide" && !normalizedReason) {
      toast.error("Vui lòng nhập lý do ẩn đánh giá.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "hide") {
        await adminService.hideReview(selected.id, normalizedReason);
      } else {
        await adminService.showReview(selected.id);
      }
      setReviews((current) =>
        current
          .map((review) =>
            review.id === selected.id
              ? {
                  ...review,
                  status: mode === "hide" ? "HIDDEN" : "VISIBLE",
                  hiddenReason: mode === "hide" ? normalizedReason : "",
                }
              : review,
          )
          .filter((review) => !status || review.status === status),
      );
      toast.success(
        mode === "hide" ? "Đã ẩn đánh giá." : "Đã hiển thị lại đánh giá.",
      );
      closeModal();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondaryDark">
          Nội dung từ khách thuê
        </p>
        <h2 className="mt-1 text-3xl font-black text-primary">
          Quản lý đánh giá
        </h2>
        <p className="mt-2 text-slate-600">
          Theo dõi đánh giá, nội dung bị báo cáo và quyết định hiển thị trên hệ thống.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm người đánh giá, xe, booking..."
              className="min-h-11 w-full rounded-lg border border-slate-200 pl-10 pr-4 font-semibold outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 font-bold text-primary outline-none focus:border-secondary"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="animate-spin text-secondaryDark" size={30} />
          </div>
        ) : visibleReviews.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <MessageSquareText size={38} className="text-slate-300" />
            <p className="mt-3 font-extrabold text-primary">Không có đánh giá phù hợp</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Người đánh giá</th>
                    <th className="px-5 py-4">Xe / Booking</th>
                    <th className="px-5 py-4">Nội dung</th>
                    <th className="px-5 py-4">Trạng thái</th>
                    <th className="px-5 py-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleReviews.map((review) => {
                    const meta = STATUS_META[review.status] || {
                      label: review.status,
                      tone: "gray" as const,
                    };
                    return (
                      <tr key={review.id}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <ReviewerAvatar review={review} />
                            <div>
                              <p className="font-extrabold text-primary">{review.renterName}</p>
                              <p className="text-xs text-slate-500">{review.renterEmail || "--"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-primary">{review.carName}</p>
                          <p className="text-xs text-slate-500">{review.licensePlate || "--"} · #{review.bookingCode || "--"}</p>
                        </td>
                        <td className="max-w-sm px-5 py-4">
                          <div className="flex items-center gap-2 font-black text-amber-500">
                            <Star size={16} fill="currentColor" /> {review.rating}/5
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
                              <ThumbsUp size={14} /> {review.helpfulCount || 0}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-slate-600">{review.comment || "Không có nhận xét."}</p>
                          {review.criteria && Object.keys(review.criteria).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {Object.entries(review.criteria)
                                .filter(([, value]) => Number(value) > 0)
                                .map(([key]) => (
                                  <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                                    {CRITERIA_LABELS[key] || key}
                                  </span>
                                ))}
                            </div>
                          )}
                          {review.report?.reason && (
                            <p className="mt-2 text-xs font-bold text-red-600">Báo cáo: {review.report.reason}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <AdminStatusBadge label={meta.label} tone={meta.tone} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => openAction(review, review.status === "HIDDEN" ? "show" : "hide")}
                            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 font-extrabold transition ${review.status === "HIDDEN" ? "bg-secondary text-primary hover:brightness-95" : "border border-red-200 bg-white text-red-700 hover:bg-red-50"}`}
                          >
                            {review.status === "HIDDEN" ? <Eye size={17} /> : <EyeOff size={17} />}
                            {review.status === "HIDDEN" ? "Hiển thị" : "Ẩn"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-4 lg:hidden">
              {visibleReviews.map((review) => {
                const meta = STATUS_META[review.status] || {
                  label: review.status,
                  tone: "gray" as const,
                };
                return (
                  <article key={review.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ReviewerAvatar review={review} />
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-primary">{review.renterName}</p>
                          <p className="truncate text-xs text-slate-500">{review.carName} · #{review.bookingCode || "--"}</p>
                        </div>
                      </div>
                      <AdminStatusBadge label={meta.label} tone={meta.tone} />
                    </div>
                    <p className="mt-3 font-black text-amber-500">★ {review.rating}/5</p>
                    <p className="mt-2 text-sm text-slate-600">{review.comment || "Không có nhận xét."}</p>
                    <button
                      type="button"
                      onClick={() => openAction(review, review.status === "HIDDEN" ? "show" : "hide")}
                      className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 font-extrabold text-secondary"
                    >
                      {review.status === "HIDDEN" ? <Eye size={17} /> : <EyeOff size={17} />}
                      {review.status === "HIDDEN" ? "Hiển thị lại" : "Ẩn đánh giá"}
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <AdminModal
        open={Boolean(selected && mode)}
        title={mode === "hide" ? "Ẩn đánh giá?" : "Hiển thị lại đánh giá?"}
        description={
          mode === "hide"
            ? "Đánh giá sẽ không còn xuất hiện công khai trên trang xe."
            : "Đánh giá sẽ xuất hiện lại trên trang chi tiết xe."
        }
        confirmText={mode === "hide" ? "Xác nhận ẩn" : "Hiển thị lại"}
        danger={mode === "hide"}
        loading={submitting}
        onClose={closeModal}
        onConfirm={() => void handleConfirm()}
      >
        {mode === "hide" && (
          <label className="block">
            <span className="text-sm font-extrabold text-primary">Lý do ẩn *</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Nhập lý do để lưu vết kiểm duyệt..."
              className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-semibold outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
            />
          </label>
        )}
      </AdminModal>
    </div>
  );
}
