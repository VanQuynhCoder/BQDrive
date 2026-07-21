import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Building2,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CircleDashed,
  Clock3,
  CreditCard,
  Fuel,
  Gauge,
  Hash,
  Loader2,
  MapPin,
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
import RouteMap from "../components/maps/RouteMap";
import { bookingService } from "../services/booking.service";
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
import { getFirstCarImage, normalizeImageUrl } from "../utils/image.util";
import { formatVietnamDateTime } from "../utils/date.util";
import { formatAddressSnapshot, formatFullAddress } from "../utils/address.util";
import { getBookingTimelineView } from "../utils/bookingTimeline.util";

type BookingStatus =
  | "REQUESTED"
  | "OWNER_APPROVED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "PENDING"
  | "WAITING_PAYMENT"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "RETURN_INSPECTION"
  | "AWAITING_EXTRA_CHARGE"
  | "CANCELLED"
  | "REJECTED"
  | "COMPLETED"
  | "NO_SHOW"
  | string;

type BookingCar = {
  _id: string;
  name?: string;
  licensePlate?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  rentalUnit?: string;
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

type BookingBusiness = {
  _id: string;
  businessName?: string;
  phone?: string;
  address: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
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

type PricingSnapshot = {
  rentalSubtotal?: number;
  deliveryFee?: number;
  totalPrice?: number;
  delivery?: {
    deliveryType?: string;
    deliveryAddress?: string;
    deliveryAddressText?: string;
    deliveryFormattedAddress?: string;
    deliveryDistanceKm?: number;
    deliveryDurationText?: string;
  };
};

type Booking = {
  _id: string;
  carId: BookingCar;
  businessId: BookingBusiness;
  ownerId: BookingBusiness | BookingOwnerUser | string;
  ownerType?: "BUSINESS" | "USER" | string;
  startDate: string;
  endDate: string;
  rentalMode?: string;
  totalPrice?: number;
  depositAmount: number;
  remainingAmount: number;
  paidAmount: number;
  paymentOption: "DEPOSIT" | "FULL" | string;
  status: BookingStatus;
  cancelReason: string;
  rejectReason?: string;
  noShowReason: string;
  noShowAt?: string;
  note?: string;
  pricingSnapshot?: PricingSnapshot;
  pickupAddressSnapshot: string;
  returnAddressSnapshot: string;
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

function getShortId(id: string) {
  return id ? `#${id.slice(-8).toUpperCase()}` : "--";
}

function getRentalInfo(car: BookingCar | undefined, rentalMode?: string) {
  if (rentalMode === "HOURLY" || (!rentalMode && car?.rentalUnit === "HOUR")) {
    return {
      price: car?.pricePerHour || 0,
      unit: "giờ",
      label: "Số giờ thuê",
      mode: "Thuê theo giờ",
    };
  }

  return {
    price: car?.pricePerDay || 0,
    unit: "ngày",
    label: "Số ngày thuê",
    mode: "Thuê theo ngày",
  };
}

const HOUR_MS = 1000 * 60 * 60;
const maxReviewImages = 3;
const maxReviewImageSize = 5 * 1024 * 1024;

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

function readReviewImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Invalid image result"));
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
  const value = status || "PENDING";

  if (value === "OWNER_APPROVED") {
    return {
      label: "Chủ xe đã duyệt",
      detail: "Chủ xe đã đồng ý cho thuê. Bạn có thể tạo hợp đồng và thanh toán.",
      badgeClass: "bg-primary text-secondary",
      panelClass: "border-primary/15 bg-primary text-secondary",
      icon: BadgeCheck,
    };
  }

  if (value === "PAYMENT_PENDING" || value === "WAITING_PAYMENT") {
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

  if (value === "CONFIRMED") {
    return {
      label: "Đã xác nhận",
      detail: "Chủ xe đã xác nhận lịch thuê.",
      badgeClass: "bg-primary text-secondary",
      panelClass: "border-primary/15 bg-primary text-secondary",
      icon: BadgeCheck,
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
  const depositAmount =
    booking.depositAmount || (!isFullPayment ? Math.round(totalPrice * 0.3) : 0);
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
      depositAmount,
      remainingAfterDeposit: 0,
      outstandingAmount,
    };
  }

  if (paidAmount > 0) {
    return {
      label: "Đã thanh toán cọc",
      detail: "Booking đã ghi nhận tiền cọc, vẫn còn phần tiền cần thanh toán.",
      badgeClass: "bg-primary text-secondary",
      nextAmount: outstandingAmount,
      totalPrice,
      paidAmount,
      depositAmount,
      remainingAfterDeposit: outstandingAmount,
      outstandingAmount,
    };
  }

  return {
    label: "Chưa thanh toán",
    detail:
      isFullPayment
        ? "Booking chọn thanh toán toàn bộ."
        : "Booking chọn thanh toán cọc.",
    badgeClass: "bg-amber-50 text-amber-700",
    nextAmount: isFullPayment ? totalPrice : depositAmount,
    totalPrice,
    paidAmount,
    depositAmount,
    remainingAfterDeposit: Math.max(totalPrice - depositAmount, 0),
    outstandingAmount,
  };
}

function canPayBooking(booking: Booking, nextAmount: number) {
  return (
    nextAmount > 0 &&
    [
      "OWNER_APPROVED", // Chủ xe đã duyệt nên khách được thanh toán
      "PAYMENT_PENDING", // Đang chờ thanh toán, cho phép quay lại thanh toán
      "PAID", // Đã trả cọc, có thể thanh toán phần còn lại nếu còn tiền
      "CONFIRMED", // Trạng thái cũ
      "WAITING_PAYMENT", // Trạng thái cũ
      "IN_PROGRESS",
      "RETURN_INSPECTION",
      "AWAITING_EXTRA_CHARGE",
    ].includes(
      booking.status || "",
    )
  );
}

function canCancelBooking(booking: Booking) {
  return ["REQUESTED", "OWNER_APPROVED", "PENDING", "CONFIRMED"].includes(
    booking.status || "",
  );
}

const extraChargeTypeLabels: Record<ExtraChargeType, string> = {
  CLEANING: "Phí vệ sinh",
  DAMAGE: "Phí sửa chữa/hư hỏng",
  LATE_RETURN: "Phí trễ giờ",
  FUEL: "Phí nhiên liệu",
  OTHER: "Phí khác",
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

export default function BookingDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [review, setReview] = useState<ReviewItem | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewCriteria, setReviewCriteria] = useState<ReviewCriteria>({});
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [extraCharges, setExtraCharges] = useState<ExtraCharge[]>([]);
  const [extraChargeLoading, setExtraChargeLoading] = useState(false);
  const [extraChargePayingId, setExtraChargePayingId] = useState("");

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
    queueMicrotask(() => {
      void fetchBooking();
    });
  }, [fetchBooking]);

  const handleCancel = async () => {
    if (!booking || cancelSubmitting) return;
    if (!window.confirm("Bạn có chắc muốn hủy booking này?")) return;

    try {
      setCancelSubmitting(true);
      await bookingService.cancelBooking(booking._id, "Khách hàng hủy booking");
      toast.success("Đã hủy booking");
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
        openReviewModal();
        setSearchParams({});
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
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} không phải là ảnh hợp lệ.`);
        return false;
      }

      if (file.size > maxReviewImageSize) {
        toast.error(`${file.name} vượt quá 5MB.`);
        return false;
      }

      return true;
    });

    const images = await Promise.all(validFiles.map(readReviewImage));
    setReviewImages((current) => [...current, ...images].slice(0, maxReviewImages));
  };

  const handleSubmitReview = async () => {
    if (!booking || reviewSubmitting) return;

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
    booking.ownerType === "USER" && typeof booking.ownerId === "object"
      ? (booking.ownerId as BookingOwnerUser)
      : undefined;
  const ownerName =
    booking.ownerType === "USER"
      ? ownerUser?.name || "Người dùng ký gửi"
      : booking.businessId.businessName || "Đối tác BQDrive";
  const ownerAddress =
    booking.ownerType === "USER"
      ? formatFullAddress(ownerUser, "Địa chỉ liên hệ sẽ theo hợp đồng.")
      : formatFullAddress(booking.businessId, "Thông tin địa chỉ đang được cập nhật.");
  const ownerPhone =
    booking.ownerType === "USER" ? ownerUser?.phone : booking.businessId.phone;
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
  const rental = getRentalInfo(car, booking.rentalMode);
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
    "CONFIRMED",
    "WAITING_PAYMENT",
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

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
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
              Booking {getShortId(booking._id)}
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
                      <p className="mt-2 text-muted">
                        {car?.licensePlate || "Biển số đang cập nhật"}
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
                    <InfoLine icon={Clock3} label={rental.label} value={`${rentalTime} ${rental.unit}`} />
                    <InfoLine icon={Wallet} label="Đơn giá" value={`${formatPrice(rental.price)} / ${rental.unit}`} />
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
                  {booking.status === "NO_SHOW" && paymentPaidAmount > 0 && (
                    <p className="mt-3">
                      Booking đã được đánh dấu không nhận xe. Chính sách xử lý
                      cọc/thanh toán sẽ được thực hiện theo quy định của hệ
                      thống hoặc chủ xe.
                    </p>
                  )}
                </div>
              )}
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

            <section id="booking-timeline" className="rounded-lg border border-border bg-white p-6 shadow-sm">
              <p className="text-sm font-bold uppercase text-secondary">
                Đơn vị cho thuê
              </p>
              <div className="mt-4 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary">
                  <Building2 size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-primary">
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
          </section>

          <aside id="booking-payment-summary" className="lg:sticky lg:top-28 lg:self-start">
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
                <SummaryRow label="Mã booking" value={getShortId(booking._id)} />
                <SummaryRow label="Hình thức" value={booking.paymentOption === "FULL" ? "Thanh toán toàn bộ" : "Thanh toán cọc"} />
                <SummaryRow
                  label="Tiền thuê xe"
                  value={formatPrice(
                    booking.pricingSnapshot?.rentalSubtotal ?? booking.totalPrice,
                  )}
                />
                <SummaryRow
                  label="Phí giao xe"
                  value={formatPrice(booking.pricingSnapshot?.deliveryFee || 0)}
                />
                <SummaryRow label="Tổng tiền" value={formatPrice(paymentInfo.totalPrice)} />
                {booking.paymentOption !== "FULL" && (
                  <SummaryRow label="Tiền cọc" value={formatPrice(paymentInfo.depositAmount)} />
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
                  {booking.status === "PENDING"
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
                  onClick={handleCancel}
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
          </aside>
        </div>
      </main>

      <Footer />

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
                    Booking {getShortId(booking._id)} - {car?.name || "Xe BQDrive"}
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
                <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-secondary/50 bg-secondarySoft/30 px-4 py-3 text-sm font-extrabold text-primary transition hover:bg-secondarySoft">
                  Chọn ảnh đánh giá
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    multiple
                    className="hidden"
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
                disabled={reviewSubmitting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reviewSubmitting && <Loader2 size={18} className="animate-spin" />}
                Gửi đánh giá
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









