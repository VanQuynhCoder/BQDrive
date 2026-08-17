import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Ban,
  Building2,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Fuel,
  FileText,
  Gauge,
  Hash,
  Loader2,
  MapPin,
  Printer,
  ReceiptText,
  ShieldCheck,
  Star,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import {
  BookingNextAction,
  BookingStatusBadge,
  BookingTimeline,
} from "../components/booking/BookingTimeline";
import BookingExtensionPanel from "../components/booking/BookingExtensionPanel";
import BookingChatPanel, {
  canOpenBookingChat,
  isBookingChatReadOnly,
} from "../components/booking/BookingChatPanel";
import PricingBreakdown from "../components/pricing/PricingBreakdown";
import RouteMap from "../components/maps/RouteMap";
import { bookingService } from "../services/booking.service";
import type { CancellationPreview } from "../services/booking.service";
import { authService } from "../services/auth.service";
import {
  contractService,
  type RentalContract,
} from "../services/contract.service";
import { notifyNotificationSummaryChanged } from "../services/notification.service";
import {
  reviewService,
  type ReviewCriteria,
  type ReviewItem,
} from "../services/review.service";
import {
  extraChargeService,
  type ExtraCharge,
  type ExtraChargeType,
} from "../services/extraCharge.service";
import { refundService } from "../services/refund.service";
import { uploadService } from "../services/upload.service";
import type {
  RefundProviderOperation,
  RefundRecipientInfo,
  RefundRecipientInfoPayload,
  RefundRecipientMethod,
  RefundStatus,
} from "../services/refund.service";
import { getFirstCarImage, normalizeImageUrl } from "../utils/image.util";
import { formatVietnamDateTime } from "../utils/date.util";
import { formatAddressSnapshot, formatFullAddress } from "../utils/address.util";
import { getBookingTimelineView } from "../utils/bookingTimeline.util";
import { getBookingDisplayCode } from "../utils/display.util";
import type { BookingStatus } from "../constants/status.constants";
import type { PricingSnapshot } from "../types/pricing";
import type {
  VehicleAccessoriesSnapshot,
  VehicleConditionChecklist,
  VehicleDocumentsSnapshot,
} from "../types/ownerBooking";

type BookingCar = {
  _id: string;
  name?: string;
  licensePlate?: string;
  type?: string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
  pickupAddress: string;
  pickupFormattedAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  latitude?: number;
  longitude?: number;
  address: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
};

type BookingOwnerUser = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  address: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
};

type Booking = {
  _id: string;
  bookingCode?: string;
  carId: BookingCar;
  ownerId: BookingOwnerUser | string;
  startDate: string;
  endDate: string;
  rentalMode?: string;
  rentalPlanConversionSnapshot?: {
    sourceRentalMode?: string;
    targetRentalMode?: string;
    effectiveFrom?: string;
    convertedAt?: string;
    extensionId?: string;
  };
  totalPrice?: number;
  upfrontPaymentAmount: number;
  remainingAmount: number;
  paidAmount: number;
  paymentOption: "DEPOSIT" | "FULL" | string;
  status: BookingStatus;
  cancelReason: string;
  cancelledAt?: string;
  cancelledByRole?: string;
  cancelReasonCode?: string;
  cancelReasonText?: string;
  cancellationSummary?: {
    paidAmountAtCancellation: number;
    cancellationFee: number;
    refundAmount: number;
    policyRuleApplied: string;
    refundRequired: boolean;
    refundId?: string;
  };
  refunds?: BookingRefund[];
  rejectReason?: string;
  noShowReason: string;
  noShowAt?: string;
  note?: string;
  pricingSnapshot?: PricingSnapshot;
  pickupAddressSnapshot: string;
  returnAddressSnapshot: string;
  renterInfo?: {
    fullName?: string;
  };
  handoverSnapshot?: {
    preparation?: {
      odometerKm: number;
      energyLevelPercent: number;
      images?: string[];
      dashboardImage?: string;
      note?: string;
      recordedAt?: string;
    };
    handoverOdometerKm: number;
    handoverEnergyLevelPercent: number;
    handoverPhotos?: string[];
    handoverDashboardImage?: string;
    handoverConditionNotes?: string;
    vehicleCondition?: VehicleConditionChecklist;
    accessoriesSnapshot?: VehicleAccessoriesSnapshot;
    vehicleDocumentsSnapshot?: VehicleDocumentsSnapshot;
    handoverRecordedAt?: string;
    ownerConfirmedAt?: string;
    renterConfirmedAt?: string;
  };
};

type ReturnInspectionRecord = {
  _id: string;
  actualReturnAt?: string;
  returnOdometerKm?: number;
  returnEnergyLevelPercent?: number;
  returnDashboardImage?: string;
  returnPhotos?: string[];
  conditionNotes?: string;
  distanceTravelledKm?: number;
  hasDamage?: boolean;
  hasCleaningIssue?: boolean;
  hasFuelShortage?: boolean;
  vehicleCondition?: VehicleConditionChecklist;
  accessoriesSnapshot?: VehicleAccessoriesSnapshot;
  vehicleDocumentsSnapshot?: VehicleDocumentsSnapshot;
  ownerConfirmedAt?: string;
  renterConfirmedAt?: string;
};

function formatPrice(price?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price || 0);
}

function formatDateTime(date?: string) {
  if (!date) return "--";

  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "--";

  return formatVietnamDateTime(date, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDuration(minutes?: number) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (hours === 0) return `${remainingMinutes} phút`;
  if (remainingMinutes === 0) return `${hours} giờ`;
  return `${hours} giờ ${remainingMinutes} phút`;
}

function getRentalInfo(rentalMode?: string) {
  if (rentalMode === "HOURLY") {
    return {
      unit: "giờ",
      label: "Số giờ thuê",
      mode: "Thuê theo giờ",
    };
  }

  return {
    unit: "ngày",
    label: "Số ngày thuê",
    mode: "Thuê theo ngày",
  };
}

const HOUR_MS = 1000 * 60 * 60;
const maxReviewImages = 3;
const maxReviewImageSize = 5 * 1024 * 1024;
const supportedReviewImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const reviewCriteriaOptions: Array<{
  key: keyof ReviewCriteria;
  label: string;
  description: string;
}> = [
  {
    key: "vehicleQuality",
    label: "Chất lượng xe cao",
    description: "Xe vận hành ổn, phù hợp chuyến đi",
  },
  {
    key: "cleanliness",
    label: "Xe sạch sẽ",
    description: "Nội thất và ngoại thất được chuẩn bị tốt",
  },
  {
    key: "descriptionAccuracy",
    label: "Đúng như mô tả",
    description: "Thông tin xe trên hệ thống chính xác",
  },
  {
    key: "handoverService",
    label: "Nhận/trả xe nhanh gọn",
    description: "Thủ tục rõ ràng, không mất nhiều thời gian",
  },
  {
    key: "ownerAttitude",
    label: "Chủ xe hỗ trợ tốt",
    description: "Tư vấn và phản hồi thân thiện",
  },
  {
    key: "punctuality",
    label: "Giao xe đúng giờ",
    description: "Xe được giao/nhận đúng lịch hẹn",
  },
];

function getSelectedReviewCriteria(criteria?: ReviewCriteria) {
  return reviewCriteriaOptions.filter((item) => criteria?.[item.key]);
}

function calculateRentalTime(rentalMode: string | undefined, start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();

  if (Number.isNaN(diffMs) || diffMs <= 0) return 0;

  if (rentalMode === "HOURLY") {
    return Math.ceil(diffMs / HOUR_MS);
  }

  return Math.max(1, Math.ceil(diffMs / HOUR_MS / 24));
}

function getSpecLabel(value?: string) {
  const labels: Record<string, string> = {
    ELECTRIC: "Điện",
    GASOLINE: "Xăng",
    DIESEL: "Diesel",
    HYBRID: "Hybrid",
    AUTOMATIC: "Tự động",
    MANUAL: "Số sàn",
  };

  return value ? labels[value] || value : "--";
}

function getStatusInfo(status: BookingStatus) {
  const value = status || "REQUESTED";

  if (value === "OWNER_APPROVED") {
    return {
      label: "Chủ xe đã duyệt",
      detail: "Chủ xe đã đồng ý cho thuê. Bạn có thể tạo hợp đồng và thanh toán.",
      badgeClass: "bg-primary text-secondary",
      panelClass: "border-primary/15 bg-primary text-secondary",
      icon: BadgeCheck,
    };
  }

  if (value === "PAYMENT_PENDING") {
    return {
      label: "Chờ thanh toán",
      detail: "Bạn đã bắt đầu thanh toán, hệ thống đang chờ kết quả hoặc ghi nhận thanh toán.",
      badgeClass: "bg-amber-50 text-amber-700",
      panelClass: "border-amber-100 bg-amber-50 text-amber-700",
      icon: CreditCard,
    };
  }

  if (value === "PAID") {
    return {
      label: "Đã thanh toán",
      detail: "Booking đã được thanh toán và lịch thuê đã được ghi nhận chính thức.",
      badgeClass: "bg-secondarySoft text-primary",
      panelClass: "border-secondary/40 bg-secondarySoft text-primary",
      icon: CheckCircle2,
    };
  }

  if (value === "IN_PROGRESS") {
    return {
      label: "Đang thuê",
      detail: "Chuyến thuê đang diễn ra. Vui lòng trả xe đúng thời gian.",
      badgeClass: "bg-primary text-secondary",
      panelClass: "border-primary/15 bg-primary text-secondary",
      icon: CarFront,
    };
  }

  if (value === "RETURN_INSPECTION") {
    return {
      label: "Đang kiểm tra xe",
      detail: "Chủ xe đã tiếp nhận xe trả và đang kiểm tra tình trạng sau thuê.",
      badgeClass: "bg-amber-50 text-amber-700",
      panelClass: "border-amber-100 bg-amber-50 text-amber-700",
      icon: CircleDashed,
    };
  }

  if (value === "AWAITING_EXTRA_CHARGE") {
    return {
      label: "Chờ xử lý phí phát sinh",
      detail: "Booking có phí phát sinh cần xử lý trước khi hoàn tất.",
      badgeClass: "bg-amber-50 text-amber-700",
      panelClass: "border-amber-100 bg-amber-50 text-amber-700",
      icon: CreditCard,
    };
  }

  if (value === "COMPLETED") {
    return {
      label: "Hoàn tất",
      detail: "Chuyến thuê đã hoàn tất.",
      badgeClass: "bg-secondarySoft text-primary",
      panelClass: "border-secondary/40 bg-secondarySoft text-primary",
      icon: CheckCircle2,
    };
  }

  if (value === "CANCELLED") {
    return {
      label: "Đã hủy",
      detail: "Booking này đã được hủy.",
      badgeClass: "bg-slate-100 text-slate-800",
      panelClass: "border-slate-200 bg-slate-100 text-slate-800",
      icon: XCircle,
    };
  }

  if (value === "REJECTED") {
    return {
      label: "Yêu cầu bị từ chối",
      detail: "Yêu cầu thuê xe bị từ chối.",
      badgeClass: "bg-red-50 text-red-700",
      panelClass: "border-red-100 bg-red-50 text-red-700",
      icon: XCircle,
    };
  }

  if (value === "NO_SHOW") {
    return {
      label: "Không nhận xe",
      detail: "Booking đã được đánh dấu khách không nhận xe.",
      badgeClass: "bg-slate-100 text-slate-800",
      panelClass: "border-slate-200 bg-slate-100 text-slate-800",
      icon: Ban,
    };
  }

  return {
    label: "Chờ xác nhận",
    detail: "Booking đang chờ chủ xe xác nhận.",
    badgeClass: "bg-amber-50 text-amber-700",
    panelClass: "border-amber-100 bg-amber-50 text-amber-700",
    icon: CircleDashed,
  };
}

function getPaymentInfo(booking: Booking) {
  const totalPrice = booking.totalPrice || 0;
  const paidAmount = booking.paidAmount || 0;
  const isFullPayment = booking.paymentOption === "FULL";
  const platformFee = Number(booking.pricingSnapshot?.platformFee ?? 0);
  const insuranceFee = Number(booking.pricingSnapshot?.insuranceFee ?? 0);
  const deliveryFee = Number(
    booking.pricingSnapshot?.deliveryFee ??
      booking.pricingSnapshot?.delivery?.deliveryFee ??
      0,
  );
  const rentalSubtotal = Number(
    booking.pricingSnapshot?.rentalSubtotal ??
      booking.pricingSnapshot?.subtotal ??
      Math.max(totalPrice - platformFee - insuranceFee - deliveryFee, 0),
  );
  const rentalDepositAmount = Number(
    booking.pricingSnapshot?.rentalDepositAmount ??
      Math.round(rentalSubtotal * 0.5),
  );
  const upfrontPaymentAmount = Number(
    booking.pricingSnapshot?.upfrontPaymentAmount ??
      rentalDepositAmount + platformFee + insuranceFee,
  );
  const outstandingAmount = Math.max(
    booking.remainingAmount || totalPrice - paidAmount,
    0,
  );

  if (totalPrice > 0 && paidAmount >= totalPrice) {
    return {
      label: "Đã thanh toán đủ",
      detail: "Không còn số tiền cần thanh toán.",
      badgeClass: "bg-secondarySoft text-primary",
      nextAmount: 0,
      totalPrice,
      paidAmount,
      rentalSubtotal,
      rentalDepositAmount,
      platformFee,
      insuranceFee,
      deliveryFee,
      upfrontPaymentAmount,
      outstandingAmount,
    };
  }

  if (paidAmount > 0) {
    return {
      label: "Đã thanh toán giữ chỗ",
      detail:
        "Booking đã ghi nhận khoản thanh toán giữ chỗ, vẫn còn phần tiền cần thanh toán.",
      badgeClass: "bg-primary text-secondary",
      nextAmount: outstandingAmount,
      totalPrice,
      paidAmount,
      rentalSubtotal,
      rentalDepositAmount,
      platformFee,
      insuranceFee,
      deliveryFee,
      upfrontPaymentAmount,
      outstandingAmount,
    };
  }

  return {
    label: "Chưa thanh toán",
    detail:
      isFullPayment
        ? "Booking chọn thanh toán toàn bộ."
        : "Booking chọn thanh toán giữ chỗ.",
    badgeClass: "bg-amber-50 text-amber-700",
    nextAmount: isFullPayment ? totalPrice : upfrontPaymentAmount,
    totalPrice,
    paidAmount,
    rentalSubtotal,
    rentalDepositAmount,
    platformFee,
    insuranceFee,
    deliveryFee,
    upfrontPaymentAmount,
    outstandingAmount,
  };
}

type VehicleRecordData = {
  vehicleCondition?: VehicleConditionChecklist;
  accessoriesSnapshot?: VehicleAccessoriesSnapshot;
  vehicleDocumentsSnapshot?: VehicleDocumentsSnapshot;
};

const VEHICLE_RECORD_GROUPS = [
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

function VehicleRecordChecklist({
  handoverRecord,
  returnRecord,
}: {
  handoverRecord: VehicleRecordData;
  returnRecord?: VehicleRecordData;
}) {
  return (
    <div className="mt-5 space-y-3">
      {VEHICLE_RECORD_GROUPS.map((group) => {
        const handoverValues = handoverRecord[group.field] as Record<string, boolean> | undefined;
        const returnValues = returnRecord?.[group.field] as Record<string, boolean> | undefined;
        const rows = Object.entries(group.labels).filter(([key]) => {
          if (key !== "chargingCablePresent") return true;
          return Boolean(
            handoverRecord.accessoriesSnapshot?.chargingCableApplicable ||
              returnRecord?.accessoriesSnapshot?.chargingCableApplicable,
          );
        });
        const renderStatus = (value?: boolean) => value === undefined ? (
          <span className="text-slate-400">Chưa ghi nhận</span>
        ) : (
          <span className={value ? "font-extrabold text-emerald-700" : "font-extrabold text-red-700"}>
            {value ? group.positive : group.negative}
          </span>
        );

        return (
          <section key={group.field} className="overflow-hidden rounded-xl border border-slate-200">
            <h4 className="bg-slate-50 px-4 py-2.5 text-sm font-extrabold text-primary">{group.title}</h4>
            <div className={`grid gap-2 border-t border-slate-200 px-4 py-2 text-[10px] font-extrabold uppercase text-slate-400 ${returnRecord ? "grid-cols-[minmax(0,1fr)_85px_85px]" : "grid-cols-[minmax(0,1fr)_100px]"}`}>
              <span>Hạng mục</span><span>Bàn giao</span>{returnRecord && <span>Nhận lại</span>}
            </div>
            {rows.map(([key, label]) => {
              const before = handoverValues?.[key];
              const after = returnValues?.[key];
              const changed = Boolean(returnRecord) && before !== undefined && after !== undefined && before !== after;
              return (
                <div key={key} className={`grid gap-2 border-t border-slate-100 px-4 py-2 text-xs ${returnRecord ? "grid-cols-[minmax(0,1fr)_85px_85px]" : "grid-cols-[minmax(0,1fr)_100px]"} ${changed ? "bg-amber-50" : "bg-white"}`}>
                  <span className="font-semibold text-slate-700">{label}{changed ? " · Có thay đổi" : ""}</span>
                  {renderStatus(before)}
                  {returnRecord && renderStatus(after)}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown; data?: unknown } } }).response;
    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  return fallback;
}

function canPayBooking(booking: Booking, nextAmount: number) {
  return (
    nextAmount > 0 &&
    [
      "OWNER_APPROVED", // Chủ xe đã duyệt nên khách được thanh toán
      "PAYMENT_PENDING", // Đang chờ thanh toán, cho phép quay lại thanh toán
      "PAID", // Đã trả cọc, có thể thanh toán phần còn lại nếu còn tiền
      "IN_PROGRESS",
      "RETURN_INSPECTION",
      "AWAITING_EXTRA_CHARGE",
    ].includes(
      booking.status || "",
    )
  );
}

function canCancelBooking(booking: Booking) {
  return [
    "REQUESTED",
    "OWNER_APPROVED",
    "PAYMENT_PENDING",
    "PAID",
  ].includes(booking.status || "");
}

const extraChargeTypeLabels: Record<ExtraChargeType, string> = {
  CLEANING: "Phí vệ sinh",
  DAMAGE: "Phí sửa chữa/hư hỏng",
  LATE_RETURN: "Phí trễ giờ",
  FUEL: "Phí nhiên liệu",
  OVERAGE_KM: "Phí vượt kilomet",
  OTHER: "Phí khác",
};

type BookingRefund = {
  _id: string;
  refundAmount: number;
  cancellationFee: number;
  paidAmountAtCancellation: number;
  status: RefundStatus;
  method: string;
  policyRuleApplied: string;
  reasonCode?: string;
  reasonText?: string;
  providerOperations?: RefundProviderOperation[];
  recipientInfo?: RefundRecipientInfo;
  manualRefundReference?: string;
  manualRefundSentAt?: string;
  renterConfirmedAt?: string;
  succeededAt?: string;
  createdAt?: string;
};

function getExtraChargeTypeLabel(type: ExtraChargeType | string) {
  return extraChargeTypeLabels[type as ExtraChargeType] || type || "Phí phát sinh";
}

function getExtraChargeStatusMeta(status?: string) {
  if (status === "PAID") {
    return {
      label: "Đã thanh toán",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (status === "CANCELLED") {
    return {
      label: "Đã hủy",
      className: "border-slate-200 bg-slate-100 text-slate-600",
    };
  }

  return {
    label: "Chờ thanh toán",
    className: "border-yellow-200 bg-yellow-50 text-amber-700",
  };
}

function getRefundStatusLabel(status?: string, method?: string) {
  if (status === "PROCESSING" && method === "VNPAY") {
    return "Đang xử lý hoàn tiền qua VNPay";
  }

  const labels: Record<string, string> = {
    WAITING_FOR_REFUND_INFO: "Chờ cung cấp thông tin nhận tiền",
    PROCESSING: "Chủ xe đã gửi, chờ xác nhận",
    SUCCEEDED: "Hoàn tiền thành công",
    MANUAL_REQUIRED: "Chờ hoàn thủ công",
  };

  return labels[status || ""] || "Chờ xử lý";
}

function getCancellationPolicyLabel(rule?: string) {
  const labels: Record<string, string> = {
    NO_PAID_AMOUNT:
      "Chưa thanh toán, không phát sinh hoàn tiền",

    RENTER_CANCEL_WITHIN_60_MINUTES:
      "Khách hủy trong vòng 60 phút sau lần thanh toán thành công đầu tiên, hoàn 100%",

    RENTER_CANCEL_AFTER_60_MINUTES_KEEP_DEPOSIT_AND_PLATFORM_FEE:
      "Khách hủy sau 60 phút: giữ cọc thuê xe và phí dịch vụ BQDrive, hoàn phần còn lại",

    OWNER_CANCEL_FULL_REFUND:
      "Chủ xe hủy, hoàn 100% số tiền khách đã thanh toán",

    PAYMENT_AFTER_CANCEL_FULL_REFUND:
      "Thanh toán được ghi nhận sau khi chuyến đã hủy. Hệ thống đã tạo yêu cầu hoàn lại toàn bộ số tiền.",

    PAYMENT_AFTER_BOOKING_CANCELLED:
      "Thanh toán được ghi nhận sau khi chuyến đã hủy. Hệ thống đã tạo yêu cầu hoàn lại toàn bộ số tiền.",

    NO_SHOW_KEEP_DEPOSIT_AND_PLATFORM_FEE:
      "Khách không đến nhận xe: giữ cọc thuê xe và phí dịch vụ BQDrive, hoàn phần còn lại",
  };

  return labels[rule || ""] || rule || "--";
}

export default function BookingDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReasonCode, setCancelReasonCode] = useState("CHANGE_OF_PLAN");
  const [cancelReasonText, setCancelReasonText] = useState("");
  const [cancelPreview, setCancelPreview] = useState<CancellationPreview | null>(null);
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState(false);
  const [cancelPolicyAccepted, setCancelPolicyAccepted] = useState(false);
  const [review, setReview] = useState<ReviewItem | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewCriteria, setReviewCriteria] = useState<ReviewCriteria>({});
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [reviewImagesUploading, setReviewImagesUploading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [extraCharges, setExtraCharges] = useState<ExtraCharge[]>([]);
  const [extraChargeLoading, setExtraChargeLoading] = useState(false);
  const [extraChargePayingId, setExtraChargePayingId] = useState("");
  const [refundConfirmingId, setRefundConfirmingId] = useState("");
  const [refundCheckingId, setRefundCheckingId] = useState("");
  const [refundRecipientSubmittingId, setRefundRecipientSubmittingId] =
    useState("");
  const [refundRecipientModalOpen, setRefundRecipientModalOpen] = useState(false);
  const [refundRecipientMethod, setRefundRecipientMethod] =
    useState<RefundRecipientMethod>("BANK_TRANSFER");
  const [refundBankName, setRefundBankName] = useState("");
  const [refundAccountNumber, setRefundAccountNumber] = useState("");
  const [refundAccountHolderName, setRefundAccountHolderName] = useState("");
  const [refundWalletProvider, setRefundWalletProvider] = useState("");
  const [refundWalletAccount, setRefundWalletAccount] = useState("");
  const [refundWalletHolderName, setRefundWalletHolderName] = useState("");
  const [refundCashNote, setRefundCashNote] = useState("");
  const [refundRecipientAccepted, setRefundRecipientAccepted] = useState(false);
  const [returnInspection, setReturnInspection] =
    useState<ReturnInspectionRecord | null>(null);
  const [rentalContract, setRentalContract] = useState<RentalContract | null>(null);
  const [handoverExpanded, setHandoverExpanded] = useState(false);
  const [returnExpanded, setReturnExpanded] = useState(false);
  const [printDocument, setPrintDocument] = useState<"handover" | "return" | null>(null);
  const [handoverConfirming, setHandoverConfirming] = useState(false);
  const [returnConfirming, setReturnConfirming] = useState(false);

  const fetchExtraCharges = useCallback(async (bookingId: string) => {
    setExtraChargeLoading(true);
    try {
      setExtraCharges(await extraChargeService.getMyByBooking(bookingId));
    } catch {
      setExtraCharges([]);
    } finally {
      setExtraChargeLoading(false);
    }
  }, []);

  const fetchBooking = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      const foundBooking = (await bookingService.getMyBooking(id)) as Booking;
      setBooking(foundBooking || null);
      if (foundBooking?._id) {
        await fetchExtraCharges(foundBooking._id);
        try {
          const contracts = await contractService.getMyContracts();
          const matchedContract = contracts.find((contract) => {
            const contractBookingId =
              typeof contract.bookingId === "string"
                ? contract.bookingId
                : contract.bookingId?._id;
            return contractBookingId === foundBooking._id;
          });
          setRentalContract(matchedContract || null);
        } catch {
          setRentalContract(null);
        }
        try {
          const inspectionData = await bookingService.getReturnInspection(
            foundBooking._id,
          );
          setReturnInspection(inspectionData.inspection || null);
        } catch {
          setReturnInspection(null);
        }
      }
      if (foundBooking?.status === "COMPLETED") {
        const foundReview = await reviewService.getBookingReview(foundBooking._id);
        setReview(foundReview);
      } else {
        setReview(null);
      }
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: unknown } } }).response
          ?.data?.message === "string"
          ? String(
              (error as { response?: { data?: { message?: unknown } } }).response
                ?.data?.message,
            )
          : "Không thể tải booking";

      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [fetchExtraCharges, id]);

  useEffect(() => {
    const clearPrintDocument = () => setPrintDocument(null);
    window.addEventListener("afterprint", clearPrintDocument);
    return () => window.removeEventListener("afterprint", clearPrintDocument);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchBooking();
    });
  }, [fetchBooking]);

  const loadCancellationPreview = useCallback(
    async (nextReasonCode = cancelReasonCode, nextReasonText = cancelReasonText) => {
      if (!booking?._id) return;

      setCancelPreviewLoading(true);
      try {
        const preview = await bookingService.previewCancellation(booking._id, {
          reasonCode: nextReasonCode,
          reasonText: nextReasonText,
        });
        setCancelPreview(preview);
      } catch (error) {
        const message =
          typeof error === "object" &&
          error !== null &&
          "response" in error &&
          typeof (error as { response?: { data?: { message?: unknown; data?: unknown } } })
            .response?.data?.message === "string"
            ? String(
                (error as { response?: { data?: { message?: unknown } } }).response
                  ?.data?.message,
              )
            : "Không thể xem trước chính sách hủy";

        setCancelPreview(null);
        toast.error(message);
      } finally {
        setCancelPreviewLoading(false);
      }
    },
    [booking, cancelReasonCode, cancelReasonText],
  );

  const openCancelModal = async () => {
    if (!booking || cancelSubmitting) return;
    setCancelModalOpen(true);
    setCancelPolicyAccepted(false);
    await loadCancellationPreview();
  };

  const handleCancel = async () => {
    if (!booking || cancelSubmitting || !cancelPreview || !cancelPolicyAccepted) return;

    try {
      setCancelSubmitting(true);
      const result = await bookingService.cancelBooking(booking._id, {
        reasonCode: cancelReasonCode,
        reasonText: cancelReasonText,
        confirmed: true,
      });
      toast.success(result?.message || "Đã hủy booking");
      setCancelModalOpen(false);
      setCancelPreview(null);
      setCancelPolicyAccepted(false);
      await fetchBooking();
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: unknown } } }).response
          ?.data?.message === "string"
          ? String(
              (error as { response?: { data?: { message?: unknown } } }).response
                ?.data?.message,
            )
          : "Hủy booking thất bại";

      toast.error(message);
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handlePayExtraCharge = async (
    extraChargeId: string,
    provider: "MOMO" | "VNPAY",
  ) => {
    if (extraChargePayingId) return;

    setExtraChargePayingId(extraChargeId);
    try {
      const result =
        provider === "MOMO"
          ? await extraChargeService.createMomoPayment(extraChargeId)
          : await extraChargeService.createVnpayPayment(extraChargeId);
      const momoResult = result as { momo?: { payUrl?: string } };
      const payUrl =
        result.payUrl ||
        momoResult.momo?.payUrl;

      if (!payUrl) {
        throw new Error("Missing payment URL");
      }

      window.location.assign(payUrl);
    } catch {
      toast.error("Không thể tạo thanh toán phí phát sinh");
      setExtraChargePayingId("");
    }
  };

  const handleConfirmRefundReceived = async (refundId: string) => {
    if (refundConfirmingId) return;

    setRefundConfirmingId(refundId);
    try {
      await refundService.confirmReceived(refundId);
      toast.success("Đã xác nhận nhận tiền hoàn.");
      await fetchBooking();
      notifyNotificationSummaryChanged();
    } catch {
      toast.error("Không thể xác nhận nhận tiền hoàn");
    } finally {
      setRefundConfirmingId("");
    }
  };

  const handleConfirmHandoverReceived = async () => {
    if (!booking || handoverConfirming) return;
    setHandoverConfirming(true);
    try {
      await bookingService.confirmHandoverReceived(booking._id);
      toast.success("Đã xác nhận nhận xe.");
      notifyNotificationSummaryChanged();
      await fetchBooking();
    } catch (error) {
      toast.error(getActionErrorMessage(error, "Không thể xác nhận nhận xe."));
    } finally {
      setHandoverConfirming(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (!booking || returnConfirming) return;
    setReturnConfirming(true);
    try {
      await bookingService.confirmReturn(booking._id);
      toast.success("Đã xác nhận trả xe.");
      notifyNotificationSummaryChanged();
      await fetchBooking();
    } catch (error) {
      toast.error(getActionErrorMessage(error, "Không thể xác nhận trả xe."));
    } finally {
      setReturnConfirming(false);
    }
  };

  const handlePrintDocument = (document: "handover" | "return") => {
    setPrintDocument(document);
    window.requestAnimationFrame(() => window.print());
  };

  const openTripDocument = (document: "handover" | "return") => {
    if (document === "handover") setHandoverExpanded(true);
    else setReturnExpanded(true);
    window.requestAnimationFrame(() => {
      globalThis.document.getElementById("trip-documents")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const handleCheckVnpayRefundStatus = async (refundId: string) => {
    if (refundCheckingId) return;

    setRefundCheckingId(refundId);
    try {
      const result = await refundService.checkVnpayStatus(refundId);
      const hasUnknownOperation = result.refund.providerOperations?.some(
        (operation) =>
          operation.provider?.toUpperCase() === "VNPAY" &&
          operation.status === "UNKNOWN",
      );

      if (result.completed || result.refund.status === "SUCCEEDED") {
        toast.success(result.message || "Hoàn tiền đã được xác nhận thành công.");
      } else if (result.operationStatus === "UNKNOWN" || hasUnknownOperation) {
        toast(result.message || "Chưa xác định được trạng thái cuối cùng. Bạn có thể kiểm tra lại sau.");
      } else {
        toast(result.message || "Yêu cầu hoàn tiền vẫn đang được VNPay xử lý.");
      }

      await fetchBooking();
      notifyNotificationSummaryChanged();
    } catch {
      toast.error("Không thể kiểm tra trạng thái hoàn tiền lúc này.");
    } finally {
      setRefundCheckingId("");
    }
  };

  const openRefundRecipientModal = () => {
    setRefundRecipientMethod("BANK_TRANSFER");
    setRefundBankName("");
    setRefundAccountNumber("");
    setRefundAccountHolderName("");
    setRefundWalletProvider("");
    setRefundWalletAccount("");
    setRefundWalletHolderName("");
    setRefundCashNote("");
    setRefundRecipientAccepted(false);
    setRefundRecipientModalOpen(true);
  };

  const buildRefundRecipientPayload = (): RefundRecipientInfoPayload | null => {
    if (refundRecipientMethod === "BANK_TRANSFER") {
      const bankName = refundBankName.trim();
      const accountNumber = refundAccountNumber.trim();
      const accountHolderName = refundAccountHolderName.trim();

      if (!bankName || !accountNumber || !accountHolderName) {
        toast.error("Vui lòng nhập đầy đủ thông tin tài khoản ngân hàng.");
        return null;
      }

      return {
        method: "BANK_TRANSFER",
        bankName,
        accountNumber,
        accountHolderName,
      };
    }

    if (refundRecipientMethod === "E_WALLET") {
      const walletProvider = refundWalletProvider.trim();
      const walletAccount = refundWalletAccount.trim();
      const walletHolderName = refundWalletHolderName.trim();

      if (!walletProvider || !walletAccount || !walletHolderName) {
        toast.error("Vui lòng nhập đầy đủ thông tin ví điện tử.");
        return null;
      }

      return {
        method: "E_WALLET",
        walletProvider,
        walletAccount,
        walletHolderName,
      };
    }

    const cashNote = refundCashNote.trim();
    if (cashNote.length < 10) {
      toast.error("Vui lòng nhập ghi chú nhận tiền mặt rõ ràng hơn.");
      return null;
    }

    return {
      method: "CASH",
      cashNote,
    };
  };

  const handleSubmitRefundRecipientInfo = async () => {
    if (!latestRefund || refundRecipientSubmittingId) return;
    if (!refundRecipientAccepted) {
      toast.error("Vui lòng xác nhận thông tin nhận tiền là chính xác.");
      return;
    }

    const payload = buildRefundRecipientPayload();
    if (!payload) return;

    setRefundRecipientSubmittingId(latestRefund._id);
    try {
      await refundService.submitRecipientInfo(latestRefund._id, payload);
      toast.success("Đã gửi thông tin nhận tiền hoàn cho chủ xe.");
      setRefundRecipientModalOpen(false);
      await fetchBooking();
      notifyNotificationSummaryChanged();
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: unknown } } }).response
          ?.data?.message === "string"
          ? String(
              (error as { response?: { data?: { message?: unknown } } }).response
                ?.data?.message,
            )
          : "Không thể gửi thông tin nhận tiền hoàn";

      toast.error(message);
    } finally {
      setRefundRecipientSubmittingId("");
    }
  };

  const openReviewModal = useCallback(() => {
    if (review) {
      setReviewRating(review.rating || 0);
      setReviewComment(review.comment || "");
      setReviewCriteria(review.criteria || {});
      setReviewImages(review.images || []);
    } else {
      setReviewRating(0);
      setReviewComment("");
      setReviewCriteria({});
      setReviewImages([]);
    }

    setReviewModalOpen(true);
  }, [review]);

  useEffect(() => {
    if (loading || !booking) return;

    const actionParam = searchParams.get("action");
    const sectionParam = searchParams.get("section");
    const scrollToSection = (sectionId: string) => {
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
    };

    if (actionParam === "review" && booking.status === "COMPLETED" && !review) {
      queueMicrotask(() => {
        setSearchParams({}, { replace: true });
        openReviewModal();
      });
      return;
    }

    if (actionParam === "payment") {
      scrollToSection("booking-payment-summary");
      return;
    }

    if (sectionParam === "extra-charge") {
      scrollToSection("booking-extra-charges");
      return;
    }

    if (sectionParam === "refund") {
      scrollToSection("booking-refund");
      return;
    }

    if (sectionParam === "return") {
      scrollToSection("booking-timeline");
    }
  }, [booking, loading, openReviewModal, review, searchParams, setSearchParams]);

  const handleReviewImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const availableSlots = maxReviewImages - reviewImages.length;
    if (availableSlots <= 0) {
      toast.error(`Chỉ được tải tối đa ${maxReviewImages} ảnh đánh giá.`);
      return;
    }

    const validFiles = files.slice(0, availableSlots).filter((file) => {
      if (!supportedReviewImageMimeTypes.has(file.type)) {
        toast.error(`${file.name}: chỉ hỗ trợ JPG, PNG hoặc WEBP; không hỗ trợ HEIC.`);
        return false;
      }

      if (file.size > maxReviewImageSize) {
        toast.error(`${file.name} vượt quá 5MB.`);
        return false;
      }

      return true;
    });

    if (!validFiles.length) return;

    setReviewImagesUploading(true);
    try {
      const images = await Promise.all(
        validFiles.map((file) => uploadService.uploadCarImage(file)),
      );
      setReviewImages((current) => [
        ...current,
        ...images.map((image) => image.url),
      ].slice(0, maxReviewImages));
    } catch {
      toast.error("Không thể tải ảnh đánh giá lên hệ thống.");
    } finally {
      setReviewImagesUploading(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!booking || reviewSubmitting || reviewImagesUploading) return;

    if (!reviewRating) {
      toast.error("Vui lòng chọn điểm tổng thể từ 1 đến 5 sao");
      return;
    }

    try {
      setReviewSubmitting(true);
      const payload = {
        rating: reviewRating,
        criteria: reviewCriteria,
        comment: reviewComment,
        images: reviewImages,
      };
      const savedReview = review
        ? await reviewService.updateReview(review.id || review._id || "", payload)
        : await reviewService.createReview({
            bookingId: booking._id,
            ...payload,
          });
      setReview(savedReview);
      setReviewModalOpen(false);
      setReviewRating(0);
      setReviewComment("");
      setReviewCriteria({});
      setReviewImages([]);
      notifyNotificationSummaryChanged();
      toast.success(review ? "Đã cập nhật đánh giá." : "Cảm ơn bạn đã đánh giá chuyến thuê.");
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: unknown } } }).response
          ?.data?.message === "string"
          ? String(
              (error as { response?: { data?: { message?: unknown } } }).response
                ?.data?.message,
            )
          : "Không thể gửi đánh giá";

      toast.error(message);
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-background">
        <Header />
        <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
          <div className="mb-8 h-24 animate-pulse rounded-lg bg-soft" />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <div className="h-72 animate-pulse rounded-lg bg-soft" />
              <div className="h-56 animate-pulse rounded-lg bg-soft" />
            </div>
            <div className="h-96 animate-pulse rounded-lg bg-soft" />
          </div>
        </main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-background">
        <Header />
        <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
          <div className="rounded-lg border border-border bg-white p-10 text-center shadow-sm">
            <ReceiptText size={48} className="mx-auto text-secondary" />
            <h1 className="mt-4 text-2xl font-extrabold text-primary">
              Không tìm thấy booking
            </h1>
            <p className="mx-auto mt-2 max-w-md text-muted">
              Booking này không tồn tại hoặc không thuộc tài khoản hiện tại.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary"
            >
              Về trang chủ
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const car = booking.carId;
  const ownerUser =
    booking.ownerId &&
    typeof booking.ownerId === "object"
      ? (booking.ownerId as BookingOwnerUser)
      : undefined;

  const ownerName = ownerUser?.name || "Chủ xe ký gửi";
  const currentUserId = authService.getCurrentUser()?._id || "";

  const ownerAddress = formatFullAddress(
    ownerUser,
    "Địa chỉ liên hệ sẽ theo hợp đồng.",
  );

const ownerPhone = ownerUser?.phone;
  const pickupAddress = formatAddressSnapshot(
    booking.pickupAddressSnapshot,
    car,
  );
  const returnAddress = formatAddressSnapshot(
    booking.returnAddressSnapshot,
    car,
    pickupAddress,
  );
  const deliverySnapshot = booking.pricingSnapshot?.delivery;
  const isDeliveryToCustomer =
    deliverySnapshot?.deliveryType === "DELIVERY_TO_CUSTOMER";
  const rental = getRentalInfo(
    booking.pricingSnapshot?.rentalMode || booking.rentalMode,
  );
  const rentalTime = calculateRentalTime(
    booking.rentalMode,
    booking.startDate,
    booking.endDate,
  );
  const statusInfo = getStatusInfo(booking.status);
  const paymentInfo = getPaymentInfo(booking);
  const bookingTimeline = getBookingTimelineView({
    status: booking.status,
    perspective: "RENTER",
    startDate: booking.startDate,
    totalPrice: booking.totalPrice,
    paidAmount: booking.paidAmount,
    remainingAmount: booking.remainingAmount,
  });
  const StatusIcon = statusInfo.icon;
  const paymentNextAmount = Number(paymentInfo.nextAmount || 0);
  const paymentPaidAmount = Number(paymentInfo.paidAmount || 0);
  const paymentTotalPrice = Number(paymentInfo.totalPrice || 0);
  const paymentProgress = paymentInfo.totalPrice
    ? Math.min(100, Math.round((paymentPaidAmount / paymentTotalPrice) * 100))
    : 0;
  const showPaymentAction = canPayBooking(booking, paymentNextAmount);
  const showCancelAction = canCancelBooking(booking);
  const pickupLat = car?.pickupLat ?? car?.latitude;
  const pickupLng = car?.pickupLng ?? car?.longitude;
  const routeVisibleStatuses = [
    "OWNER_APPROVED",
    "PAYMENT_PENDING",
    "PAID",
    "IN_PROGRESS",
    "RETURN_INSPECTION",
    "AWAITING_EXTRA_CHARGE",
    "COMPLETED",
  ];
  const canShowRouteMap = routeVisibleStatuses.includes(booking.status || "");
  const canReviewBooking = booking.status === "COMPLETED";
  const pendingExtraChargeTotal = extraCharges
    .filter((charge) => charge.status === "PENDING")
    .reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
  const latestRefund = booking.refunds?.[0];
  const vnpayOperations = latestRefund?.providerOperations?.filter(
    (operation) => operation.provider?.toUpperCase() === "VNPAY",
  ) || [];
  const activeVnpayOperation = latestRefund?.providerOperations?.find(
    (operation) =>
      operation.provider?.toUpperCase() === "VNPAY" &&
      (operation.status === "PROCESSING" || operation.status === "UNKNOWN"),
  );
  const planConversion = booking.rentalPlanConversionSnapshot;
  const vnpayOperation =
    activeVnpayOperation ||
    vnpayOperations.find((operation) => operation.status === "SUCCEEDED") ||
    vnpayOperations.find((operation) => operation.status === "PENDING") ||
    vnpayOperations[0];
  const isVnpayRefund = Boolean(
    latestRefund &&
      (latestRefund.method?.toUpperCase() === "VNPAY" ||
        vnpayOperations.length > 0),
  );
  const vnpayTrackerState = !isVnpayRefund
    ? null
    : latestRefund?.status === "SUCCEEDED" || vnpayOperation?.status === "SUCCEEDED"
      ? "SUCCEEDED"
      : latestRefund?.status === "MANUAL_REQUIRED" || vnpayOperation?.status === "FAILED"
        ? "MANUAL_REQUIRED"
      : vnpayOperation?.status === "UNKNOWN"
        ? "UNKNOWN"
        : latestRefund?.status === "PROCESSING" ||
            vnpayOperation?.status === "PROCESSING"
          ? "PROCESSING"
          : vnpayOperation?.status === "PENDING"
            ? "PENDING"
            : null;
  const vnpayCompletedAt =
    vnpayOperation?.completedAt || latestRefund?.succeededAt;
  const vnpayProcessingMessage =
    vnpayOperation?.transactionStatus === "06"
      ? "VNPay đã gửi yêu cầu hoàn tiền sang ngân hàng và đang chờ xử lý."
      : vnpayOperation?.transactionStatus === "05"
        ? "VNPay đang xử lý yêu cầu hoàn tiền."
        : "Yêu cầu hoàn tiền đã được gửi và chưa có kết quả cuối cùng.";
  const canCheckVnpayRefund = Boolean(
    latestRefund?.method === "VNPAY" &&
      latestRefund.status === "PROCESSING" &&
      activeVnpayOperation,
  );
  const handover = booking.handoverSnapshot;
  const handoverOfficial = Boolean(
    handover?.ownerConfirmedAt && handover?.renterConfirmedAt,
  );
  const canConfirmHandover = Boolean(
    handover?.ownerConfirmedAt && !handover?.renterConfirmedAt,
  );
  const returnOfficial = Boolean(
    returnInspection?.ownerConfirmedAt && returnInspection?.renterConfirmedAt,
  );
  const canConfirmReturn = Boolean(
    returnInspection?.ownerConfirmedAt && !returnInspection?.renterConfirmedAt,
  );
  const preparationEnergy = Math.min(
    100,
    Math.max(
      0,
      Number(
        handover?.preparation?.energyLevelPercent ??
          handover?.handoverEnergyLevelPercent ??
          0,
      ),
    ),
  );
  const handoverEnergy = Math.min(
    100,
    Math.max(0, Number(handover?.handoverEnergyLevelPercent ?? 0)),
  );
  const returnEnergy = Math.min(
    100,
    Math.max(0, Number(returnInspection?.returnEnergyLevelPercent ?? 0)),
  );
  const handoverImages = handover
    ? Array.from(
        new Set([
          ...(handover.preparation?.images || []),
          ...(handover.preparation?.dashboardImage
            ? [handover.preparation.dashboardImage]
            : []),
          ...(handover.handoverPhotos || []),
          ...(handover.handoverDashboardImage
            ? [handover.handoverDashboardImage]
            : []),
        ]),
      )
    : [];
  const returnImages = returnInspection
    ? Array.from(
        new Set([
          ...(returnInspection.returnPhotos || []),
          ...(returnInspection.returnDashboardImage
            ? [returnInspection.returnDashboardImage]
            : []),
        ]),
      )
    : [];
  const returnStageStarted = [
    "RETURN_INSPECTION",
    "AWAITING_EXTRA_CHARGE",
    "COMPLETED",
  ].includes(booking.status || "");

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="print:hidden"><Header /></div>

      <main className={`mx-auto max-w-7xl px-6 pb-20 pt-28 ${printDocument ? "print:hidden" : ""}`}>
        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              to="/"
              className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-primary transition hover:text-secondary"
            >
              <ArrowLeft size={17} />
              Về trang chủ
            </Link>
            <p className="flex items-center gap-2 text-sm font-bold uppercase text-secondary">
              <Hash size={16} />
              Mã đặt xe: {getBookingDisplayCode(booking)}
            </p>
            <h1 className="mt-2 text-4xl font-extrabold text-primary md:text-5xl">
              Chi Tiết Đặt Xe
            </h1>
          </div>

          <div className={`inline-flex items-center gap-2 rounded-lg border px-4 py-3 font-extrabold ${statusInfo.panelClass}`}>
            <StatusIcon size={20} />
            {bookingTimeline.displayStatus}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_370px]">
          <section className="space-y-6">
            {canConfirmHandover && (
              <article className="print:hidden overflow-hidden rounded-2xl border border-secondary/40 bg-white shadow-sm">
                <div className="h-1 bg-secondary" />
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondarySoft text-primary">
                        <CarFront size={22} />
                      </span>
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wider text-secondaryDark">Cần bạn xác nhận</p>
                        <h2 className="mt-1 text-xl font-extrabold text-primary">Xác nhận đã nhận xe</h2>
                        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">Chủ xe đã hoàn tất biên bản bàn giao. Vui lòng kiểm tra tình trạng xe, phụ kiện và giấy tờ trước khi xác nhận nhận xe.</p>
                        <p className="mt-3 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-primary">Tôi xác nhận đã kiểm tra và tiếp nhận xe cùng tình trạng, phụ kiện và giấy tờ được ghi nhận trong biên bản bàn giao.</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={() => openTripDocument("handover")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 font-extrabold text-primary transition hover:bg-slate-50">
                        <FileText size={17} /> Xem biên bản
                      </button>
                      <button type="button" onClick={() => void handleConfirmHandoverReceived()} disabled={handoverConfirming} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 font-extrabold text-primary transition hover:brightness-95 disabled:opacity-60">
                        {handoverConfirming ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />} Xác nhận đã nhận xe
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {!handover && booking.status === "PAID" && (
              <div className="print:hidden flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                <Clock3 size={18} className="shrink-0 text-secondaryDark" />
                Chủ xe đang chuẩn bị biên bản bàn giao.
              </div>
            )}

            <article className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
              <div className="grid gap-0 md:grid-cols-[320px_minmax(0,1fr)]">
                <div className="relative min-h-72 overflow-hidden">
                  <img
                    src={getFirstCarImage(car?.images)}
                    alt={car?.name || "Xe thuê"}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-4 top-4">
                    <BookingStatusBadge timeline={bookingTimeline} />
                  </span>
                </div>

                <div className="p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase text-secondary">
                        Xe đã đặt
                      </p>
                      <h2 className="mt-1 text-3xl font-extrabold text-primary">
                        {car?.name || "Xe BQDrive"}
                      </h2>
                      <p className="mt-2 font-extrabold text-primary">
                        Biển số: {car?.licensePlate || "Đang cập nhật"}
                      </p>
                    </div>

                    <div className="shrink-0 md:text-right">
                      <p className="text-sm font-semibold text-muted">
                        Tổng tiền
                      </p>
                      <p className="text-2xl font-extrabold text-secondary">
                        {formatPrice(booking.totalPrice)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2 lg:grid-cols-4">
                    <InfoLine icon={CalendarDays} label="Nhận xe" value={formatDateTime(booking.startDate)} />
                    <InfoLine icon={CalendarDays} label="Trả xe" value={formatDateTime(booking.endDate)} />
                    <InfoLine
                      icon={Clock3}
                      label={planConversion ? "Gói thuê hiện tại" : rental.label}
                      value={
                        planConversion
                          ? `Theo ngày từ ${formatDateTime(planConversion.effectiveFrom)}`
                          : `${rentalTime} ${rental.unit}`
                      }
                    />
                    <InfoLine
                      icon={Wallet}
                      label="Giá cơ bản"
                      value={
                        booking.pricingSnapshot?.basePricePerUnit !== null &&
                        booking.pricingSnapshot?.basePricePerUnit !== undefined
                          ? `${formatPrice(
                              booking.pricingSnapshot.basePricePerUnit,
                            )} / ${rental.unit}`
                          : "Chưa cập nhật"
                      }
                    />
                  </div>

                  <div className="mt-5 grid gap-4 border-b border-border pb-5 md:grid-cols-2">
                    <InfoLine icon={MapPin} label="Địa điểm nhận xe" value={pickupAddress} />
                    <InfoLine icon={MapPin} label="Địa điểm trả xe" value={returnAddress} />
                    <InfoLine
                      icon={MapPin}
                      label="Hình thức nhận xe"
                      value={isDeliveryToCustomer ? "Giao xe tận nơi" : "Nhận tại vị trí chủ xe"}
                    />
                    {isDeliveryToCustomer && (
                      <InfoLine
                        icon={MapPin}
                        label="Địa chỉ giao xe"
                        value={
                          deliverySnapshot?.deliveryAddressText ||
                          deliverySnapshot?.deliveryAddress ||
                          deliverySnapshot?.deliveryFormattedAddress ||
                          "--"
                        }
                      />
                    )}
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
                    <SpecLine icon={CarFront} value={`${car?.seats || "--"} chỗ`} />
                    <SpecLine icon={Fuel} value={getSpecLabel(car?.fuelType)} />
                    <SpecLine icon={Gauge} value={getSpecLabel(car?.transmission)} />
                    <SpecLine icon={ShieldCheck} value={rental.mode} />
                  </div>
                </div>
              </div>
            </article>

            <PricingBreakdown snapshot={booking.pricingSnapshot} />

            <section className="rounded-lg border border-border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Tiến trình
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold text-primary">
                    Trạng thái booking
                  </h2>
                </div>

                <BookingStatusBadge timeline={bookingTimeline} />
              </div>

              <div className="mt-6">
                <BookingTimeline timeline={bookingTimeline} />
              </div>

              <div className="mt-4">
                <BookingNextAction
                  timeline={bookingTimeline}
                  actionSlot={
                    bookingTimeline.allowedActions.includes("PAY") &&
                    showPaymentAction ? (
                      <Link
                        to={`/bookings/${booking._id}/payment`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 font-extrabold text-primary transition hover:brightness-95"
                      >
                        <CreditCard size={18} />
                        Thanh toán
                      </Link>
                    ) : undefined
                  }
                />
              </div>

              {["CANCELLED", "NO_SHOW", "REJECTED"].includes(booking.status || "") && (
                <div className={`mt-4 rounded-lg border p-4 text-sm font-semibold leading-6 ${statusInfo.panelClass}`}>
                  <p>
                    {booking.rejectReason ||
                      booking.cancelReason ||
                      booking.noShowReason ||
                      bookingTimeline.nextActionText}
                  </p>

                </div>
              )}

             {["CANCELLED", "NO_SHOW"].includes(booking.status || "") &&
  booking.cancellationSummary && (
                <div id="booking-refund" className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold uppercase text-secondary">
                        Hoàn tiền
                      </p>
                        <h3 className="mt-1 text-xl font-extrabold text-primary">
                        {booking.status === "NO_SHOW"
                          ? "Hoàn tiền sau khi khách không nhận xe"
                          : "Trạng thái hoàn tiền sau hủy"}
                      </h3>

                      <p className="mt-2 text-sm font-semibold leading-6 text-muted">
                        {booking.status === "NO_SHOW"
                          ? "Booking đã được ghi nhận khách không đến nhận xe. Khoản được hoàn sẽ được xử lý bằng hồ sơ hoàn tiền riêng."
                          : "Booking đã hủy không còn giữ lịch xe. Hoàn tiền được xử lý bằng hồ sơ riêng."}
                      </p>
                    </div>
                    <span className="rounded-full bg-secondarySoft px-4 py-2 text-sm font-extrabold text-primary">
                      {latestRefund
                        ? getRefundStatusLabel(
                            latestRefund.status,
                            latestRefund.method,
                          )
                        : booking.cancellationSummary.refundRequired
                          ? "Chờ tạo hồ sơ hoàn"
                          : "Không cần hoàn"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryTile
                      label={
                        booking.status === "NO_SHOW"
                          ? "Đã thanh toán khi ghi nhận"
                          : "Đã thanh toán lúc hủy"
                      }
                      value={formatPrice(
                        booking.cancellationSummary.paidAmountAtCancellation,
                      )}
                    />

                    <SummaryTile
                      label={
                        booking.status === "NO_SHOW"
                          ? "Khoản được giữ lại"
                          : "Phí hủy"
                      }
                      value={formatPrice(
                        booking.cancellationSummary.cancellationFee,
                      )}
                    />
                    <SummaryTile
                      label={
                        latestRefund?.status === "SUCCEEDED"
                          ? "Đã hoàn"
                          : "Dự kiến hoàn"
                      }
                      value={formatPrice(
                        latestRefund?.status === "SUCCEEDED"
                          ? latestRefund.refundAmount
                          : booking.cancellationSummary.refundAmount,
                      )}
                    />
                    <SummaryTile
                      label="Chính sách"
                      value={getCancellationPolicyLabel(
                        latestRefund?.reasonCode ===
                          "PAYMENT_AFTER_BOOKING_CANCELLED"
                          ? latestRefund.reasonCode
                          : latestRefund?.policyRuleApplied ||
                              booking.cancellationSummary.policyRuleApplied,
                      )}
                    />
                  </div>

                  {latestRefund && (
                    <div className="mt-4 rounded-lg border border-dashed border-border bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
                      <p>Mã refund: #{latestRefund._id.slice(-8).toUpperCase()}</p>
                      <p>Phương thức xử lý: {latestRefund.method}</p>
                      {latestRefund.status === "SUCCEEDED" && !isVnpayRefund && (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                          <p className="font-extrabold">Hoàn tiền thành công</p>
                          <p className="mt-1">
                            Số tiền đã hoàn: {formatPrice(latestRefund.refundAmount)}
                          </p>
                        </div>
                      )}
                      {vnpayTrackerState && (
                        <div
                          className={`mt-3 rounded-xl border p-4 ${
                            vnpayTrackerState === "SUCCEEDED"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : vnpayTrackerState === "PROCESSING"
                                ? "border-sky-200 bg-sky-50 text-sky-900"
                                : vnpayTrackerState === "MANUAL_REQUIRED"
                                  ? "border-amber-200 bg-amber-50 text-amber-900"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                        >
                          <p className="text-xs font-extrabold uppercase tracking-wide text-secondary">
                            Hoàn tiền qua VNPay
                          </p>
                          <h4 className="mt-1 text-lg font-extrabold text-primary">
                            {vnpayTrackerState === "SUCCEEDED"
                              ? "Hoàn tiền thành công"
                              : vnpayTrackerState === "MANUAL_REQUIRED"
                                ? "VNPay từ chối hoàn tiền tự động"
                              : vnpayTrackerState === "UNKNOWN"
                                ? "Chưa xác định trạng thái hoàn tiền"
                                : vnpayTrackerState === "PENDING"
                                  ? "Đã tạo yêu cầu hoàn tiền"
                                  : "VNPay đang xử lý yêu cầu hoàn tiền"}
                          </h4>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                            {vnpayTrackerState === "SUCCEEDED"
                              ? "VNPay đã xác nhận hoàn tiền thành công."
                              : vnpayTrackerState === "MANUAL_REQUIRED"
                                ? "Khoản hoàn sẽ được xử lý theo luồng hoàn tiền thủ công."
                              : vnpayTrackerState === "UNKNOWN"
                                ? "Chưa nhận được trạng thái cuối cùng từ VNPay. Bạn có thể kiểm tra lại."
                              : vnpayTrackerState === "PENDING"
                                  ? "Yêu cầu hoàn tiền đã được tạo và đang chờ gửi hoặc xử lý bởi VNPay."
                                  : vnpayProcessingMessage}
                          </p>

                          <div className="mt-5 flex items-start">
                            <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
                                <CheckCircle2 size={21} />
                              </span>
                              <p className="mt-2 text-xs font-extrabold leading-5 text-primary">
                                {vnpayTrackerState === "PENDING"
                                  ? "Đã tạo yêu cầu"
                                  : "Đã gửi yêu cầu"}
                              </p>
                            </div>
                            <div className="mt-5 h-0.5 w-5 shrink-0 bg-emerald-400 sm:flex-1" />
                            <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                              <span
                                className={`flex h-10 w-10 items-center justify-center rounded-full shadow-sm ${
                                  vnpayTrackerState === "SUCCEEDED"
                                    ? "bg-emerald-600 text-white"
                                    : vnpayTrackerState === "PROCESSING"
                                      ? "bg-sky-600 text-white"
                                      : vnpayTrackerState === "MANUAL_REQUIRED"
                                        ? "bg-amber-500 text-white"
                                      : "bg-white text-slate-500 ring-1 ring-slate-300"
                                }`}
                              >
                                {vnpayTrackerState === "SUCCEEDED" ? (
                                  <CheckCircle2 size={21} />
                                ) : vnpayTrackerState === "PROCESSING" ? (
                                  <Clock3 size={21} />
                                ) : vnpayTrackerState === "MANUAL_REQUIRED" ? (
                                  <XCircle size={21} />
                                ) : vnpayTrackerState === "UNKNOWN" ? (
                                  <span className="text-lg font-extrabold">?</span>
                                ) : (
                                  <Clock3 size={20} />
                                )}
                              </span>
                              <p className="mt-2 text-xs font-extrabold leading-5 text-primary">
                                {vnpayTrackerState === "SUCCEEDED"
                                  ? "VNPay đã xử lý"
                                  : vnpayTrackerState === "MANUAL_REQUIRED"
                                    ? "Cần xử lý thủ công"
                                  : vnpayTrackerState === "UNKNOWN"
                                    ? "Chưa xác định trạng thái"
                                    : vnpayTrackerState === "PENDING"
                                      ? "Chờ gửi/xử lý"
                                      : "VNPay đang xử lý"}
                              </p>
                            </div>
                            <div
                              className={`mt-5 h-0.5 w-5 shrink-0 sm:flex-1 ${
                                vnpayTrackerState === "SUCCEEDED"
                                  ? "bg-emerald-400"
                                  : "bg-slate-200"
                              }`}
                            />
                            <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                              <span
                                className={`flex h-10 w-10 items-center justify-center rounded-full shadow-sm ${
                                  vnpayTrackerState === "SUCCEEDED"
                                    ? "bg-emerald-600 text-white"
                                    : "bg-white text-slate-400 ring-1 ring-slate-300"
                                }`}
                              >
                                {vnpayTrackerState === "SUCCEEDED" ? (
                                  <CheckCircle2 size={21} />
                                ) : (
                                  <CircleDashed size={20} />
                                )}
                              </span>
                              <p className="mt-2 text-xs font-extrabold leading-5 text-primary">
                                {vnpayTrackerState === "SUCCEEDED"
                                  ? "Hoàn tiền thành công"
                                  : vnpayTrackerState === "MANUAL_REQUIRED"
                                    ? "Chờ xử lý thủ công"
                                  : "Hoàn tất"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-5 grid gap-3 rounded-lg border border-white/70 bg-white/75 p-3 text-sm sm:grid-cols-3">
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-400">
                                Số tiền hoàn
                              </p>
                              <p className="mt-1 font-extrabold text-primary">
                                {formatPrice(latestRefund.refundAmount)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-400">
                                Phương thức hoàn
                              </p>
                              <p className="mt-1 font-extrabold text-primary">VNPay</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-400">
                                Trạng thái
                              </p>
                              <p className="mt-1 font-extrabold text-primary">
                                {vnpayTrackerState === "SUCCEEDED"
                                  ? "Hoàn tiền thành công"
                                  : vnpayTrackerState === "MANUAL_REQUIRED"
                                    ? "Cần hoàn thủ công"
                                  : vnpayTrackerState === "UNKNOWN"
                                    ? "Chưa xác định"
                                    : vnpayTrackerState === "PENDING"
                                      ? "Chờ gửi/xử lý"
                                      : "Đang xử lý"}
                              </p>
                            </div>
                          </div>

                          {vnpayTrackerState === "SUCCEEDED" && vnpayCompletedAt && (
                            <p className="mt-3 text-sm font-semibold text-emerald-800">
                              Hoàn tất lúc {formatDateTime(vnpayCompletedAt)}
                            </p>
                          )}

                          {canCheckVnpayRefund && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCheckVnpayRefundStatus(latestRefund._id)
                              }
                              disabled={Boolean(refundCheckingId)}
                              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-extrabold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {refundCheckingId === latestRefund._id && (
                                <Loader2 size={18} className="animate-spin" />
                              )}
                              {refundCheckingId === latestRefund._id
                                ? "Đang kiểm tra với VNPay..."
                                : "Kiểm tra trạng thái"}
                            </button>
                          )}
                        </div>
                      )}
                      {latestRefund.status === "WAITING_FOR_REFUND_INFO" && (
                        <div className="mt-3 rounded-lg border border-secondary/30 bg-secondarySoft/35 p-4">
                          <p className="font-extrabold text-primary">
                            Cần cung cấp thông tin nhận tiền hoàn
                          </p>
                          <p className="mt-1 text-sm font-semibold text-muted">
                            Chủ xe chỉ có thể thực hiện hoàn tiền sau khi bạn gửi
                            thông tin nhận tiền chính xác.
                          </p>
                          <button
                            type="button"
                            onClick={openRefundRecipientModal}
                            className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 font-extrabold text-primary transition hover:brightness-95"
                          >
                            <Wallet size={18} />
                            Cung cấp thông tin nhận tiền
                          </button>
                        </div>
                      )}
                      {latestRefund.recipientInfo && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-extrabold uppercase text-secondary">
                            Thông tin nhận tiền đã gửi
                          </p>
                          {latestRefund.recipientInfo.method === "BANK_TRANSFER" && (
                            <div className="mt-2 space-y-1">
                              <p>Ngân hàng: {latestRefund.recipientInfo.bankName || "--"}</p>
                              <p>
                                Chủ tài khoản:{" "}
                                {latestRefund.recipientInfo.accountHolderName || "--"}
                              </p>
                              <p>
                                Số tài khoản:{" "}
                                {latestRefund.recipientInfo.accountNumberMasked ||
                                  latestRefund.recipientInfo.accountNumber ||
                                  "--"}
                              </p>
                            </div>
                          )}
                          {latestRefund.recipientInfo.method === "E_WALLET" && (
                            <div className="mt-2 space-y-1">
                              <p>
                                Ví điện tử:{" "}
                                {latestRefund.recipientInfo.walletProvider || "--"}
                              </p>
                              <p>
                                Chủ ví:{" "}
                                {latestRefund.recipientInfo.walletHolderName || "--"}
                              </p>
                              <p>
                                Tài khoản ví:{" "}
                                {latestRefund.recipientInfo.walletAccountMasked ||
                                  latestRefund.recipientInfo.walletAccount ||
                                  "--"}
                              </p>
                            </div>
                          )}
                          {latestRefund.recipientInfo.method === "CASH" && (
                            <p className="mt-2">
                              Nhận tiền mặt:{" "}
                              {latestRefund.recipientInfo.cashNote ||
                                "Đã cung cấp ghi chú nhận tiền mặt."}
                            </p>
                          )}
                        </div>
                      )}
                      {latestRefund.manualRefundReference && (
                        <p>Mã tham chiếu thủ công: {latestRefund.manualRefundReference}</p>
                      )}
                      {latestRefund.status === "PROCESSING" &&
                        latestRefund.method !== "VNPAY" && (
                        <button
                          type="button"
                          onClick={() => handleConfirmRefundReceived(latestRefund._id)}
                          disabled={refundConfirmingId === latestRefund._id}
                          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {refundConfirmingId === latestRefund._id && (
                            <Loader2 size={18} className="animate-spin" />
                          )}
                          Tôi đã nhận tiền hoàn
                        </button>
                        )}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section id="trip-documents" className="print:hidden overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-secondaryDark">Tài liệu</p>
                <h2 className="mt-1 text-2xl font-extrabold text-primary">Hồ sơ chuyến thuê</h2>
                <p className="mt-2 text-sm font-semibold text-slate-500">Các tài liệu được lưu theo tiến trình thực tế của booking.</p>
              </div>

              <div className="divide-y divide-slate-200">
                {rentalContract ? (
                  <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><CheckCircle2 size={18} /></span>
                      <div><h3 className="font-extrabold text-primary">Hợp đồng thuê xe</h3><p className="mt-1 text-sm font-semibold text-slate-500">{rentalContract.contractCode} · Đã tạo trên hệ thống</p></div>
                    </div>
                    <Link to={`/contracts/${rentalContract._id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-extrabold text-primary transition hover:bg-slate-50"><FileText size={16} /> Xem</Link>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 px-5 py-4 sm:px-6"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><CircleDashed size={18} /></span><div><h3 className="font-extrabold text-primary">Hợp đồng thuê xe</h3><p className="mt-1 text-sm font-semibold text-slate-500">Chưa có hợp đồng phù hợp với booking này.</p></div></div>
                )}

                <div>
                  <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${handoverOfficial ? "bg-emerald-50 text-emerald-700" : handover?.ownerConfirmedAt ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-400"}`}>{handoverOfficial ? <CheckCircle2 size={18} /> : <CircleDashed size={18} />}</span>
                      <div><h3 className="font-semibold text-slate-900">Biên bản bàn giao xe</h3><p className="mt-1 text-sm font-medium text-slate-500">{handoverOfficial ? `Đã xác nhận hai bên · Hoàn tất ${formatDateTime(handover?.renterConfirmedAt)}` : handover?.ownerConfirmedAt ? "Chờ người thuê xác nhận" : "Chưa lập biên bản"}</p></div>
                    </div>
                    {handover && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setHandoverExpanded((value) => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50">{handoverExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {handoverExpanded ? "Thu gọn" : "Xem"}</button>{handoverOfficial && <button type="button" onClick={() => handlePrintDocument("handover")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"><Printer size={16} /> In</button>}</div>}
                  </div>

                  {handoverExpanded && handover && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-6">
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 sm:p-6">
                        <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-amber-500">Biên bản bàn giao xe</p><h3 className="mt-1.5 text-xl font-bold text-slate-900">{car?.name || "Xe thuê"}</h3><p className="mt-1 text-sm font-medium text-slate-500">{getBookingDisplayCode(booking)} · {car?.licensePlate || "Chưa cập nhật biển số"}</p></div><span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${handoverOfficial ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}><CheckCircle2 size={14} /> {handoverOfficial ? "Đã xác nhận hai bên" : "Chờ người thuê xác nhận"}</span></div>

                        <div className="mt-5 grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)]">
                          <div className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300"><p className="text-sm font-semibold text-slate-800">Trước khi đi giao</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Gauge size={14} className="text-slate-400" /> ODO</p><p className="mt-1.5 text-2xl font-bold text-slate-900">{new Intl.NumberFormat("vi-VN").format(handover.preparation?.odometerKm ?? handover.handoverOdometerKm)} <span className="text-sm font-semibold text-slate-500">km</span></p></div><div><p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Fuel size={14} className="text-slate-400" /> Nhiên liệu / pin</p><p className="mt-1.5 text-2xl font-bold text-slate-900">{preparationEnergy}%</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-secondary" style={{ width: `${preparationEnergy}%` }} /></div></div></div><div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400"><FileText size={13} /> Ghi chú</p><p className="mt-1.5 text-sm font-medium leading-6 text-slate-700">{handover.preparation?.note || "Không có ghi chú thêm."}</p></div></div>
                          <div className="flex items-center justify-center text-amber-400"><ArrowRight size={22} strokeWidth={2.4} className="rotate-90 lg:rotate-0" /></div>
                          <div className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300"><p className="text-sm font-semibold text-slate-800">Khi khách nhận xe</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Gauge size={14} className="text-slate-400" /> ODO</p><p className="mt-1.5 text-2xl font-bold text-slate-900">{new Intl.NumberFormat("vi-VN").format(handover.handoverOdometerKm)} <span className="text-sm font-semibold text-slate-500">km</span></p></div><div><p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Fuel size={14} className="text-slate-400" /> Nhiên liệu / pin</p><p className="mt-1.5 text-2xl font-bold text-slate-900">{handoverEnergy}%</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-secondary" style={{ width: `${handoverEnergy}%` }} /></div></div></div><div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400"><FileText size={13} /> Ghi chú</p><p className="mt-1.5 text-sm font-medium leading-6 text-slate-700">{handover.handoverConditionNotes || "Không có ghi chú thêm."}</p></div></div>
                        </div>

                        <VehicleRecordChecklist handoverRecord={handover} />
                        {handoverImages.length > 0 && <div className="mt-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Ảnh hiện trạng</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{handoverImages.slice(0, 8).map((image, index) => <a key={`${image}-${index}`} href={normalizeImageUrl(image)} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={normalizeImageUrl(image)} alt={`Ảnh tình trạng bàn giao ${index + 1}`} className="h-24 w-full object-cover transition group-hover:scale-105" /></a>)}</div></div>}

                        <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bên giao</p><p className="mt-2 font-bold text-slate-900">{typeof booking.ownerId === "string" ? "Chủ xe" : booking.ownerId?.name || "Chủ xe"}</p><p className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} className="text-emerald-600" /> Đã xác nhận trên hệ thống</p><p className="mt-1 text-sm font-medium text-slate-500">{formatDateTime(handover.ownerConfirmedAt)}</p></div><div className={`rounded-xl border p-4 ${handover.renterConfirmedAt ? "border-emerald-100 bg-emerald-50/40" : "border-amber-100 bg-amber-50/40"}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bên nhận</p><p className="mt-2 font-bold text-slate-900">{booking.renterInfo?.fullName || "Người thuê"}</p><p className={`mt-2 flex items-center gap-2 text-sm font-semibold ${handover.renterConfirmedAt ? "text-emerald-700" : "text-amber-700"}`}>{handover.renterConfirmedAt ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Clock3 size={16} />} {handover.renterConfirmedAt ? "Đã xác nhận trên hệ thống" : "Đang chờ xác nhận"}</p><p className="mt-1 text-sm font-medium text-slate-500">{formatDateTime(handover.renterConfirmedAt)}</p></div></div>
                        <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2 text-sm font-medium text-slate-500"><ShieldCheck size={16} className="shrink-0 text-slate-400" /> Biên bản được xác nhận điện tử trên hệ thống BQDrive.</p>{handoverOfficial && <button type="button" onClick={() => handlePrintDocument("handover")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"><Printer size={16} /> In biên bản</button>}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${returnOfficial ? "bg-emerald-50 text-emerald-700" : returnInspection ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-400"}`}>{returnOfficial ? <CheckCircle2 size={18} /> : <CircleDashed size={18} />}</span><div><h3 className="font-semibold text-slate-800">Biên bản kiểm tra khi trả xe</h3><p className="mt-1 text-sm font-medium text-slate-500">{returnOfficial ? `Đã xác nhận hai bên · Hoàn tất ${formatDateTime(returnInspection?.renterConfirmedAt)}` : returnInspection?.ownerConfirmedAt ? "Chờ người thuê xác nhận" : returnInspection ? "Đang kiểm tra tình trạng xe" : returnStageStarted ? "Đang chờ lập biên bản kiểm tra" : "Chưa đến giai đoạn trả xe"}</p></div></div>
                    {returnInspection && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setReturnExpanded((value) => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-extrabold text-primary">{returnExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {returnExpanded ? "Thu gọn" : "Xem"}</button>{returnOfficial && <button type="button" onClick={() => handlePrintDocument("return")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-extrabold text-primary"><Printer size={16} /> In</button>}</div>}
                  </div>

                  {returnExpanded && returnInspection && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-6"><div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-secondaryDark">Biên bản kiểm tra khi trả xe</p><h3 className="mt-1 text-xl font-extrabold text-primary">Đối chiếu tình trạng xe</h3><p className="mt-1 text-sm font-semibold text-slate-500">{getBookingDisplayCode(booking)} · {car?.name || "Xe thuê"}</p></div>{returnOfficial && <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700"><CheckCircle2 size={14} /> Đã xác nhận hai bên</span>}</div>
                    <div className="mt-5 grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)]"><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Lúc giao</p><p className="mt-4 text-xs font-bold uppercase text-slate-400">ODO</p><p className="mt-1 text-2xl font-extrabold text-primary">{handover ? new Intl.NumberFormat("vi-VN").format(handover.handoverOdometerKm) : "--"} <span className="text-sm text-slate-500">km</span></p><p className="mt-4 text-xs font-bold uppercase text-slate-400">Nhiên liệu / pin</p><p className="mt-1 text-2xl font-extrabold text-primary">{handoverEnergy}%</p><div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-secondary" style={{ width: `${handoverEnergy}%` }} /></div></div><div className="flex items-center justify-center text-slate-300"><ArrowRight size={22} className="rotate-90 lg:rotate-0" /></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Lúc trả</p><p className="mt-4 text-xs font-bold uppercase text-slate-400">ODO</p><p className="mt-1 text-2xl font-extrabold text-primary">{returnInspection.returnOdometerKm !== undefined ? new Intl.NumberFormat("vi-VN").format(returnInspection.returnOdometerKm) : "--"} <span className="text-sm text-slate-500">km</span></p><p className="mt-4 text-xs font-bold uppercase text-slate-400">Nhiên liệu / pin</p><p className="mt-1 text-2xl font-extrabold text-primary">{returnInspection.returnEnergyLevelPercent !== undefined ? `${returnEnergy}%` : "--"}</p><div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-secondary" style={{ width: `${returnEnergy}%` }} /></div></div></div></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Quãng đường sử dụng</p><p className="mt-1 font-extrabold text-primary">{returnInspection.distanceTravelledKm ?? "--"} km</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Hư hỏng mới</p><p className="mt-1 font-extrabold text-primary">{returnInspection.hasDamage ? "Có" : "Không"}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Ghi chú</p><p className="mt-1 text-sm font-semibold text-slate-600">{returnInspection.conditionNotes || "Không có ghi chú."}</p></div></div>
                    {handover && <><VehicleRecordChecklist handoverRecord={handover} returnRecord={returnInspection} /><p className="mt-2 text-xs font-semibold text-slate-500">Khác biệt chỉ dùng để đối chiếu, không tự động tạo phụ phí.</p></>}
                    {returnImages.length > 0 && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{returnImages.slice(0, 8).map((image, index) => <a key={`${image}-${index}`} href={normalizeImageUrl(image)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-slate-200"><img src={normalizeImageUrl(image)} alt={`Ảnh xe lúc trả ${index + 1}`} className="h-24 w-full object-cover" /></a>)}</div>}
                    <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase text-slate-400">Bên nhận lại xe — Owner</p><p className="mt-2 font-extrabold text-primary">{ownerName}</p><p className="mt-2 text-sm font-semibold text-slate-600">{returnInspection.ownerConfirmedAt ? `✓ Đã xác nhận ${formatDateTime(returnInspection.ownerConfirmedAt)}` : "Chưa xác nhận"}</p></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase text-slate-400">Bên trả xe — Renter</p><p className="mt-2 font-extrabold text-primary">{booking.renterInfo?.fullName || "Người thuê"}</p><p className="mt-2 text-sm font-semibold text-slate-600">{returnInspection.renterConfirmedAt ? `✓ Đã xác nhận ${formatDateTime(returnInspection.renterConfirmedAt)}` : "Chưa xác nhận"}</p></div></div>
                    {returnOfficial && (
                      <div className="mt-5 flex justify-end border-t border-slate-200 pt-4">
                        <button type="button" onClick={() => handlePrintDocument("return")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-extrabold text-primary"><Printer size={16} /> In biên bản</button>
                      </div>
                    )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {(extraChargeLoading || extraCharges.length > 0) && (
              <section id="booking-extra-charges" className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase text-secondary">
                      Phí phát sinh
                    </p>
                    <h2 className="mt-1 text-2xl font-extrabold text-primary">
                      Chi phí sau chuyến thuê
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted">
                      Đây là khoản phí riêng do chủ xe tạo sau khi kiểm tra xe.
                      Khoản này không cộng vào tiền thuê ban đầu của booking.
                    </p>
                  </div>
                  {pendingExtraChargeTotal > 0 && (
                    <div className="rounded-lg bg-yellow-50 px-4 py-3 text-right">
                      <p className="text-xs font-bold uppercase text-amber-700">
                        Cần thanh toán
                      </p>
                      <p className="mt-1 text-xl font-extrabold text-primary">
                        {formatPrice(pendingExtraChargeTotal)}
                      </p>
                    </div>
                  )}
                </div>

                {extraChargeLoading ? (
                  <div className="mt-5 flex items-center gap-2 rounded-lg border border-dashed border-border bg-slate-50 px-4 py-3 text-sm font-bold text-muted">
                    <Loader2 size={16} className="animate-spin text-secondary" />
                    Đang tải phí phát sinh...
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {extraCharges.map((charge) => {
                      const status = getExtraChargeStatusMeta(charge.status);
                      const isPending = charge.status === "PENDING";

                      return (
                        <div
                          key={charge._id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-extrabold text-primary">
                                  {getExtraChargeTypeLabel(charge.type)}
                                </h3>
                                <span
                                  className={`rounded-full border px-3 py-1 text-xs font-extrabold ${status.className}`}
                                >
                                  {status.label}
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                                {charge.description}
                              </p>
                            </div>
                            <p className="shrink-0 text-xl font-extrabold text-secondary">
                              {formatPrice(charge.amount)}
                            </p>
                          </div>

                          {charge.type === "LATE_RETURN" && charge.lateReturnSnapshot && (
                            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                              <p className="text-xs font-extrabold uppercase text-amber-700">
                                Cách tính phí trả xe trễ
                              </p>
                              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                <p>
                                  Dự kiến trả: <strong>{formatDateTime(charge.lateReturnSnapshot.scheduledReturnAt)}</strong>
                                </p>
                                <p>
                                  Thực tế trả: <strong>{formatDateTime(charge.lateReturnSnapshot.actualReturnAt)}</strong>
                                </p>
                                <p>
                                  Trễ: <strong>{formatDuration(charge.lateReturnSnapshot.lateMinutes)}</strong>
                                </p>
                                <p>
                                  Miễn phí: <strong>{charge.lateReturnSnapshot.graceMinutes} phút</strong>
                                </p>
                                <p>
                                  Thời gian tính phí: <strong>{formatDuration(charge.lateReturnSnapshot.chargeableMinutes)}</strong>
                                </p>
                                <p>
                                  Số block: <strong>{charge.lateReturnSnapshot.chargedBlocks}</strong>
                                </p>
                                <p>
                                  Đơn giá: <strong>{formatPrice(charge.lateReturnSnapshot.feePerBlock)} / block {charge.lateReturnSnapshot.blockMinutes} phút</strong>
                                </p>
                                <p>
                                  Tổng phí: <strong>{formatPrice(charge.lateReturnSnapshot.calculatedAmount)}</strong>
                                </p>
                              </div>
                            </div>
                          )}

                          {charge.evidenceImages?.length ? (
                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                              {charge.evidenceImages.map((image, index) => (
                                <a
                                  key={`${charge._id}-${index}`}
                                  href={normalizeImageUrl(image)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                                  title="Xem ảnh bằng chứng"
                                >
                                  <img
                                    src={normalizeImageUrl(image)}
                                    alt={`Ảnh bằng chứng phí phát sinh ${index + 1}`}
                                    className="h-24 w-full object-cover transition hover:scale-105"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : null}

                          {isPending && (
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => handlePayExtraCharge(charge._id, "VNPAY")}
                                disabled={Boolean(extraChargePayingId)}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {extraChargePayingId === charge._id ? (
                                  <Loader2 size={18} className="animate-spin" />
                                ) : (
                                  <CreditCard size={18} />
                                )}
                                Thanh toán VNPay
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePayExtraCharge(charge._id, "MOMO")}
                                disabled={Boolean(extraChargePayingId)}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-extrabold text-secondary transition hover:bg-primaryDark disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {extraChargePayingId === charge._id ? (
                                  <Loader2 size={18} className="animate-spin" />
                                ) : (
                                  <Wallet size={18} />
                                )}
                                Thanh toán MoMo
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {canReviewBooking && (
              <section className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase text-secondary">
                      Đánh giá
                    </p>
                    <h2 className="mt-1 text-2xl font-extrabold text-primary">
                      Trải nghiệm chuyến thuê
                    </h2>
                    <p className="mt-2 text-sm font-semibold text-muted">
                      Chia sẻ nhận xét của bạn để những khách thuê sau có thêm
                      thông tin tham khảo.
                    </p>
                  </div>

                  {review ? (
                    <div className="flex flex-col gap-2 sm:items-end">
                      <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondarySoft px-5 py-3 font-extrabold text-primary">
                        <CheckCircle2 size={19} />
                        Đã đánh giá
                      </span>
                      {review.canEdit && (
                        <button
                          type="button"
                          onClick={openReviewModal}
                          className="text-sm font-extrabold text-primary underline decoration-secondary decoration-2 underline-offset-4"
                        >
                          Chỉnh sửa trong 24 giờ
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={openReviewModal}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95"
                    >
                      <Star size={19} />
                      Đánh giá chuyến thuê
                    </button>
                  )}
                </div>

                {review && (
                  <div className="mt-5 rounded-lg border border-secondary/30 bg-secondarySoft/30 p-4">
                    <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-secondary">
                      <CheckCircle2 size={14} />
                      Đã ghi nhận trải nghiệm
                    </span>
                    {review.comment && (
                      <p className="mt-3 text-sm font-semibold leading-6 text-primary">
                        {review.comment}
                      </p>
                    )}
                    {review.criteria && Object.keys(review.criteria).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {getSelectedReviewCriteria(review.criteria).map((item) => (
                          <span
                            key={item.key}
                            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-extrabold text-primary"
                          >
                            <CheckCircle2 size={15} className="text-emerald-600" />
                            {item.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {review.images?.length ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {review.images.map((image, index) => (
                          <img
                            key={`${image}-${index}`}
                            src={image}
                            alt={`Ảnh đánh giá ${index + 1}`}
                            className="h-20 w-28 rounded-lg border border-border object-cover"
                          />
                        ))}
                      </div>
                    ) : null}
                    {review.ownerReply?.content && (
                      <div className="mt-4 rounded-xl border border-primary/10 bg-white p-4">
                        <p className="text-xs font-bold uppercase text-secondary">
                          Phản hồi từ chủ xe
                        </p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-primary">
                          {review.ownerReply.content}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            <BookingExtensionPanel
              bookingId={booking._id}
              bookingStatus={booking.status}
              startAt={booking.startDate}
              currentEndAt={booking.endDate}
              rentalMode={booking.rentalMode}
              mode="RENTER"
              onChanged={fetchBooking}
            />

            {canShowRouteMap && (
              <section className="rounded-lg border border-border bg-white p-6 shadow-sm">
                <p className="text-sm font-bold uppercase text-secondary">
                  Thông tin nhận xe
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-primary">
                  Tìm đường đến điểm nhận xe
                </h2>
                <div className="mt-4">
                  <RouteMap
                    destLat={pickupLat}
                    destLng={pickupLng}
                    address={car?.pickupFormattedAddress || pickupAddress}
                    height={340}
                  />
                </div>
              </section>
            )}

          </section>

          <aside id="booking-payment-summary" className="space-y-4 lg:self-start">
            <div className="rounded-lg border border-border bg-white p-6 shadow-xl shadow-slate-900/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Thanh toán
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold text-primary">
                    Tóm tắt chi phí
                  </h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${paymentInfo.badgeClass}`}>
                  {paymentInfo.label}
                </span>
              </div>

              <div className="mt-6 h-2 overflow-hidden rounded-full bg-secondarySoft/45">
                <div
                  className="h-full rounded-full bg-secondary transition-all"
                  style={{ width: `${paymentProgress}%` }}
                />
              </div>

              <div className="my-6 space-y-4 border-y border-border py-5 text-sm">
                <SummaryRow label="Mã booking" value={getBookingDisplayCode(booking)} />
                <SummaryRow label="Hình thức" value={booking.paymentOption === "FULL" ? "Thanh toán toàn bộ" : "Thanh toán giữ chỗ"} />
                <SummaryRow
                  label="Tiền thuê xe"
                  value={formatPrice(paymentInfo.rentalSubtotal)}
                />
                <SummaryRow
                  label="Tiền cọc thuê xe (50% tiền thuê)"
                  value={formatPrice(paymentInfo.rentalDepositAmount)}
                />
                <SummaryRow
                  label="Phí nền tảng"
                  value={formatPrice(paymentInfo.platformFee)}
                />
                <SummaryRow
                  label="Phí bảo hiểm"
                  value={formatPrice(paymentInfo.insuranceFee)}
                />
                <SummaryRow
                  label="Phí giao xe"
                  value={formatPrice(paymentInfo.deliveryFee)}
                />
                <SummaryRow label="Tổng tiền" value={formatPrice(paymentInfo.totalPrice)} />
                {booking.paymentOption !== "FULL" && (
                  <SummaryRow label="Thanh toán giữ chỗ" value={formatPrice(paymentInfo.upfrontPaymentAmount)} />
                )}
                <SummaryRow label="Đã thanh toán" value={formatPrice(paymentInfo.paidAmount)} />
                <SummaryRow label="Còn phải thanh toán" value={formatPrice(paymentInfo.outstandingAmount)} strong />
              </div>

              {showPaymentAction ? (
                <Link
                  to={`/bookings/${booking._id}/payment`}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95"
                >
                  <CreditCard size={20} />
                  Thanh toán {formatPrice(paymentNextAmount)}
                </Link>
              ) : paymentNextAmount > 0 ? (
                <div className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-50 px-5 py-3 text-center font-extrabold text-amber-700">
                  <Clock3 size={20} />
                  {booking.status === "REQUESTED"
                    ? "Chờ chủ xe xác nhận"
                    : "Chưa thể thanh toán"}
                </div>
              ) : (
                <div className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondarySoft px-5 py-3 font-extrabold text-primary">
                  <CheckCircle2 size={20} />
                  Không cần thanh toán
                </div>
              )}

              {showCancelAction && (
                <button
                  type="button"
                  onClick={openCancelModal}
                  disabled={cancelSubmitting}
                  className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-5 py-3 font-extrabold text-slate-800 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelSubmitting ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <XCircle size={20} />
                  )}
                  Hủy booking
                </button>
              )}

              <p className="mt-4 rounded-lg border border-secondary/20 bg-secondarySoft/25 px-4 py-3 text-sm font-semibold leading-6 text-muted">
                {paymentInfo.detail}
              </p>
            </div>

            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <p className="text-sm font-bold uppercase text-secondary">
                Đơn vị cho thuê
              </p>
              <div className="mt-4 flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary">
                  <Building2 size={21} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-extrabold text-primary">
                    {ownerName}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {ownerAddress}
                  </p>
                  {ownerPhone && (
                    <p className="mt-1 text-sm font-semibold text-primary">
                      {ownerPhone}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {canOpenBookingChat(booking.status) && (
              <BookingChatPanel
                open
                variant="embedded"
                bookingId={booking._id}
                bookingCode={getBookingDisplayCode(booking)}
                carName={car?.name}
                counterpartName={ownerName}
                currentUserId={currentUserId}
                readOnly={isBookingChatReadOnly(booking.status)}
              />
            )}

            {canConfirmReturn && (
              <article className="print:hidden overflow-hidden rounded-2xl border border-secondary/40 bg-white shadow-sm">
                <div className="h-1 bg-secondary" />
                <div className="p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondarySoft text-primary">
                      <CheckCircle2 size={22} />
                    </span>
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-secondaryDark">
                        Cần bạn xác nhận
                      </p>
                      <h2 className="mt-1 text-xl font-extrabold text-primary">
                        Xác nhận đã trả xe
                      </h2>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                        Chủ xe đã xác nhận nhận lại xe. Hãy xem và đối chiếu đầy đủ biên bản kiểm tra trước khi xác nhận.
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-primary">
                    Tôi xác nhận đã xem và đồng ý với tình trạng xe, phụ kiện và giấy tờ được ghi nhận trong biên bản trả xe.
                  </p>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => openTripDocument("return")}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 font-extrabold text-primary"
                    >
                      <FileText size={17} /> Xem biên bản
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmReturn()}
                      disabled={returnConfirming}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-5 font-extrabold text-primary disabled:opacity-60"
                    >
                      {returnConfirming ? (
                        <Loader2 size={17} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={17} />
                      )}
                      Xác nhận đã trả xe
                    </button>
                  </div>
                </div>
              </article>
            )}
          </aside>
        </div>
      </main>

      {printDocument && (
        <article className="hidden bg-white p-8 text-slate-950 print:block">
          <header className="border-b-2 border-slate-900 pb-5 text-center">
            <p className="text-sm font-extrabold uppercase tracking-[0.22em]">BQDrive</p>
            <h1 className="mt-2 text-2xl font-extrabold uppercase">
              {printDocument === "handover"
                ? "Biên bản bàn giao xe"
                : "Biên bản kiểm tra khi trả xe"}
            </h1>
            <p className="mt-2 text-sm">Mã booking: {getBookingDisplayCode(booking)}</p>
          </header>

          <section className="mt-6">
            <h2 className="font-extrabold uppercase">I. Thông tin chuyến thuê</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <p><strong>Người thuê:</strong> {booking.renterInfo?.fullName || "Người thuê"}</p>
              <p><strong>Chủ xe:</strong> {ownerName}</p>
              <p><strong>Nhận xe:</strong> {formatDateTime(booking.startDate)}</p>
              <p><strong>Trả xe:</strong> {formatDateTime(booking.endDate)}</p>
              <p className="col-span-2"><strong>Địa điểm nhận:</strong> {pickupAddress}</p>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="font-extrabold uppercase">II. Thông tin xe</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
               <p><strong>Xe:</strong> {car?.name || "--"}</p>
               <p><strong>Biển số:</strong> {car?.licensePlate || "--"}</p>
               <p><strong>Loại xe:</strong> {getSpecLabel(car?.type)}</p>
               <p><strong>Loại nhiên liệu:</strong> {getSpecLabel(car?.fuelType)}</p>
               <p><strong>Hộp số:</strong> {getSpecLabel(car?.transmission)}</p>
               <p><strong>Số chỗ:</strong> {car?.seats || "--"}</p>
            </div>
          </section>

          {printDocument === "handover" && handover ? (
            <>
              <section className="mt-6"><h2 className="font-extrabold uppercase">III. Tình trạng trước khi giao</h2><div className="mt-3 grid grid-cols-2 gap-3 border border-slate-300 p-4 text-sm"><p><strong>ODO:</strong> {new Intl.NumberFormat("vi-VN").format(handover.preparation?.odometerKm ?? handover.handoverOdometerKm)} km</p><p><strong>Nhiên liệu/pin:</strong> {preparationEnergy}%</p><p className="col-span-2"><strong>Ghi chú:</strong> {handover.preparation?.note || "Không có ghi chú thêm."}</p></div></section>
               <section className="mt-6"><h2 className="font-extrabold uppercase">IV. Tình trạng khi khách nhận</h2><div className="mt-3 grid grid-cols-2 gap-3 border border-slate-300 p-4 text-sm"><p><strong>ODO:</strong> {new Intl.NumberFormat("vi-VN").format(handover.handoverOdometerKm)} km</p><p><strong>Nhiên liệu/pin:</strong> {handoverEnergy}%</p><p className="col-span-2"><strong>Ghi chú:</strong> {handover.handoverConditionNotes || "Không có ghi chú thêm."}</p></div></section>
               <section className="mt-6"><h2 className="font-extrabold uppercase">V. Checklist bàn giao</h2><VehicleRecordChecklist handoverRecord={handover} /></section>
               {handoverImages.length > 0 && <section className="mt-6"><h2 className="font-extrabold uppercase">Ảnh hiện trạng</h2><div className="mt-3 grid grid-cols-4 gap-3">{handoverImages.slice(0, 8).map((image, index) => <img key={`${image}-${index}`} src={normalizeImageUrl(image)} alt={`Ảnh bàn giao ${index + 1}`} className="h-24 w-full border border-slate-300 object-cover" />)}</div></section>}
               <section className="mt-6"><h2 className="font-extrabold uppercase">VI. Xác nhận hai bên</h2><div className="mt-3 grid grid-cols-2 gap-4 text-sm"><div className="border border-slate-300 p-4"><p className="font-extrabold uppercase">Bên giao</p><p className="mt-2 font-bold">{ownerName}</p><p className="mt-2">Đã xác nhận trên hệ thống</p><p>{formatDateTime(handover.ownerConfirmedAt)}</p></div><div className="border border-slate-300 p-4"><p className="font-extrabold uppercase">Bên nhận</p><p className="mt-2 font-bold">{booking.renterInfo?.fullName || "Người thuê"}</p><p className="mt-2">Đã xác nhận trên hệ thống</p><p>{formatDateTime(handover.renterConfirmedAt)}</p></div></div></section>
            </>
          ) : printDocument === "return" && returnInspection ? (
            <>
              <section className="mt-6"><h2 className="font-extrabold uppercase">III. Đối chiếu lúc giao / lúc trả</h2><div className="mt-3 grid grid-cols-2 gap-4 text-sm"><div className="border border-slate-300 p-4"><p className="font-extrabold uppercase">Lúc giao</p><p className="mt-2"><strong>ODO:</strong> {handover ? new Intl.NumberFormat("vi-VN").format(handover.handoverOdometerKm) : "--"} km</p><p><strong>Nhiên liệu/pin:</strong> {handoverEnergy}%</p></div><div className="border border-slate-300 p-4"><p className="font-extrabold uppercase">Lúc trả</p><p className="mt-2"><strong>ODO:</strong> {returnInspection.returnOdometerKm !== undefined ? new Intl.NumberFormat("vi-VN").format(returnInspection.returnOdometerKm) : "--"} km</p><p><strong>Nhiên liệu/pin:</strong> {returnInspection.returnEnergyLevelPercent !== undefined ? `${returnEnergy}%` : "--"}</p></div></div></section>
               <section className="mt-6"><h2 className="font-extrabold uppercase">IV. Kết quả kiểm tra</h2><div className="mt-3 border border-slate-300 p-4 text-sm"><p><strong>Quãng đường sử dụng:</strong> {returnInspection.distanceTravelledKm ?? "--"} km</p><p><strong>Hư hỏng mới:</strong> {returnInspection.hasDamage ? "Có" : "Không"}</p><p><strong>Cần vệ sinh:</strong> {returnInspection.hasCleaningIssue ? "Có" : "Không"}</p><p><strong>Ghi chú:</strong> {returnInspection.conditionNotes || "Không có ghi chú."}</p></div></section>
               {handover && <section className="mt-6"><h2 className="font-extrabold uppercase">V. Checklist đối chiếu</h2><VehicleRecordChecklist handoverRecord={handover} returnRecord={returnInspection} /><p className="mt-2 text-xs font-semibold">Khác biệt chỉ dùng để đối chiếu, không tự động tạo phụ phí.</p></section>}
               <section className="mt-6"><h2 className="font-extrabold uppercase">VI. Xác nhận hai bên</h2><div className="mt-3 grid grid-cols-2 gap-4 text-sm"><div className="border border-slate-300 p-4"><p className="font-extrabold uppercase">Bên nhận lại xe</p><p className="mt-2 font-bold">{ownerName}</p><p>{formatDateTime(returnInspection.ownerConfirmedAt)}</p></div><div className="border border-slate-300 p-4"><p className="font-extrabold uppercase">Bên trả xe</p><p className="mt-2 font-bold">{booking.renterInfo?.fullName || "Người thuê"}</p><p>{formatDateTime(returnInspection.renterConfirmedAt)}</p></div></div></section>
            </>
          ) : null}

          <p className="mt-8 border-t border-slate-300 pt-4 text-center text-xs font-semibold">Biên bản được xác nhận điện tử trên hệ thống BQDrive.</p>
        </article>
      )}

      <div className="print:hidden"><Footer /></div>

      {refundRecipientModalOpen && latestRefund && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-primary px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary">
                    Thông tin nhận tiền hoàn
                  </h2>
                  <p className="mt-1 font-semibold text-white/75">
                    Refund #{latestRefund._id.slice(-8).toUpperCase()} -{" "}
                    {formatPrice(latestRefund.refundAmount)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRefundRecipientModalOpen(false)}
                  disabled={Boolean(refundRecipientSubmittingId)}
                  className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Đóng"
                >
                  <XCircle size={22} />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-xl border border-secondary/30 bg-secondarySoft/30 p-4 text-sm font-semibold leading-6 text-primary">
                Thông tin này chỉ dùng để chủ xe xử lý khoản hoàn tiền của booking này.
                Không nhập OTP, mã PIN, mật khẩu, CVV hoặc thông tin đăng nhập.
              </div>

              <label className="block">
                <span className="text-sm font-bold text-primary">
                  Phương thức nhận tiền
                </span>
                <select
                  value={refundRecipientMethod}
                  onChange={(event) =>
                    setRefundRecipientMethod(
                      event.target.value as RefundRecipientMethod,
                    )
                  }
                  className="mt-2 h-12 w-full rounded-lg border border-border px-3 font-semibold outline-none focus:border-secondary"
                >
                  <option value="BANK_TRANSFER">Chuyển khoản ngân hàng</option>
                  <option value="E_WALLET">Ví điện tử</option>
                  <option value="CASH">Nhận tiền mặt</option>
                </select>
              </label>

              {refundRecipientMethod === "BANK_TRANSFER" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-bold text-primary">
                      Tên ngân hàng
                    </span>
                    <input
                      value={refundBankName}
                      onChange={(event) => setRefundBankName(event.target.value)}
                      maxLength={100}
                      className="mt-2 h-12 w-full rounded-lg border border-border px-3 font-semibold outline-none focus:border-secondary"
                      placeholder="VD: Vietcombank"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-primary">
                      Số tài khoản
                    </span>
                    <input
                      value={refundAccountNumber}
                      onChange={(event) =>
                        setRefundAccountNumber(event.target.value)
                      }
                      maxLength={30}
                      className="mt-2 h-12 w-full rounded-lg border border-border px-3 font-semibold outline-none focus:border-secondary"
                      placeholder="VD: 0123456789"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-bold text-primary">
                      Tên chủ tài khoản
                    </span>
                    <input
                      value={refundAccountHolderName}
                      onChange={(event) =>
                        setRefundAccountHolderName(event.target.value)
                      }
                      maxLength={100}
                      className="mt-2 h-12 w-full rounded-lg border border-border px-3 font-semibold uppercase outline-none focus:border-secondary"
                      placeholder="VD: NGUYEN VAN A"
                    />
                  </label>
                </div>
              )}

              {refundRecipientMethod === "E_WALLET" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-bold text-primary">
                      Tên ví điện tử
                    </span>
                    <input
                      value={refundWalletProvider}
                      onChange={(event) =>
                        setRefundWalletProvider(event.target.value)
                      }
                      maxLength={100}
                      className="mt-2 h-12 w-full rounded-lg border border-border px-3 font-semibold outline-none focus:border-secondary"
                      placeholder="VD: MoMo, ZaloPay"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-primary">
                      Số điện thoại/tài khoản ví
                    </span>
                    <input
                      value={refundWalletAccount}
                      onChange={(event) =>
                        setRefundWalletAccount(event.target.value)
                      }
                      maxLength={100}
                      className="mt-2 h-12 w-full rounded-lg border border-border px-3 font-semibold outline-none focus:border-secondary"
                      placeholder="VD: 0901234567"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-bold text-primary">
                      Tên chủ ví
                    </span>
                    <input
                      value={refundWalletHolderName}
                      onChange={(event) =>
                        setRefundWalletHolderName(event.target.value)
                      }
                      maxLength={100}
                      className="mt-2 h-12 w-full rounded-lg border border-border px-3 font-semibold outline-none focus:border-secondary"
                      placeholder="VD: Nguyễn Văn A"
                    />
                  </label>
                </div>
              )}

              {refundRecipientMethod === "CASH" && (
                <label className="block">
                  <span className="text-sm font-bold text-primary">
                    Ghi chú nhận tiền mặt
                  </span>
                  <textarea
                    value={refundCashNote}
                    onChange={(event) => setRefundCashNote(event.target.value)}
                    maxLength={500}
                    rows={4}
                    className="mt-2 w-full rounded-lg border border-border px-3 py-3 font-semibold outline-none focus:border-secondary"
                    placeholder="VD: Tôi sẽ nhận tiền mặt khi gặp chủ xe tại điểm hẹn..."
                  />
                </label>
              )}

              <label className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-semibold leading-6 text-primary">
                <input
                  type="checkbox"
                  checked={refundRecipientAccepted}
                  onChange={(event) =>
                    setRefundRecipientAccepted(event.target.checked)
                  }
                  className="mt-1 h-5 w-5 rounded border-border accent-secondary"
                />
                <span>
                  Tôi xác nhận thông tin nhận tiền là chính xác và hiểu rằng chủ
                  xe sẽ dùng thông tin này để hoàn tiền.
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRefundRecipientModalOpen(false)}
                disabled={Boolean(refundRecipientSubmittingId)}
                className="min-h-11 rounded-lg border border-border bg-white px-5 py-2 font-extrabold text-primary"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmitRefundRecipientInfo}
                disabled={
                  !refundRecipientAccepted || Boolean(refundRecipientSubmittingId)
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refundRecipientSubmittingId && (
                  <Loader2 size={18} className="animate-spin" />
                )}
                Gửi thông tin
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-primary px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary">
                    Hủy booking
                  </h2>
                  <p className="mt-1 font-semibold text-white/75">
                    Booking {getBookingDisplayCode(booking)} - {car?.name || "Xe BQDrive"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Đóng"
                >
                  <XCircle size={22} />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold text-primary">Lý do hủy</span>
                  <select
                    value={cancelReasonCode}
                    onChange={(event) => {
                      setCancelReasonCode(event.target.value);
                      setCancelPolicyAccepted(false);
                    }}
                    className="mt-2 h-12 w-full rounded-lg border border-border px-3 font-semibold outline-none focus:border-secondary"
                  >
                    <option value="CHANGE_OF_PLAN">Thay đổi lịch trình</option>
                    <option value="FOUND_ANOTHER_CAR">Đã chọn xe khác</option>
                    <option value="PRICE_OR_TIME_NOT_SUITABLE">Giá hoặc thời gian chưa phù hợp</option>
                    <option value="OTHER">Lý do khác</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-primary">Ghi chú</span>
                  <input
                    value={cancelReasonText}
                    onChange={(event) => {
                      setCancelReasonText(event.target.value);
                      setCancelPolicyAccepted(false);
                    }}
                    onBlur={() => void loadCancellationPreview()}
                    placeholder="Nhập thêm lý do nếu cần"
                    className="mt-2 h-12 w-full rounded-lg border border-border px-3 font-semibold outline-none focus:border-secondary"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => void loadCancellationPreview()}
                disabled={cancelPreviewLoading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-slate-100 px-4 py-2 font-extrabold text-primary transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelPreviewLoading && <Loader2 size={18} className="animate-spin" />}
                Cập nhật xem trước
              </button>

              {cancelPreviewLoading ? (
                <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border bg-slate-50 text-sm font-bold text-muted">
                  <Loader2 size={18} className="mr-2 animate-spin text-secondary" />
                  Đang tính chính sách hủy...
                </div>
              ) : cancelPreview ? (
                <div className="rounded-xl border border-secondary/30 bg-secondarySoft/30 p-4">
                  <p className="text-sm font-bold uppercase text-secondary">
                    Xem trước hoàn tiền
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <SummaryRow
                      label="Tổng tiền"
                      value={formatPrice(cancelPreview.totalPrice)}
                    />
                    <SummaryRow
                      label="Đã thanh toán"
                      value={formatPrice(cancelPreview.paidAmountAtCancellation)}
                    />
                    <SummaryRow
                      label="Phí hủy"
                      value={formatPrice(cancelPreview.cancellationFee)}
                    />
                    <SummaryRow
                      label="Dự kiến hoàn"
                      value={formatPrice(cancelPreview.refundAmount)}
                      strong
                    />
                  </div>
                  <p className="mt-4 rounded-lg bg-white px-4 py-3 text-sm font-semibold leading-6 text-primary">
                    {getCancellationPolicyLabel(cancelPreview.policyRuleApplied)}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-muted">
                    {cancelPreview.message}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
                  Chưa thể xem trước chính sách hủy cho booking này.
                </div>
              )}

              <label className="flex items-start gap-3 rounded-xl border border-border bg-slate-50 p-4 text-sm font-semibold leading-6 text-primary">
                <input
                  type="checkbox"
                  checked={cancelPolicyAccepted}
                  onChange={(event) => setCancelPolicyAccepted(event.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-border text-secondary"
                />
                <span>
                  Tôi đã đọc, hiểu{" "}
                  <Link
                    to="/policies/cancellation-refund"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="font-extrabold text-secondary underline decoration-2 underline-offset-4 hover:text-primary"
                  >
                    chính sách hủy và hoàn tiền
                  </Link>{" "}
                  và xác nhận hủy booking này.
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="min-h-11 rounded-lg border border-border bg-white px-5 py-2 font-extrabold text-primary"
              >
                Giữ booking
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={!cancelPreview || !cancelPolicyAccepted || cancelSubmitting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelSubmitting && <Loader2 size={18} className="animate-spin" />}
                Xác nhận hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 px-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-primary px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-secondary">
                    Đánh giá chuyến thuê
                  </h2>
                  <p className="mt-1 font-semibold text-white/75">
                    Booking {getBookingDisplayCode(booking)} - {car?.name || "Xe BQDrive"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Đóng"
                >
                  <XCircle size={22} />
                </button>
              </div>
            </div>

            <div className="space-y-5 overflow-y-auto p-6">
              <div>
                <p className="mb-3 text-sm font-bold uppercase text-secondary">
                  Điểm tổng thể
                </p>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 5 }).map((_, index) => {
                    const value = index + 1;
                    const active = value <= reviewRating;

                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setReviewRating(value)}
                        className={`flex h-12 w-12 items-center justify-center rounded-xl border transition ${
                          active
                            ? "border-secondary bg-secondary text-primary"
                            : "border-border bg-white text-slate-300 hover:border-secondary hover:text-secondary"
                        }`}
                        aria-label={`${value} sao`}
                      >
                        <Star size={24} fill={active ? "currentColor" : "none"} />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-sm font-semibold text-muted">
                  Chọn mức hài lòng chung của bạn về chuyến thuê này.
                </p>
              </div>

              <div>
                <p className="text-sm font-bold uppercase text-secondary">
                  Chọn điểm nổi bật của chuyến thuê
                </p>
                <p className="mt-1 text-sm font-semibold leading-6 text-muted">
                  Chọn nhanh những điều bạn hài lòng để BQDrive và chủ xe hiểu rõ
                  trải nghiệm thực tế hơn.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {reviewCriteriaOptions.map((item) => {
                    const selected = Boolean(reviewCriteria[item.key]);

                    return (
                      <button
                      key={item.key}
                        type="button"
                        onClick={() =>
                          setReviewCriteria((current) => {
                            const next = { ...current };

                            if (next[item.key]) {
                              delete next[item.key];
                            } else {
                              next[item.key] = 5;
                            }

                            return next;
                          })
                        }
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          selected
                            ? "border-secondary bg-secondarySoft text-primary shadow-sm"
                            : "border-border bg-white text-primary hover:border-secondary hover:bg-secondarySoft/40"
                        }`}
                    >
                        <span className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? "border-primary bg-primary text-secondary"
                                : "border-slate-300 bg-white text-transparent"
                            }`}
                          >
                            <CheckCircle2 size={16} />
                          </span>
                          <span>
                            <span className="block text-base font-extrabold">
                              {item.label}
                            </span>
                            <span className="mt-1 block text-sm font-semibold leading-5 text-muted">
                              {item.description}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="text-sm font-bold uppercase text-muted">
                  Nhận xét
                </span>
                <textarea
                  value={reviewComment}
                  onChange={(event) =>
                    setReviewComment(event.target.value.slice(0, 1000))
                  }
                  rows={5}
                  className="mt-2 w-full rounded-xl border border-border px-4 py-3 font-semibold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/15"
                  placeholder="Xe sạch, chủ xe hỗ trợ tốt..."
                />
                <span className="mt-1 block text-right text-xs font-semibold text-muted">
                  {reviewComment.length}/1000
                </span>
              </label>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold uppercase text-muted">
                    Ảnh thực tế sau chuyến thuê
                  </p>
                  <span className="text-xs font-bold text-muted">
                    {reviewImages.length}/{maxReviewImages}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold leading-6 text-muted">
                  Không tải ảnh giấy tờ cá nhân, bằng lái, CCCD hoặc thông tin thanh toán.
                </p>
                <label className={`mt-3 flex min-h-12 items-center justify-center rounded-xl border border-dashed border-secondary/50 bg-secondarySoft/30 px-4 py-3 text-sm font-extrabold text-primary transition ${reviewImagesUploading ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-secondarySoft"}`}>
                  {reviewImagesUploading ? "Đang tải ảnh đánh giá..." : "Chọn ảnh đánh giá"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    disabled={reviewImagesUploading}
                    onChange={handleReviewImageChange}
                  />
                </label>
                {reviewImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {reviewImages.map((image, index) => (
                      <div key={`${image}-${index}`} className="relative">
                        <img
                          src={image}
                          alt={`Ảnh đánh giá ${index + 1}`}
                          className="h-24 w-full rounded-xl border border-border object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setReviewImages((current) =>
                              current.filter((_, imageIndex) => imageIndex !== index),
                            )
                          }
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-secondary shadow"
                          aria-label="Xóa ảnh"
                        >
                          <XCircle size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="min-h-11 rounded-lg border border-border bg-white px-5 py-2 font-extrabold text-primary transition hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={reviewSubmitting || reviewImagesUploading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {(reviewSubmitting || reviewImagesUploading) && <Loader2 size={18} className="animate-spin" />}
                {reviewImagesUploading ? "Đang tải ảnh..." : "Gửi đánh giá"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-sm font-semibold text-muted">
        <Icon size={17} className="shrink-0 text-secondary" />
        {label}
      </p>
      <p className="mt-1 break-words font-extrabold text-primary">{value}</p>
    </div>
  );
}

function SpecLine({
  icon: Icon,
  value,
}: {
  icon: LucideIcon;
  value: string;
}) {
  return (
    <p className="flex items-center gap-2 font-semibold">
      <Icon size={17} className="shrink-0 text-secondary" />
      {value}
    </p>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong ? "text-base font-extrabold text-primary" : "text-muted"
      }`}
    >
      <span>{label}</span>
      <span className="text-right font-extrabold text-primary">{value}</span>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-1 break-words text-base font-extrabold text-primary">
        {value}
      </p>
    </div>
  );
}









