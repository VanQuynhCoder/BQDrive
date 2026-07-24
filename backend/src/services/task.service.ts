import mongoose from "mongoose";
import {
  BookingStatusEnum,
  CarStatusEnum,
  ExtraChargeStatusEnum,
  OwnerTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  RefundStatusEnum,
  ReturnInspectionStatusEnum,
  UserRoleEnum,
} from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { BusinessModel } from "../models/business/business.model";
import { CarModel } from "../models/car/car.model";
import { ExtraChargeModel } from "../models/extra-charge/extraCharge.model";
import { PaymentModel } from "../models/payment/payment.model";
import { RefundModel } from "../models/refund/refund.model";
import { ReviewModel, ReviewStatusEnum } from "../models/review/review.model";
import { ReturnInspectionModel } from "../models/return-inspection/returnInspection.model";

export type TaskGroup = "ACTION_REQUIRED" | "WAITING";
export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
export type TaskEntityType = "BOOKING" | "CAR" | "BUSINESS" | "REVIEW" | "REFUND";

export type ActionCenterTask = {
  id: string;
  type: string;
  summaryKey: string;
  context: "admin" | "business" | "customer" | "consignment";
  group: TaskGroup;
  priority: TaskPriority;
  title: string;
  description: string;
  detail?: string;
  entityType: TaskEntityType;
  entityId: string;
  bookingId?: string;
  carId?: string;
  actionKey: string;
  actionLabel: string;
  actionUrl: string;
  dueAt?: Date | null;
  isOverdue?: boolean;
  createdAt?: Date | null;
  metadata?: Record<string, any>;
};

export type ActionCenterResult = {
  summary: {
    actionRequiredCount: number;
    waitingCount: number;
    highPriorityCount: number;
    totalCount: number;
  };
  tasks: ActionCenterTask[];
};

const TERMINAL_BOOKING_STATUSES = [
  BookingStatusEnum.COMPLETED,
  BookingStatusEnum.CANCELLED,
  BookingStatusEnum.REJECTED,
  BookingStatusEnum.NO_SHOW,
];
const PAYMENT_ALLOWED_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.WAITING_PAYMENT,
  BookingStatusEnum.PAID,
  BookingStatusEnum.CONFIRMED,
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];
const OWNER_REVIEW_STATUSES = [
  BookingStatusEnum.REQUESTED,
  BookingStatusEnum.PENDING,
];
const HANDOVER_STATUSES = [
  BookingStatusEnum.PAID,
  BookingStatusEnum.CONFIRMED,
];
const RETURN_DUE_SOON_MINUTES = 30;

function idOf(value: unknown) {
  return String(value || "");
}

function getCar(booking: any) {
  return typeof booking.carId === "object" ? booking.carId : {};
}

function bookingCode(booking: any) {
  return idOf(booking._id).slice(-8).toUpperCase();
}

function carName(booking: any) {
  return getCar(booking)?.name || "Xe BQDrive";
}

function licensePlate(booking: any) {
  return getCar(booking)?.licensePlate || "";
}

function carImage(booking: any) {
  const images = getCar(booking)?.images;
  return Array.isArray(images) ? images.find(Boolean) || "" : "";
}

function getDeliveryMetadata(booking: any) {
  const delivery = booking.pricingSnapshot?.delivery || {};
  const isDeliveryToCustomer = delivery.deliveryType === "DELIVERY_TO_CUSTOMER";

  if (!isDeliveryToCustomer) {
    return {
      deliveryType: "PICKUP_AT_CAR_LOCATION",
      deliveryLabel: "Nhận xe tại vị trí chủ xe",
    };
  }

  return {
    deliveryType: "DELIVERY_TO_CUSTOMER",
    deliveryLabel: "Giao xe tận nơi",
    deliveryAddress:
      delivery.deliveryAddressText ||
      delivery.deliveryAddress ||
      delivery.deliveryFormattedAddress ||
      "",
    deliveryDistanceKm:
      typeof delivery.deliveryDistanceKm === "number"
        ? delivery.deliveryDistanceKm
        : undefined,
    deliveryDurationText: delivery.deliveryDurationText || "",
    deliveryFee: Number(
      booking.pricingSnapshot?.deliveryFee || delivery.deliveryFee || 0,
    ),
  };
}

function buildBookingMetadata(booking: any, extra?: Record<string, any>) {
  return {
    bookingCode: bookingCode(booking),
    carName: carName(booking),
    licensePlate: licensePlate(booking),
    carImage: carImage(booking),
    startDate: booking.startDate,
    endDate: booking.endDate,
    totalPrice: Number(booking.totalPrice || 0),
    paidAmount: Number(booking.paidAmount || 0),
    remainingAmount: Number(booking.remainingAmount || 0),
    ...getDeliveryMetadata(booking),
    ...extra,
  };
}

function isOverdue(date?: Date) {
  return Boolean(date && date.getTime() < Date.now());
}

function isDueSoon(date?: Date, minutes = RETURN_DUE_SOON_MINUTES) {
  if (!date) return false;
  const diff = date.getTime() - Date.now();
  return diff >= 0 && diff <= minutes * 60 * 1000;
}

function taskSort(a: ActionCenterTask, b: ActionCenterTask) {
  const groupRank: Record<TaskGroup, number> = { ACTION_REQUIRED: 0, WAITING: 1 };
  const priorityRank: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;

  return (
    groupRank[a.group] - groupRank[b.group] ||
    priorityRank[a.priority] - priorityRank[b.priority] ||
    dueA - dueB ||
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

function dedupe(tasks: ActionCenterTask[]) {
  return Array.from(new Map(tasks.map((task) => [task.id, task])).values());
}

function ownerActionUrl(
  context: "business" | "consignment",
  bookingId: string,
  action: string,
) {
  const base = context === "business" ? "/business/bookings" : "/consignment/bookings";
  return `${base}?bookingId=${bookingId}&action=${action}`;
}

async function getBusinessOwner(userId: string) {
  const business = await BusinessModel.findOne({
    userId: userId as any,
    isDeleted: false,
  }).select("_id businessName");

  if (!business) return null;

  return {
    ownerId: business._id,
    ownerType: OwnerTypeEnum.BUSINESS,
    context: "business" as const,
    ownerName: business.businessName,
    bookingFilter: {
      isDeleted: false,
      $or: [
        { ownerId: business._id, ownerType: OwnerTypeEnum.BUSINESS },
        { businessId: business._id },
      ],
    },
    carFilter: {
      isDeleted: false,
      $or: [
        { ownerId: business._id, ownerType: OwnerTypeEnum.BUSINESS },
        { businessId: business._id },
      ],
    },
  };
}

function getConsignmentOwner(userId: string) {
  return {
    ownerId: new mongoose.Types.ObjectId(userId),
    ownerType: OwnerTypeEnum.USER,
    context: "consignment" as const,
    ownerName: "",
    bookingFilter: {
      isDeleted: false,
      ownerId: userId as any,
      ownerType: OwnerTypeEnum.USER,
    },
    carFilter: {
      isDeleted: false,
      ownerId: userId as any,
      ownerType: OwnerTypeEnum.USER,
    },
  };
}

async function getOwnerTasks(owner: Awaited<ReturnType<typeof getBusinessOwner>> | ReturnType<typeof getConsignmentOwner>) {
  if (!owner) return [];

  const tasks: ActionCenterTask[] = [];
  const [cars, bookings] = await Promise.all([
    CarModel.find(owner.carFilter as any)
      .select("_id name licensePlate images status rejectReason createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    BookingModel.find(owner.bookingFilter as any)
      .populate("carId", "name licensePlate images")
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const bookingIds = bookings.map((booking) => booking._id);
  const [inspections, pendingExtraCharges, pendingCashPayments, ownerRefunds] =
    await Promise.all([
      ReturnInspectionModel.find({
        bookingId: { $in: bookingIds },
        isDeleted: false,
      } as any).lean(),
      ExtraChargeModel.find({
        bookingId: { $in: bookingIds },
        ownerId: owner.ownerId as any,
        ownerType: owner.ownerType,
        status: ExtraChargeStatusEnum.PENDING,
        isDeleted: false,
      } as any).lean(),
      PaymentModel.find({
        bookingId: { $in: bookingIds },
        method: PaymentMethodEnum.CASH,
        status: PaymentStatusEnum.PENDING,
      } as any).lean(),
      RefundModel.find({
        bookingId: { $in: bookingIds },
        status: {
          $in: [
            RefundStatusEnum.MANUAL_REQUIRED,
            RefundStatusEnum.WAITING_FOR_REFUND_INFO,
            RefundStatusEnum.PROCESSING,
          ],
        },
        isDeleted: false,
      } as any).lean(),
    ]);
  const inspectionByBooking = new Map(
    inspections.map((inspection) => [idOf(inspection.bookingId), inspection]),
  );
  const bookingById = new Map(bookings.map((booking) => [idOf(booking._id), booking]));
  const pendingChargeByBooking = new Map<string, number>();
  const pendingCashByBooking = new Map<string, number>();

  pendingExtraCharges.forEach((charge) => {
    const key = idOf(charge.bookingId);
    pendingChargeByBooking.set(key, (pendingChargeByBooking.get(key) || 0) + 1);
  });

  pendingCashPayments.forEach((payment) => {
    const key = idOf(payment.bookingId);
    pendingCashByBooking.set(key, (pendingCashByBooking.get(key) || 0) + 1);
  });

  ownerRefunds.forEach((refund: any) => {
    const booking = bookingById.get(idOf(refund.bookingId));
    if (!booking) return;

    const id = idOf(refund._id);
    const bookingId = idOf(booking._id);
    const amount = Number(refund.refundAmount || 0);
    const isWaitingForInfo =
      refund.status === RefundStatusEnum.WAITING_FOR_REFUND_INFO;
    const isManualRequired = refund.status === RefundStatusEnum.MANUAL_REQUIRED;
    const actionUrl =
      owner.context === "business"
        ? `/business/refunds?refundId=${id}`
        : `/consignment/refunds?refundId=${id}`;

    tasks.push({
      id: `${isManualRequired ? "OWNER_REFUND_REQUIRED" : isWaitingForInfo ? "OWNER_REFUND_WAITING_INFO" : "OWNER_REFUND_WAITING_RENTER"}:${id}`,
      type: isManualRequired
        ? "OWNER_REFUND_REQUIRED"
        : isWaitingForInfo
          ? "OWNER_REFUND_WAITING_INFO"
          : "OWNER_REFUND_WAITING_RENTER",
      summaryKey: isManualRequired
        ? owner.context === "business"
          ? "ownerManualRefundRequired"
          : "consignmentOwnerManualRefundRequired"
        : isWaitingForInfo
          ? owner.context === "business"
            ? "ownerRefundWaitingInfo"
            : "consignmentOwnerRefundWaitingInfo"
        : owner.context === "business"
          ? "ownerRefundWaitingRenter"
          : "consignmentOwnerRefundWaitingRenter",
      context: owner.context,
      group: isManualRequired ? "ACTION_REQUIRED" : "WAITING",
      priority: isManualRequired ? "HIGH" : "LOW",
      title: isManualRequired
        ? "Hoàn tiền cho người thuê"
        : isWaitingForInfo
          ? "Đang chờ người thuê cung cấp thông tin nhận tiền"
          : "Đang chờ người thuê xác nhận hoàn tiền",
      description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
      detail: isManualRequired
        ? `Số tiền cần hoàn: ${amount.toLocaleString("vi-VN")}đ.`
        : isWaitingForInfo
          ? "Người thuê cần cung cấp thông tin nhận tiền trước khi bạn có thể hoàn tiền."
          : "Bạn đã ghi nhận gửi tiền hoàn, hệ thống đang chờ người thuê xác nhận đã nhận tiền.",
      entityType: "REFUND",
      entityId: id,
      bookingId,
      carId: idOf(getCar(booking)?._id),
      actionKey: isManualRequired ? "manual-refund" : "view-refund",
      actionLabel: isManualRequired ? "Xử lý hoàn tiền" : "Xem hoàn tiền",
      actionUrl,
      dueAt: booking.cancelledAt || refund.createdAt || null,
      isOverdue: false,
      createdAt: refund.createdAt || null,
      metadata: buildBookingMetadata(booking, {
        refundId: id,
        refundAmount: amount,
        refundStatus: refund.status,
      }),
    });
  });

  cars.forEach((car) => {
    const carId = idOf(car._id);
    if (car.status !== CarStatusEnum.REJECTED) return;

    tasks.push({
      id: `CAR_REJECTED_NEEDS_UPDATE:${carId}`,
      type: "CAR_REJECTED_NEEDS_UPDATE",
      summaryKey: owner.context === "business" ? "rejectedCars" : "consignmentRejectedCars",
      context: owner.context,
      group: "ACTION_REQUIRED",
      priority: "MEDIUM",
      title: owner.context === "business" ? "Xe doanh nghiá»‡p bá»‹ tá»« chá»‘i" : "Xe kÃ½ gá»­i bá»‹ tá»« chá»‘i",
      description: car.name || "Xe BQDrive",
      detail: car.rejectReason || "Vui lÃ²ng cáº­p nháº­t thÃ´ng tin xe trÆ°á»›c khi gá»­i duyá»‡t láº¡i.",
      entityType: "CAR",
      entityId: carId,
      carId,
      actionKey: "edit-car",
      actionLabel: "Sửa xe",
      actionUrl: owner.context === "business" ? `/business/cars?carId=${carId}` : `/consignment/cars?carId=${carId}`,
      createdAt: car.createdAt || null,
      metadata: {
        carName: car.name,
        licensePlate: car.licensePlate,
        carImage: Array.isArray(car.images) ? car.images.find(Boolean) || "" : "",
      },
    });
  });

  bookings.forEach((booking: any) => {
    const id = idOf(booking._id);
    const status = booking.status as BookingStatusEnum;
    const metadata = buildBookingMetadata(booking, {
      renterName: booking.userId?.name || booking.renterInfo?.fullName || "",
      renterEmail: booking.userId?.email || booking.renterInfo?.email || "",
    });

    if (OWNER_REVIEW_STATUSES.includes(status)) {
      tasks.push({
        id: `BOOKING_APPROVAL_REQUIRED:${id}`,
        type: "BOOKING_APPROVAL_REQUIRED",
        summaryKey: owner.context === "business" ? "newBookingRequests" : "consignmentBookingRequests",
        context: owner.context,
        group: "ACTION_REQUIRED",
        priority: "MEDIUM",
        title: "Booking cần xác nhận",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "KhÃ¡ch vá»«a gá»­i yÃªu cáº§u thuÃª xe, báº¡n cáº§n xÃ¡c nháº­n hoáº·c tá»« chá»‘i.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "approve-booking",
        actionLabel: "Xử lý booking",
        actionUrl: ownerActionUrl(owner.context, id, "confirm"),
        dueAt: booking.startDate || null,
        isOverdue: isOverdue(booking.startDate),
        createdAt: booking.createdAt || null,
        metadata,
      });
    }

    if (HANDOVER_STATUSES.includes(status)) {
      tasks.push({
        id: `HANDOVER_REQUIRED:${id}`,
        type: "HANDOVER_REQUIRED",
        summaryKey: owner.context === "business" ? "paidAwaitingHandover" : "consignmentPaidAwaitingHandover",
        context: owner.context,
        group: "ACTION_REQUIRED",
        priority: isDueSoon(booking.startDate, 720) || isOverdue(booking.startDate) ? "HIGH" : "MEDIUM",
        title: "Cần bàn giao xe",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Booking Ä‘Ã£ Ä‘á»§ Ä‘iá»u kiá»‡n bÃ n giao, hÃ£y chuáº©n bá»‹ xe Ä‘Ãºng lá»‹ch.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "handover",
        actionLabel: "Xử lý bàn giao",
        actionUrl: ownerActionUrl(owner.context, id, "handover"),
        dueAt: booking.startDate || null,
        isOverdue: isOverdue(booking.startDate),
        createdAt: booking.createdAt || null,
        metadata,
      });
    }

    if (pendingCashByBooking.has(id)) {
      tasks.push({
        id: `CASH_PAYMENT_CONFIRMATION_REQUIRED:${id}`,
        type: "CASH_PAYMENT_CONFIRMATION_REQUIRED",
        summaryKey: owner.context === "business" ? "cashConfirmationRequired" : "consignmentCashConfirmationRequired",
        context: owner.context,
        group: "ACTION_REQUIRED",
        priority: "HIGH",
        title: "Cáº§n xÃ¡c nháº­n Ä‘Ã£ nháº­n tiá»n máº·t",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "CÃ³ giao dá»‹ch tiá»n máº·t Ä‘ang chá» chá»§ xe xÃ¡c nháº­n.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "confirm-cash",
        actionLabel: "XÃ¡c nháº­n Ä‘Ã£ thu",
        actionUrl: ownerActionUrl(owner.context, id, "confirm-remaining"),
        dueAt: booking.startDate || null,
        isOverdue: isOverdue(booking.startDate),
        createdAt: booking.createdAt || null,
        metadata,
      });
    }

    if (status === BookingStatusEnum.IN_PROGRESS) {
      const overdue = isOverdue(booking.endDate);
      tasks.push({
        id: `RECEIVE_RETURN_REQUIRED:${id}`,
        type: "RECEIVE_RETURN_REQUIRED",
        summaryKey: owner.context === "business" ? "inProgressNeedReceiveReturn" : "consignmentInProgressNeedReceiveReturn",
        context: owner.context,
        group: "ACTION_REQUIRED",
        priority: overdue ? "HIGH" : "MEDIUM",
        title: overdue ? "Xe đã quá hạn trả" : "Cần tiếp nhận xe trả",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: overdue
          ? "Xe đã quá thời gian dự kiến trả, hãy liên hệ khách và tiếp nhận xe."
          : "Chuyến thuê đang diễn ra. Khi khách trả xe, hãy tiếp nhận và kiểm tra sau thuê.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "receive-return",
        actionLabel: "Tiếp nhận xe trả",
        actionUrl: ownerActionUrl(owner.context, id, "return-inspection"),
        dueAt: booking.endDate || null,
        isOverdue: overdue,
        createdAt: booking.createdAt || null,
        metadata,
      });
    }

    if (
      [BookingStatusEnum.RETURN_INSPECTION, BookingStatusEnum.AWAITING_EXTRA_CHARGE].includes(
        status,
      )
    ) {
      const inspection = inspectionByBooking.get(id);
      const pendingChargeCount = pendingChargeByBooking.get(id) || 0;
      const remainingAmount = Number(booking.remainingAmount || 0);

      if (pendingChargeCount > 0) {
        tasks.push({
          id: `WAITING_EXTRA_CHARGE_PAYMENT:${id}`,
          type: "WAITING_EXTRA_CHARGE_PAYMENT",
          summaryKey: owner.context === "business" ? "ownerPendingExtraCharges" : "consignmentPendingExtraCharges",
          context: owner.context,
          group: "WAITING",
          priority: "MEDIUM",
          title: "Đang chờ khách xử lý phí phát sinh",
          description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
          detail: "Booking cÃ³ phÃ­ phÃ¡t sinh Ä‘ang chá» khÃ¡ch thanh toÃ¡n hoáº·c chá»§ xe xÃ¡c nháº­n thu.",
          entityType: "BOOKING",
          entityId: id,
          bookingId: id,
          carId: idOf(getCar(booking)?._id),
          actionKey: "extra-charge",
          actionLabel: "Xem phí",
          actionUrl: ownerActionUrl(owner.context, id, "extra-charge"),
          dueAt: booking.endDate || null,
          isOverdue: isOverdue(booking.endDate),
          createdAt: booking.createdAt || null,
          metadata: buildBookingMetadata(booking, { pendingExtraChargeCount: pendingChargeCount }),
        });
        return;
      }

      if (inspection?.inspectionStatus === ReturnInspectionStatusEnum.CLEARED) {
        if (remainingAmount <= 0) {
          tasks.push({
            id: `COMPLETE_BOOKING_REQUIRED:${id}`,
            type: "COMPLETE_BOOKING_REQUIRED",
            summaryKey: owner.context === "business" ? "completeBookingRequired" : "consignmentCompleteBookingRequired",
            context: owner.context,
            group: "ACTION_REQUIRED",
            priority: "HIGH",
            title: "Booking sẵn sàng hoàn tất",
            description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
            detail: "Xe Ä‘Ã£ kiá»ƒm tra xong, khÃ´ng cÃ²n tiá»n hoáº·c phÃ­ chá» xá»­ lÃ½.",
            entityType: "BOOKING",
            entityId: id,
            bookingId: id,
            carId: idOf(getCar(booking)?._id),
            actionKey: "complete-booking",
            actionLabel: "Hoàn tất booking",
            actionUrl: ownerActionUrl(owner.context, id, "complete"),
            dueAt: booking.endDate || null,
            isOverdue: isOverdue(booking.endDate),
            createdAt: booking.createdAt || null,
            metadata,
          });
        } else {
          tasks.push({
            id: `WAITING_REMAINING_PAYMENT:${id}`,
            type: "WAITING_REMAINING_PAYMENT",
            summaryKey: owner.context === "business" ? "approvedAwaitingPayment" : "consignmentAwaitingPayment",
            context: owner.context,
            group: "WAITING",
            priority: "MEDIUM",
            title: "Đang chờ khách thanh toán phần còn lại",
            description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
            detail: "Booking Ä‘Ã£ kiá»ƒm tra xong nhÆ°ng khÃ¡ch cÃ²n sá»‘ tiá»n thuÃª chÆ°a thanh toÃ¡n.",
            entityType: "BOOKING",
            entityId: id,
            bookingId: id,
            carId: idOf(getCar(booking)?._id),
            actionKey: "view-booking",
            actionLabel: "Xem booking",
            actionUrl: ownerActionUrl(owner.context, id, "view-booking"),
            dueAt: booking.endDate || null,
            isOverdue: isOverdue(booking.endDate),
            createdAt: booking.createdAt || null,
            metadata,
          });
        }
        return;
      }

      tasks.push({
        id: `RETURN_INSPECTION_REQUIRED:${id}`,
        type: "RETURN_INSPECTION_REQUIRED",
        summaryKey: owner.context === "business" ? "returnInspectionPending" : "consignmentReturnInspectionPending",
        context: owner.context,
        group: "ACTION_REQUIRED",
        priority: "MEDIUM",
        title: "Cần kiỒm tra xe sau thuê",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Xe Ä‘Ã£ Ä‘Æ°á»£c tiáº¿p nháº­n vÃ  Ä‘ang chá» báº¡n kiá»ƒm tra tÃ¬nh tráº¡ng sau thuÃª.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "return-inspection",
        actionLabel: "KiỒm tra xe",
        actionUrl: ownerActionUrl(owner.context, id, "return-inspection"),
        dueAt: booking.endDate || null,
        isOverdue: isOverdue(booking.endDate),
        createdAt: booking.createdAt || null,
        metadata,
      });
    }

    if (
      [
        BookingStatusEnum.OWNER_APPROVED,
        BookingStatusEnum.PAYMENT_PENDING,
        BookingStatusEnum.WAITING_PAYMENT,
      ].includes(status)
    ) {
      tasks.push({
        id: `WAITING_CUSTOMER_PAYMENT:${id}`,
        type: "WAITING_CUSTOMER_PAYMENT",
        summaryKey: "approvedAwaitingPayment",
        context: owner.context,
        group: "WAITING",
        priority: "LOW",
        title: "Đang chờ khách thanh toán",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Chá»§ xe Ä‘Ã£ duyá»‡t booking, hiá»‡n Ä‘ang chá» ngÆ°á»i thuÃª thanh toÃ¡n.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "view-booking",
        actionLabel: "Xem booking",
        actionUrl: ownerActionUrl(owner.context, id, "view-booking"),
        dueAt: booking.startDate || null,
        isOverdue: isOverdue(booking.startDate),
        createdAt: booking.createdAt || null,
        metadata,
      });
    }
  });

  return tasks;
}

async function getCustomerTasks(userId: string) {
  const tasks: ActionCenterTask[] = [];
  const bookings = await BookingModel.find({
    userId: userId as any,
    isDeleted: false,
    status: { $nin: TERMINAL_BOOKING_STATUSES },
  } as any)
    .populate("carId", "name licensePlate images")
    .populate("businessId", "businessName")
    .populate("ownerId", "name businessName")
    .sort({ createdAt: -1 })
    .lean();
  const bookingIds = bookings.map((booking) => booking._id);
  const [pendingCharges, refundBookings] = await Promise.all([
    ExtraChargeModel.find({
      bookingId: { $in: bookingIds },
      renterId: userId as any,
      status: ExtraChargeStatusEnum.PENDING,
      isDeleted: false,
    } as any).lean(),
    BookingModel.find({
      userId: userId as any,
      isDeleted: false,
      status: BookingStatusEnum.CANCELLED,
    } as any)
      .populate("carId", "name licensePlate images")
      .populate("businessId", "businessName")
      .populate("ownerId", "name businessName")
      .sort({ updatedAt: -1 })
      .lean(),
  ]);
  const refundBookingById = new Map(
    refundBookings.map((booking) => [idOf(booking._id), booking]),
  );
  const renterRefunds = await RefundModel.find({
    bookingId: { $in: refundBookings.map((booking) => booking._id) },
    status: {
      $in: [
        RefundStatusEnum.WAITING_FOR_REFUND_INFO,
        RefundStatusEnum.MANUAL_REQUIRED,
        RefundStatusEnum.PROCESSING,
      ],
    },
    isDeleted: false,
  } as any).lean();
  const pendingChargeByBooking = new Map<string, { count: number; amount: number }>();

  pendingCharges.forEach((charge) => {
    const key = idOf(charge.bookingId);
    const current = pendingChargeByBooking.get(key) || { count: 0, amount: 0 };
    pendingChargeByBooking.set(key, {
      count: current.count + 1,
      amount: current.amount + Number(charge.amount || 0),
    });
  });

  renterRefunds.forEach((refund: any) => {
    const booking = refundBookingById.get(idOf(refund.bookingId));
    if (!booking) return;

    const id = idOf(refund._id);
    const bookingId = idOf(booking._id);
    const amount = Number(refund.refundAmount || 0);
    const needsRecipientInfo =
      refund.status === RefundStatusEnum.WAITING_FOR_REFUND_INFO;
    const waitingOwner = refund.status === RefundStatusEnum.MANUAL_REQUIRED;
    const needsConfirmation = refund.status === RefundStatusEnum.PROCESSING;

    tasks.push({
      id: `${needsRecipientInfo ? "REFUND_RECIPIENT_INFO_REQUIRED" : waitingOwner ? "WAITING_REFUND_FROM_OWNER" : "REFUND_CONFIRMATION_REQUIRED"}:${id}`,
      type: needsRecipientInfo
        ? "REFUND_RECIPIENT_INFO_REQUIRED"
        : waitingOwner
          ? "WAITING_REFUND_FROM_OWNER"
          : "REFUND_CONFIRMATION_REQUIRED",
      summaryKey: needsRecipientInfo
        ? "refundRecipientInfoRequired"
        : waitingOwner
          ? "waitingRefundFromOwner"
          : "refundConfirmationRequired",
      context: "customer",
      group: waitingOwner ? "WAITING" : "ACTION_REQUIRED",
      priority: waitingOwner ? "LOW" : "HIGH",
      title: needsRecipientInfo
        ? "Cung cấp thông tin nhận tiền hoàn"
        : waitingOwner
          ? "Đang chờ chủ xe hoàn tiền"
          : "Xác nhận đã nhận tiền hoàn",
      description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
      detail: needsRecipientInfo
        ? `Vui lòng cung cấp thông tin để nhận khoản hoàn ${amount.toLocaleString("vi-VN")}đ.`
        : waitingOwner
          ? `Chủ xe cần hoàn ${amount.toLocaleString("vi-VN")}đ cho booking đã hủy.`
          : `Chủ xe đã báo hoàn ${amount.toLocaleString("vi-VN")}đ, vui lòng xác nhận khi bạn đã nhận tiền.`,
      entityType: "REFUND",
      entityId: id,
      bookingId,
      carId: idOf(getCar(booking)?._id),
      actionKey: needsRecipientInfo
        ? "recipient-info"
        : needsConfirmation
          ? "confirm-refund"
          : "view-refund",
      actionLabel: needsRecipientInfo
        ? "Cung cấp thông tin"
        : waitingOwner
          ? "Xem hoàn tiền"
          : "Xác nhận đã nhận",
      actionUrl: `/bookings/${bookingId}?section=refund`,
      dueAt: refund.createdAt || booking.cancelledAt || null,
      isOverdue: false,
      createdAt: refund.createdAt || null,
      metadata: buildBookingMetadata(booking, {
        refundId: id,
        refundAmount: amount,
        refundStatus: refund.status,
      }),
    });
  });

  bookings.forEach((booking: any) => {
    const id = idOf(booking._id);
    const status = booking.status as BookingStatusEnum;
    const remainingAmount = Number(booking.remainingAmount || 0);
    const paidAmount = Number(booking.paidAmount || 0);
    const metadata = buildBookingMetadata(booking, {
      ownerName:
        booking.businessId?.businessName ||
        booking.ownerId?.businessName ||
        booking.ownerId?.name ||
        "",
    });

    if (
      [
        BookingStatusEnum.OWNER_APPROVED,
        BookingStatusEnum.PAYMENT_PENDING,
        BookingStatusEnum.WAITING_PAYMENT,
        BookingStatusEnum.CONFIRMED,
      ].includes(status) &&
      paidAmount <= 0
    ) {
      tasks.push({
        id: `BOOKING_PAYMENT_REQUIRED:${id}`,
        type: "BOOKING_PAYMENT_REQUIRED",
        summaryKey: "bookingOwnerApproved",
        context: "customer",
        group: "ACTION_REQUIRED",
        priority: "HIGH",
        title: "Booking Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t, cáº§n thanh toÃ¡n",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Chá»§ xe Ä‘Ã£ Ä‘á»“ng Ã½ cho thuÃª. Báº¡n cáº§n thanh toÃ¡n Ä‘á»ƒ giá»¯ lá»‹ch thuÃª.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "remaining-payment",
        actionLabel: "Thanh toán ngay",
        actionUrl: `/bookings/${id}?action=payment`,
        dueAt: booking.startDate || null,
        isOverdue: isOverdue(booking.startDate),
        createdAt: booking.createdAt || null,
        metadata,
      });
    } else if (
      remainingAmount > 0 &&
      paidAmount > 0 &&
      PAYMENT_ALLOWED_STATUSES.includes(status)
    ) {
      tasks.push({
        id: `REMAINING_PAYMENT_REQUIRED:${id}`,
        type: "REMAINING_PAYMENT_REQUIRED",
        summaryKey: "remainingPaymentDue",
        context: "customer",
        group: "ACTION_REQUIRED",
        priority: "HIGH",
        title: "Cần thanh toán phần còn lại",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: `Sá»‘ tiá»n cÃ²n pháº£i thanh toÃ¡n: ${remainingAmount.toLocaleString("vi-VN")}Ä‘.`,
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "remaining-payment",
        actionLabel: "Tiếp tục thanh toán",
        actionUrl: `/bookings/${id}?action=payment`,
        dueAt: booking.startDate || null,
        isOverdue: isOverdue(booking.startDate),
        createdAt: booking.createdAt || null,
        metadata,
      });
    }

    const chargeSummary = pendingChargeByBooking.get(id);
    if (chargeSummary) {
      tasks.push({
        id: `EXTRA_CHARGE_PAYMENT_REQUIRED:${id}`,
        type: "EXTRA_CHARGE_PAYMENT_REQUIRED",
        summaryKey: "renterPendingExtraCharges",
        context: "customer",
        group: "ACTION_REQUIRED",
        priority: "HIGH",
        title: "Có phí phát sinh cần xử lý",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: `Báº¡n cÃ³ ${chargeSummary.count} khoáº£n phÃ­ phÃ¡t sinh Ä‘ang chá» xá»­ lÃ½.`,
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "extra-charge",
        actionLabel: "Xem phí phát sinh",
        actionUrl: `/bookings/${id}?section=extra-charge`,
        dueAt: booking.endDate || null,
        isOverdue: isOverdue(booking.endDate),
        createdAt: booking.createdAt || null,
        metadata: { ...metadata, pendingExtraChargeAmount: chargeSummary.amount },
      });
    }

    if (status === BookingStatusEnum.IN_PROGRESS) {
      const overdue = isOverdue(booking.endDate);
      if (overdue || isDueSoon(booking.endDate)) {
        tasks.push({
          id: `${overdue ? "RETURN_OVERDUE" : "RETURN_DUE_SOON"}:${id}`,
          type: overdue ? "RETURN_OVERDUE" : "RETURN_DUE_SOON",
          summaryKey: "returnDueSoon",
          context: "customer",
          group: "ACTION_REQUIRED",
          priority: overdue ? "HIGH" : "MEDIUM",
          title: overdue ? "ÄÃ£ quÃ¡ háº¡n tráº£ xe" : "Sáº¯p Ä‘áº¿n háº¡n tráº£ xe",
          description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
          detail: overdue
            ? "Booking Ä‘Ã£ quÃ¡ thá»i gian tráº£ xe dá»± kiáº¿n."
            : "Chuyáº¿n thuÃª sáº¯p Ä‘áº¿n háº¡n tráº£ xe trong 30 phÃºt.",
          entityType: "BOOKING",
          entityId: id,
          bookingId: id,
          carId: idOf(getCar(booking)?._id),
          actionKey: "view-booking",
          actionLabel: "Xem thông tin trả xe",
          actionUrl: `/bookings/${id}?section=return`,
          dueAt: booking.endDate || null,
          isOverdue: overdue,
          createdAt: booking.createdAt || null,
          metadata,
        });
      } else {
        tasks.push({
          id: `ACTIVE_TRIP:${id}`,
          type: "ACTIVE_TRIP",
          summaryKey: "activeTrips",
          context: "customer",
          group: "WAITING",
          priority: "LOW",
          title: "Chuyáº¿n thuÃª Ä‘ang diá»…n ra",
          description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
          detail: "Báº¡n Ä‘ang trong thá»i gian thuÃª xe. HÃ£y theo dÃµi lá»‹ch tráº£ xe.",
          entityType: "BOOKING",
          entityId: id,
          bookingId: id,
          carId: idOf(getCar(booking)?._id),
          actionKey: "view-booking",
          actionLabel: "Xem chuyến thuê",
          actionUrl: `/bookings/${id}`,
          dueAt: booking.endDate || null,
          isOverdue: false,
          createdAt: booking.createdAt || null,
          metadata,
        });
      }
    }

    if (
      [BookingStatusEnum.REQUESTED, BookingStatusEnum.PENDING].includes(status)
    ) {
      tasks.push({
        id: `WAITING_OWNER_APPROVAL:${id}`,
        type: "WAITING_OWNER_APPROVAL",
        summaryKey: "bookingWaitingOwner",
        context: "customer",
        group: "WAITING",
        priority: "LOW",
        title: "Äang chá» chá»§ xe duyá»‡t",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "YÃªu cáº§u thuÃª xe Ä‘Ã£ gá»­i vÃ  Ä‘ang chá» chá»§ xe pháº£n há»“i.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "view-booking",
        actionLabel: "Xem booking",
        actionUrl: `/bookings/${id}`,
        dueAt: booking.startDate || null,
        isOverdue: isOverdue(booking.startDate),
        createdAt: booking.createdAt || null,
        metadata,
      });
    }

    if (
      [BookingStatusEnum.RETURN_INSPECTION, BookingStatusEnum.AWAITING_EXTRA_CHARGE].includes(
        status,
      )
    ) {
      tasks.push({
        id: `WAITING_OWNER_INSPECTION:${id}`,
        type: "WAITING_OWNER_INSPECTION",
        summaryKey: "ownerInspectingReturn",
        context: "customer",
        group: "WAITING",
        priority: "LOW",
        title: "Chá»§ xe Ä‘ang kiá»ƒm tra xe",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Xe Ä‘Ã£ Ä‘Æ°á»£c tráº£ vÃ  Ä‘ang trong bÆ°á»›c kiá»ƒm tra sau thuÃª.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "view-booking",
        actionLabel: "Xem booking",
        actionUrl: `/bookings/${id}`,
        dueAt: booking.endDate || null,
        isOverdue: isOverdue(booking.endDate),
        createdAt: booking.createdAt || null,
        metadata,
      });
    }
  });

  const completedBookingIds = await BookingModel.distinct("_id", {
    userId: userId as any,
    isDeleted: false,
    status: BookingStatusEnum.COMPLETED,
  } as any);
  const reviewedBookingIds = await ReviewModel.distinct("bookingId", {
    bookingId: { $in: completedBookingIds },
    renterId: userId as any,
  } as any);
  const reviewed = new Set(reviewedBookingIds.map(idOf));
  const reviewBookings = await BookingModel.find({
    _id: { $in: completedBookingIds.filter((id) => !reviewed.has(idOf(id))) },
  } as any)
    .populate("carId", "name licensePlate images")
    .sort({ updatedAt: -1 })
    .lean();

  reviewBookings.forEach((booking: any) => {
    const id = idOf(booking._id);
    tasks.push({
      id: `REVIEW_REQUIRED:${id}`,
      type: "REVIEW_REQUIRED",
      summaryKey: "completedNeedReview",
      context: "customer",
      group: "ACTION_REQUIRED",
      priority: "LOW",
      title: "Chuyáº¿n thuÃª hoÃ n táº¥t, hÃ£y Ä‘á»ƒ láº¡i Ä‘Ã¡nh giÃ¡",
      description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
      detail: "ÄÃ¡nh giÃ¡ cá»§a báº¡n giÃºp BQDrive cáº£i thiá»‡n cháº¥t lÆ°á»£ng dá»‹ch vá»¥.",
      entityType: "BOOKING",
      entityId: id,
      bookingId: id,
      carId: idOf(getCar(booking)?._id),
      actionKey: "review",
      actionLabel: "Đánh giá chuyến thuê",
      actionUrl: `/bookings/${id}?action=review`,
      dueAt: null,
      isOverdue: false,
      createdAt: booking.updatedAt || booking.createdAt || null,
      metadata: buildBookingMetadata(booking),
    });
  });

  return tasks;
}

async function getAdminTasks() {
  const [pendingCars, pendingBusinesses, reportedReviews] = await Promise.all([
    CarModel.find({ isDeleted: false, status: CarStatusEnum.PENDING })
      .select("_id name licensePlate images createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    BusinessModel.find({
      isDeleted: false,
      isApproved: false,
      isRejected: { $ne: true },
    })
      .select("_id businessName phone createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    ReviewModel.find({ status: ReviewStatusEnum.REPORTED })
      .select("_id comment createdAt carNameSnapshot reviewerNameSnapshot")
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const tasks: ActionCenterTask[] = [];

  pendingCars.forEach((car) => {
    const id = idOf(car._id);
    tasks.push({
      id: `CAR_APPROVAL_REQUIRED:${id}`,
      type: "CAR_APPROVAL_REQUIRED",
      summaryKey: "pendingCars",
      context: "admin",
      group: "ACTION_REQUIRED",
      priority: "MEDIUM",
      title: "Xe chờ kiểm duyệt",
      description: car.name || "Xe BQDrive",
      detail: "Admin cần kiểm tra hồ sơ xe trước khi hiển thị trên hệ thống.",
      entityType: "CAR",
      entityId: id,
      carId: id,
      actionKey: "approve-car",
      actionLabel: "Duyệt xe",
      actionUrl: `/admin/cars?carId=${id}&action=detail`,
      createdAt: car.createdAt || null,
      metadata: {
        carName: car.name,
        licensePlate: car.licensePlate,
        carImage: Array.isArray(car.images) ? car.images.find(Boolean) || "" : "",
      },
    });
  });

  pendingBusinesses.forEach((business) => {
    const id = idOf(business._id);
    tasks.push({
      id: `BUSINESS_APPROVAL_REQUIRED:${id}`,
      type: "BUSINESS_APPROVAL_REQUIRED",
      summaryKey: "pendingBusiness",
      context: "admin",
      group: "ACTION_REQUIRED",
      priority: "MEDIUM",
      title: "Doanh nghiệp chờ duyệt",
      description: business.businessName || "Doanh nghiệp BQDrive",
      detail: "Admin cần kiểm tra hồ sơ doanh nghiệp.",
      entityType: "BUSINESS",
      entityId: id,
      actionKey: "approve-business",
      actionLabel: "Xem doanh nghiệp",
      actionUrl: `/admin/businesses?businessId=${id}`,
      createdAt: business.createdAt || null,
      metadata: { businessName: business.businessName, phone: business.phone },
    });
  });

  reportedReviews.forEach((review) => {
    const id = idOf(review._id);
    tasks.push({
      id: `REVIEW_REPORT_REQUIRED:${id}`,
      type: "REVIEW_REPORT_REQUIRED",
      summaryKey: "reportedReviews",
      context: "admin",
      group: "ACTION_REQUIRED",
      priority: "LOW",
      title: "Đánh giá bị báo cáo",
      description: review.carNameSnapshot || "Đánh giá xe",
      detail: review.comment || "Có đánh giá cần admin xem xét nội dung.",
      entityType: "REVIEW",
      entityId: id,
      actionKey: "review-report",
      actionLabel: "Xem đánh giá",
      actionUrl: "/admin/reviews",
      createdAt: review.createdAt || null,
      metadata: { reviewerName: review.reviewerNameSnapshot },
    });
  });

  return tasks;
}

function buildResult(tasks: ActionCenterTask[]): ActionCenterResult {
  const normalizedTasks = dedupe(tasks).sort(taskSort);

  return {
    summary: {
      actionRequiredCount: normalizedTasks.filter(
        (task) => task.group === "ACTION_REQUIRED",
      ).length,
      waitingCount: normalizedTasks.filter((task) => task.group === "WAITING").length,
      highPriorityCount: normalizedTasks.filter(
        (task) => task.priority === "HIGH" && task.group === "ACTION_REQUIRED",
      ).length,
      totalCount: normalizedTasks.length,
    },
    tasks: normalizedTasks,
  };
}

function toSummaryItems(tasks: ActionCenterTask[]) {
  const byKey = new Map<string, ActionCenterTask[]>();

  tasks
    .filter((task) => task.group === "ACTION_REQUIRED")
    .forEach((task) => {
      byKey.set(task.summaryKey, [...(byKey.get(task.summaryKey) || []), task]);
    });

  return Array.from(byKey.entries()).flatMap(([key, items]) => {
    const first = items.sort(taskSort)[0];
    if (!first) return [];
    const severity =
      first.priority === "HIGH"
        ? "danger"
        : first.priority === "MEDIUM"
          ? "warning"
          : "success";

    return {
      key,
      label: first.title,
      count: items.length,
      path: first.actionUrl,
      severity,
    };
  });
}

type NotificationSummaryItem = {
  key: string;
  label: string;
  count: number;
  path: string;
  severity: "success" | "warning" | "danger";
};

type NotificationSummaryPayload = {
  total: number;
  actionRequiredCount: number;
  waitingCount: number;
  highPriorityCount: number;
  items: NotificationSummaryItem[];
};

type SummaryCounter = {
  actionRequiredCount: number;
  waitingCount: number;
  highPriorityCount: number;
  items: NotificationSummaryItem[];
};

const EMPTY_COUNTER: SummaryCounter = {
  actionRequiredCount: 0,
  waitingCount: 0,
  highPriorityCount: 0,
  items: [],
};

const SUMMARY_DEFINITIONS: Record<
  string,
  { label: string; path: string; severity: "success" | "warning" | "danger" }
> = {
  pendingCars: {
    label: "Xe chờ kiểm duyệt",
    path: "/admin/cars",
    severity: "warning",
  },
  pendingBusiness: {
    label: "Doanh nghiệp chờ duyệt",
    path: "/admin/businesses",
    severity: "warning",
  },
  reportedReviews: {
    label: "Đánh giá bị báo cáo",
    path: "/admin/reviews",
    severity: "success",
  },
  rejectedCars: {
    label: "Xe bị từ chối",
    path: "/business/cars",
    severity: "warning",
  },
  consignmentRejectedCars: {
    label: "Xe ký gửi bị từ chối",
    path: "/consignment/cars",
    severity: "warning",
  },
  newBookingRequests: {
    label: "Booking cần xác nhận",
    path: "/business/bookings",
    severity: "warning",
  },
  consignmentBookingRequests: {
    label: "Booking xe ký gửi cần xác nhận",
    path: "/consignment/bookings",
    severity: "warning",
  },
  paidAwaitingHandover: {
    label: "Cần bàn giao xe",
    path: "/business/bookings",
    severity: "warning",
  },
  consignmentPaidAwaitingHandover: {
    label: "Cần bàn giao xe ký gửi",
    path: "/consignment/bookings",
    severity: "warning",
  },
  cashConfirmationRequired: {
    label: "Cần xác nhận đã nhận tiền mặt",
    path: "/business/bookings",
    severity: "danger",
  },
  consignmentCashConfirmationRequired: {
    label: "Cần xác nhận tiền mặt xe ký gửi",
    path: "/consignment/bookings",
    severity: "danger",
  },
  inProgressNeedReceiveReturn: {
    label: "Cần tiếp nhận xe trả",
    path: "/business/bookings",
    severity: "warning",
  },
  consignmentInProgressNeedReceiveReturn: {
    label: "Cần tiếp nhận xe ký gửi trả",
    path: "/consignment/bookings",
    severity: "warning",
  },
  returnInspectionPending: {
    label: "Cần kiểm tra xe sau thuê",
    path: "/business/bookings",
    severity: "warning",
  },
  consignmentReturnInspectionPending: {
    label: "Cần kiểm tra xe ký gửi sau thuê",
    path: "/consignment/bookings",
    severity: "warning",
  },
  completeBookingRequired: {
    label: "Booking sẵn sàng hoàn tất",
    path: "/business/bookings",
    severity: "danger",
  },
  consignmentCompleteBookingRequired: {
    label: "Booking xe ký gửi sẵn sàng hoàn tất",
    path: "/consignment/bookings",
    severity: "danger",
  },
  bookingOwnerApproved: {
    label: "Booking đã được duyệt, cần thanh toán",
    path: "/tasks",
    severity: "danger",
  },
  remainingPaymentDue: {
    label: "Cần thanh toán phần còn lại",
    path: "/tasks",
    severity: "danger",
  },
  renterPendingExtraCharges: {
    label: "Có phí phát sinh cần xử lý",
    path: "/tasks",
    severity: "danger",
  },
  ownerPendingExtraCharges: {
    label: "Phí phát sinh chờ khách xử lý",
    path: "/business/bookings",
    severity: "warning",
  },
  consignmentPendingExtraCharges: {
    label: "Phí phát sinh xe ký gửi chờ xử lý",
    path: "/consignment/bookings",
    severity: "warning",
  },
  ownerManualRefundRequired: {
    label: "Hoàn tiền cần xử lý",
    path: "/business/refunds",
    severity: "danger",
  },
  consignmentOwnerManualRefundRequired: {
    label: "Hoàn tiền xe ký gửi cần xử lý",
    path: "/consignment/refunds",
    severity: "danger",
  },
  ownerRefundWaitingInfo: {
    label: "Chờ người thuê cung cấp thông tin nhận tiền",
    path: "/business/refunds",
    severity: "warning",
  },
  consignmentOwnerRefundWaitingInfo: {
    label: "Chờ người thuê cung cấp thông tin nhận tiền xe ký gửi",
    path: "/consignment/refunds",
    severity: "warning",
  },
  ownerRefundWaitingRenter: {
    label: "Chờ khách xác nhận hoàn tiền",
    path: "/business/refunds",
    severity: "warning",
  },
  consignmentOwnerRefundWaitingRenter: {
    label: "Chờ khách xác nhận hoàn tiền xe ký gửi",
    path: "/consignment/refunds",
    severity: "warning",
  },
  refundRecipientInfoRequired: {
    label: "Cung cấp thông tin nhận tiền hoàn",
    path: "/tasks",
    severity: "danger",
  },
  waitingRefundFromOwner: {
    label: "Chờ chủ xe hoàn tiền",
    path: "/tasks",
    severity: "warning",
  },
  refundConfirmationRequired: {
    label: "Xác nhận đã nhận tiền hoàn",
    path: "/tasks",
    severity: "danger",
  },
  returnDueSoon: {
    label: "Sắp đến hạn trả xe",
    path: "/tasks",
    severity: "warning",
  },
  completedNeedReview: {
    label: "Chuyến thuê hoàn tất, hãy để lại đánh giá",
    path: "/tasks",
    severity: "success",
  },
};

function summaryItem(key: string, count: number): NotificationSummaryItem | null {
  if (count <= 0) return null;
  const definition = SUMMARY_DEFINITIONS[key];
  if (!definition) return null;

  return {
    key,
    label: definition.label,
    count,
    path: definition.path,
    severity: definition.severity,
  };
}

function compactCounter(counter: SummaryCounter): SummaryCounter {
  const items = counter.items.filter((item) => item.count > 0);

  return {
    actionRequiredCount: items.reduce((sum, item) => sum + item.count, 0),
    waitingCount: counter.waitingCount,
    highPriorityCount: counter.highPriorityCount,
    items,
  };
}

function mergeCounters(counters: SummaryCounter[]): NotificationSummaryPayload {
  const mergedItems = new Map<string, NotificationSummaryItem>();
  let waitingCount = 0;
  let highPriorityCount = 0;

  counters.forEach((counter) => {
    waitingCount += counter.waitingCount;
    highPriorityCount += counter.highPriorityCount;

    counter.items.forEach((item) => {
      const current = mergedItems.get(item.key);
      mergedItems.set(item.key, {
        ...item,
        count: (current?.count || 0) + item.count,
      });
    });
  });

  const items = Array.from(mergedItems.values()).filter((item) => item.count > 0);
  const actionRequiredCount = items.reduce((sum, item) => sum + item.count, 0);

  return {
    total: actionRequiredCount,
    actionRequiredCount,
    waitingCount,
    highPriorityCount,
    items,
  };
}

function firstAggregateCount(rows: Array<Record<string, unknown>>, key = "count") {
  return Number(rows[0]?.[key] || 0);
}

async function countOwnerCashConfirmationRequired(
  bookingMatch: Record<string, unknown>,
) {
  const rows = await BookingModel.aggregate([
    { $match: bookingMatch },
    {
      $lookup: {
        from: PaymentModel.collection.name,
        let: { bookingId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$bookingId", "$$bookingId"] },
              method: PaymentMethodEnum.CASH,
              status: PaymentStatusEnum.PENDING,
            },
          },
          { $limit: 1 },
        ],
        as: "pendingCashPayments",
      },
    },
    { $match: { "pendingCashPayments.0": { $exists: true } } },
    { $count: "count" },
  ]);

  return firstAggregateCount(rows);
}

async function countOwnerRefundWorkflow(bookingMatch: Record<string, unknown>) {
  const rows = await BookingModel.aggregate([
    { $match: bookingMatch },
    {
      $lookup: {
        from: RefundModel.collection.name,
        let: { bookingId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$bookingId", "$$bookingId"] },
              status: {
                $in: [
                  RefundStatusEnum.WAITING_FOR_REFUND_INFO,
                  RefundStatusEnum.MANUAL_REQUIRED,
                  RefundStatusEnum.PROCESSING,
                ],
              },
              isDeleted: false,
            },
          },
          { $project: { status: 1 } },
        ],
        as: "refunds",
      },
    },
    { $unwind: "$refunds" },
    {
      $group: {
        _id: null,
        manualRequired: {
          $sum: {
            $cond: [
              { $eq: ["$refunds.status", RefundStatusEnum.MANUAL_REQUIRED] },
              1,
              0,
            ],
          },
        },
        waitingForInfo: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$refunds.status",
                  RefundStatusEnum.WAITING_FOR_REFUND_INFO,
                ],
              },
              1,
              0,
            ],
          },
        },
        processing: {
          $sum: {
            $cond: [
              { $eq: ["$refunds.status", RefundStatusEnum.PROCESSING] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    manualRequired: firstAggregateCount(rows, "manualRequired"),
    waitingForInfo: firstAggregateCount(rows, "waitingForInfo"),
    processing: firstAggregateCount(rows, "processing"),
  };
}

async function countOwnerReturnWorkflow(bookingMatch: Record<string, unknown>) {
  const rows = await BookingModel.aggregate([
    {
      $match: {
        ...bookingMatch,
        status: {
          $in: [
            BookingStatusEnum.RETURN_INSPECTION,
            BookingStatusEnum.AWAITING_EXTRA_CHARGE,
          ],
        },
      },
    },
    {
      $lookup: {
        from: ExtraChargeModel.collection.name,
        let: { bookingId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$bookingId", "$$bookingId"] },
              status: ExtraChargeStatusEnum.PENDING,
              isDeleted: false,
            },
          },
        ],
        as: "pendingCharges",
      },
    },
    {
      $lookup: {
        from: ReturnInspectionModel.collection.name,
        let: { bookingId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$bookingId", "$$bookingId"] },
              isDeleted: false,
            },
          },
          { $project: { inspectionStatus: 1 } },
          { $limit: 1 },
        ],
        as: "inspection",
      },
    },
    {
      $project: {
        remainingAmount: 1,
        pendingChargeCount: { $size: "$pendingCharges" },
        inspectionStatus: { $arrayElemAt: ["$inspection.inspectionStatus", 0] },
      },
    },
    {
      $group: {
        _id: null,
        ownerPendingExtraCharges: {
          $sum: { $cond: [{ $gt: ["$pendingChargeCount", 0] }, 1, 0] },
        },
        completeBookingRequired: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$pendingChargeCount", 0] },
                  {
                    $eq: [
                      "$inspectionStatus",
                      ReturnInspectionStatusEnum.CLEARED,
                    ],
                  },
                  { $lte: ["$remainingAmount", 0] },
                ],
              },
              1,
              0,
            ],
          },
        },
        approvedAwaitingPayment: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$pendingChargeCount", 0] },
                  {
                    $eq: [
                      "$inspectionStatus",
                      ReturnInspectionStatusEnum.CLEARED,
                    ],
                  },
                  { $gt: ["$remainingAmount", 0] },
                ],
              },
              1,
              0,
            ],
          },
        },
        returnInspectionPending: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$pendingChargeCount", 0] },
                  {
                    $ne: [
                      "$inspectionStatus",
                      ReturnInspectionStatusEnum.CLEARED,
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    ownerPendingExtraCharges: firstAggregateCount(rows, "ownerPendingExtraCharges"),
    completeBookingRequired: firstAggregateCount(rows, "completeBookingRequired"),
    approvedAwaitingPayment: firstAggregateCount(rows, "approvedAwaitingPayment"),
    returnInspectionPending: firstAggregateCount(rows, "returnInspectionPending"),
  };
}

async function getOwnerSummaryCounter(
  owner: Awaited<ReturnType<typeof getBusinessOwner>> | ReturnType<typeof getConsignmentOwner>,
) {
  if (!owner) return EMPTY_COUNTER;

  const isConsignment = owner.context === "consignment";
  const now = new Date();
  const soon = new Date(Date.now() + 720 * 60 * 1000);
  const bookingMatch = owner.bookingFilter as Record<string, unknown>;
  const carMatch = owner.carFilter as Record<string, unknown>;
  const [
    rejectedCars,
    newBookingRequests,
    paidAwaitingHandover,
    paidAwaitingHandoverHigh,
    cashConfirmationRequired,
    inProgressNeedReceiveReturn,
    inProgressNeedReceiveReturnHigh,
    approvedAwaitingPaymentBase,
    returnWorkflow,
    refundWorkflow,
  ] = await Promise.all([
    CarModel.countDocuments({ ...carMatch, status: CarStatusEnum.REJECTED }),
    BookingModel.countDocuments({
      ...bookingMatch,
      status: { $in: OWNER_REVIEW_STATUSES },
    }),
    BookingModel.countDocuments({
      ...bookingMatch,
      status: { $in: HANDOVER_STATUSES },
    }),
    BookingModel.countDocuments({
      ...bookingMatch,
      status: { $in: HANDOVER_STATUSES },
      startDate: { $lte: soon },
    }),
    countOwnerCashConfirmationRequired(bookingMatch),
    BookingModel.countDocuments({
      ...bookingMatch,
      status: BookingStatusEnum.IN_PROGRESS,
    }),
    BookingModel.countDocuments({
      ...bookingMatch,
      status: BookingStatusEnum.IN_PROGRESS,
      endDate: { $lt: now },
    }),
    BookingModel.countDocuments({
      ...bookingMatch,
      status: {
        $in: [
          BookingStatusEnum.OWNER_APPROVED,
          BookingStatusEnum.PAYMENT_PENDING,
          BookingStatusEnum.WAITING_PAYMENT,
        ],
      },
    }),
    countOwnerReturnWorkflow(bookingMatch),
    countOwnerRefundWorkflow(bookingMatch),
  ]);
  const keyPrefix = isConsignment ? "consignment" : "";
  const key = (businessKey: string, consignmentKey: string) =>
    keyPrefix ? consignmentKey : businessKey;
  const approvedAwaitingPayment =
    approvedAwaitingPaymentBase + returnWorkflow.approvedAwaitingPayment;
  const items = [
    summaryItem(key("rejectedCars", "consignmentRejectedCars"), rejectedCars),
    summaryItem(
      key("newBookingRequests", "consignmentBookingRequests"),
      newBookingRequests,
    ),
    summaryItem(
      key("paidAwaitingHandover", "consignmentPaidAwaitingHandover"),
      paidAwaitingHandover,
    ),
    summaryItem(
      key("cashConfirmationRequired", "consignmentCashConfirmationRequired"),
      cashConfirmationRequired,
    ),
    summaryItem(
      key("inProgressNeedReceiveReturn", "consignmentInProgressNeedReceiveReturn"),
      inProgressNeedReceiveReturn,
    ),
    summaryItem(
      key("returnInspectionPending", "consignmentReturnInspectionPending"),
      returnWorkflow.returnInspectionPending,
    ),
    summaryItem(
      key("ownerPendingExtraCharges", "consignmentPendingExtraCharges"),
      returnWorkflow.ownerPendingExtraCharges,
    ),
    summaryItem(
      key("completeBookingRequired", "consignmentCompleteBookingRequired"),
      returnWorkflow.completeBookingRequired,
    ),
    summaryItem(
      key("ownerManualRefundRequired", "consignmentOwnerManualRefundRequired"),
      refundWorkflow.manualRequired,
    ),
    summaryItem(
      key("ownerRefundWaitingInfo", "consignmentOwnerRefundWaitingInfo"),
      refundWorkflow.waitingForInfo,
    ),
  ].filter(Boolean) as NotificationSummaryItem[];

  return compactCounter({
    actionRequiredCount: 0,
    waitingCount:
      returnWorkflow.ownerPendingExtraCharges +
      approvedAwaitingPayment +
      refundWorkflow.waitingForInfo +
      refundWorkflow.processing,
    highPriorityCount:
      paidAwaitingHandoverHigh +
      cashConfirmationRequired +
      inProgressNeedReceiveReturnHigh +
      returnWorkflow.completeBookingRequired +
      refundWorkflow.manualRequired,
    items,
  });
}

async function countCustomerRefundWorkflow(userId: string) {
  const rows = await BookingModel.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
        status: BookingStatusEnum.CANCELLED,
      },
    },
    {
      $lookup: {
        from: RefundModel.collection.name,
        let: { bookingId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$bookingId", "$$bookingId"] },
              status: {
                $in: [
                  RefundStatusEnum.WAITING_FOR_REFUND_INFO,
                  RefundStatusEnum.MANUAL_REQUIRED,
                  RefundStatusEnum.PROCESSING,
                ],
              },
              isDeleted: false,
            },
          },
          { $project: { status: 1 } },
        ],
        as: "refunds",
      },
    },
    { $unwind: "$refunds" },
    {
      $group: {
        _id: null,
        recipientInfoRequired: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$refunds.status",
                  RefundStatusEnum.WAITING_FOR_REFUND_INFO,
                ],
              },
              1,
              0,
            ],
          },
        },
        waitingOwner: {
          $sum: {
            $cond: [
              { $eq: ["$refunds.status", RefundStatusEnum.MANUAL_REQUIRED] },
              1,
              0,
            ],
          },
        },
        confirmationRequired: {
          $sum: {
            $cond: [
              { $eq: ["$refunds.status", RefundStatusEnum.PROCESSING] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    recipientInfoRequired: firstAggregateCount(rows, "recipientInfoRequired"),
    waitingOwner: firstAggregateCount(rows, "waitingOwner"),
    confirmationRequired: firstAggregateCount(rows, "confirmationRequired"),
  };
}

async function getCustomerSummaryCounter(userId: string) {
  const now = new Date();
  const dueSoon = new Date(Date.now() + RETURN_DUE_SOON_MINUTES * 60 * 1000);
  const [
    bookingOwnerApproved,
    remainingPaymentDue,
    renterPendingExtraChargesRows,
    returnDueSoon,
    returnOverdue,
    activeTrips,
    bookingWaitingOwner,
    ownerInspectingReturn,
    completedNeedReviewRows,
    refundWorkflow,
  ] = await Promise.all([
    BookingModel.countDocuments({
      userId: userId as unknown as mongoose.Types.ObjectId,
      isDeleted: false,
      status: {
        $in: [
          BookingStatusEnum.OWNER_APPROVED,
          BookingStatusEnum.PAYMENT_PENDING,
          BookingStatusEnum.WAITING_PAYMENT,
          BookingStatusEnum.CONFIRMED,
        ],
      },
      paidAmount: { $lte: 0 },
    }),
    BookingModel.countDocuments({
      userId: userId as unknown as mongoose.Types.ObjectId,
      isDeleted: false,
      status: { $in: PAYMENT_ALLOWED_STATUSES },
      paidAmount: { $gt: 0 },
      remainingAmount: { $gt: 0 },
    }),
    ExtraChargeModel.aggregate([
      {
        $match: {
          renterId: new mongoose.Types.ObjectId(userId),
          status: ExtraChargeStatusEnum.PENDING,
          isDeleted: false,
        },
      },
      { $group: { _id: "$bookingId" } },
      { $count: "count" },
    ]),
    BookingModel.countDocuments({
      userId: userId as unknown as mongoose.Types.ObjectId,
      isDeleted: false,
      status: BookingStatusEnum.IN_PROGRESS,
      endDate: { $lte: dueSoon },
    }),
    BookingModel.countDocuments({
      userId: userId as unknown as mongoose.Types.ObjectId,
      isDeleted: false,
      status: BookingStatusEnum.IN_PROGRESS,
      endDate: { $lt: now },
    }),
    BookingModel.countDocuments({
      userId: userId as unknown as mongoose.Types.ObjectId,
      isDeleted: false,
      status: BookingStatusEnum.IN_PROGRESS,
      endDate: { $gt: dueSoon },
    }),
    BookingModel.countDocuments({
      userId: userId as unknown as mongoose.Types.ObjectId,
      isDeleted: false,
      status: { $in: [BookingStatusEnum.REQUESTED, BookingStatusEnum.PENDING] },
    }),
    BookingModel.countDocuments({
      userId: userId as unknown as mongoose.Types.ObjectId,
      isDeleted: false,
      status: {
        $in: [
          BookingStatusEnum.RETURN_INSPECTION,
          BookingStatusEnum.AWAITING_EXTRA_CHARGE,
        ],
      },
    }),
    BookingModel.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          isDeleted: false,
          status: BookingStatusEnum.COMPLETED,
        },
      },
      {
        $lookup: {
          from: ReviewModel.collection.name,
          let: { bookingId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$bookingId", "$$bookingId"] },
                    { $eq: ["$renterId", new mongoose.Types.ObjectId(userId)] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "review",
        },
      },
      { $match: { "review.0": { $exists: false } } },
      { $count: "count" },
    ]),
    countCustomerRefundWorkflow(userId),
  ]);
  const renterPendingExtraCharges = firstAggregateCount(
    renterPendingExtraChargesRows,
  );
  const completedNeedReview = firstAggregateCount(completedNeedReviewRows);
  const items = [
    summaryItem("bookingOwnerApproved", bookingOwnerApproved),
    summaryItem("remainingPaymentDue", remainingPaymentDue),
    summaryItem("renterPendingExtraCharges", renterPendingExtraCharges),
    summaryItem(
      "refundRecipientInfoRequired",
      refundWorkflow.recipientInfoRequired,
    ),
    summaryItem("refundConfirmationRequired", refundWorkflow.confirmationRequired),
    summaryItem("returnDueSoon", returnDueSoon),
    summaryItem("completedNeedReview", completedNeedReview),
  ].filter(Boolean) as NotificationSummaryItem[];

  return compactCounter({
    actionRequiredCount: 0,
    waitingCount:
      activeTrips +
      bookingWaitingOwner +
      ownerInspectingReturn +
      refundWorkflow.waitingOwner,
    highPriorityCount:
      bookingOwnerApproved +
      remainingPaymentDue +
      renterPendingExtraCharges +
      returnOverdue +
      refundWorkflow.recipientInfoRequired +
      refundWorkflow.confirmationRequired,
    items,
  });
}

async function getAdminSummaryCounter() {
  const [pendingCars, pendingBusiness, reportedReviews] = await Promise.all([
    CarModel.countDocuments({
      isDeleted: false,
      status: CarStatusEnum.PENDING,
    }),
    BusinessModel.countDocuments({
      isDeleted: false,
      isApproved: false,
      isRejected: { $ne: true },
    }),
    ReviewModel.countDocuments({ status: ReviewStatusEnum.REPORTED }),
  ]);
  const items = [
    summaryItem("pendingCars", pendingCars),
    summaryItem("pendingBusiness", pendingBusiness),
    summaryItem("reportedReviews", reportedReviews),
  ].filter(Boolean) as NotificationSummaryItem[];

  return compactCounter({
    actionRequiredCount: 0,
    waitingCount: 0,
    highPriorityCount: 0,
    items,
  });
}

async function getNotificationSummaryCounter(authUser: any) {
  const role = String(authUser.role || "").toUpperCase();
  const userId = idOf(authUser.userId);

  if (role === UserRoleEnum.ADMIN) {
    return mergeCounters([await getAdminSummaryCounter()]);
  }

  if (role === UserRoleEnum.BUSINESS) {
    return mergeCounters([
      await getOwnerSummaryCounter(await getBusinessOwner(userId)),
    ]);
  }

  if (role === UserRoleEnum.USER) {
    const [customerCounter, ownerCounter] = await Promise.all([
      getCustomerSummaryCounter(userId),
      getOwnerSummaryCounter(getConsignmentOwner(userId)),
    ]);

    return mergeCounters([customerCounter, ownerCounter]);
  }

  return mergeCounters([]);
}

export const taskService = {
  async getTasksForCurrentUser(authUser: any, context?: string) {
    const role = String(authUser.role || "").toUpperCase();
    const userId = idOf(authUser.userId);
    let tasks: ActionCenterTask[] = [];

    if (role === UserRoleEnum.ADMIN) {
      tasks = await getAdminTasks();
    }

    if (role === UserRoleEnum.BUSINESS) {
      tasks = await getOwnerTasks(await getBusinessOwner(userId));
    }

    if (role === UserRoleEnum.USER) {
      const userTasks = await getCustomerTasks(userId);
      const ownerTasks = await getOwnerTasks(getConsignmentOwner(userId));
      tasks = [...userTasks, ...ownerTasks];
    }

    if (context) {
      tasks = tasks.filter((task) => task.context === context);
    }

    return buildResult(tasks);
  },

  async getNotificationSummary(authUser: any) {
    return getNotificationSummaryCounter(authUser);
  },
};
