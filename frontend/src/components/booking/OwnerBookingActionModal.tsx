import { type ChangeEvent, useEffect, useState } from "react";
import {
  CalendarRange,
  Clock3,
  Fuel,
  Gauge,
  ImagePlus,
  Loader2,
  Trash2,
} from "lucide-react";

import AdminModal from "../admin/AdminModal";
import { uploadService } from "../../services/upload.service";
import type {
  OwnerBookingMutationAction,
  OwnerBookingDetail,
  OwnerHandoverPayload,
  OwnerReturnPayload,
} from "../../types/ownerBooking";
import { formatVietnamDateTime } from "../../utils/date.util";
import { normalizeImageUrl } from "../../utils/image.util";

export type OwnerBookingActionPayload =
  | { rejectReason: string }
  | { noShowReason?: string }
  | OwnerHandoverPayload
  | OwnerReturnPayload
  | Record<string, never>;

type Props = {
  action: OwnerBookingMutationAction | null;
  detail: OwnerBookingDetail | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (
    action: OwnerBookingMutationAction,
    payload: OwnerBookingActionPayload,
  ) => Promise<void>;
};

const ACTION_COPY: Record<
  OwnerBookingMutationAction,
  { title: string; description: string; confirmText: string }
> = {
  approve: {
    title: "Duyệt booking",
    description: "Xác nhận chấp nhận yêu cầu thuê xe này.",
    confirmText: "Duyệt booking",
  },
  reject: {
    title: "Từ chối booking",
    description: "Nhập lý do rõ ràng để khách thuê biết và chủ động chọn xe khác.",
    confirmText: "Từ chối booking",
  },
  "no-show": {
    title: "Xác nhận khách không nhận xe?",
    description:
      "Chỉ xác nhận khi đã quá thời gian nhận xe và khách không đến. Booking sẽ chuyển sang trạng thái không nhận xe.",
    confirmText: "Đánh dấu không nhận xe",
  },
  handover: {
    title: "Bàn giao xe",
    description: "Ghi nhận ODO và mức nhiên liệu/năng lượng tại thời điểm giao xe.",
    confirmText: "Xác nhận bàn giao",
  },
  return: {
    title: "Nhận xe trả",
    description: "Ghi nhận thông tin xe khi nhận lại và chuyển sang bước kiểm tra xe trả.",
    confirmText: "Xác nhận nhận xe",
  },
};

function formatDateTime(value?: string) {
  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const OWNER_RESPONSE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_ODO_IMAGE_SIZE = 5 * 1024 * 1024;

function BookingApprovalDeadline({ createdAt }: { createdAt?: string }) {
  const [now, setNow] = useState(0);
  const createdAtMs = createdAt ? new Date(createdAt).getTime() : Number.NaN;
  const deadlineMs = createdAtMs + OWNER_RESPONSE_TIMEOUT_MS;
  const hasDeadline = Number.isFinite(deadlineMs);
  const effectiveNow = now || createdAtMs;
  const remainingMs = hasDeadline ? Math.max(deadlineMs - effectiveNow, 0) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const progress = hasDeadline
    ? Math.max(0, Math.min(100, (remainingMs / OWNER_RESPONSE_TIMEOUT_MS) * 100))
    : 0;
  const isExpired = hasDeadline && remainingMs <= 0;
  const isUrgent = !isExpired && remainingMs <= 2 * 60 * 1000;

  useEffect(() => {
    if (!hasDeadline) return undefined;

    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, [hasDeadline]);

  if (!hasDeadline) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
        Chưa xác định được thời hạn phản hồi yêu cầu thuê.
      </div>
    );
  }

  const tone = isExpired
    ? "border-red-200 bg-red-50 text-red-700"
    : isUrgent
      ? "border-orange-200 bg-orange-50 text-orange-700"
      : "border-yellow-200 bg-yellow-50 text-primary";
  const progressTone = isExpired
    ? "bg-red-500"
    : isUrgent
      ? "bg-orange-500"
      : "bg-secondary";

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-extrabold">Thời hạn chủ xe phản hồi</p>
            <p className="mt-1 text-sm font-semibold opacity-80">
              Duyệt hoặc từ chối trước {formatDateTime(new Date(deadlineMs).toISOString())}.
            </p>
          </div>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-xs font-bold uppercase opacity-70">
            {isExpired ? "Đã hết thời gian" : "Còn lại"}
          </p>
          <p className="mt-1 text-xl font-black tabular-nums">
            {isExpired ? "00:00" : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
          </p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ${progressTone}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {isExpired && (
        <p className="mt-2 text-sm font-bold">
          Hệ thống đang tự động hủy yêu cầu và giải phóng lịch xe.
        </p>
      )}
    </div>
  );
}

function BookingSummary({ detail }: { detail: OwnerBookingDetail }) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
      <div>
        <p className="text-xs font-bold uppercase text-slate-400">Khách thuê</p>
        <p className="mt-1 font-extrabold text-primary">{detail.customer.name}</p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-slate-400">Xe</p>
        <p className="mt-1 font-extrabold text-primary">{detail.car.name}</p>
        <p className="text-sm font-semibold text-slate-500">
          {detail.car.carCode || "Chưa được cấp mã"} · {detail.car.licensePlate || "Chưa có biển số"}
        </p>
      </div>
      <div className="sm:col-span-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
          <CalendarRange size={15} /> Thời gian thuê
        </p>
        <p className="mt-1 font-bold text-primary">
          {formatDateTime(detail.startDate)} - {formatDateTime(detail.endDate)}
        </p>
      </div>
    </div>
  );
}

export default function OwnerBookingActionModal({
  action,
  detail,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const [rejectReason, setRejectReason] = useState("");
  const [noShowReason, setNoShowReason] = useState("");
  const [odometer, setOdometer] = useState(() =>
    action === "handover" &&
    detail?.currentOdometerKm !== null &&
    detail?.currentOdometerKm !== undefined
      ? String(detail.currentOdometerKm)
      : "",
  );
  const [energyPercent, setEnergyPercent] = useState(() =>
    action === "return" &&
    detail?.handoverSnapshot?.handoverEnergyLevelPercent !== undefined
      ? String(detail.handoverSnapshot.handoverEnergyLevelPercent)
      : "",
  );
  const [conditionNotes, setConditionNotes] = useState("");
  const [hasDamage, setHasDamage] = useState(false);
  const [hasCleaningIssue, setHasCleaningIssue] = useState(false);
  const [hasFuelShortage, setHasFuelShortage] = useState(false);
  const [returnDashboardImage, setReturnDashboardImage] = useState("");
  const [uploadingReturnImage, setUploadingReturnImage] = useState(false);
  const [validationError, setValidationError] = useState("");

  if (!action || !detail) return null;

  const copy = ACTION_COPY[action];
  const returnOdometerReference =
    detail.handoverSnapshot?.handoverOdometerKm ??
    detail.currentOdometerKm;

  const parseVehicleState = () => {
    const normalizedOdometer = Number(odometer);
    const normalizedEnergy = Number(energyPercent);

    if (!Number.isInteger(normalizedOdometer) || normalizedOdometer < 0) {
      setValidationError("ODO phải là số nguyên không âm.");
      return null;
    }

    if (
      action === "return" &&
      returnOdometerReference !== null &&
      returnOdometerReference !== undefined &&
      normalizedOdometer < returnOdometerReference
    ) {
      setValidationError(
        `ODO nhận lại không được nhỏ hơn ${new Intl.NumberFormat("vi-VN").format(returnOdometerReference)} km đang được ghi nhận trên hệ thống.`,
      );
      return null;
    }

    if (
      !Number.isFinite(normalizedEnergy) ||
      normalizedEnergy < 0 ||
      normalizedEnergy > 100
    ) {
      setValidationError("Mức nhiên liệu/năng lượng phải từ 0 đến 100%.");
      return null;
    }

    return { normalizedOdometer, normalizedEnergy };
  };

  const handleReturnDashboardImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    setValidationError("");

    if (!file.type.startsWith("image/")) {
      setValidationError("Vui lòng chọn đúng file hình ảnh ODO.");
      return;
    }

    if (file.size > MAX_ODO_IMAGE_SIZE) {
      setValidationError("Ảnh ODO không được vượt quá 5 MB.");
      return;
    }

    setUploadingReturnImage(true);
    try {
      const uploadedImage = await uploadService.uploadCarImage(file);
      setReturnDashboardImage(uploadedImage.url);
    } catch {
      setValidationError(
        "Không thể tải ảnh ODO lên hệ thống. Vui lòng thử lại.",
      );
    } finally {
      setUploadingReturnImage(false);
    }
  };

  const handleSubmit = async () => {
    setValidationError("");

    if (action === "approve") {
      await onSubmit(action, {});
      return;
    }

    if (action === "reject") {
      const reason = rejectReason.trim();
      if (!reason) {
        setValidationError("Vui lòng nhập lý do từ chối booking.");
        return;
      }
      if (reason.length > 500) {
        setValidationError("Lý do từ chối không được vượt quá 500 ký tự.");
        return;
      }
      await onSubmit(action, { rejectReason: reason });
      return;
    }

    if (action === "no-show") {
      const reason = noShowReason.trim();
      if (reason.length > 500) {
        setValidationError("Ghi chú không được vượt quá 500 ký tự.");
        return;
      }
      await onSubmit(action, { noShowReason: reason || undefined });
      return;
    }

    const vehicleState = parseVehicleState();
    if (!vehicleState) return;

    if (action === "handover") {
      await onSubmit(action, {
        handoverOdometerKm: vehicleState.normalizedOdometer,
        handoverEnergyLevelPercent: vehicleState.normalizedEnergy,
      });
      return;
    }

    if (conditionNotes.trim().length > 1000) {
      setValidationError("Ghi chú tình trạng xe không được vượt quá 1000 ký tự.");
      return;
    }

    await onSubmit(action, {
      returnOdometerKm: vehicleState.normalizedOdometer,
      returnEnergyLevelPercent: vehicleState.normalizedEnergy,
      returnDashboardImage: returnDashboardImage || undefined,
      conditionNotes: conditionNotes.trim(),
      hasDamage,
      hasCleaningIssue,
      hasFuelShortage,
    });
  };

  return (
    <AdminModal
      open
      title={copy.title}
      description={copy.description}
      confirmText={copy.confirmText}
      danger={action === "reject" || action === "no-show"}
      loading={loading || uploadingReturnImage}
      onClose={onClose}
      onConfirm={() => void handleSubmit()}
    >
      <div className="space-y-5">
        <BookingSummary detail={detail} />

        {detail.status === "REQUESTED" && (
          <BookingApprovalDeadline createdAt={detail.createdAt} />
        )}

        {action === "approve" && (
          <p className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm font-semibold leading-6 text-primary">
            Sau khi duyệt, khách thuê sẽ được chuyển sang bước thanh toán. Hành động này không tự đánh dấu booking đã thanh toán.
          </p>
        )}

        {action === "reject" && (
          <label className="block">
            <span className="text-sm font-extrabold text-primary">Lý do từ chối *</span>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Ví dụ: Xe đang cần bảo dưỡng trong thời gian khách yêu cầu."
              className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm font-semibold outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/20"
            />
            <span className="mt-1 block text-right text-xs text-slate-400">
              {rejectReason.length}/500
            </span>
          </label>
        )}

        {action === "no-show" && (
          <label className="block">
            <span className="text-sm font-extrabold text-primary">
              Ghi chú (không bắt buộc)
            </span>
            <textarea
              value={noShowReason}
              onChange={(event) => setNoShowReason(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Ví dụ: Đã liên hệ nhưng khách không đến nhận xe."
              className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm font-semibold outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/20"
            />
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Hệ thống vẫn kiểm tra đúng chủ xe, trạng thái booking và thời gian chờ 30 phút.
            </p>
          </label>
        )}

        {action === "return" && (
          <div className="rounded-lg border border-secondary/40 bg-yellow-50 px-4 py-3">
            <p className="text-xs font-extrabold uppercase text-amber-700">
              ODO đang ghi nhận trên hệ thống
            </p>
            <p className="mt-1 text-2xl font-black text-primary">
              {detail.currentOdometerKm !== null &&
              detail.currentOdometerKm !== undefined
                ? `${new Intl.NumberFormat("vi-VN").format(detail.currentOdometerKm)} km`
                : "Chưa cập nhật"}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              ODO lúc bàn giao: {detail.handoverSnapshot?.handoverOdometerKm !== undefined
                ? `${new Intl.NumberFormat("vi-VN").format(detail.handoverSnapshot.handoverOdometerKm)} km`
                : "Chưa ghi nhận"}. Hãy đối chiếu với đồng hồ xe trước khi nhập ODO nhận lại.
            </p>
          </div>
        )}

        {(action === "handover" || action === "return") && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-extrabold text-primary">
                <Gauge size={17} className="text-secondaryDark" /> ODO {action === "handover" ? "bàn giao" : "nhận lại"} (km) *
              </span>
              <input
                inputMode="numeric"
                value={odometer}
                onChange={(event) => setOdometer(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder={
                  action === "return" && detail.handoverSnapshot
                    ? `Từ ${detail.handoverSnapshot.handoverOdometerKm} km`
                    : "Nhập ODO hiện tại"
                }
                className="mt-2 h-12 w-full rounded-lg border border-slate-200 px-3 font-bold outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/20"
              />
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-extrabold text-primary">
                <Fuel size={17} className="text-secondaryDark" /> Nhiên liệu/năng lượng (%) *
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={energyPercent}
                onChange={(event) => setEnergyPercent(event.target.value)}
                placeholder="0 - 100"
                className="mt-2 h-12 w-full rounded-lg border border-slate-200 px-3 font-bold outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/20"
              />
            </label>
          </div>
        )}

        {action === "return" && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-primary">
                    Ảnh đồng hồ ODO khi nhận xe
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Ảnh giúp đối chiếu số kilomet đã nhập. Hỗ trợ JPG, PNG, WEBP tối đa 5 MB.
                  </p>
                </div>
                {returnDashboardImage && (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                    Đã tải ảnh
                  </span>
                )}
              </div>

              {returnDashboardImage ? (
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <img
                    src={normalizeImageUrl(returnDashboardImage)}
                    alt="Ảnh đồng hồ ODO khi nhận xe trả"
                    className="h-44 w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setReturnDashboardImage("")}
                    className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:bg-red-600"
                    aria-label="Xóa ảnh đồng hồ ODO"
                    title="Xóa ảnh"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ) : (
                <label className={`flex min-h-24 items-center justify-center gap-3 rounded-lg border border-dashed border-secondary/60 bg-yellow-50 px-4 text-sm font-extrabold text-primary transition hover:bg-yellow-100 ${uploadingReturnImage ? "cursor-wait opacity-70" : "cursor-pointer"}`}>
                  {uploadingReturnImage ? (
                    <Loader2 size={21} className="animate-spin text-secondaryDark" />
                  ) : (
                    <ImagePlus size={21} className="text-secondaryDark" />
                  )}
                  {uploadingReturnImage
                    ? "Đang tải ảnh ODO..."
                    : "Chọn ảnh đồng hồ ODO"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingReturnImage}
                    className="hidden"
                    onChange={handleReturnDashboardImageChange}
                  />
                </label>
              )}
            </div>

            <label className="block">
              <span className="text-sm font-extrabold text-primary">Ghi chú tình trạng xe</span>
              <textarea
                value={conditionNotes}
                onChange={(event) => setConditionNotes(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Ghi nhận nhanh tình trạng xe khi nhận lại."
                className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm font-semibold outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/20"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["Có hư hỏng", hasDamage, setHasDamage],
                ["Cần vệ sinh", hasCleaningIssue, setHasCleaningIssue],
                ["Thiếu nhiên liệu", hasFuelShortage, setHasFuelShortage],
              ].map(([label, checked, setter]) => (
                <label key={String(label)} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-primary">
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                    className="h-4 w-4 accent-secondaryDark"
                  />
                  {String(label)}
                </label>
              ))}
            </div>
          </div>
        )}

        {validationError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {validationError}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
