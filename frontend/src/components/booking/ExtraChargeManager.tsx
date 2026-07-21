import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import toast from "react-hot-toast";
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";

import {
  extraChargeService,
  type ExtraCharge,
  type ExtraChargeType,
} from "../../services/extraCharge.service";
import { notifyNotificationSummaryChanged } from "../../services/notification.service";
import { normalizeImageUrl } from "../../utils/image.util";

const MAX_EVIDENCE_IMAGES = 5;

const chargeTypes: Array<{ value: ExtraChargeType; label: string }> = [
  { value: "CLEANING", label: "Phí vệ sinh" },
  { value: "DAMAGE", label: "Phí sửa chữa/hư hỏng" },
  { value: "LATE_RETURN", label: "Phí trễ giờ" },
  { value: "FUEL", label: "Phí nhiên liệu" },
  { value: "OTHER", label: "Khác" },
];

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getTypeLabel(type: string) {
  return chargeTypes.find((item) => item.value === type)?.label || type;
}

function getStatusLabel(status: string) {
  if (status === "PAID") return "Đã thu";
  if (status === "CANCELLED") return "Đã hủy";
  return "Chờ xử lý";
}

function getStatusClass(status: string) {
  if (status === "PAID") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "CANCELLED") {
    return "bg-slate-100 text-slate-500 border-slate-200";
  }

  return "bg-yellow-50 text-amber-700 border-yellow-200";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ExtraChargeManager({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: string;
}) {
  const [charges, setCharges] = useState<ExtraCharge[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<ExtraChargeType>("CLEANING");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);

  const canCreate = ["RETURN_INSPECTION", "AWAITING_EXTRA_CHARGE"].includes(
    bookingStatus,
  );
  const pendingTotal = useMemo(
    () =>
      charges
        .filter((charge) => charge.status === "PENDING")
        .reduce((sum, charge) => sum + Number(charge.amount || 0), 0),
    [charges],
  );

  const fetchCharges = useCallback(async () => {
    setLoading(true);
    try {
      setCharges(await extraChargeService.getByBooking(bookingId));
    } catch {
      toast.error("Không thể tải phí phát sinh");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchCharges();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchCharges]);

  const resetForm = () => {
    setType("CLEANING");
    setAmount("");
    setDescription("");
    setEvidenceImages([]);
    setFormOpen(false);
  };

  const handleEvidenceChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) return;

    const availableSlots = MAX_EVIDENCE_IMAGES - evidenceImages.length;
    if (availableSlots <= 0) {
      toast.error(`Chỉ được thêm tối đa ${MAX_EVIDENCE_IMAGES} ảnh bằng chứng`);
      return;
    }

    const acceptedFiles = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, availableSlots);

    if (acceptedFiles.length !== files.length) {
      toast.error("Một số file không phải hình ảnh hoặc vượt quá số lượng cho phép");
    }

    try {
      const images = await Promise.all(acceptedFiles.map(readFileAsDataUrl));
      setEvidenceImages((current) => [...current, ...images]);
    } catch {
      toast.error("Không thể đọc ảnh bằng chứng");
    }
  };

  const removeEvidenceImage = (index: number) => {
    setEvidenceImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleCreate = async () => {
    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Số tiền phí phát sinh phải lớn hơn 0");
      return;
    }

    if (!description.trim()) {
      toast.error("Vui lòng nhập mô tả phí phát sinh");
      return;
    }

    setSubmitting(true);
    try {
      await extraChargeService.create(bookingId, {
        type,
        amount: Math.round(parsedAmount),
        description: description.trim(),
        evidenceImages,
      });
      toast.success("Đã thêm phí phát sinh");
      notifyNotificationSummaryChanged();
      resetForm();
      await fetchCharges();
    } catch {
      toast.error("Không thể thêm phí phát sinh");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCash = async (id: string) => {
    setSubmitting(true);
    try {
      await extraChargeService.confirmCash(id);
      toast.success("Đã xác nhận thu phí");
      notifyNotificationSummaryChanged();
      await fetchCharges();
    } catch {
      toast.error("Không thể xác nhận thu phí");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    setSubmitting(true);
    try {
      await extraChargeService.cancel(id, "Chủ xe hủy phí phát sinh");
      toast.success("Đã hủy phí phát sinh");
      notifyNotificationSummaryChanged();
      await fetchCharges();
    } catch {
      toast.error("Không thể hủy phí phát sinh");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-slate-200 p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">
            Phí phát sinh sau thuê
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {pendingTotal > 0
              ? `Còn ${formatCurrency(pendingTotal)} phí chờ xử lý.`
              : "Chưa có phí phát sinh chờ xử lý."}
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setFormOpen((prev) => !prev)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-secondary px-4 text-sm font-extrabold text-primary"
          >
            {formOpen ? <X size={16} /> : <Plus size={16} />}
            {formOpen ? "Đóng" : "Thêm phí"}
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mb-4 grid gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-primary">
              Loại phí
            </span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as ExtraChargeType)}
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-secondary"
            >
              {chargeTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-primary">
              Số tiền
            </span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-secondary"
              placeholder="300000"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-extrabold text-primary">
              Mô tả
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold outline-none focus:border-secondary"
              placeholder="Ví dụ: Xe bị trầy cản trước bên phải..."
            />
          </label>

          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-extrabold text-primary">
                Ảnh bằng chứng
              </span>
              <span className="text-xs font-bold text-slate-500">
                {evidenceImages.length}/{MAX_EVIDENCE_IMAGES} ảnh
              </span>
            </div>
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-secondary bg-white px-4 text-sm font-extrabold text-primary transition hover:bg-secondarySoft/60">
              <ImagePlus size={18} className="text-secondary" />
              Chọn ảnh từ máy
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleEvidenceChange}
              />
            </label>
            {evidenceImages.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {evidenceImages.map((image, index) => (
                  <div
                    key={`${image.slice(0, 24)}-${index}`}
                    className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                  >
                    <img
                      src={normalizeImageUrl(image)}
                      alt={`Ảnh bằng chứng ${index + 1}`}
                      className="h-24 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeEvidenceImage(index)}
                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-secondary opacity-95"
                      aria-label="Xóa ảnh bằng chứng"
                      title="Xóa ảnh"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-extrabold text-secondary disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Lưu phí phát sinh
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
          <Loader2 size={16} className="animate-spin text-secondary" />
          Đang tải phí phát sinh...
        </div>
      ) : charges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
          Chưa có phí phát sinh cho booking này.
        </div>
      ) : (
        <div className="space-y-3">
          {charges.map((charge) => (
            <div
              key={charge._id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-extrabold text-primary">
                      {getTypeLabel(charge.type)}
                    </p>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-extrabold ${getStatusClass(charge.status)}`}
                    >
                      {getStatusLabel(charge.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                    {charge.description}
                  </p>
                </div>
                <p className="text-lg font-extrabold text-primary">
                  {formatCurrency(charge.amount)}
                </p>
              </div>

              {charge.evidenceImages?.length ? (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {charge.evidenceImages.map((image, index) => (
                    <a
                      key={`${charge._id}-${index}`}
                      href={normalizeImageUrl(image)}
                      target="_blank"
                      rel="noreferrer"
                      className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                      title="Mở ảnh bằng chứng"
                    >
                      <img
                        src={normalizeImageUrl(image)}
                        alt={`Ảnh bằng chứng phí phát sinh ${index + 1}`}
                        className="h-24 w-full object-cover transition group-hover:scale-105"
                      />
                    </a>
                  ))}
                </div>
              ) : null}

              {charge.status === "PENDING" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleConfirmCash(charge._id)}
                    disabled={submitting}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-secondary disabled:opacity-60"
                  >
                    Xác nhận đã thu
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(charge._id)}
                    disabled={submitting}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-extrabold text-primary disabled:opacity-60"
                  >
                    Hủy phí
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
