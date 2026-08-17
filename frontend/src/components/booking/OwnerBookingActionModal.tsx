// Modal xử lý các thao tác booking dành cho chủ xe ký gửi.
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
  VehicleAccessoriesSnapshot,
  VehicleConditionChecklist,
  VehicleDocumentsSnapshot,
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
  ) => Promise<unknown>;
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
    description: "Có thể bàn giao sớm tối đa 15 phút trước giờ nhận xe. Lập biên bản tình trạng xe và xác nhận bàn giao để chờ người thuê xác nhận nhận xe.",
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
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type PendingChecklist<T> = { [K in keyof T]: boolean | null };

const VEHICLE_CONDITION_ITEMS: Array<[
  keyof VehicleConditionChecklist,
  string,
]> = [
  ["bodyOk", "Thân vỏ, vết trầy xước"],
  ["glassAndMirrorsOk", "Kính và gương"],
  ["lightsOk", "Hệ thống đèn"],
  ["tiresOk", "Lốp xe"],
  ["interiorClean", "Nội thất sạch sẽ"],
  ["seatsAndSeatbeltsOk", "Ghế và dây an toàn"],
  ["airConditioningOk", "Điều hòa"],
  ["dashboardWarningFree", "Bảng đồng hồ không có cảnh báo bất thường"],
];

const VEHICLE_ACCESSORY_ITEMS: Array<[
  Exclude<keyof VehicleAccessoriesSnapshot, "chargingCableApplicable" | "chargingCablePresent">,
  string,
]> = [
  ["vehicleKeysPresent", "Chìa khóa xe"],
  ["tireSupportKitPresent", "Lốp dự phòng hoặc bộ vá lốp"],
  ["basicToolkitPresent", "Kích xe và bộ dụng cụ cơ bản"],
  ["warningTrianglePresent", "Tam giác cảnh báo"],
];

const VEHICLE_DOCUMENT_ITEMS: Array<[
  keyof VehicleDocumentsSnapshot,
  string,
]> = [
  ["registrationPresent", "Đăng ký xe hoặc giấy tờ thay thế hợp pháp"],
  ["inspectionCertificatePresent", "Giấy chứng nhận đăng kiểm"],
  ["insuranceCertificatePresent", "Giấy chứng nhận bảo hiểm"],
];

function ChecklistChoice({
  label,
  value,
  positiveLabel,
  negativeLabel,
  onChange,
}: {
  label: string;
  value: boolean | null;
  positiveLabel: string;
  negativeLabel: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-bold text-primary">{label}</span>
      <div className="flex shrink-0 gap-2">
        {[
          [true, positiveLabel],
          [false, negativeLabel],
        ].map(([choice, choiceLabel]) => (
          <button
            key={String(choice)}
            type="button"
            onClick={() => onChange(Boolean(choice))}
            className={`rounded-md border px-3 py-1.5 text-xs font-extrabold transition ${
              value === choice
                ? choice
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-red-400 bg-red-50 text-red-700"
                : "border-slate-200 text-slate-500 hover:border-secondary"
            }`}
          >
            {String(choiceLabel)}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [preparationOdometer, setPreparationOdometer] = useState(() =>
    action === "handover" &&
    detail?.currentOdometerKm !== null &&
    detail?.currentOdometerKm !== undefined
      ? String(detail.currentOdometerKm)
      : "",
  );
  const [preparationEnergyPercent, setPreparationEnergyPercent] = useState("");
  const [preparationNotes, setPreparationNotes] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [hasDamage, setHasDamage] = useState(false);
  const [hasCleaningIssue, setHasCleaningIssue] = useState(false);
  const [hasFuelShortage, setHasFuelShortage] = useState(false);
  const [dashboardImage, setDashboardImage] = useState("");
  const [uploadingDashboardImage, setUploadingDashboardImage] = useState(false);
  const [validationError, setValidationError] = useState("");
  const isElectricVehicle = detail?.car.fuelType === "ELECTRIC";
  const handoverCableApplicable =
    detail?.handoverSnapshot?.accessoriesSnapshot?.chargingCableApplicable;
  const initialCableApplicability =
    action === "return" && typeof handoverCableApplicable === "boolean"
      ? handoverCableApplicable
      : isElectricVehicle
        ? null
        : false;
  const [chargingCableApplicable, setChargingCableApplicable] = useState<boolean | null>(
    initialCableApplicability,
  );
  const cableApplicable = chargingCableApplicable === true;
  const [vehicleCondition, setVehicleCondition] = useState<
    PendingChecklist<VehicleConditionChecklist>
  >({
    bodyOk: null,
    glassAndMirrorsOk: null,
    lightsOk: null,
    tiresOk: null,
    interiorClean: null,
    seatsAndSeatbeltsOk: null,
    airConditioningOk: null,
    dashboardWarningFree: null,
  });
  const [accessoriesSnapshot, setAccessoriesSnapshot] = useState<
    PendingChecklist<VehicleAccessoriesSnapshot>
  >({
    vehicleKeysPresent: null,
    tireSupportKitPresent: null,
    basicToolkitPresent: null,
    warningTrianglePresent: null,
    chargingCableApplicable: initialCableApplicability,
    chargingCablePresent: cableApplicable ? null : false,
  });
  const [vehicleDocumentsSnapshot, setVehicleDocumentsSnapshot] = useState<
    PendingChecklist<VehicleDocumentsSnapshot>
  >({
    registrationPresent: null,
    inspectionCertificatePresent: null,
    insuranceCertificatePresent: null,
  });

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

  const handleDashboardImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    setValidationError("");

    if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) {
      setValidationError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP; không hỗ trợ HEIC.");
      return;
    }

    if (file.size > MAX_ODO_IMAGE_SIZE) {
      setValidationError("Ảnh ODO không được vượt quá 5 MB.");
      return;
    }

    setUploadingDashboardImage(true);
    try {
      const uploadedImage = await uploadService.uploadCarImage(file);
      setDashboardImage(uploadedImage.url);
    } catch {
      setValidationError(
        "Không thể tải ảnh ODO lên hệ thống. Vui lòng thử lại.",
      );
    } finally {
      setUploadingDashboardImage(false);
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

    if (conditionNotes.trim().length > 1000) {
      setValidationError("Ghi chú tình trạng xe không được vượt quá 1000 ký tự.");
      return;
    }

    if (Object.values(vehicleCondition).some((value) => value === null)) {
      setValidationError("Vui lòng ghi nhận đầy đủ từng mục tình trạng xe.");
      return;
    }
    if (
      VEHICLE_ACCESSORY_ITEMS.some(([key]) => accessoriesSnapshot[key] === null) ||
      chargingCableApplicable === null ||
      (cableApplicable && accessoriesSnapshot.chargingCablePresent === null)
    ) {
      setValidationError("Vui lòng ghi nhận đầy đủ từng phụ kiện theo xe.");
      return;
    }
    if (Object.values(vehicleDocumentsSnapshot).some((value) => value === null)) {
      setValidationError("Vui lòng ghi nhận đầy đủ từng giấy tờ theo xe.");
      return;
    }
    if (
      Object.values(vehicleCondition).some((value) => value === false) &&
      !conditionNotes.trim()
    ) {
      setValidationError("Vui lòng mô tả trong ghi chú khi có mục tình trạng xe không đạt.");
      return;
    }

    const completedVehicleCondition =
      vehicleCondition as VehicleConditionChecklist;
    const completedAccessoriesSnapshot = {
      ...accessoriesSnapshot,
      chargingCableApplicable: Boolean(chargingCableApplicable),
      chargingCablePresent: cableApplicable
        ? Boolean(accessoriesSnapshot.chargingCablePresent)
        : false,
    } as VehicleAccessoriesSnapshot;
    const completedVehicleDocumentsSnapshot =
      vehicleDocumentsSnapshot as VehicleDocumentsSnapshot;

    if (action === "handover") {
      const normalizedPreparationOdometer = Number(preparationOdometer);
      const normalizedPreparationEnergy = Number(preparationEnergyPercent);
      if (
        !Number.isInteger(normalizedPreparationOdometer) ||
        normalizedPreparationOdometer < 0
      ) {
        setValidationError("ODO kiểm tra trước khi giao phải là số nguyên không âm.");
        return;
      }
      if (
        !Number.isFinite(normalizedPreparationEnergy) ||
        normalizedPreparationEnergy < 0 ||
        normalizedPreparationEnergy > 100
      ) {
        setValidationError("Mức nhiên liệu/pin trước khi giao phải từ 0 đến 100%.");
        return;
      }
      if (preparationNotes.trim().length > 1000) {
        setValidationError("Ghi chú trước khi giao không được vượt quá 1000 ký tự.");
        return;
      }
      await onSubmit(action, {
        preparation: {
          odometerKm: normalizedPreparationOdometer,
          energyLevelPercent: normalizedPreparationEnergy,
          images: dashboardImage ? [dashboardImage] : undefined,
          dashboardImage: dashboardImage || undefined,
          note: preparationNotes.trim() || undefined,
        },
        handoverOdometerKm: vehicleState.normalizedOdometer,
        handoverEnergyLevelPercent: vehicleState.normalizedEnergy,
        handoverPhotos: dashboardImage ? [dashboardImage] : undefined,
        handoverDashboardImage: dashboardImage || undefined,
        handoverConditionNotes: conditionNotes.trim() || undefined,
        vehicleCondition: completedVehicleCondition,
        accessoriesSnapshot: completedAccessoriesSnapshot,
        vehicleDocumentsSnapshot: completedVehicleDocumentsSnapshot,
      });
      return;
    }

    await onSubmit(action, {
      returnOdometerKm: vehicleState.normalizedOdometer,
      returnEnergyLevelPercent: vehicleState.normalizedEnergy,
      returnDashboardImage: dashboardImage || undefined,
      conditionNotes: conditionNotes.trim(),
      hasDamage,
      hasCleaningIssue,
      hasFuelShortage,
      vehicleCondition: completedVehicleCondition,
      accessoriesSnapshot: completedAccessoriesSnapshot,
      vehicleDocumentsSnapshot: completedVehicleDocumentsSnapshot,
    });
  };

  return (
    <AdminModal
      open
      title={copy.title}
      description={copy.description}
      confirmText={copy.confirmText}
      danger={action === "reject" || action === "no-show"}
      loading={loading || uploadingDashboardImage}
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

        {action === "handover" && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="font-extrabold text-primary">I. Kiểm tra trước khi đi giao</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Ghi nhận tình trạng xe trước khi mang xe đến điểm hẹn.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="text-sm font-extrabold text-primary">ODO trước khi đi giao (km) *</span><input inputMode="numeric" value={preparationOdometer} onChange={(event) => setPreparationOdometer(event.target.value.replace(/[^0-9]/g, ""))} className="mt-2 h-12 w-full rounded-lg border border-slate-200 bg-white px-3 font-bold outline-none focus:border-secondary" /></label>
              <label className="block"><span className="text-sm font-extrabold text-primary">Nhiên liệu/pin trước khi đi giao (%) *</span><input type="number" min={0} max={100} value={preparationEnergyPercent} onChange={(event) => setPreparationEnergyPercent(event.target.value)} className="mt-2 h-12 w-full rounded-lg border border-slate-200 bg-white px-3 font-bold outline-none focus:border-secondary" /></label>
            </div>
            <label className="block"><span className="text-sm font-extrabold text-primary">Ghi chú trước khi đi giao</span><textarea value={preparationNotes} onChange={(event) => setPreparationNotes(event.target.value)} rows={2} maxLength={1000} placeholder="Ví dụ: ngoại thất sạch, không phát hiện vết xước mới." className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold outline-none focus:border-secondary" /></label>
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

        {(action === "handover" || action === "return") && (
          <div className="space-y-4">
            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="font-extrabold text-primary">Tình trạng xe</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Chọn rõ Đạt hoặc Không đạt cho từng mục. Không đạt vẫn được lưu nếu đã mô tả trong ghi chú.</p>
              </div>
              {VEHICLE_CONDITION_ITEMS.map(([key, label]) => (
                <ChecklistChoice key={key} label={label} value={vehicleCondition[key]} positiveLabel="Đạt" negativeLabel="Không đạt" onChange={(value) => setVehicleCondition((current) => ({ ...current, [key]: value }))} />
              ))}
            </section>

            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-extrabold text-primary">Phụ kiện theo xe</p>
              {VEHICLE_ACCESSORY_ITEMS.map(([key, label]) => (
                <ChecklistChoice key={key} label={label} value={accessoriesSnapshot[key]} positiveLabel="Có" negativeLabel="Không có" onChange={(value) => setAccessoriesSnapshot((current) => ({ ...current, [key]: value }))} />
              ))}
              {action === "handover" && isElectricVehicle && (
                <ChecklistChoice label="Xe thực tế có áp dụng cáp sạc đi kèm" value={chargingCableApplicable} positiveLabel="Có áp dụng" negativeLabel="Không áp dụng" onChange={(value) => {
                  setChargingCableApplicable(value);
                  setAccessoriesSnapshot((current) => ({
                    ...current,
                    chargingCableApplicable: value,
                    chargingCablePresent: value ? null : false,
                  }));
                }} />
              )}
              {cableApplicable && (
                <ChecklistChoice label="Cáp sạc" value={accessoriesSnapshot.chargingCablePresent} positiveLabel="Có" negativeLabel="Không có" onChange={(value) => setAccessoriesSnapshot((current) => ({ ...current, chargingCablePresent: value }))} />
              )}
              {!cableApplicable && <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-500">Cáp sạc: Không áp dụng với xe này.</p>}
            </section>

            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-extrabold text-primary">Giấy tờ theo xe</p>
              {VEHICLE_DOCUMENT_ITEMS.map(([key, label]) => (
                <ChecklistChoice key={key} label={label} value={vehicleDocumentsSnapshot[key]} positiveLabel="Có" negativeLabel="Không có" onChange={(value) => setVehicleDocumentsSnapshot((current) => ({ ...current, [key]: value }))} />
              ))}
            </section>
          </div>
        )}

        {(action === "handover" || action === "return") && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-primary">
                    Ảnh đồng hồ ODO {action === "handover" ? "khi bàn giao" : "khi nhận xe"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Ảnh giúp đối chiếu số kilomet đã nhập. Hỗ trợ JPG, PNG, WEBP tối đa 5 MB.
                  </p>
                </div>
                {dashboardImage && (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                    Đã tải ảnh
                  </span>
                )}
              </div>

              {dashboardImage ? (
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <img
                    src={normalizeImageUrl(dashboardImage)}
                    alt={action === "handover" ? "Ảnh đồng hồ ODO khi bàn giao" : "Ảnh đồng hồ ODO khi nhận xe trả"}
                    className="h-44 w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setDashboardImage("")}
                    className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:bg-red-600"
                    aria-label="Xóa ảnh đồng hồ ODO"
                    title="Xóa ảnh"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ) : (
                <label className={`flex min-h-24 items-center justify-center gap-3 rounded-lg border border-dashed border-secondary/60 bg-yellow-50 px-4 text-sm font-extrabold text-primary transition hover:bg-yellow-100 ${uploadingDashboardImage ? "cursor-wait opacity-70" : "cursor-pointer"}`}>
                  {uploadingDashboardImage ? (
                    <Loader2 size={21} className="animate-spin text-secondaryDark" />
                  ) : (
                    <ImagePlus size={21} className="text-secondaryDark" />
                  )}
                  {uploadingDashboardImage
                    ? "Đang tải ảnh ODO..."
                    : "Chọn ảnh đồng hồ ODO"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingDashboardImage}
                    className="hidden"
                    onChange={handleDashboardImageChange}
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
            {action === "return" && <div className="grid gap-2 sm:grid-cols-3">
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
            </div>}
          </div>
        )}

        {action === "handover" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-primary">
            Bên giao xác nhận đã bàn giao xe và các hạng mục được ghi nhận trong biên bản. Sau khi xác nhận, dữ liệu biên bản sẽ được khóa để chờ người thuê xác nhận.
          </p>
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
