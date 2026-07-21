import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import toast from "react-hot-toast";
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { notifyNotificationSummaryChanged } from "../../services/notification.service";
import { formatVietnamDateTime } from "../../utils/date.util";
import { normalizeImageUrl } from "../../utils/image.util";

type ReturnInspection = {
  _id: string;
  actualReturnAt: string;
  receivedAt?: string;
  returnOdometer?: number;
  returnFuelLevel?: number;
  returnPhotos?: string[];
  conditionNotes?: string;
  isLate?: boolean;
  lateMinutes?: number;
  hasDamage?: boolean;
  hasCleaningIssue?: boolean;
  hasFuelShortage?: boolean;
  inspectionStatus?: string;
};

type CompletionState = {
  canComplete: boolean;
  blockers: string[];
};

type ReceiveReturnPayload = {
  actualReturnAt: string;
  returnOdometer?: number;
  returnFuelLevel?: number;
  returnPhotos?: string[];
  conditionNotes?: string;
  hasDamage?: boolean;
  hasCleaningIssue?: boolean;
  hasFuelShortage?: boolean;
};

type ReturnInspectionResponse = {
  inspection: ReturnInspection | null;
  completionState: CompletionState;
};

type Props = {
  bookingId: string;
  bookingStatus: string;
  plannedReturnAt?: string;
  getInspection: (id: string) => Promise<ReturnInspectionResponse>;
  receiveReturn: (
    id: string,
    data: ReceiveReturnPayload,
  ) => Promise<ReturnInspectionResponse>;
  clearInspection: (
    id: string,
    conditionNotes?: string,
  ) => Promise<ReturnInspectionResponse>;
  onChanged?: () => Promise<void> | void;
};

const MAX_RETURN_PHOTOS = 8;
const inspectionStatuses: Record<string, string> = {
  RECEIVED: "Đã tiếp nhận xe trả",
  INSPECTING: "Đang kiểm tra xe",
  CHARGES_PENDING: "Chờ xử lý phí phát sinh",
  CLEARED: "Đã hoàn tất kiểm tra",
};
const blockerLabels: Record<string, string> = {
  RETURN_INSPECTION_NOT_FOUND: "Chưa có biên bản tiếp nhận xe trả.",
  INSPECTION_NOT_CLEARED: "Chưa xác nhận hoàn tất kiểm tra xe.",
  REMAINING_PAYMENT: "Booking vẫn còn tiền thuê chưa thanh toán.",
  PENDING_EXTRA_CHARGE: "Booking vẫn còn phí phát sinh đang chờ xử lý.",
  BOOKING_NOT_ACTIVE: "Booking không còn ở trạng thái có thể hoàn tất.",
};

function toDatetimeLocalValue(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatDateTime(value?: string) {
  return value
    ? formatVietnamDateTime(value, { dateStyle: "short", timeStyle: "short" })
    : "--";
}

export default function ReturnInspectionPanel({
  bookingId,
  bookingStatus,
  plannedReturnAt,
  getInspection,
  receiveReturn,
  clearInspection,
  onChanged,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inspection, setInspection] = useState<ReturnInspection | null>(null);
  const [completionState, setCompletionState] = useState<CompletionState>({
    canComplete: false,
    blockers: [],
  });
  const [actualReturnAt, setActualReturnAt] = useState(toDatetimeLocalValue());
  const [returnOdometer, setReturnOdometer] = useState("");
  const [returnFuelLevel, setReturnFuelLevel] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [returnPhotos, setReturnPhotos] = useState<string[]>([]);
  const [hasDamage, setHasDamage] = useState(false);
  const [hasCleaningIssue, setHasCleaningIssue] = useState(false);
  const [hasFuelShortage, setHasFuelShortage] = useState(false);

  const shouldFetch = useMemo(
    () =>
      [
        "IN_PROGRESS",
        "RETURN_INSPECTION",
        "AWAITING_EXTRA_CHARGE",
        "COMPLETED",
      ].includes(bookingStatus || ""),
    [bookingStatus],
  );

  const fetchInspection = useCallback(async () => {
    if (!shouldFetch) return;
    setLoading(true);
    try {
      const data = await getInspection(bookingId);
      setInspection(data.inspection);
      setCompletionState(data.completionState);
    } catch {
      setInspection(null);
    } finally {
      setLoading(false);
    }
  }, [bookingId, getInspection, shouldFetch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchInspection();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchInspection]);

  const handlePhotosChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const availableSlots = MAX_RETURN_PHOTOS - returnPhotos.length;
    const acceptedFiles = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, availableSlots);

    if (!acceptedFiles.length) {
      toast.error("Vui lòng chọn file hình ảnh hợp lệ.");
      return;
    }

    if (acceptedFiles.length < files.length) {
      toast.error(`Chỉ nhận tối đa ${MAX_RETURN_PHOTOS} ảnh xe lúc trả.`);
    }

    const images = await Promise.all(acceptedFiles.map(readFileAsDataUrl));
    setReturnPhotos((current) => [...current, ...images]);
  };

  const handleReceiveReturn = async () => {
    if (!actualReturnAt) {
      toast.error("Vui lòng nhập thời gian trả xe thực tế.");
      return;
    }

    const odometer =
      returnOdometer.trim() === "" ? undefined : Number(returnOdometer);
    const fuel =
      returnFuelLevel.trim() === "" ? undefined : Number(returnFuelLevel);

    if (odometer !== undefined && (!Number.isFinite(odometer) || odometer < 0)) {
      toast.error("Số kilomet lúc trả không hợp lệ.");
      return;
    }

    if (fuel !== undefined && (!Number.isFinite(fuel) || fuel < 0 || fuel > 100)) {
      toast.error("Mức nhiên liệu phải nằm trong khoảng 0 đến 100.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await receiveReturn(bookingId, {
        actualReturnAt: new Date(actualReturnAt).toISOString(),
        returnOdometer: odometer,
        returnFuelLevel: fuel,
        returnPhotos,
        conditionNotes: conditionNotes.trim(),
        hasDamage,
        hasCleaningIssue,
        hasFuelShortage,
      });
      setInspection(data.inspection);
      setCompletionState(data.completionState);
      toast.success("Đã tiếp nhận xe trả");
      notifyNotificationSummaryChanged();
      await onChanged?.();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể tiếp nhận xe trả"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearInspection = async () => {
    setSubmitting(true);
    try {
      const data = await clearInspection(bookingId, conditionNotes.trim());
      setInspection(data.inspection);
      setCompletionState(data.completionState);
      toast.success("Đã xác nhận kiểm tra xe");
      notifyNotificationSummaryChanged();
      await onChanged?.();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể xác nhận kiểm tra xe"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!shouldFetch) return null;

  return (
    <div className="border-t border-slate-200 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-secondary">
            Trả xe và kiểm tra sau thuê
          </p>
          <h4 className="mt-1 text-lg font-extrabold text-primary">
            {inspection
              ? inspectionStatuses[inspection.inspectionStatus || ""] ||
                "Đang kiểm tra xe"
              : "Tiếp nhận xe khách trả"}
          </h4>
        </div>
        {loading && <Loader2 size={18} className="animate-spin text-secondary" />}
      </div>

      {!inspection && bookingStatus === "IN_PROGRESS" && (
        <div className="space-y-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Thời gian dự kiến trả
              </span>
              <div className="rounded-lg border border-yellow-200 bg-white px-3 py-3 text-sm font-extrabold text-primary">
                {formatDateTime(plannedReturnAt)}
              </div>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Thời gian trả thực tế
              </span>
              <input
                type="datetime-local"
                value={actualReturnAt}
                onChange={(event) => setActualReturnAt(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-secondary"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                ODO lúc trả
              </span>
              <input
                value={returnOdometer}
                onChange={(event) => setReturnOdometer(event.target.value)}
                inputMode="numeric"
                placeholder="Ví dụ: 25420"
                className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-secondary"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Nhiên liệu lúc trả (%)
              </span>
              <input
                value={returnFuelLevel}
                onChange={(event) => setReturnFuelLevel(event.target.value)}
                inputMode="numeric"
                placeholder="Ví dụ: 60"
                className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-secondary"
              />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["hasDamage", "Có hư hỏng"],
              ["hasCleaningIssue", "Cần vệ sinh"],
              ["hasFuelShortage", "Thiếu nhiên liệu"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-white px-3 py-2 text-sm font-bold text-primary"
              >
                <input
                  type="checkbox"
                  checked={
                    key === "hasDamage"
                      ? hasDamage
                      : key === "hasCleaningIssue"
                        ? hasCleaningIssue
                        : hasFuelShortage
                  }
                  onChange={(event) => {
                    if (key === "hasDamage") setHasDamage(event.target.checked);
                    if (key === "hasCleaningIssue") {
                      setHasCleaningIssue(event.target.checked);
                    }
                    if (key === "hasFuelShortage") {
                      setHasFuelShortage(event.target.checked);
                    }
                  }}
                />
                {label}
              </label>
            ))}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Ghi chú tình trạng xe
            </span>
            <textarea
              value={conditionNotes}
              onChange={(event) => setConditionNotes(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold outline-none focus:border-secondary"
              placeholder="Xe được trả, tình trạng tổng quan, vết trầy nếu có..."
            />
          </label>

          <div>
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-secondary bg-white px-4 text-sm font-extrabold text-primary transition hover:bg-secondarySoft/70">
              <ImagePlus size={18} className="text-secondary" />
              Chọn ảnh xe lúc trả
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotosChange}
              />
            </label>
            {returnPhotos.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {returnPhotos.map((image, index) => (
                  <div
                    key={`${image.slice(0, 20)}-${index}`}
                    className="relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                  >
                    <img
                      src={normalizeImageUrl(image)}
                      alt={`Ảnh xe lúc trả ${index + 1}`}
                      className="h-24 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setReturnPhotos((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-secondary"
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
            onClick={handleReceiveReturn}
            disabled={submitting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-extrabold text-secondary disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Xác nhận tiếp nhận xe
          </button>
        </div>
      )}

      {inspection && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-400">
                Thời gian trả thực tế
              </p>
              <p className="mt-1 font-extrabold text-primary">
                {formatDateTime(inspection.actualReturnAt)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-400">
                Tình trạng trễ hạn
              </p>
              <p className="mt-1 font-extrabold text-primary">
                {inspection.isLate
                  ? `Trễ ${inspection.lateMinutes || 0} phút`
                  : "Không trễ hạn"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-400">
                ODO lúc trả
              </p>
              <p className="mt-1 font-extrabold text-primary">
                {inspection.returnOdometer ?? "--"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-400">
                Nhiên liệu lúc trả
              </p>
              <p className="mt-1 font-extrabold text-primary">
                {inspection.returnFuelLevel ?? "--"}
                {inspection.returnFuelLevel !== undefined ? "%" : ""}
              </p>
            </div>
          </div>

          {inspection.conditionNotes && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700">
              {inspection.conditionNotes}
            </div>
          )}

          {inspection.returnPhotos?.length ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-slate-400">
                Ảnh xe lúc trả
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {inspection.returnPhotos.map((image, index) => (
                  <a
                    key={`${inspection._id}-${index}`}
                    href={normalizeImageUrl(image)}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <img
                      src={normalizeImageUrl(image)}
                      alt={`Ảnh xe lúc trả ${index + 1}`}
                      className="h-24 w-full object-cover transition group-hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">
              <Camera size={16} />
              Chưa có ảnh xe lúc trả.
            </div>
          )}

          {completionState.blockers.length > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm font-semibold leading-6 text-slate-700">
              <p className="font-extrabold text-primary">
                Điều kiện còn thiếu để hoàn tất:
              </p>
              <ul className="mt-2 list-disc pl-5">
                {completionState.blockers.map((blocker) => (
                  <li key={blocker}>{blockerLabels[blocker] || blocker}</li>
                ))}
              </ul>
            </div>
          )}

          {inspection.inspectionStatus !== "CLEARED" && (
            <button
              type="button"
              onClick={handleClearInspection}
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 font-extrabold text-primary disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Xác nhận không có phát sinh / đã xử lý xong
            </button>
          )}
        </div>
      )}
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
