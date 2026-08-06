// Shared owner module: extra-charge handling for BUSINESS and USER consignment bookings.
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
import { ownerBookingService } from "../../services/ownerBooking.service";
import type { OwnerReturnInspection } from "../../types/ownerBooking";
import { normalizeImageUrl } from "../../utils/image.util";
import { CASH_PAYMENT_UI_ENABLED } from "../../config/payment.config";

const MAX_EVIDENCE_IMAGES = 5;

const chargeTypes: Array<{ value: ExtraChargeType; label: string }> = [
  { value: "CLEANING", label: "Phí vệ sinh" },
  { value: "DAMAGE", label: "Phí sửa chữa/hư hỏng" },
  { value: "LATE_RETURN", label: "Phí trễ giờ" },
  { value: "FUEL", label: "Phí nhiên liệu" },
  { value: "OVERAGE_KM", label: "Phí vượt kilomet" },
  { value: "OTHER", label: "Khác" },
];

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDuration(minutes?: number) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (hours === 0) return `${remainingMinutes} phút`;
  if (remainingMinutes === 0) return `${hours} giờ`;
  return `${hours} giờ ${remainingMinutes} phút`;
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
  onChanged,
}: {
  bookingId: string;
  bookingStatus: string;
  onChanged?: () => Promise<void> | void;
}) {
  const [charges, setCharges] = useState<ExtraCharge[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<ExtraChargeType>("CLEANING");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const [inspection, setInspection] = useState<OwnerReturnInspection | null>(null);

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
  const paidTotal = useMemo(
    () =>
      charges
        .filter((charge) => charge.status === "PAID")
        .reduce((sum, charge) => sum + Number(charge.amount || 0), 0),
    [charges],
  );
  const totalCharge = useMemo(
    () =>
      charges
        .filter((charge) => charge.status !== "CANCELLED")
        .reduce((sum, charge) => sum + Number(charge.amount || 0), 0),
    [charges],
  );
  const suggestedOverageAmount = Math.round(
    Number(inspection?.suggestedOverageAmount || 0),
  );
  const chargeableOverageKm = Number(inspection?.chargeableOverageKm || 0);
  const hasValidOverage =
    inspection?.mileageStatus === "EXCEEDED_LIMIT_KM" &&
    chargeableOverageKm > 0 &&
    suggestedOverageAmount > 0;
  const lateReturnCalculation = inspection?.lateReturnCalculation;
  const suggestedLateReturnAmount = Math.round(
    Number(lateReturnCalculation?.calculatedAmount || 0),
  );
  const hasValidLateReturn =
    Number(lateReturnCalculation?.chargeableMinutes || 0) > 0 &&
    Number(lateReturnCalculation?.chargedBlocks || 0) > 0 &&
    suggestedLateReturnAmount > 0;
  const isSystemCalculatedCharge =
    type === "OVERAGE_KM" || type === "LATE_RETURN";
  const hasValidSystemCalculation =
    type === "OVERAGE_KM" ? hasValidOverage : hasValidLateReturn;

  const fetchCharges = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCharges, inspectionResult] = await Promise.all([
        extraChargeService.getByBooking(bookingId),
        ownerBookingService.getReturnInspection(bookingId),
      ]);
      setCharges(nextCharges);
      setInspection(inspectionResult.inspection);
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
    setAdjustmentReason("");
    setEvidenceImages([]);
    setFormOpen(false);
  };

  const showUnavailableOverageMessage = () => {
    if (inspection?.mileageStatus === "NOT_EVALUATED_KM") {
      toast.error(
        "Booking không có đủ dữ liệu chính sách kilomet để tính phí vượt.",
      );
      return;
    }

    toast.error("Xe không vượt ngưỡng kilomet tính phí.");
  };

  const showUnavailableLateReturnMessage = () => {
    toast.error(
      "Xe được trả trong thời gian miễn phí 30 phút, không phát sinh phí trả trễ.",
    );
  };

  const handleChargeTypeChange = (nextType: ExtraChargeType) => {
    setType(nextType);
    setAdjustmentReason("");

    if (nextType === "LATE_RETURN") {
      if (!hasValidLateReturn) {
        setAmount("");
        setDescription("");
        showUnavailableLateReturnMessage();
        return;
      }

      setAmount(String(suggestedLateReturnAmount));
      setDescription(
        `Phí trả xe trễ ${formatDuration(lateReturnCalculation?.lateMinutes)}, sau 30 phút miễn phí`,
      );
      return;
    }

    if (nextType !== "OVERAGE_KM") {
      setAmount("");
      setDescription("");
      return;
    }

    if (!hasValidOverage) {
      setAmount("");
      setDescription("");
      showUnavailableOverageMessage();
      return;
    }

    setAmount(String(suggestedOverageAmount));
    setDescription(
      `Phí vượt ${chargeableOverageKm} km theo biên bản trả xe`,
    );
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
    if (type === "OVERAGE_KM" && !hasValidOverage) {
      showUnavailableOverageMessage();
      return;
    }

    if (type === "LATE_RETURN" && !hasValidLateReturn) {
      showUnavailableLateReturnMessage();
      return;
    }

    const parsedAmount =
      type === "OVERAGE_KM"
        ? suggestedOverageAmount
        : type === "LATE_RETURN"
          ? suggestedLateReturnAmount
          : Number(amount);

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
        ...(adjustmentReason.trim()
          ? { adjustmentReason: adjustmentReason.trim() }
          : {}),
      });
      toast.success("Đã thêm phí phát sinh");
      notifyNotificationSummaryChanged();
      resetForm();
      await fetchCharges();
      await onChanged?.();
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
      await onChanged?.();
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
      await onChanged?.();
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

      {charges.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-400">Tổng phụ phí</p>
            <p className="mt-1 font-extrabold text-primary">{formatCurrency(totalCharge)}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-bold uppercase text-emerald-700">Đã thu</p>
            <p className="mt-1 font-extrabold text-emerald-800">{formatCurrency(paidTotal)}</p>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <p className="text-xs font-bold uppercase text-amber-700">Còn phải thu</p>
            <p className="mt-1 font-extrabold text-amber-800">{formatCurrency(pendingTotal)}</p>
          </div>
        </div>
      )}

      {canCreate && suggestedOverageAmount > 0 && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm font-extrabold text-primary">Gợi ý phí vượt kilomet</p>
          <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
            <p>Km tính phí: <strong>{inspection?.chargeableOverageKm || 0} km</strong></p>
            <p>Đơn giá: <strong>{formatCurrency(inspection?.suggestedOverageAmount && inspection.chargeableOverageKm ? inspection.suggestedOverageAmount / inspection.chargeableOverageKm : 0)}/km</strong></p>
            <p>Tạm tính: <strong>{formatCurrency(suggestedOverageAmount)}</strong></p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormOpen(true);
              handleChargeTypeChange("OVERAGE_KM");
            }}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-secondary"
          >
            Tạo theo mức đề xuất
          </button>
        </div>
      )}

      {canCreate && hasValidLateReturn && lateReturnCalculation && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm font-extrabold text-primary">
            Gợi ý phí trả xe trễ
          </p>
          <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-4">
            <p>
              Trễ thực tế: <strong>{formatDuration(lateReturnCalculation.lateMinutes)}</strong>
            </p>
            <p>
              Miễn phí: <strong>{lateReturnCalculation.graceMinutes} phút</strong>
            </p>
            <p>
              Số block: <strong>{lateReturnCalculation.chargedBlocks}</strong>
            </p>
            <p>
              Tạm tính: <strong>{formatCurrency(suggestedLateReturnAmount)}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormOpen(true);
              handleChargeTypeChange("LATE_RETURN");
            }}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-secondary"
          >
            Tạo phí trả xe trễ
          </button>
        </div>
      )}

      {formOpen && (
        <div className="mb-4 grid gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-primary">
              Loại phí
            </span>
            <select
              value={type}
              onChange={(event) => {
                const nextType = event.target.value as ExtraChargeType;
                handleChargeTypeChange(nextType);
              }}
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
              onChange={(event) => {
                if (!isSystemCalculatedCharge) setAmount(event.target.value);
              }}
              inputMode="numeric"
              readOnly={isSystemCalculatedCharge}
              disabled={isSystemCalculatedCharge && !hasValidSystemCalculation}
              className={`min-h-11 w-full rounded-lg border px-3 font-semibold outline-none ${
                isSystemCalculatedCharge
                  ? "cursor-not-allowed border-yellow-200 bg-yellow-100 text-primary"
                  : "border-slate-200 bg-white focus:border-secondary"
              }`}
              placeholder={
                type === "OVERAGE_KM"
                  ? "Không có phí vượt kilomet"
                  : type === "LATE_RETURN"
                    ? "Không có phí trả xe trễ"
                  : "300000"
              }
            />
            {type === "OVERAGE_KM" && (
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-600">
                {hasValidOverage
                  ? `Hệ thống tự tính ${chargeableOverageKm} km vượt ngưỡng, tương ứng ${formatCurrency(suggestedOverageAmount)}.`
                  : "Không phát sinh kilomet vượt ngưỡng nên không thể tạo khoản phí này."}
              </span>
            )}
            {type === "LATE_RETURN" && (
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-600">
                {hasValidLateReturn && lateReturnCalculation
                  ? `Hệ thống tính ${lateReturnCalculation.chargedBlocks} block, mỗi block ${lateReturnCalculation.blockMinutes} phút, tương ứng ${formatCurrency(suggestedLateReturnAmount)}.`
                  : "Xe được trả trong thời gian miễn phí 30 phút nên không thể tạo khoản phí này."}
              </span>
            )}
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
            disabled={
              submitting ||
              (type === "OVERAGE_KM" && !hasValidOverage) ||
              (type === "LATE_RETURN" && !hasValidLateReturn)
            }
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
                  {charge.adjustmentReason && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      Điều chỉnh: {charge.adjustmentReason}
                    </p>
                  )}
                </div>
                <p className="text-lg font-extrabold text-primary">
                  {formatCurrency(charge.amount)}
                </p>
              </div>

              {charge.type === "LATE_RETURN" && charge.lateReturnSnapshot && (
                <div className="mt-4 grid gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm sm:grid-cols-3">
                  <p>
                    Trả dự kiến: <strong>{new Date(charge.lateReturnSnapshot.scheduledReturnAt).toLocaleString("vi-VN")}</strong>
                  </p>
                  <p>
                    Tiếp nhận thực tế: <strong>{new Date(charge.lateReturnSnapshot.actualReturnAt).toLocaleString("vi-VN")}</strong>
                  </p>
                  <p>
                    Trễ: <strong>{formatDuration(charge.lateReturnSnapshot.lateMinutes)}</strong>
                  </p>
                  <p>
                    Miễn phí: <strong>{charge.lateReturnSnapshot.graceMinutes} phút</strong>
                  </p>
                  <p>
                    Tính phí: <strong>{formatDuration(charge.lateReturnSnapshot.chargeableMinutes)}</strong>
                  </p>
                  <p>
                    Công thức: <strong>{charge.lateReturnSnapshot.chargedBlocks} block × {formatCurrency(charge.lateReturnSnapshot.feePerBlock)}</strong>
                  </p>
                </div>
              )}

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
                  {CASH_PAYMENT_UI_ENABLED && (
                    <button
                      type="button"
                      onClick={() => handleConfirmCash(charge._id)}
                      disabled={submitting}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-secondary disabled:opacity-60"
                    >
                      Xác nhận đã thu tiền mặt
                    </button>
                  )}
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
