//  Thành phần quản lý booking dành cho người dùng có xe ký gửi.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  Loader2,
  MapPin,
  MessageCircle,
  MoreVertical,
  RefreshCw,
  ReceiptText,
  Search,
  Truck,
  UserX,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";

import AdminModal from "../admin/AdminModal";
import AdminStatusBadge, { type AdminStatusBadgeTone } from "../admin/AdminStatusBadge";
import { BOOKING_STATUSES, type BookingStatus } from "../../constants/status.constants";
import type {
  OwnerBookingAction,
  OwnerBookingDetail,
  OwnerBookingGroup,
  OwnerBookingListItem,
  OwnerBookingMutationAction,
  OwnerBookingSort,
} from "../../types/ownerBooking";
import { ownerBookingService } from "../../services/ownerBooking.service";
import type { CancellationPreview } from "../../services/booking.service";
import { notifyNotificationSummaryChanged } from "../../services/notification.service";
import { formatVietnamDateTime } from "../../utils/date.util";
import { getBookingStatusLabel } from "../../utils/display.util";
import { normalizeImageUrl } from "../../utils/image.util";
import { CASH_PAYMENT_UI_ENABLED } from "../../config/payment.config";
import { useOwnerBookingList } from "./useOwnerBookingList";
import OwnerBookingActionModal, {
  type OwnerBookingActionPayload,
} from "./OwnerBookingActionModal";
import OwnerBookingProcessWizard from "./OwnerBookingProcessWizard";
import ExtraChargeManager from "./ExtraChargeManager";
import ReturnInspectionPanel from "./ReturnInspectionPanel";
import BookingExtensionPanel from "./BookingExtensionPanel";
import BookingChatPanel, {
  canOpenBookingChat,
  isBookingChatReadOnly,
} from "./BookingChatPanel";
import { authService } from "../../services/auth.service";

type OwnerBookingManagementProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
};

const GROUP_OPTIONS: Array<{ value: OwnerBookingGroup; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "ACTION_REQUIRED", label: "Chờ xử lý" },
  { value: "UPCOMING", label: "Sắp tới" },
  { value: "ACTIVE", label: "Đang thực hiện" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "CLOSED", label: "Đã đóng" },
];

const SORT_OPTIONS: Array<{ value: OwnerBookingSort; label: string }> = [
  { value: "newest", label: "Mới nhất" },
  { value: "oldest", label: "Cũ nhất" },
  { value: "pickup_asc", label: "Ngày nhận gần nhất" },
  { value: "pickup_desc", label: "Ngày nhận xa nhất" },
];

const STATUS_TONES: Record<BookingStatus, AdminStatusBadgeTone> = {
  REQUESTED: "yellow",
  OWNER_APPROVED: "blue",
  PAYMENT_PENDING: "yellow",
  PAID: "green",
  IN_PROGRESS: "blue",
  RETURN_INSPECTION: "yellow",
  AWAITING_EXTRA_CHARGE: "yellow",
  COMPLETED: "green",
  CANCELLED: "gray",
  REJECTED: "red",
  NO_SHOW: "red",
};

function formatDateTime(value?: string) {
  return formatVietnamDateTime(value, { dateStyle: "short", timeStyle: "short" });
}

const HANDOVER_EARLY_ALLOWANCE_MS = 15 * 60 * 1000;

function getHandoverAvailableAt(startDate?: string) {
  const pickupAt = new Date(startDate || "").getTime();
  return Number.isFinite(pickupAt)
    ? new Date(pickupAt - HANDOVER_EARLY_ALLOWANCE_MS)
    : null;
}

function isHandoverAvailable(
  booking: Pick<OwnerBookingListItem, "startDate">,
  now = Date.now(),
) {
  const availableAt = getHandoverAvailableAt(booking.startDate);
  return !availableAt || now >= availableAt.getTime();
}

function getHandoverAvailableLabel(
  booking: Pick<OwnerBookingListItem, "startDate">,
) {
  const availableAt = getHandoverAvailableAt(booking.startDate);
  if (!availableAt) return "Chưa xác định được thời điểm có thể bàn giao.";

  const time = availableAt.toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = availableAt.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return `Có thể bàn giao từ ${time} ngày ${date}.`;
}

const HANDOVER_CHECKLIST_GROUPS = [
  {
    title: "Tình trạng xe",
    field: "vehicleCondition",
    positive: "Đạt",
    negative: "Không đạt",
    labels: {
      bodyOk: "Thân vỏ, vết trầy xước",
      glassAndMirrorsOk: "Kính và gương",
      lightsOk: "Hệ thống đèn",
      tiresOk: "Lốp xe",
      interiorClean: "Nội thất sạch sẽ",
      seatsAndSeatbeltsOk: "Ghế và dây an toàn",
      airConditioningOk: "Điều hòa",
      dashboardWarningFree: "Bảng đồng hồ không có cảnh báo bất thường",
    },
  },
  {
    title: "Phụ kiện theo xe",
    field: "accessoriesSnapshot",
    positive: "Có",
    negative: "Không có",
    labels: {
      vehicleKeysPresent: "Chìa khóa xe",
      tireSupportKitPresent: "Lốp dự phòng hoặc bộ vá lốp",
      basicToolkitPresent: "Kích xe và bộ dụng cụ cơ bản",
      warningTrianglePresent: "Tam giác cảnh báo",
      chargingCablePresent: "Cáp sạc",
    },
  },
  {
    title: "Giấy tờ theo xe",
    field: "vehicleDocumentsSnapshot",
    positive: "Có",
    negative: "Không có",
    labels: {
      registrationPresent: "Đăng ký xe hoặc giấy tờ thay thế hợp pháp",
      inspectionCertificatePresent: "Giấy chứng nhận đăng kiểm",
      insuranceCertificatePresent: "Giấy chứng nhận bảo hiểm",
    },
  },
] as const;

function HandoverChecklistSummary({ snapshot }: { snapshot: NonNullable<OwnerBookingDetail["handoverSnapshot"]> }) {
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-3">
      {HANDOVER_CHECKLIST_GROUPS.map((group) => {
        const values = snapshot[group.field] as Record<string, boolean> | undefined;
        const rows = Object.entries(group.labels).filter(([key]) => {
          return key !== "chargingCablePresent" || snapshot.accessoriesSnapshot?.chargingCableApplicable;
        });
        return (
          <section key={group.field} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-extrabold text-primary">{group.title}</p>
            <div className="mt-2 space-y-2">
              {rows.map(([key, label]) => (
                <div key={key} className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-slate-600">{label}</span>
                  {values?.[key] === undefined ? (
                    <span className="shrink-0 text-slate-400">Chưa ghi nhận</span>
                  ) : (
                    <span className={`shrink-0 font-extrabold ${values[key] ? "text-emerald-700" : "text-red-700"}`}>
                      {values[key] ? group.positive : group.negative}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join("") || "KH";
}

function CarThumbnail({ booking }: { booking: OwnerBookingListItem }) {
  const image = normalizeImageUrl(booking.car.image || "");
  if (!image) {
    return <div className="flex h-14 w-20 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-400">Chưa có ảnh</div>;
  }
  return <img src={image} alt={booking.car.name} className="h-14 w-20 rounded-md object-cover" />;
}

function CustomerAvatar({ booking }: { booking: OwnerBookingListItem }) {
  const avatar = normalizeImageUrl(booking.customer.avatar || "");
  if (avatar) return <img src={avatar} alt={booking.customer.name} className="h-10 w-10 rounded-full object-cover" />;
  return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondarySoft text-xs font-extrabold text-primary">{getInitials(booking.customer.name)}</span>;
}

function ViewButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-extrabold text-white transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2">
      <Eye size={17} /> Xem chi tiết
    </button>
  );
}

const ACTION_LABELS: Record<OwnerBookingAction, string> = {
  "no-show": "Khách không nhận xe",
  approve: "Duyệt booking",
  reject: "Từ chối",
  cancel: "Hủy booking",
  handover: "Bàn giao xe",
  return: "Nhận xe trả",
  inspection: "Xử lý xe trả",
  "extra-charge": "Xem phụ phí",
  "confirm-remaining": "Xác nhận tiền mặt",
};

const ACTION_ICONS: Record<OwnerBookingAction, typeof CheckCircle2> = {
  "no-show": UserX,
  approve: CheckCircle2,
  reject: XCircle,
  cancel: XCircle,
  handover: KeyRound,
  return: RefreshCw,
  inspection: ClipboardCheck,
  "extra-charge": ReceiptText,
  "confirm-remaining": WalletCards,
};

const MUTATION_ACTIONS: OwnerBookingMutationAction[] = [
  "no-show",
  "approve",
  "reject",
  "handover",
  "return",
];

const INLINE_DETAIL_ACTIONS = new Set<OwnerBookingAction>([
  "inspection",
  "extra-charge",
  "confirm-remaining",
]);

function isMutationAction(
  action: OwnerBookingAction | null,
): action is OwnerBookingMutationAction {
  return Boolean(action && MUTATION_ACTIONS.includes(action as OwnerBookingMutationAction));
}

const OWNER_CANCELLATION_REASONS = [
  {
    value: "OWNER_VEHICLE_UNAVAILABLE",
    label: "Xe không thể phục vụ chuyến thuê",
  },
  {
    value: "OWNER_SCHEDULE_CONFLICT",
    label: "Lịch xe có thay đổi hoặc bị trùng",
  },
  {
    value: "OWNER_MAINTENANCE_REQUIRED",
    label: "Xe cần kiểm tra hoặc bảo dưỡng",
  },
  { value: "OWNER_OTHER", label: "Lý do khác" },
] as const;

function getOwnerCancellationReasonText(code: string, note: string) {
  const reason = OWNER_CANCELLATION_REASONS.find(
    (option) => option.value === code,
  );
  const normalizedNote = note.trim();

  if (!reason) return normalizedNote;
  return normalizedNote
    ? reason.label + ": " + normalizedNote
    : reason.label;
}

function getCancellationPolicyLabel(rule?: string) {
  const labels: Record<string, string> = {
    NO_PAID_AMOUNT: "Khách chưa thanh toán, không phát sinh hoàn tiền.",
    OWNER_CANCEL_FULL_REFUND:
      "Chủ xe hủy booking, khách được hoàn 100% số tiền hợp lệ đã thanh toán.",
  };

  return labels[rule || ""] || rule || "--";
}

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as {
        response?: { data?: { data?: unknown; message?: unknown } };
      }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

function OwnerBookingCancellationModal({
  detail,
  onClose,
  onCancelled,
}: {
  detail: OwnerBookingDetail;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const defaultReason = OWNER_CANCELLATION_REASONS[0];
  const [reasonCode, setReasonCode] = useState<string>(defaultReason.value);
  const [reasonNote, setReasonNote] = useState("");
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  useEffect(() => {
    let active = true;

    ownerBookingService
      .previewCancellation(detail._id, {
        reasonCode: defaultReason.value,
        reasonText: defaultReason.label,
      })
      .then((result) => {
        if (active) setPreview(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPreview(null);
        toast.error(
          getRequestErrorMessage(
            error,
            "Không thể xem trước kết quả hủy booking.",
          ),
        );
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [defaultReason.label, defaultReason.value, detail._id]);

  const validateReason = () => {
    if (reasonCode === "OWNER_OTHER" && reasonNote.trim().length < 3) {
      toast.error("Vui lòng nhập lý do hủy booking cụ thể.");
      return false;
    }
    return true;
  };

  const refreshPreview = async () => {
    if (!validateReason()) return;

    setPreviewLoading(true);
    setPolicyAccepted(false);
    try {
      const result = await ownerBookingService.previewCancellation(detail._id, {
        reasonCode,
        reasonText: getOwnerCancellationReasonText(reasonCode, reasonNote),
      });
      setPreview(result);
    } catch (error) {
      setPreview(null);
      toast.error(
        getRequestErrorMessage(
          error,
          "Không thể xem trước kết quả hủy booking.",
        ),
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmCancellation = async () => {
    if (!preview || !policyAccepted || submitting || !validateReason()) return;

    setSubmitting(true);
    try {
      const result = await ownerBookingService.cancelBooking(detail._id, {
        reasonCode,
        reasonText: getOwnerCancellationReasonText(reasonCode, reasonNote),
        confirmed: true,
      });
      toast.success(result.message || "Đã hủy booking.");
      notifyNotificationSummaryChanged();
      onCancelled();
    } catch (error) {
      toast.error(
        getRequestErrorMessage(error, "Không thể hủy booking lúc này."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="min-h-11 rounded-lg border border-slate-200 bg-white px-5 py-2 font-bold text-primary transition hover:border-secondary disabled:opacity-60"
      >
        Giữ booking
      </button>
      <button
        type="button"
        onClick={() => void confirmCancellation()}
        disabled={!preview || !policyAccepted || submitting || previewLoading}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-2 font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting && <Loader2 size={18} className="animate-spin" />}
        Xác nhận hủy booking
      </button>
    </div>
  );

  return (
    <AdminModal
      open
      title="Hủy booking"
      description={"Booking " + detail.bookingCode + " - " + detail.car.name}
      footer={footer}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-800">
          Chủ xe hủy booking sẽ giải phóng lịch xe. Nếu khách đã thanh toán,
          hệ thống sẽ tạo hồ sơ hoàn 100% số tiền hợp lệ cho khách.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-extrabold text-primary">Lý do hủy</span>
            <select
              value={reasonCode}
              onChange={(event) => {
                setReasonCode(event.target.value);
                setPreview(null);
                setPolicyAccepted(false);
              }}
              className="mt-2 h-12 w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-secondary"
            >
              {OWNER_CANCELLATION_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-extrabold text-primary">
              Ghi chú {reasonCode === "OWNER_OTHER" ? "*" : ""}
            </span>
            <input
              value={reasonNote}
              maxLength={300}
              onChange={(event) => {
                setReasonNote(event.target.value);
                setPreview(null);
                setPolicyAccepted(false);
              }}
              placeholder="Thông tin thêm để khách hiểu lý do"
              className="mt-2 h-12 w-full rounded-lg border border-slate-200 px-3 font-semibold outline-none focus:border-secondary"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void refreshPreview()}
          disabled={previewLoading || submitting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 font-extrabold text-primary transition hover:bg-slate-200 disabled:opacity-60"
        >
          {previewLoading && <Loader2 size={18} className="animate-spin" />}
          Cập nhật xem trước
        </button>

        {previewLoading ? (
          <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500">
            <Loader2 size={18} className="mr-2 animate-spin text-secondary" />
            Đang tính kết quả hủy và hoàn tiền...
          </div>
        ) : preview ? (
          <div className="rounded-lg border border-secondary/40 bg-yellow-50 p-4">
            <p className="text-sm font-extrabold uppercase text-amber-700">
              Xem trước hoàn tiền
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailField label="Tổng tiền" value={formatCurrency(preview.totalPrice)} />
              <DetailField
                label="Khách đã thanh toán"
                value={formatCurrency(preview.paidAmountAtCancellation)}
              />
              <DetailField label="Phí hủy" value={formatCurrency(preview.cancellationFee)} />
              <DetailField
                label="Dự kiến hoàn khách"
                value={formatCurrency(preview.refundAmount)}
              />
            </div>
            <p className="mt-4 rounded-lg bg-white px-4 py-3 text-sm font-bold leading-6 text-primary">
              {getCancellationPolicyLabel(preview.policyRuleApplied)}
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {preview.message}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            Chưa thể xác định kết quả hủy. Vui lòng cập nhật xem trước.
          </div>
        )}

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-primary">
          <input
            type="checkbox"
            checked={policyAccepted}
            disabled={!preview}
            onChange={(event) => setPolicyAccepted(event.target.checked)}
            className="mt-1 h-5 w-5 rounded border-slate-300 accent-amber-500"
          />
          <span>
            Tôi đã xem kết quả tài chính, hiểu{" "}
            <a
              href="/policies/cancellation-refund"
              target="_blank"
              rel="noreferrer"
              className="font-extrabold text-amber-700 underline underline-offset-4"
            >
              chính sách hủy và hoàn tiền
            </a>{" "}
            và xác nhận hủy booking này.
          </span>
        </label>
      </div>
    </AdminModal>
  );
}

function OwnerBookingActions({
  booking,
  onView,
  onAction,
  variant,
  currentTime,
}: {
  booking: OwnerBookingListItem;
  onView: (id: string) => void;
  onAction: (id: string, action: OwnerBookingAction) => void;
  variant: "desktop" | "mobile";
  currentTime: number;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const handoverBlocked =
    (booking.availableActions || []).includes("handover") &&
    !isHandoverAvailable(booking, currentTime);
  const handoverAvailableLabel = getHandoverAvailableLabel(booking);
  const availableActions = (booking.availableActions || []).filter(
    (action) => action !== "handover" || !handoverBlocked,
  );
  const menuActions: Array<{
    key: "view" | OwnerBookingAction;
    label: string;
    icon: typeof Eye;
    tone?: "danger" | "default";
    disabled?: boolean;
  }> = [
    { key: "view", label: "Xem chi tiết", icon: Eye },
    ...availableActions.map((action) => ({
      key: action,
      label: ACTION_LABELS[action],
      icon: ACTION_ICONS[action],
      tone:
        action === "reject" || action === "cancel" || action === "no-show"
          ? ("danger" as const)
          : ("default" as const),
    })),
  ];

  if (handoverBlocked) {
    menuActions.push({
      key: "handover",
      label: handoverAvailableLabel,
      icon: KeyRound,
      disabled: true,
    });
  }

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeMenu = () => setOpen(false);

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [open]);

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const menuWidth = 224;
    const menuHeight = menuActions.length * 44 + 16;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(
        rect.right - menuWidth,
        window.innerWidth - menuWidth - viewportPadding,
      ),
    );
    const hasSpaceBelow =
      rect.bottom + menuHeight + viewportPadding <= window.innerHeight;

    setPosition({
      left,
      top: hasSpaceBelow
        ? rect.bottom + viewportPadding
        : Math.max(viewportPadding, rect.top - menuHeight - viewportPadding),
    });
    setOpen(true);
  };

  if (variant === "desktop") {
    const menu =
      open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="Thao tác booking"
              style={{ left: position.left, top: position.top }}
              className="fixed z-[7000] w-56 overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              {menuActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (item.disabled) return;
                      setOpen(false);
                      if (item.key === "view") {
                        onView(booking._id);
                      } else {
                        onAction(booking._id, item.key);
                      }
                    }}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-secondary disabled:cursor-not-allowed disabled:opacity-60 ${
                      item.tone === "danger"
                        ? "text-red-700 hover:bg-red-50"
                        : "text-primary hover:bg-slate-100"
                    }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null;

    return (
      <div className="inline-flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
        {handoverBlocked && (
          <span className="hidden max-w-48 text-right text-xs font-bold leading-5 text-amber-700 lg:inline">
            {handoverAvailableLabel}
          </span>
        )}
        <button
          ref={triggerRef}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleMenu();
          }}
          aria-label="Mở menu thao tác booking"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          title="Thao tác booking"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-primary bg-primary text-secondary shadow-md transition hover:bg-primaryDark focus:outline-none focus:ring-4 focus:ring-secondary/30"
        >
          <MoreVertical size={21} />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
      <ViewButton onClick={() => onView(booking._id)} />
      {availableActions.map((action) => {
        const Icon = ACTION_ICONS[action];
        return (
          <button
            key={action}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAction(booking._id, action);
            }}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              action === "reject" || action === "no-show"
                ? "border border-red-200 bg-white text-red-700 hover:bg-red-50 focus:ring-red-300"
                : "bg-secondary text-primary hover:bg-secondaryLight focus:ring-secondary"
            }`}
          >
            <Icon size={17} /> {ACTION_LABELS[action]}
          </button>
        );
      })}
      {handoverBlocked && (
        <p className="w-full text-right text-xs font-bold leading-5 text-amber-700">
          {handoverAvailableLabel}
        </p>
      )}
    </div>
  );
}

function OwnerBookingTable({ bookings, onView, onAction, currentTime }: { bookings: OwnerBookingListItem[]; onView: (id: string) => void; onAction: (id: string, action: OwnerBookingAction) => void; currentTime: number }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[1160px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
          <tr>
            <th className="px-5 py-4">Booking</th><th className="px-5 py-4">Xe</th><th className="px-5 py-4">Khách thuê</th><th className="px-5 py-4">Thời gian thuê</th><th className="px-5 py-4">Trả thực tế</th><th className="px-5 py-4">Thanh toán</th><th className="px-5 py-4">Trạng thái</th><th className="px-5 py-4 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bookings.map((booking) => (
            <tr key={booking._id} className="transition hover:bg-slate-50">
              <td className="px-5 py-4"><p className="font-extrabold text-primary">{booking.bookingCode}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(booking.createdAt)}</p></td>
              <td className="px-5 py-4"><div className="flex items-center gap-3"><CarThumbnail booking={booking} /><div><p className="font-extrabold text-primary">{booking.car.name || "--"}</p><p className="text-xs font-bold text-secondaryDark">{booking.car.carCode || "Chưa được cấp"}</p><p className="text-xs text-slate-500">{booking.car.licensePlate || "--"}</p></div></div></td>
              <td className="px-5 py-4"><div className="flex items-center gap-3"><CustomerAvatar booking={booking} /><span className="font-bold text-primary">{booking.customer.name}</span></div></td>
              <td className="px-5 py-4 text-slate-600"><p><strong className="text-primary">Nhận:</strong> {formatDateTime(booking.startDate)}</p><p className="mt-1"><strong className="text-primary">Trả:</strong> {formatDateTime(booking.endDate)}</p></td>
              <td className="px-5 py-4"><p className={`font-bold ${booking.actualReturnAt ? "text-primary" : "text-slate-500"}`}>{booking.actualReturnAt ? formatDateTime(booking.actualReturnAt) : "Chưa ghi nhận"}</p></td>
              <td className="px-5 py-4"><p className="font-extrabold text-primary">{formatCurrency(booking.pricing.totalPrice)}</p><p className="mt-1 text-xs text-emerald-700">Đã trả: {formatCurrency(booking.pricing.paidAmount)}</p><p className="text-xs text-amber-700">Còn lại: {formatCurrency(booking.pricing.remainingAmount)}</p></td>
              <td className="px-5 py-4"><AdminStatusBadge label={getBookingStatusLabel(booking.status)} tone={STATUS_TONES[booking.status]} /></td>
              <td className="px-5 py-4 text-right"><OwnerBookingActions booking={booking} onView={onView} onAction={onAction} variant="desktop" currentTime={currentTime} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OwnerBookingMobileCards({ bookings, onView, onAction, currentTime }: { bookings: OwnerBookingListItem[]; onView: (id: string) => void; onAction: (id: string, action: OwnerBookingAction) => void; currentTime: number }) {
  return (
    <div className="grid gap-3 p-3 md:hidden">
      {bookings.map((booking) => (
        <article key={booking._id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-slate-400">Mã đặt xe: {booking.bookingCode}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(booking.createdAt)}</p></div><AdminStatusBadge label={getBookingStatusLabel(booking.status)} tone={STATUS_TONES[booking.status]} /></div>
          <div className="mt-4 flex gap-3"><CarThumbnail booking={booking} /><div className="min-w-0"><h3 className="truncate font-extrabold text-primary">{booking.car.name}</h3><p className="text-xs font-bold text-secondaryDark">{booking.car.carCode || "Chưa được cấp"}</p><p className="text-xs text-slate-500">{booking.car.licensePlate || "--"}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3 text-sm"><div><p className="text-xs font-bold uppercase text-slate-400">Khách thuê</p><p className="mt-1 font-bold text-primary">{booking.customer.name}</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Còn lại</p><p className="mt-1 font-extrabold text-amber-700">{formatCurrency(booking.pricing.remainingAmount)}</p></div><div><p className="text-xs text-slate-500">Nhận xe</p><p className="font-semibold text-primary">{formatDateTime(booking.startDate)}</p></div><div><p className="text-xs text-slate-500">Trả dự kiến</p><p className="font-semibold text-primary">{formatDateTime(booking.endDate)}</p></div><div className="col-span-2"><p className="text-xs text-slate-500">Trả thực tế</p><p className={`font-semibold ${booking.actualReturnAt ? "text-primary" : "text-slate-500"}`}>{booking.actualReturnAt ? formatDateTime(booking.actualReturnAt) : "Chưa ghi nhận"}</p></div></div>
          <div className="mt-4"><OwnerBookingActions booking={booking} onView={onView} onAction={onAction} variant="mobile" currentTime={currentTime} /></div>
        </article>
      ))}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-1 break-words font-bold text-primary">{value || "--"}</p></div>;
}

function IdentityStatus({ detail }: { detail: OwnerBookingDetail }) {
  const status = detail.identityStatus;

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h4 className="font-extrabold text-primary">Hồ sơ giấy tờ người thuê</h4>
      <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-3">
        <p>
          Hồ sơ định danh: {status?.identityVerificationStatus === "VERIFIED"
            ? "Đã xác minh"
            : status?.identityProfileCompleted
              ? "Chưa xác minh"
              : "Chưa hoàn tất"}
        </p>
        <p>Hạng GPLX: {status?.driverLicenseClass || "--"}</p>
        <p>
          Đủ điều kiện thuê xe: {status?.licenseEligible ? "Có" : "Không"}
        </p>
      </div>
    </section>
  );
}

function BookingDetailContent({
  detail,
  action,
  onChanged,
}: {
  detail: OwnerBookingDetail;
  action: OwnerBookingAction | null;
  onChanged: () => Promise<void> | void;
}) {
  const [settlementVersion, setSettlementVersion] = useState(0);
  const [showCashConfirmation, setShowCashConfirmation] = useState(false);
  const [cashConfirmationNote, setCashConfirmationNote] = useState("");
  const [confirmingCash, setConfirmingCash] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hasNewChatMessage, setHasNewChatMessage] = useState(false);
  const currentUserId = authService.getCurrentUser()?._id || "";
  const hasReturnSettlement = [
    "RETURN_INSPECTION",
    "AWAITING_EXTRA_CHARGE",
    "COMPLETED",
  ].includes(detail.status);
  const canConfirmRemainingCash =
    CASH_PAYMENT_UI_ENABLED &&
    detail.pricing.remainingAmount > 0 &&
    ["RETURN_INSPECTION", "AWAITING_EXTRA_CHARGE"].includes(detail.status);

  useEffect(() => {
    if (action === "confirm-remaining" && canConfirmRemainingCash) {
      setShowCashConfirmation(true);
    }
  }, [action, canConfirmRemainingCash]);

  useEffect(() => {
    setChatOpen(false);
    setHasNewChatMessage(false);
  }, [detail._id]);

  const handleNewChatMessage = useCallback(() => {
    setHasNewChatMessage(true);
  }, []);

  const handleSettlementChanged = async () => {
    setSettlementVersion((current) => current + 1);
    await onChanged();
  };

  const handleConfirmRemainingCash = async () => {
    if (!canConfirmRemainingCash || confirmingCash) return;

    setConfirmingCash(true);
    try {
      await ownerBookingService.confirmRemainingCash(
        detail._id,
        cashConfirmationNote.trim() || undefined,
      );
      toast.success("Đã xác nhận thu phần tiền còn lại.");
      setShowCashConfirmation(false);
      setCashConfirmationNote("");
      notifyNotificationSummaryChanged();
      await handleSettlementChanged();
    } catch (error) {
      let message = "Không thể xác nhận thu phần tiền còn lại.";
      if (typeof error === "object" && error !== null && "response" in error) {
        const response = (
          error as {
            response?: { data?: { data?: unknown; message?: unknown } };
          }
        ).response;
        if (typeof response?.data?.data === "string") {
          message = response.data.data;
        } else if (typeof response?.data?.message === "string") {
          message = response.data.message;
        }
      }
      toast.error(message);
    } finally {
      setConfirmingCash(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row">
        <CarThumbnail booking={detail} />
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-extrabold text-primary">{detail.car.name}</h3><AdminStatusBadge label={getBookingStatusLabel(detail.status)} tone={STATUS_TONES[detail.status]} /></div><p className="mt-1 font-bold text-secondaryDark">{detail.car.carCode || "Chưa được cấp mã xe"}</p><p className="text-sm text-slate-500">{detail.car.licensePlate || "Chưa có biển số"}</p></div>
      </div>
      <section><h4 className="mb-3 font-extrabold text-primary">Thông tin booking</h4><div className="grid gap-3 sm:grid-cols-3"><DetailField label="Mã booking" value={detail.bookingCode} /><DetailField label="Ngày tạo" value={formatDateTime(detail.createdAt)} /><DetailField label="Hình thức thuê" value={detail.rentalMode === "HOURLY" ? "Thuê theo giờ" : "Thuê theo ngày"} /></div></section>
      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="flex items-center gap-2 font-extrabold text-primary">
            <UserRound size={18} className="text-secondaryDark" /> Khách thuê
          </h4>
          {canOpenBookingChat(detail.status) && (
            <button
              type="button"
              onClick={() => {
                setHasNewChatMessage(false);
                setChatOpen(true);
              }}
              className="relative inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-extrabold text-secondary shadow-sm transition hover:-translate-y-0.5 hover:bg-primaryDark hover:shadow-md"
            >
              <MessageCircle size={17} />
              {isBookingChatReadOnly(detail.status)
                ? "Xem lịch sử trò chuyện"
                : "Nhắn với người thuê"}
              {hasNewChatMessage && (
                <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-md ring-2 ring-white">
                  Mới
                </span>
              )}
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailField label="Họ tên" value={detail.customer.name} />
          <DetailField label="Email" value={detail.customer.email || "--"} />
          <DetailField label="Số điện thoại" value={detail.customer.phone || "--"} />
        </div>
      </section>
      <section><h4 className="mb-3 flex items-center gap-2 font-extrabold text-primary"><CalendarDays size={18} className="text-secondaryDark" /> Thời gian thuê</h4><div className="grid gap-3 sm:grid-cols-2"><DetailField label="Nhận xe" value={formatDateTime(detail.startDate)} /><DetailField label="Trả xe" value={formatDateTime(detail.endDate)} /></div></section>
      <section><h4 className="mb-3 font-extrabold text-primary">Thông tin vận hành</h4><div className="grid gap-3 sm:grid-cols-3"><DetailField label="Nhận xe thực tế" value={detail.actualPickupAt ? formatDateTime(detail.actualPickupAt) : "Chưa ghi nhận"} /><DetailField label="Trả xe thực tế" value={detail.actualReturnAt ? formatDateTime(detail.actualReturnAt) : "Chưa ghi nhận"} /><DetailField label="ODO hiện tại" value={detail.currentOdometerKm === null || detail.currentOdometerKm === undefined ? "Chưa cập nhật" : `${new Intl.NumberFormat("vi-VN").format(detail.currentOdometerKm)} km`} /></div></section>
      <section><h4 className="mb-3 flex items-center gap-2 font-extrabold text-primary"><MapPin size={18} className="text-secondaryDark" /> Địa điểm</h4><div className="grid gap-3 sm:grid-cols-2"><DetailField label="Điểm nhận" value={detail.pickupLocation || "Chưa cập nhật"} /><DetailField label="Điểm trả" value={detail.returnLocation || detail.pickupLocation || "Chưa cập nhật"} /></div>{detail.delivery?.deliveryType === "DELIVERY_TO_CUSTOMER" && <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-4"><p className="flex items-center gap-2 font-extrabold text-primary"><Truck size={18} /> Giao xe tận nơi</p><p className="mt-2 text-sm text-slate-600">{detail.delivery.address || "Địa chỉ giao xe theo booking"}</p></div>}</section>
      <section>
        <h4 className="mb-3 flex items-center gap-2 font-extrabold text-primary">
          <WalletCards size={18} className="text-secondaryDark" /> Thanh toán
        </h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailField label="Tổng tiền" value={formatCurrency(detail.pricing.totalPrice)} />
          <DetailField label="Đã thanh toán" value={formatCurrency(detail.pricing.paidAmount)} />
          <DetailField label="Còn lại" value={formatCurrency(detail.pricing.remainingAmount)} />
        </div>
        {canConfirmRemainingCash && (
          <div
            id="owner-cash-payment-section"
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-extrabold text-primary">
                  Còn {formatCurrency(detail.pricing.remainingAmount)} chưa thanh toán
                </p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                  Chỉ xác nhận khi bạn đã nhận đủ số tiền này trực tiếp từ khách thuê.
                </p>
              </div>
              {!showCashConfirmation && (
                <button
                  type="button"
                  onClick={() => setShowCashConfirmation(true)}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-extrabold text-secondary transition hover:bg-primaryDark focus:outline-none focus:ring-4 focus:ring-secondary/30"
                >
                  <CheckCircle2 size={18} />
                  Xác nhận đã thu tiền mặt
                </button>
              )}
            </div>
            {showCashConfirmation && (
              <div className="mt-4 border-t border-amber-200 pt-4">
                <label
                  className="block text-sm font-extrabold text-primary"
                  htmlFor={`cash-note-${detail._id}`}
                >
                  Ghi chú giao dịch (không bắt buộc)
                </label>
                <textarea
                  id={`cash-note-${detail._id}`}
                  value={cashConfirmationNote}
                  onChange={(event) => setCashConfirmationNote(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Ví dụ: Đã nhận đủ tiền mặt khi khách trả xe."
                  className="mt-2 w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-primary outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/20"
                />
                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCashConfirmation(false);
                      setCashConfirmationNote("");
                    }}
                    disabled={confirmingCash}
                    className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 font-bold text-primary transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmRemainingCash()}
                    disabled={confirmingCash}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 size={18} />
                    {confirmingCash ? "Đang xác nhận..." : "Xác nhận đã nhận đủ tiền"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      <BookingExtensionPanel
        bookingId={detail._id}
        bookingStatus={detail.status}
        startAt={detail.startDate}
        currentEndAt={detail.endDate}
        rentalMode={detail.rentalMode}
        mode="OWNER"
        onChanged={onChanged}
      />
      {detail.note && <section><h4 className="mb-2 font-extrabold text-primary">Ghi chú</h4><p className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">{detail.note}</p></section>}
      <IdentityStatus detail={detail} />
      {detail.handoverSnapshot && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 print:border-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-secondary">BQDrive</p>
              <h4 className="mt-1 font-extrabold text-primary">Biên bản bàn giao xe</h4>
            </div>
            {detail.handoverSnapshot.ownerConfirmedAt && detail.handoverSnapshot.renterConfirmedAt && (
              <button type="button" onClick={() => window.print()} className="print:hidden rounded-lg border border-primary px-4 py-2 text-sm font-extrabold text-primary">In biên bản</button>
            )}
          </div>
          <HandoverChecklistSummary snapshot={detail.handoverSnapshot} />
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3"><p className="font-extrabold text-primary">I. Trước khi đi giao</p><p className="mt-1">ODO: {detail.handoverSnapshot.preparation?.odometerKm ?? detail.handoverSnapshot.handoverOdometerKm} km · Nhiên liệu/pin: {detail.handoverSnapshot.preparation?.energyLevelPercent ?? detail.handoverSnapshot.handoverEnergyLevelPercent}%</p><p className="mt-1 text-slate-600">{detail.handoverSnapshot.preparation?.note || "Không có ghi chú."}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="font-extrabold text-primary">II. Khi bàn giao</p><p className="mt-1">ODO: {detail.handoverSnapshot.handoverOdometerKm} km · Nhiên liệu/pin: {detail.handoverSnapshot.handoverEnergyLevelPercent}%</p><p className="mt-1 text-slate-600">{detail.handoverSnapshot.handoverConditionNotes || "Không có ghi chú."}</p></div>
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p><span className="font-extrabold text-primary">Bên giao:</span> {detail.handoverSnapshot.ownerConfirmedAt ? `✓ Đã xác nhận ${formatVietnamDateTime(detail.handoverSnapshot.ownerConfirmedAt, { dateStyle: "short", timeStyle: "short" })}` : "Chưa xác nhận"}</p><p><span className="font-extrabold text-primary">Bên nhận:</span> {detail.handoverSnapshot.renterConfirmedAt ? `✓ Đã xác nhận ${formatVietnamDateTime(detail.handoverSnapshot.renterConfirmedAt, { dateStyle: "short", timeStyle: "short" })}` : "Đang chờ người thuê xác nhận"}</p></div>
        </section>
      )}
      {hasReturnSettlement && (
        <section
          id="owner-return-settlement"
          className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <ReturnInspectionPanel
            key={`${detail._id}-${detail.status}-${detail.updatedAt || ""}-${settlementVersion}`}
            bookingId={detail._id}
            bookingStatus={detail.status}
            plannedReturnAt={detail.endDate}
            handoverOdometerKm={detail.handoverSnapshot?.handoverOdometerKm}
            handoverEnergyLevelPercent={
              detail.handoverSnapshot?.handoverEnergyLevelPercent
            }
            handoverVehicleCondition={detail.handoverSnapshot?.vehicleCondition}
            handoverAccessoriesSnapshot={detail.handoverSnapshot?.accessoriesSnapshot}
            handoverVehicleDocumentsSnapshot={detail.handoverSnapshot?.vehicleDocumentsSnapshot}
            getInspection={ownerBookingService.getReturnInspection}
            receiveReturn={async (id, payload) =>
              ownerBookingService.receiveReturn(id, {
                returnOdometerKm: payload.returnOdometerKm,
                returnEnergyLevelPercent: payload.returnEnergyLevelPercent,
                returnPhotos: payload.returnPhotos,
                conditionNotes: payload.conditionNotes,
                hasDamage: payload.hasDamage,
                hasCleaningIssue: payload.hasCleaningIssue,
                hasFuelShortage: payload.hasFuelShortage,
                vehicleCondition: payload.vehicleCondition,
                accessoriesSnapshot: payload.accessoriesSnapshot,
                vehicleDocumentsSnapshot: payload.vehicleDocumentsSnapshot,
              })
            }
            clearInspection={ownerBookingService.clearReturnInspection}
            completeBooking={ownerBookingService.completeBooking}
            onChanged={handleSettlementChanged}
          />
          <div id="owner-extra-charge-section">
            <ExtraChargeManager
              bookingId={detail._id}
              bookingStatus={detail.status}
              onChanged={handleSettlementChanged}
            />
          </div>
        </section>
      )}
      <BookingChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        bookingId={detail._id}
        bookingCode={detail.bookingCode}
        carName={detail.car.name}
        counterpartName={detail.customer.name}
        currentUserId={currentUserId}
        readOnly={isBookingChatReadOnly(detail.status)}
        listenWhenClosed
        onNewMessage={handleNewChatMessage}
      />
    </div>
  );
}

export default function OwnerBookingManagement({ eyebrow, title, subtitle }: OwnerBookingManagementProps) {
  const state = useOwnerBookingList();
  const { action, closeAction, detail } = state;
  const [actionLoading, setActionLoading] = useState(false);
  const [handoverAvailabilityNow, setHandoverAvailabilityNow] = useState(Date.now());
  const lastValidActionRef = useRef<{
    bookingId: string;
    action: OwnerBookingAction;
  } | null>(null);
  const totalPages = state.result.pagination.totalPages;
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter((value) => Math.abs(value - state.page) <= 2 || value === 1 || value === totalPages);

  useEffect(() => {
    const timer = window.setInterval(
      () => setHandoverAvailabilityNow(Date.now()),
      30 * 1000,
    );

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!action || !detail) {
      if (!action) lastValidActionRef.current = null;
      return;
    }

    const actionIsAvailable =
      (detail.availableActions || []).includes(action) &&
      (action !== "handover" || isHandoverAvailable(detail, handoverAvailabilityNow));
    if (actionIsAvailable) {
      lastValidActionRef.current = {
        bookingId: detail._id,
        action,
      };
      return;
    }

    const becameInvalidAfterRefresh =
      lastValidActionRef.current?.bookingId === detail._id &&
      lastValidActionRef.current.action === action;

    if (!becameInvalidAfterRefresh) {
      toast.error(
        action === "handover"
          ? getHandoverAvailableLabel(detail)
          : "Hành động này không còn phù hợp với trạng thái booking hiện tại.",
      );
    }
    lastValidActionRef.current = null;
    closeAction();
  }, [action, closeAction, detail, handoverAvailabilityNow]);

  useEffect(() => {
    if (!detail || !action || isMutationAction(action)) return;

    const targetId =
      action === "extra-charge"
        ? "owner-extra-charge-section"
        : action === "confirm-remaining"
          ? "owner-cash-payment-section"
          : "owner-return-settlement";
    const timeoutId = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [action, detail]);

  const handleAction = async (
    action: OwnerBookingMutationAction,
    payload: OwnerBookingActionPayload,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!state.detail) {
      return { success: false, error: "Không tìm thấy thông tin booking để xử lý." };
    }

    setActionLoading(true);
    try {
      if (action === "approve") {
        await ownerBookingService.approveBooking(state.detail._id);
      } else if (action === "reject" && "rejectReason" in payload) {
        await ownerBookingService.rejectBooking(
          state.detail._id,
          payload.rejectReason,
        );
      } else if (action === "no-show" && "noShowReason" in payload) {
        await ownerBookingService.markNoShow(
          state.detail._id,
          payload.noShowReason,
        );
      } else if (action === "handover" && "handoverOdometerKm" in payload) {
        await ownerBookingService.handoverBooking(state.detail._id, {
          handoverOdometerKm: Number(payload.handoverOdometerKm),
            handoverEnergyLevelPercent: Number(
              payload.handoverEnergyLevelPercent,
            ),
          preparation: payload.preparation,
          handoverPhotos: payload.handoverPhotos,
          handoverDashboardImage: payload.handoverDashboardImage,
          handoverConditionNotes: payload.handoverConditionNotes,
          vehicleCondition: payload.vehicleCondition,
          accessoriesSnapshot: payload.accessoriesSnapshot,
          vehicleDocumentsSnapshot: payload.vehicleDocumentsSnapshot,
        });
      } else if (action === "return" && "returnOdometerKm" in payload) {
        await ownerBookingService.receiveReturn(state.detail._id, {
          returnOdometerKm: Number(payload.returnOdometerKm),
          returnEnergyLevelPercent: Number(payload.returnEnergyLevelPercent),
          returnDashboardImage: payload.returnDashboardImage,
          returnPhotos: payload.returnPhotos,
          conditionNotes: payload.conditionNotes,
          hasDamage: payload.hasDamage,
          hasCleaningIssue: payload.hasCleaningIssue,
          hasFuelShortage: payload.hasFuelShortage,
          vehicleCondition: payload.vehicleCondition,
          accessoriesSnapshot: payload.accessoriesSnapshot,
          vehicleDocumentsSnapshot: payload.vehicleDocumentsSnapshot,
        });
      } else {
        throw new Error("Dữ liệu thao tác không hợp lệ.");
      }

      const successMessages: Record<OwnerBookingMutationAction, string> = {
        approve: "Đã duyệt booking thành công.",
        reject: "Đã từ chối booking.",
        "no-show": "Đã đánh dấu khách không nhận xe.",
        handover: "Đã xác nhận bàn giao xe.",
        return: "Đã xác nhận nhận xe trả.",
      };
      toast.success(successMessages[action]);
      notifyNotificationSummaryChanged();
      state.closeDetail();
      state.refresh();
      return { success: true };
    } catch (error) {
      let message = "Không thể xử lý booking.";
      if (typeof error === "object" && error !== null && "response" in error) {
        const response = (error as { response?: { data?: { data?: unknown; message?: unknown } } }).response;
        if (typeof response?.data?.data === "string") message = response.data.data;
        else if (typeof response?.data?.message === "string") message = response.data.message;
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setActionLoading(false);
    }
  };

  const detailHandoverBlocked = Boolean(
    state.detail &&
      (state.detail.availableActions || []).includes("handover") &&
      !isHandoverAvailable(state.detail, handoverAvailabilityNow),
  );
  const detailFooter = state.detail ? (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      <button type="button" onClick={state.closeDetail} className="min-h-11 rounded-lg border border-slate-200 bg-white px-5 py-2 font-bold text-primary transition hover:border-secondary hover:bg-secondarySoft/70">Đóng</button>
      {detailHandoverBlocked && (
        <p className="text-sm font-extrabold leading-5 text-amber-700">
          {getHandoverAvailableLabel(state.detail)}
        </p>
      )}
      {(state.detail.availableActions || [])
        .filter(
          (action) =>
            !INLINE_DETAIL_ACTIONS.has(action) &&
            (action !== "handover" || !detailHandoverBlocked),
        )
        .map((action) => {
        const Icon = ACTION_ICONS[action];
        return <button key={action} type="button" onClick={() => state.openAction(state.detail!._id, action)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2 font-extrabold transition ${action === "reject" || action === "cancel" || action === "no-show" ? "border border-red-200 bg-white text-red-700 hover:bg-red-50" : "bg-secondary text-primary hover:bg-secondaryLight"}`}><Icon size={18} />{ACTION_LABELS[action]}</button>;
        })}
    </div>
  ) : undefined;

  const processAction =
    state.action === "handover" || state.action === "return" ? state.action : null;
  const mutationAction =
    isMutationAction(state.action) && !processAction ? state.action : null;
  const mutationActionOpen = Boolean(mutationAction && state.detail);
  const processActionOpen = Boolean(processAction && state.detail);
  const cancellationActionOpen = Boolean(
    state.action === "cancel" && state.detail,
  );
  const actionUsesSeparateModal =
    mutationActionOpen || processActionOpen || cancellationActionOpen;
  const detailModalOpen =
    Boolean(state.bookingId) &&
    (!actionUsesSeparateModal || !state.detail);

  return (
    <div className="space-y-6">
      <section><p className="text-sm font-bold uppercase text-secondaryDark">{eyebrow}</p><h2 className="mt-2 text-3xl font-extrabold text-primary">{title}</h2><p className="mt-2 max-w-3xl text-slate-500">{subtitle}</p></section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_240px_220px_auto]">
          <label className="relative"><span className="sr-only">Tìm booking</span><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={state.searchInput} onChange={(event) => state.setSearchInput(event.target.value)} placeholder="Tìm mã booking, mã xe, tên xe, biển số hoặc khách thuê..." className="h-11 w-full rounded-md border border-slate-200 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/20" /></label>
          <select value={state.status} onChange={(event) => state.setStatus(event.target.value as BookingStatus | "")} className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-primary outline-none focus:border-secondary"><option value="">Tất cả trạng thái</option>{BOOKING_STATUSES.map((item) => <option key={item} value={item}>{getBookingStatusLabel(item)}</option>)}</select>
          <select value={state.sort} onChange={(event) => state.setSort(event.target.value as OwnerBookingSort)} className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-primary outline-none focus:border-secondary">{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <button type="button" onClick={state.reset} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-extrabold text-primary transition hover:border-secondary hover:bg-secondarySoft"><RefreshCw size={17} /> Đặt lại</button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{GROUP_OPTIONS.map((option) => {
          const isActive = state.group === option.value && !state.status;
          const count = state.result.groupCounts?.[option.value] || 0;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => state.setGroup(option.value)}
              aria-pressed={isActive}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold transition ${isActive ? "bg-primary text-secondary" : "bg-slate-100 text-slate-600 hover:bg-secondarySoft hover:text-primary"}`}
            >
              <span>{option.label}</span>
              <span
                className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${isActive ? "bg-secondary text-primary" : count > 0 ? "bg-white text-primary ring-1 ring-slate-200" : "bg-slate-200 text-slate-500"}`}
              >
                {count}
              </span>
            </button>
          );
        })}</div>
      </section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h3 className="font-extrabold text-primary">Danh sách booking</h3><p className="mt-1 text-sm text-slate-500">{state.result.pagination.totalItems} booking phù hợp</p></div></div>
        {state.loading ? <div className="px-5 py-14 text-center font-semibold text-slate-500">Đang tải danh sách booking...</div> : state.error ? <div className="px-5 py-14 text-center"><p className="font-semibold text-red-600">{state.error}</p><button type="button" onClick={state.retry} className="mt-4 rounded-md bg-primary px-5 py-2 font-bold text-secondary">Thử lại</button></div> : state.result.bookings.length === 0 ? <div className="px-5 py-14 text-center font-semibold text-slate-500">{state.searchInput || state.status || state.group !== "ALL" ? "Không tìm thấy booking phù hợp." : "Chưa có booking nào."}</div> : <><OwnerBookingTable bookings={state.result.bookings} onView={state.openDetail} onAction={state.openAction} currentTime={handoverAvailabilityNow} /><OwnerBookingMobileCards bookings={state.result.bookings} onView={state.openDetail} onAction={state.openAction} currentTime={handoverAvailabilityNow} /></>}
        {!state.loading && !state.error && totalPages > 1 && <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-4 py-4"><button type="button" aria-label="Trang trước" disabled={state.page <= 1} onClick={() => state.setPage(state.page - 1)} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 disabled:opacity-40"><ChevronLeft size={18} /></button>{pageNumbers.map((number, index) => <span key={number} className="contents">{index > 0 && number - pageNumbers[index - 1] > 1 && <span className="px-1 text-slate-400">...</span>}<button type="button" onClick={() => state.setPage(number)} className={`h-10 min-w-10 rounded-md px-3 font-extrabold ${number === state.page ? "bg-primary text-secondary" : "border border-slate-200 text-primary"}`}>{number}</button></span>)}<button type="button" aria-label="Trang sau" disabled={state.page >= totalPages} onClick={() => state.setPage(state.page + 1)} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 disabled:opacity-40"><ChevronRight size={18} /></button></div>}
      </section>
      <AdminModal open={detailModalOpen} title={state.detail ? `Booking ${state.detail.bookingCode}` : "Chi tiết booking"} description="Thông tin booking thuộc xe của bạn" cancelText="Đóng" onClose={state.closeDetail} footer={detailFooter}>
        {state.detailLoading ? <div className="py-14 text-center font-semibold text-slate-500">Đang tải chi tiết booking...</div> : state.detailError ? <div className="py-14 text-center"><p className="font-semibold text-red-600">{state.detailError}</p><button type="button" onClick={state.closeDetail} className="mt-4 rounded-md bg-primary px-5 py-2 font-bold text-secondary">Đóng</button></div> : state.detail ? <BookingDetailContent detail={state.detail} action={state.action} onChanged={state.refresh} /> : null}
      </AdminModal>
      {mutationActionOpen && state.detail && (
        <OwnerBookingActionModal
          key={`${state.detail._id}-${state.action}`}
          action={mutationAction}
          detail={state.detail}
          loading={actionLoading}
          onClose={state.closeDetail}
          onSubmit={handleAction}
        />
      )}
      {processActionOpen && state.detail && processAction && (
        <OwnerBookingProcessWizard
          key={`${state.detail._id}-${processAction}`}
          mode={processAction}
          detail={state.detail}
          loading={actionLoading}
          onClose={state.closeDetail}
          onSubmit={(payload) =>
            handleAction(processAction, payload as OwnerBookingActionPayload)
          }
        />
      )}
      {cancellationActionOpen && state.detail && (
        <OwnerBookingCancellationModal
          key={`${state.detail._id}-cancel`}
          detail={state.detail}
          onClose={state.closeAction}
          onCancelled={() => {
            state.closeDetail();
            state.refresh();
          }}
        />
      )}
    </div>
  );
}
