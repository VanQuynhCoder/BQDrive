import mongoose from "mongoose";
import {
  BookingStatusEnum,
  CarStatusEnum,
  ExtraChargeStatusEnum,
  OwnerTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  ReturnInspectionStatusEnum,
  UserRoleEnum,
} from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { BusinessModel } from "../models/business/business.model";
import { CarModel } from "../models/car/car.model";
import { ExtraChargeModel } from "../models/extra-charge/extraCharge.model";
import { PaymentModel } from "../models/payment/payment.model";
import { ReviewModel, ReviewStatusEnum } from "../models/review/review.model";
import { ReturnInspectionModel } from "../models/return-inspection/returnInspection.model";

export type TaskGroup = "ACTION_REQUIRED" | "WAITING";
export type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
export type TaskEntityType = "BOOKING" | "CAR" | "BUSINESS" | "REVIEW";

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
  const [inspections, pendingExtraCharges, pendingCashPayments] =
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
    ]);
  const inspectionByBooking = new Map(
    inspections.map((inspection) => [idOf(inspection.bookingId), inspection]),
  );
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
      title: owner.context === "business" ? "Xe doanh nghiệp bị từ chối" : "Xe ký gửi bị từ chối",
      description: car.name || "Xe BQDrive",
      detail: car.rejectReason || "Vui lòng cập nhật thông tin xe trước khi gửi duyệt lại.",
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
        detail: "Khách vừa gửi yêu cầu thuê xe, bạn cần xác nhận hoặc từ chối.",
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
        detail: "Booking đã đủ điều kiện bàn giao, hãy chuẩn bị xe đúng lịch.",
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
        title: "Cần xác nhận đã nhận tiền mặt",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Có giao dịch tiền mặt đang chờ chủ xe xác nhận.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "confirm-cash",
        actionLabel: "Xác nhận đã thu",
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
          detail: "Booking có phí phát sinh đang chờ khách thanh toán hoặc chủ xe xác nhận thu.",
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
            detail: "Xe đã kiểm tra xong, không còn tiền hoặc phí chờ xử lý.",
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
            detail: "Booking đã kiểm tra xong nhưng khách còn số tiền thuê chưa thanh toán.",
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
        title: "Cần kiểm tra xe sau thuê",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Xe đã được tiếp nhận và đang chờ bạn kiểm tra tình trạng sau thuê.",
        entityType: "BOOKING",
        entityId: id,
        bookingId: id,
        carId: idOf(getCar(booking)?._id),
        actionKey: "return-inspection",
        actionLabel: "Kiểm tra xe",
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
        detail: "Chủ xe đã duyệt booking, hiện đang chờ người thuê thanh toán.",
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
  const pendingCharges = await ExtraChargeModel.find({
    bookingId: { $in: bookingIds },
    renterId: userId as any,
    status: ExtraChargeStatusEnum.PENDING,
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
        title: "Booking đã được duyệt, cần thanh toán",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Chủ xe đã đồng ý cho thuê. Bạn cần thanh toán để giữ lịch thuê.",
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
        detail: `Số tiền còn phải thanh toán: ${remainingAmount.toLocaleString("vi-VN")}đ.`,
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
        detail: `Bạn có ${chargeSummary.count} khoản phí phát sinh đang chờ xử lý.`,
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
          title: overdue ? "Đã quá hạn trả xe" : "Sắp đến hạn trả xe",
          description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
          detail: overdue
            ? "Booking đã quá thời gian trả xe dự kiến."
            : "Chuyến thuê sắp đến hạn trả xe trong 30 phút.",
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
          title: "Chuyến thuê đang diễn ra",
          description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
          detail: "Bạn đang trong thời gian thuê xe. Hãy theo dõi lịch trả xe.",
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
        title: "Đang chờ chủ xe duyệt",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Yêu cầu thuê xe đã gửi và đang chờ chủ xe phản hồi.",
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
        title: "Chủ xe đang kiểm tra xe",
        description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
        detail: "Xe đã được trả và đang trong bước kiểm tra sau thuê.",
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
      title: "Chuyến thuê hoàn tất, hãy để lại đánh giá",
      description: `${carName(booking)} - Booking #${bookingCode(booking)}`,
      detail: "Đánh giá của bạn giúp BQDrive cải thiện chất lượng dịch vụ.",
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
    const result = await this.getTasksForCurrentUser(authUser);
    const actionTasks = result.tasks.filter((task) => task.group === "ACTION_REQUIRED");
    const items = toSummaryItems(actionTasks);

    return {
      total: result.summary.actionRequiredCount,
      actionRequiredCount: result.summary.actionRequiredCount,
      waitingCount: result.summary.waitingCount,
      highPriorityCount: result.summary.highPriorityCount,
      items,
      topTasks: actionTasks.sort(taskSort).slice(0, 8),
    };
  },
};
