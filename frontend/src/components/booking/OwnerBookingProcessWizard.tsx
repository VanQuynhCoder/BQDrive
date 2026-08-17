import { type ChangeEvent, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Fuel,
  Gauge,
  ImagePlus,
  Loader2,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { uploadService } from "../../services/upload.service";
import type {
  OwnerBookingDetail,
  OwnerHandoverPayload,
  OwnerReturnPayload,
  VehicleAccessoriesSnapshot,
  VehicleConditionChecklist,
  VehicleDocumentsSnapshot,
} from "../../types/ownerBooking";
import { formatVietnamDateTime } from "../../utils/date.util";
import { normalizeImageUrl } from "../../utils/image.util";

type ProcessMode = "handover" | "return";
type ProcessPayload = OwnerHandoverPayload | OwnerReturnPayload;
type SubmitResult = { success: boolean; error?: string };
type PendingChecklist<T> = { [K in keyof T]: boolean | null };

type Props = {
  mode: ProcessMode;
  detail: OwnerBookingDetail;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: ProcessPayload) => Promise<SubmitResult>;
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_PHOTOS = 8;
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const CONDITION_ITEMS: Array<[keyof VehicleConditionChecklist, string]> = [
  ["bodyOk", "Thân vỏ, vết trầy xước"],
  ["glassAndMirrorsOk", "Kính và gương"],
  ["lightsOk", "Hệ thống đèn"],
  ["tiresOk", "Lốp xe"],
  ["interiorClean", "Nội thất sạch sẽ"],
  ["seatsAndSeatbeltsOk", "Ghế và dây an toàn"],
  ["airConditioningOk", "Điều hòa"],
  ["dashboardWarningFree", "Bảng đồng hồ không có cảnh báo bất thường"],
];

const ACCESSORY_ITEMS: Array<[
  Exclude<
    keyof VehicleAccessoriesSnapshot,
    "chargingCableApplicable" | "chargingCablePresent"
  >,
  string,
]> = [
  ["vehicleKeysPresent", "Chìa khóa xe"],
  ["tireSupportKitPresent", "Lốp dự phòng hoặc bộ vá lốp"],
  ["basicToolkitPresent", "Kích xe và bộ dụng cụ cơ bản"],
  ["warningTrianglePresent", "Tam giác cảnh báo"],
];

const DOCUMENT_ITEMS: Array<[keyof VehicleDocumentsSnapshot, string]> = [
  ["registrationPresent", "Đăng ký xe hoặc giấy tờ thay thế hợp pháp"],
  ["inspectionCertificatePresent", "Giấy chứng nhận đăng kiểm"],
  ["insuranceCertificatePresent", "Giấy chứng nhận bảo hiểm"],
];

function formatDateTime(value?: string | null) {
  return value
    ? formatVietnamDateTime(value, { dateStyle: "short", timeStyle: "short" })
    : "--";
}

function formatNumber(value?: number | null, suffix = "") {
  if (value === null || value === undefined) return "--";
  return `${new Intl.NumberFormat("vi-VN").format(value)}${suffix}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error as {
      response?: { data?: { data?: unknown; message?: unknown } };
    };
    if (typeof response.response?.data?.data === "string") {
      return response.response.data.data;
    }
    if (typeof response.response?.data?.message === "string") {
      return response.response.data.message;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function ChoiceRow({
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
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-bold leading-5 text-primary">{label}</span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`min-h-10 rounded-lg border px-3 text-xs font-extrabold transition ${
            value === true
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-slate-200 text-slate-500 hover:border-emerald-300"
          }`}
        >
          {positiveLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`min-h-10 rounded-lg border px-3 text-xs font-extrabold transition ${
            value === false
              ? "border-red-400 bg-red-50 text-red-700"
              : "border-slate-200 text-slate-500 hover:border-red-300"
          }`}
        >
          {negativeLabel}
        </button>
      </div>
    </div>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold leading-6 text-primary">
        {value || "--"}
      </p>
    </div>
  );
}

function ChecklistReview({
  title,
  items,
  values,
  positiveLabel,
  negativeLabel,
}: {
  title: string;
  items: Array<[string, string]>;
  values: Record<string, boolean | null | undefined>;
  positiveLabel: string;
  negativeLabel: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h4 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-extrabold text-primary">
        {title}
      </h4>
      <div className="divide-y divide-slate-100">
        {items.map(([key, label]) => {
          const value = values[key];
          return (
            <div key={key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="font-semibold text-slate-700">{label}</span>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${
                  value === true
                    ? "bg-emerald-50 text-emerald-700"
                    : value === false
                      ? "bg-red-50 text-red-700"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {value === true ? positiveLabel : value === false ? negativeLabel : "Chưa chọn"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function OwnerBookingProcessWizard({
  mode,
  detail,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const isHandover = mode === "handover";
  const stepLabels = isHandover
    ? ["Thông tin chuyến", "Thông số & ảnh", "Kiểm tra xe", "Xem lại"]
    : ["Thông tin & đối chiếu", "Thông số & ảnh", "Kiểm tra xe", "Tổng kết"];
  const handoverSnapshot = detail.handoverSnapshot;
  const returnOdometerReference =
    handoverSnapshot?.handoverOdometerKm ?? detail.currentOdometerKm ?? null;
  const isElectricVehicle = detail.car.fuelType === "ELECTRIC";
  const initialCableApplicable = isHandover
    ? isElectricVehicle
      ? null
      : false
    : typeof handoverSnapshot?.accessoriesSnapshot?.chargingCableApplicable === "boolean"
      ? handoverSnapshot.accessoriesSnapshot.chargingCableApplicable
      : isElectricVehicle
        ? null
        : false;
  const initialReturnEnergy = !isHandover && handoverSnapshot?.handoverEnergyLevelPercent !== undefined
    ? String(handoverSnapshot.handoverEnergyLevelPercent)
    : "";

  const [currentStep, setCurrentStep] = useState(1);
  const [highestStep, setHighestStep] = useState(1);
  const [preparationOdometer, setPreparationOdometer] = useState(
    isHandover && detail.currentOdometerKm !== null && detail.currentOdometerKm !== undefined
      ? String(detail.currentOdometerKm)
      : "",
  );
  const [preparationEnergy, setPreparationEnergy] = useState("");
  const [preparationNote, setPreparationNote] = useState("");
  const [odometer, setOdometer] = useState(
    isHandover && detail.currentOdometerKm !== null && detail.currentOdometerKm !== undefined
      ? String(detail.currentOdometerKm)
      : "",
  );
  const [energy, setEnergy] = useState(initialReturnEnergy);
  const [dashboardImage, setDashboardImage] = useState("");
  const [conditionImages, setConditionImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [conditionNotes, setConditionNotes] = useState("");
  const [hasDamage, setHasDamage] = useState(false);
  const [hasCleaningIssue, setHasCleaningIssue] = useState(false);
  const [hasFuelShortage, setHasFuelShortage] = useState(false);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [error, setError] = useState("");
  const [vehicleCondition, setVehicleCondition] = useState<PendingChecklist<VehicleConditionChecklist>>({
    bodyOk: null,
    glassAndMirrorsOk: null,
    lightsOk: null,
    tiresOk: null,
    interiorClean: null,
    seatsAndSeatbeltsOk: null,
    airConditioningOk: null,
    dashboardWarningFree: null,
  });
  const [accessoriesSnapshot, setAccessoriesSnapshot] = useState<PendingChecklist<VehicleAccessoriesSnapshot>>({
    vehicleKeysPresent: null,
    tireSupportKitPresent: null,
    basicToolkitPresent: null,
    warningTrianglePresent: null,
    chargingCableApplicable: initialCableApplicable,
    chargingCablePresent: initialCableApplicable === true ? null : false,
  });
  const [vehicleDocumentsSnapshot, setVehicleDocumentsSnapshot] = useState<PendingChecklist<VehicleDocumentsSnapshot>>({
    registrationPresent: null,
    inspectionCertificatePresent: null,
    insuranceCertificatePresent: null,
  });

  const initialSnapshot = useRef<string | null>(null);
  const currentSnapshot = JSON.stringify({
    preparationOdometer,
    preparationEnergy,
    preparationNote,
    odometer,
    energy,
    dashboardImage,
    conditionImages,
    conditionNotes,
    hasDamage,
    hasCleaningIssue,
    hasFuelShortage,
    reviewAccepted,
    vehicleCondition,
    accessoriesSnapshot,
    vehicleDocumentsSnapshot,
  });
  if (initialSnapshot.current === null) initialSnapshot.current = currentSnapshot;
  const isDirty = initialSnapshot.current !== currentSnapshot;
  const cableApplicable = accessoriesSnapshot.chargingCableApplicable === true;
  const expectedDistance = useMemo(() => {
    const start = Number(returnOdometerReference);
    const end = Number(odometer);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start
      ? end - start
      : null;
  }, [odometer, returnOdometerReference]);

  const changeStep = (step: number) => {
    setCurrentStep(step);
    setHighestStep((value) => Math.max(value, step));
    setError("");
  };

  const validateStep = (step: number) => {
    if (step === 2) {
      const normalizedOdometer = Number(odometer);
      const normalizedEnergy = Number(energy);
      if (!Number.isInteger(normalizedOdometer) || normalizedOdometer < 0) {
        setError("ODO phải là số nguyên không âm.");
        return false;
      }
      if (
        !isHandover &&
        returnOdometerReference !== null &&
        returnOdometerReference !== undefined &&
        normalizedOdometer < Number(returnOdometerReference)
      ) {
        setError(
          `ODO nhận lại không được nhỏ hơn ${formatNumber(returnOdometerReference)} km đã ghi nhận lúc bàn giao.`,
        );
        return false;
      }
      if (!Number.isFinite(normalizedEnergy) || normalizedEnergy < 0 || normalizedEnergy > 100) {
        setError("Mức nhiên liệu/năng lượng phải từ 0 đến 100%.");
        return false;
      }
      if (isHandover) {
        const beforeOdometer = Number(preparationOdometer);
        const beforeEnergy = Number(preparationEnergy);
        if (!Number.isInteger(beforeOdometer) || beforeOdometer < 0) {
          setError("ODO kiểm tra trước khi giao phải là số nguyên không âm.");
          return false;
        }
        if (!Number.isFinite(beforeEnergy) || beforeEnergy < 0 || beforeEnergy > 100) {
          setError("Mức nhiên liệu/pin trước khi giao phải từ 0 đến 100%.");
          return false;
        }
        if (preparationNote.trim().length > 1000) {
          setError("Ghi chú trước khi giao không được vượt quá 1000 ký tự.");
          return false;
        }
      }
    }

    if (step === 3) {
      if (conditionNotes.trim().length > 1000) {
        setError("Ghi chú tình trạng xe không được vượt quá 1000 ký tự.");
        return false;
      }
      if (Object.values(vehicleCondition).some((value) => value === null)) {
        setError("Vui lòng ghi nhận đầy đủ từng mục tình trạng xe.");
        return false;
      }
      if (
        ACCESSORY_ITEMS.some(([key]) => accessoriesSnapshot[key] === null) ||
        accessoriesSnapshot.chargingCableApplicable === null ||
        (cableApplicable && accessoriesSnapshot.chargingCablePresent === null)
      ) {
        setError("Vui lòng ghi nhận đầy đủ từng phụ kiện theo xe.");
        return false;
      }
      if (Object.values(vehicleDocumentsSnapshot).some((value) => value === null)) {
        setError("Vui lòng ghi nhận đầy đủ từng giấy tờ theo xe.");
        return false;
      }
      if (Object.values(vehicleCondition).some((value) => value === false) && !conditionNotes.trim()) {
        setError("Vui lòng mô tả trong ghi chú khi có mục tình trạng xe không đạt.");
        return false;
      }
    }

    if (step === 4 && !reviewAccepted) {
      setError("Vui lòng xác nhận đã kiểm tra thông tin trước khi gửi biên bản.");
      return false;
    }

    setError("");
    return true;
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < 4) changeStep(currentStep + 1);
  };

  const handleClose = () => {
    if (isDirty && !window.confirm("Thông tin chưa được gửi sẽ bị mất. Bạn có chắc muốn đóng?")) {
      return;
    }
    onClose();
  };

  const uploadImage = async (file: File) => {
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) {
      setError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP; không hỗ trợ HEIC.");
      return null;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError("Mỗi ảnh không được vượt quá 5 MB.");
      return null;
    }
    setUploading(true);
    setError("");
    try {
      return (await uploadService.uploadCarImage(file)).url;
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, "Không thể tải ảnh lên hệ thống."));
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleDashboardImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const imageUrl = await uploadImage(file);
    if (imageUrl) setDashboardImage(imageUrl);
  };

  const handleConditionImagesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const availableSlots = MAX_PHOTOS - conditionImages.length;
    if (!files.length || availableSlots <= 0) {
      setError(`Chỉ được thêm tối đa ${MAX_PHOTOS} ảnh hiện trạng.`);
      return;
    }
    const acceptedFiles = files.slice(0, availableSlots);
    if (acceptedFiles.some((file) => !SUPPORTED_IMAGE_MIME_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE)) {
      setError("Ảnh hiện trạng phải là JPG, PNG hoặc WEBP và không vượt quá 5 MB mỗi ảnh.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const uploaded = await Promise.all(
        acceptedFiles.map((file) => uploadService.uploadCarImage(file)),
      );
      setConditionImages((current) => [
        ...current,
        ...uploaded.map((image) => image.url),
      ]);
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, "Không thể tải ảnh hiện trạng lên hệ thống."));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!validateStep(4) || loading || uploading) return;

    const completedVehicleCondition = vehicleCondition as VehicleConditionChecklist;
    const completedAccessories = {
      ...accessoriesSnapshot,
      chargingCableApplicable: Boolean(accessoriesSnapshot.chargingCableApplicable),
      chargingCablePresent: cableApplicable
        ? Boolean(accessoriesSnapshot.chargingCablePresent)
        : false,
    } as VehicleAccessoriesSnapshot;
    const completedDocuments = vehicleDocumentsSnapshot as VehicleDocumentsSnapshot;
    const payload: ProcessPayload = isHandover
      ? {
          preparation: {
            odometerKm: Number(preparationOdometer),
            energyLevelPercent: Number(preparationEnergy),
            images: [dashboardImage, ...conditionImages].filter(Boolean).slice(0, MAX_PHOTOS),
            dashboardImage: dashboardImage || undefined,
            note: preparationNote.trim() || undefined,
          },
          handoverOdometerKm: Number(odometer),
          handoverEnergyLevelPercent: Number(energy),
          handoverPhotos: conditionImages,
          handoverDashboardImage: dashboardImage || undefined,
          handoverConditionNotes: conditionNotes.trim() || undefined,
          vehicleCondition: completedVehicleCondition,
          accessoriesSnapshot: completedAccessories,
          vehicleDocumentsSnapshot: completedDocuments,
        }
      : {
          returnOdometerKm: Number(odometer),
          returnEnergyLevelPercent: Number(energy),
          returnDashboardImage: dashboardImage || undefined,
          returnPhotos: conditionImages,
          conditionNotes: conditionNotes.trim(),
          hasDamage,
          hasCleaningIssue,
          hasFuelShortage,
          vehicleCondition: completedVehicleCondition,
          accessoriesSnapshot: completedAccessories,
          vehicleDocumentsSnapshot: completedDocuments,
        };

    const result = await onSubmit(payload);
    if (!result.success) setError(result.error || "Không thể gửi biên bản. Vui lòng thử lại.");
  };

  const title = isHandover ? "Bàn giao xe" : "Tiếp nhận xe trả";
  const dashboardLabel = isHandover ? "Ảnh đồng hồ ODO khi bàn giao" : "Ảnh đồng hồ ODO khi nhận lại";
  const conditionImageLabel = isHandover ? "Ảnh hiện trạng khi bàn giao" : "Ảnh hiện trạng khi nhận lại";
  const activeStepTitle = stepLabels[currentStep - 1];

  return (
    <div
      className="fixed inset-0 z-[6000] flex bg-slate-950/65 p-0 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex h-full w-full min-h-0 flex-col bg-slate-50 shadow-2xl sm:rounded-3xl sm:border sm:border-white/20">
        <header className="flex shrink-0 items-start justify-between gap-4 bg-primary px-4 py-4 text-white sm:px-7 sm:py-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">
              Biên bản điện tử BQDrive
            </p>
            <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-white/70">
              {detail.bookingCode} · {detail.car.name}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading || uploading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label="Đóng wizard"
            title="Đóng"
          >
            <X size={21} />
          </button>
        </header>

        <nav className="shrink-0 border-b border-slate-200 bg-white px-3 py-3 sm:px-6" aria-label="Tiến trình biên bản">
          <ol className="grid grid-cols-4 gap-2">
            {stepLabels.map((label, index) => {
              const step = index + 1;
              const isCurrent = step === currentStep;
              const isCompleted = step < highestStep && !isCurrent;
              return (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => step <= highestStep && changeStep(step)}
                    disabled={step > highestStep || loading || uploading}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-xl border p-2 text-left transition ${
                      isCurrent
                        ? "border-secondary bg-primary text-white shadow-sm"
                        : isCompleted
                          ? "border-secondary/60 bg-yellow-50 text-primary hover:bg-yellow-100"
                          : "border-transparent bg-slate-50 text-slate-400"
                    }`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                      isCurrent ? "bg-secondary text-primary" : isCompleted ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white"
                    }`}>
                      {isCompleted ? <Check size={14} strokeWidth={3} /> : step}
                    </span>
                    <span className={`min-w-0 text-xs font-extrabold leading-4 ${isCurrent ? "block" : "hidden lg:block"}`}>
                      {label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7">
          <div className="mx-auto max-w-5xl pb-24">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondarySoft text-primary">
                {isHandover ? <CarFront size={19} /> : <ClipboardCheck size={19} />}
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-secondaryDark">Bước {currentStep}/4</p>
                <h3 className="font-extrabold text-primary">{activeStepTitle}</h3>
              </div>
            </div>

            {currentStep === 1 && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2"><UserRound size={18} className="text-secondaryDark" /><h4 className="font-extrabold text-primary">Thông tin chuyến thuê</h4></div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ReadOnlyValue label="Người thuê" value={detail.customer.name} />
                    <ReadOnlyValue label="Xe" value={detail.car.name} />
                    <ReadOnlyValue label="Biển số" value={detail.car.licensePlate || "Chưa cập nhật"} />
                    <ReadOnlyValue label="Thời gian nhận" value={formatDateTime(detail.startDate)} />
                    <ReadOnlyValue label="Thời gian trả" value={formatDateTime(detail.endDate)} />
                    <ReadOnlyValue label="Địa điểm" value={isHandover ? detail.pickupLocation || "Chưa cập nhật" : detail.returnLocation || detail.pickupLocation || "Chưa cập nhật"} />
                    {isHandover && <ReadOnlyValue label="Hình thức thanh toán" value={detail.paymentOption === "FULL" ? "Thanh toán toàn bộ" : "Thanh toán giữ chỗ"} />}
                    {isHandover && <ReadOnlyValue label="Trạng thái thanh toán" value={detail.paymentStatus || "Chưa cập nhật"} />}
                  </div>
                </section>

                {isHandover ? (
                  <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
                    <CircleAlert className="mt-0.5 shrink-0 text-amber-700" size={19} />
                    <p>Có thể thực hiện bàn giao từ 15 phút trước giờ nhận xe. Hệ thống sẽ kiểm tra điều kiện thanh toán, lịch xe và an toàn bàn giao khi bạn xác nhận cuối.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold leading-6 text-sky-900">
                      <ClipboardCheck className="mt-0.5 shrink-0 text-sky-700" size={19} />
                      <p>Dữ liệu bàn giao dưới đây chỉ dùng để chủ xe đối chiếu khi tiếp nhận xe trả. Thời gian trả thực tế sẽ do hệ thống ghi nhận ở bước xác nhận cuối.</p>
                    </div>
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="mb-4 flex items-center gap-2"><CarFront size={18} className="text-secondaryDark" /><h4 className="font-extrabold text-primary">Dữ liệu lúc giao</h4></div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ReadOnlyValue label="ODO lúc giao" value={`${formatNumber(handoverSnapshot?.handoverOdometerKm)} km`} />
                        <ReadOnlyValue label="Nhiên liệu/pin lúc giao" value={handoverSnapshot?.handoverEnergyLevelPercent !== undefined ? `${handoverSnapshot.handoverEnergyLevelPercent}%` : "--"} />
                      </div>
                      {(handoverSnapshot?.handoverDashboardImage || handoverSnapshot?.handoverPhotos?.length) && (
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {[handoverSnapshot.handoverDashboardImage, ...(handoverSnapshot.handoverPhotos || [])].filter(Boolean).slice(0, MAX_PHOTOS).map((image, index) => (
                            <a key={`${image}-${index}`} href={normalizeImageUrl(String(image))} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                              <img src={normalizeImageUrl(String(image))} alt={`Ảnh bàn giao ${index + 1}`} className="h-28 w-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                      {(handoverSnapshot?.vehicleCondition || handoverSnapshot?.accessoriesSnapshot || handoverSnapshot?.vehicleDocumentsSnapshot) && (
                        <div className="mt-4">
                          <p className="mb-3 text-sm font-extrabold text-primary">Checklist đã ghi nhận lúc bàn giao</p>
                          <div className="grid gap-3 lg:grid-cols-3">
                            <ChecklistReview title="Tình trạng xe" items={CONDITION_ITEMS as Array<[string, string]>} values={handoverSnapshot.vehicleCondition || {}} positiveLabel="Đạt" negativeLabel="Không đạt" />
                            <ChecklistReview title="Phụ kiện" items={[...ACCESSORY_ITEMS, ...(handoverSnapshot.accessoriesSnapshot?.chargingCableApplicable ? [["chargingCablePresent", "Cáp sạc"] as [string, string]] : [])]} values={handoverSnapshot.accessoriesSnapshot || {}} positiveLabel="Có" negativeLabel="Không có" />
                            <ChecklistReview title="Giấy tờ" items={DOCUMENT_ITEMS as Array<[string, string]>} values={handoverSnapshot.vehicleDocumentsSnapshot || {}} positiveLabel="Có" negativeLabel="Không có" />
                          </div>
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-5">
                {isHandover && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <h4 className="font-extrabold text-primary">Trước khi đi giao</h4>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Ghi nhận tình trạng xe trước khi di chuyển đến điểm hẹn.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label><span className="text-sm font-extrabold text-primary">ODO trước khi đi giao (km) *</span><input inputMode="numeric" value={preparationOdometer} onChange={(event) => setPreparationOdometer(event.target.value.replace(/[^0-9]/g, ""))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-4 font-bold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10" /></label>
                      <label><span className="text-sm font-extrabold text-primary">Nhiên liệu/pin trước khi đi giao (%) *</span><input type="number" min={0} max={100} value={preparationEnergy} onChange={(event) => setPreparationEnergy(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-4 font-bold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10" /></label>
                      <label className="sm:col-span-2"><span className="text-sm font-extrabold text-primary">Ghi chú trước khi đi giao</span><textarea value={preparationNote} onChange={(event) => setPreparationNote(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 p-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10" placeholder="Ví dụ: ngoại thất sạch, không phát hiện vết xước mới." /></label>
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center gap-2"><Gauge size={18} className="text-secondaryDark" /><h4 className="font-extrabold text-primary">{isHandover ? "Khi bàn giao" : "Khi nhận lại xe"}</h4></div>
                  {!isHandover && returnOdometerReference !== null && <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">ODO lúc giao: <strong className="text-primary">{formatNumber(returnOdometerReference)} km</strong></p>}
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label><span className="flex items-center gap-2 text-sm font-extrabold text-primary"><Gauge size={16} className="text-secondaryDark" /> ODO {isHandover ? "bàn giao" : "lúc trả"} (km) *</span><input inputMode="numeric" value={odometer} onChange={(event) => setOdometer(event.target.value.replace(/[^0-9]/g, ""))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-4 font-bold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10" placeholder="Nhập ODO hiện tại" /></label>
                    <label><span className="flex items-center gap-2 text-sm font-extrabold text-primary"><Fuel size={16} className="text-secondaryDark" /> Nhiên liệu/năng lượng (%) *</span><input type="number" min={0} max={100} value={energy} onChange={(event) => setEnergy(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-4 font-bold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10" placeholder="0 - 100" /></label>
                  </div>
                  {!isHandover && expectedDistance !== null && <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">Dự kiến đã đi: <strong>{formatNumber(expectedDistance)} km</strong>. Đây chỉ là số liệu tham khảo trước khi hệ thống lập biên bản.</p>}

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-extrabold text-primary">{dashboardLabel}</p><p className="mt-1 text-xs font-semibold text-slate-500">Ảnh tùy chọn, JPG/PNG/WEBP, tối đa 5 MB.</p>
                      {dashboardImage ? <div className="relative mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><img src={normalizeImageUrl(dashboardImage)} alt={dashboardLabel} className="h-48 w-full object-contain" /><button type="button" onClick={() => setDashboardImage("")} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white"><Trash2 size={16} /></button></div> : <label className={`mt-3 flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-secondary/60 bg-white px-4 text-sm font-extrabold text-primary ${uploading ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-yellow-50"}`}><ImagePlus size={19} className="text-secondaryDark" />{uploading ? "Đang tải ảnh..." : "Chọn ảnh ODO"}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading} onChange={handleDashboardImageChange} /></label>}
                    </section>
                    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-extrabold text-primary">{conditionImageLabel}</p><p className="mt-1 text-xs font-semibold text-slate-500">Tùy chọn, tối đa {MAX_PHOTOS} ảnh, mỗi ảnh tối đa 5 MB.</p>
                      <label className={`mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-secondary/60 bg-white px-4 text-sm font-extrabold text-primary ${uploading ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-yellow-50"}`}><ImagePlus size={18} className="text-secondaryDark" />{uploading ? "Đang tải ảnh..." : "Thêm ảnh hiện trạng"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={uploading || conditionImages.length >= MAX_PHOTOS} onChange={handleConditionImagesChange} /></label>
                      {conditionImages.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{conditionImages.map((image, index) => <div key={`${image}-${index}`} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white"><img src={normalizeImageUrl(image)} alt={`Ảnh hiện trạng ${index + 1}`} className="h-24 w-full object-cover" /><button type="button" onClick={() => setConditionImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white"><Trash2 size={14} /></button></div>)}</div>}
                    </section>
                  </div>
                </section>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-5">
                {!isHandover && <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-sky-900">Hãy đánh giá tình trạng thực tế lúc nhận lại và đối chiếu với biên bản bàn giao. Khác biệt chỉ là dữ liệu kiểm tra, không tự tạo phụ phí.</div>}
                {!isHandover && handoverSnapshot?.vehicleCondition && (
                  <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm sm:p-5">
                    <h4 className="font-extrabold text-primary">Đối chiếu tình trạng xe: lúc giao | lúc trả</h4>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Cột bên phải cập nhật theo lựa chọn của bạn, chỉ dùng để hỗ trợ kiểm tra trước khi gửi biên bản.</p>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <ChecklistReview title="Lúc giao" items={CONDITION_ITEMS as Array<[string, string]>} values={handoverSnapshot.vehicleCondition} positiveLabel="Đạt" negativeLabel="Không đạt" />
                      <ChecklistReview title="Lúc trả" items={CONDITION_ITEMS as Array<[string, string]>} values={vehicleCondition} positiveLabel="Đạt" negativeLabel="Không đạt" />
                    </div>
                  </section>
                )}
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h4 className="font-extrabold text-primary">1. Tình trạng xe</h4><div className="mt-4 space-y-2">{CONDITION_ITEMS.map(([key, label]) => <ChoiceRow key={key} label={label} value={vehicleCondition[key]} positiveLabel="Đạt" negativeLabel="Không đạt" onChange={(value) => setVehicleCondition((current) => ({ ...current, [key]: value }))} />)}</div></section>
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h4 className="font-extrabold text-primary">2. Phụ kiện theo xe</h4><div className="mt-4 space-y-2">{ACCESSORY_ITEMS.map(([key, label]) => <ChoiceRow key={key} label={label} value={accessoriesSnapshot[key]} positiveLabel="Có" negativeLabel="Không có" onChange={(value) => setAccessoriesSnapshot((current) => ({ ...current, [key]: value }))} />)}{isHandover && isElectricVehicle && <ChoiceRow label="Xe thực tế có áp dụng cáp sạc đi kèm" value={accessoriesSnapshot.chargingCableApplicable} positiveLabel="Có áp dụng" negativeLabel="Không áp dụng" onChange={(value) => setAccessoriesSnapshot((current) => ({ ...current, chargingCableApplicable: value, chargingCablePresent: value ? null : false }))} />}{cableApplicable && <ChoiceRow label="Cáp sạc" value={accessoriesSnapshot.chargingCablePresent} positiveLabel="Có" negativeLabel="Không có" onChange={(value) => setAccessoriesSnapshot((current) => ({ ...current, chargingCablePresent: value }))} />}</div></section>
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h4 className="font-extrabold text-primary">3. Giấy tờ theo xe</h4><div className="mt-4 space-y-2">{DOCUMENT_ITEMS.map(([key, label]) => <ChoiceRow key={key} label={label} value={vehicleDocumentsSnapshot[key]} positiveLabel="Có" negativeLabel="Không có" onChange={(value) => setVehicleDocumentsSnapshot((current) => ({ ...current, [key]: value }))} />)}</div></section>
                {!isHandover && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h4 className="font-extrabold text-primary">Dấu hiệu cần lưu ý</h4><div className="mt-4 grid gap-2 sm:grid-cols-3">{[["Có hư hỏng", hasDamage, setHasDamage], ["Cần vệ sinh", hasCleaningIssue, setHasCleaningIssue], ["Thiếu nhiên liệu", hasFuelShortage, setHasFuelShortage]].map(([label, checked, setter]) => <label key={String(label)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-primary"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} className="h-4 w-4 accent-secondaryDark" />{String(label)}</label>)}</div></section>}
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><label className="block"><span className="font-extrabold text-primary">Ghi chú tình trạng xe</span><span className="mt-1 block text-sm font-semibold text-slate-500">Bắt buộc khi có hạng mục tình trạng xe không đạt.</span><textarea value={conditionNotes} onChange={(event) => setConditionNotes(event.target.value)} rows={4} maxLength={1000} className="mt-3 w-full rounded-xl border border-slate-200 p-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10" placeholder={isHandover ? "Ghi nhận tình trạng xe khi bàn giao." : "Ghi nhận tình trạng xe khi nhận lại."} /></label></section>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CalendarDays size={18} className="text-secondaryDark" /><h4 className="font-extrabold text-primary">Thông tin chuyến</h4></div><button type="button" onClick={() => changeStep(1)} className="inline-flex items-center gap-1 text-sm font-extrabold text-secondaryDark hover:text-primary"><Pencil size={15} /> Sửa</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><ReadOnlyValue label="Người thuê" value={detail.customer.name} /><ReadOnlyValue label="Xe" value={detail.car.name} /><ReadOnlyValue label="Biển số" value={detail.car.licensePlate || "Chưa cập nhật"} /><ReadOnlyValue label={isHandover ? "Nhận xe" : "Trả dự kiến"} value={formatDateTime(isHandover ? detail.startDate : detail.endDate)} /><ReadOnlyValue label="Địa điểm" value={isHandover ? detail.pickupLocation || "Chưa cập nhật" : detail.returnLocation || detail.pickupLocation || "Chưa cập nhật"} /></div></section>
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Gauge size={18} className="text-secondaryDark" /><h4 className="font-extrabold text-primary">Thông số xe</h4></div><button type="button" onClick={() => changeStep(2)} className="inline-flex items-center gap-1 text-sm font-extrabold text-secondaryDark hover:text-primary"><Pencil size={15} /> Sửa</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{isHandover && <><ReadOnlyValue label="ODO trước khi đi giao" value={`${formatNumber(Number(preparationOdometer))} km`} /><ReadOnlyValue label="Nhiên liệu trước khi đi giao" value={`${preparationEnergy || "--"}%`} /></>} {!isHandover && <><ReadOnlyValue label="ODO lúc giao" value={`${formatNumber(returnOdometerReference)} km`} /><ReadOnlyValue label="Nhiên liệu lúc giao" value={handoverSnapshot?.handoverEnergyLevelPercent !== undefined ? `${handoverSnapshot.handoverEnergyLevelPercent}%` : "--"} /></>}<ReadOnlyValue label={isHandover ? "ODO bàn giao" : "ODO lúc trả"} value={`${formatNumber(Number(odometer))} km`} /><ReadOnlyValue label={isHandover ? "Nhiên liệu bàn giao" : "Nhiên liệu lúc trả"} value={`${energy || "--"}%`} /></div>{!isHandover && expectedDistance !== null && <p className="mt-3 text-sm font-semibold text-slate-600">Chênh lệch ODO tham khảo: <strong className="text-primary">{formatNumber(expectedDistance)} km</strong>.</p>}</section>
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ImagePlus size={18} className="text-secondaryDark" /><h4 className="font-extrabold text-primary">Hình ảnh</h4></div><button type="button" onClick={() => changeStep(2)} className="inline-flex items-center gap-1 text-sm font-extrabold text-secondaryDark hover:text-primary"><Pencil size={15} /> Sửa</button></div>{dashboardImage || conditionImages.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[dashboardImage, ...conditionImages].filter(Boolean).map((image, index) => <a key={`${image}-${index}`} href={normalizeImageUrl(image)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-slate-200"><img src={normalizeImageUrl(image)} alt={`Ảnh biên bản ${index + 1}`} className="h-28 w-full object-cover" /></a>)}</div> : <p className="mt-3 text-sm font-semibold text-slate-500">Chưa đính kèm ảnh.</p>}</section>
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-secondaryDark" /><h4 className="font-extrabold text-primary">Tình trạng xe, phụ kiện và giấy tờ</h4></div><button type="button" onClick={() => changeStep(3)} className="inline-flex items-center gap-1 text-sm font-extrabold text-secondaryDark hover:text-primary"><Pencil size={15} /> Sửa</button></div><div className="mt-4 grid gap-4 lg:grid-cols-3"><ChecklistReview title="Tình trạng xe" items={CONDITION_ITEMS as Array<[string, string]>} values={vehicleCondition} positiveLabel="Đạt" negativeLabel="Không đạt" /><ChecklistReview title="Phụ kiện" items={[...ACCESSORY_ITEMS, ...(cableApplicable ? [["chargingCablePresent", "Cáp sạc"] as [string, string]] : [])]} values={accessoriesSnapshot} positiveLabel="Có" negativeLabel="Không có" /><ChecklistReview title="Giấy tờ" items={DOCUMENT_ITEMS as Array<[string, string]>} values={vehicleDocumentsSnapshot} positiveLabel="Có" negativeLabel="Không có" /></div>{!isHandover && <div className="mt-4 flex flex-wrap gap-2">{hasDamage && <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-700">Có hư hỏng</span>}{hasCleaningIssue && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-700">Cần vệ sinh</span>}{hasFuelShortage && <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-extrabold text-sky-700">Thiếu nhiên liệu</span>}{!hasDamage && !hasCleaningIssue && !hasFuelShortage && <span className="text-sm font-semibold text-slate-500">Không có dấu hiệu cần lưu ý được đánh dấu.</span>}</div>}{conditionNotes && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Ghi chú</p><p className="mt-1">{conditionNotes}</p></div>}</section>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-primary"><input type="checkbox" checked={reviewAccepted} onChange={(event) => setReviewAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-secondaryDark" />{isHandover ? "Tôi xác nhận các thông tin bàn giao trên là chính xác." : "Tôi xác nhận các thông tin tiếp nhận xe trả trên là chính xác."}</label>
              </div>
            )}

            {error && <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-700"><CircleAlert className="mt-0.5 shrink-0" size={19} />{error}</div>}
          </div>
        </main>

        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-4">
          <button type="button" onClick={handleClose} disabled={loading || uploading} className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">Hủy</button>
          <div className="flex flex-col gap-2 sm:flex-row">
            {currentStep > 1 && <button type="button" onClick={() => changeStep(currentStep - 1)} disabled={loading || uploading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-extrabold text-primary transition hover:bg-slate-50 disabled:opacity-60"><ChevronLeft size={18} />Quay lại</button>}
            {currentStep < 4 ? <button type="button" onClick={handleNext} disabled={loading || uploading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-5 text-sm font-extrabold text-primary transition hover:brightness-95 disabled:opacity-60">Tiếp tục <ChevronRight size={18} /></button> : <button type="button" onClick={() => void submit()} disabled={loading || uploading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-5 text-sm font-extrabold text-primary transition hover:brightness-95 disabled:opacity-60">{loading || uploading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}{isHandover ? "Xác nhận bàn giao" : "Xác nhận tiếp nhận xe trả"}</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}
