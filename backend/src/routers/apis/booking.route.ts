import axios from "axios";
import mongoose, { ClientSession } from "mongoose";
import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { CarModel } from "../../models/car/car.model";
import { CartModel } from "../../models/cart/cart.model";
import {
  UserModel,
  getIdentityVerificationStatus,
} from "../../models/user/user.model";
import { ContractModel } from "../../models/contract/contract.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { ExtraChargeModel } from "../../models/extra-charge/extraCharge.model";
import { ReturnInspectionModel } from "../../models/return-inspection/returnInspection.model";
import { RefundModel } from "../../models/refund/refund.model";
import { ReviewModel, ReviewStatusEnum } from "../../models/review/review.model";
import {
  calculateRentalPrice,
  getCarRentalSupport,
  normalizeRentalMode,
} from "../../helper/rental.helper";
import { calculateLateReturnFee } from "../../helper/late-return-fee.helper";
import { releaseCarIfNoConfirmedBooking } from "../../helper/car-status.helper";
import { expireOldCarts } from "../../helper/cart.helper";
import { assertCarAvailability } from "../../helper/car-availability.helper";
import { getCarCleaningUnavailableUntil } from "../../helper/booking-availability.helper";
import {
  buildBookingMileagePolicySnapshot,
  buildBookingRatePlanSnapshot,
  getRentalBillableUnits,
} from "../../helper/booking-rate-plan-snapshot.helper";

import {
  expireAbandonedPendingBookings,
  getBookingHoldExpiresAt,
} from "../../helper/booking-hold.helper";
import { formatAddress } from "../../helper/address.helper";
import {
  generateBookingCode,
  getBookingDisplayCode,
} from "../../helper/booking-code.helper";
import {
  buildPaymentSummaryForBooking,
  getContractStatusForBookingStatus,
  syncBookingPaymentFromPaidPayments,
  syncContractFromBooking,
} from "../../helper/payment-sync.helper";
import {
  deriveContractPaymentStatus,
  transitionBookingStatus,
} from "../../helper/status.helper";
import {
  sendBookingApprovedMail,
  sendBookingCompletedMail,
  sendBookingCancellationRefundMail,
  sendBookingCreatedMail,
  sendBookingHandoverMail,
  sendBookingNoShowMail,
  sendBookingRejectedMail,
  sendRemainingCashConfirmedMail,
  sendReturnInspectionCompletedMail,
} from "../../helper/mail.helper";
import { notificationCenterService } from "../../services/notification-center.service";
import { toCloudinaryCardThumbnailUrl } from "../../services/cloudinary.service";
import { cancellationRefundService } from "../../services/cancellation-refund.service";
import {
  BookingStatusEnum,
  CarStatusEnum,
  CartStatusEnum,
  DeliveryAddressSourceEnum,
  DeliveryTypeEnum,
  ExtraChargeStatusEnum,
  IdentityVerificationStatusEnum,
  MileageStatusEnum,
  PaymentMethodEnum,
  PaymentOptionEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  PricingDateTypeEnum,
  RentalModeEnum,
  ReturnInspectionStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import {
  validatePhone,
} from "../../utils/validators";
import {
  getBookingUpfrontPaymentAmount,
} from "../../helper/payment-sync.helper";

const RENTER_ROLES = [UserRoleEnum.USER];
const DRIVER_LICENSE_CLASSES = ["B", "B1", "B2"] as const;
const IDENTITY_PROFILE_REQUIRED_MESSAGE =
  "Vui lòng cập nhật đầy đủ CCCD và giấy phép lái xe trong hồ sơ cá nhân trước khi đặt xe.";
const IDENTITY_VERIFICATION_PENDING_MESSAGE =
  "Hồ sơ giấy tờ của bạn đang chờ BQDrive xác minh. Vui lòng thử lại sau.";
const IDENTITY_VERIFICATION_REJECTED_MESSAGE =
  "Hồ sơ giấy tờ chưa được chấp nhận. Vui lòng cập nhật lại giấy tờ trong hồ sơ cá nhân.";
const LICENSE_NOT_ELIGIBLE_MESSAGE =
  "Giấy phép lái xe của bạn chưa phù hợp với điều kiện thuê xe.";
const OWNER_REVIEW_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // Trạng thái mới: khách vừa gửi yêu cầu, chủ xe cần duyệt
];
const BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // Chặn lịch ngay khi khách gửi yêu cầu để tránh hai người đặt cùng slot
  BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã đồng ý, khách đang chuẩn bị thanh toán
  BookingStatusEnum.PAYMENT_PENDING, // Khách đã bắt đầu thanh toán, chưa có kết quả cuối
  BookingStatusEnum.PAID, // Đã thanh toán, lịch thuê được giữ chính thức
  BookingStatusEnum.IN_PROGRESS, // Xe đang được bàn giao/đang thuê thực tế
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];
const BOOKABLE_CAR_STATUSES = [CarStatusEnum.APPROVED, CarStatusEnum.RENTED];
const HANDOVER_ALLOWED_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
];
const HANDOVER_BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];
const HANDOVER_OVERLAP_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
];
const HANDOVER_EARLY_ALLOWANCE_MINUTES = 15;
const PICKUP_GRACE_MINUTES = 30;
const NO_SHOW_ALLOWED_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
];
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const RENTAL_DEPOSIT_RATE = 0.5;
const PLATFORM_FEE_RATE = 0.1;
const INSURANCE_FEE_PER_DAY = 30000;
const VEHICLE_CONDITION_KEYS = [
  "bodyOk",
  "glassAndMirrorsOk",
  "lightsOk",
  "tiresOk",
  "interiorClean",
  "seatsAndSeatbeltsOk",
  "airConditioningOk",
  "dashboardWarningFree",
] as const;
const VEHICLE_ACCESSORY_KEYS = [
  "vehicleKeysPresent",
  "tireSupportKitPresent",
  "basicToolkitPresent",
  "warningTrianglePresent",
  "chargingCableApplicable",
  "chargingCablePresent",
] as const;
const VEHICLE_DOCUMENT_KEYS = [
  "registrationPresent",
  "inspectionCertificatePresent",
  "insuranceCertificatePresent",
] as const;

function toCoordinate(value: unknown, min: number, max: number) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : undefined;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isNonNegativeFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasValidPricingSnapshot(snapshot: any) {
  if (
    !snapshot ||
    !Object.values(RentalModeEnum).includes(snapshot.rentalMode) ||
    !isNonNegativeFiniteNumber(snapshot.basePricePerUnit) ||
    !isNonNegativeFiniteNumber(snapshot.weekendSurchargePerUnit) ||
    !isNonNegativeFiniteNumber(snapshot.holidaySurchargePerUnit) ||
    !isNonNegativeFiniteNumber(snapshot.subtotal) ||
    !Array.isArray(snapshot.breakdown) ||
    snapshot.breakdown.length === 0
  ) {
    return false;
  }

  const calculatedSubtotal = snapshot.breakdown.reduce(
    (sum: number, item: any) => {
      const isValidItem =
        typeof item?.dateOrTime === "string" &&
        Object.values(PricingDateTypeEnum).includes(item?.priceType) &&
        isNonNegativeFiniteNumber(item?.basePrice) &&
        isNonNegativeFiniteNumber(item?.surchargeAmount) &&
        isNonNegativeFiniteNumber(item?.finalPrice) &&
        isNonNegativeFiniteNumber(item?.unitCount) &&
        isNonNegativeFiniteNumber(item?.price) &&
        item.finalPrice === item.basePrice + item.surchargeAmount &&
        item.price === item.finalPrice * item.unitCount;

      return isValidItem ? sum + item.price : Number.NaN;
    },
    0,
  );

  return (
    Number.isFinite(calculatedSubtotal) &&
    calculatedSubtotal === snapshot.subtotal
  );
}

async function getDrivingDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
) {
  try {
    const response = await axios.get(
      `${OSRM_ROUTE_URL}/${originLng},${originLat};${destLng},${destLat}`,
      {
        params: {
          overview: "false",
          geometries: "geojson",
        },
        headers: {
          "User-Agent": "BQDrive/1.0 delivery fee calculation",
          Accept: "application/json",
        },
        timeout: 8000,
      },
    );
    const distanceMeters = Number(response.data?.routes?.[0]?.distance || 0);
    const durationSeconds = Number(response.data?.routes?.[0]?.duration || 0);

    if (response.data?.code !== "Ok" || !distanceMeters) {
      throw new Error("NO_ROUTE");
    }

    const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
    const durationMinutes = durationSeconds
      ? Math.max(1, Math.round(durationSeconds / 60))
      : 0;

    return {
      distanceKm,
      durationText: durationMinutes ? `${durationMinutes} phút` : undefined,
    };
  } catch {
    throw ErrorHelper.requestDataInvalid(
      "Không thể tính khoảng cách giao xe, vui lòng thử lại hoặc chọn nhận xe tại địa điểm của chủ xe.",
    );
  }
}

function normalizeDeliveryAddressSource(value: unknown) {
  return Object.values(DeliveryAddressSourceEnum).includes(
    value as DeliveryAddressSourceEnum,
  )
    ? (value as DeliveryAddressSourceEnum)
    : DeliveryAddressSourceEnum.MANUAL_TEXT;
}

function calculatePaymentAmounts(
  totalPrice: number,
  upfrontPaymentAmount: number,
  paymentOption: string,
) {
  if (paymentOption === PaymentOptionEnum.FULL) {
    return {
      upfrontPaymentAmount,
      remainingAmount: totalPrice,
      paidAmount: 0,
    };
  }

  return {
    upfrontPaymentAmount,
    remainingAmount: Math.max(totalPrice - upfrontPaymentAmount, 0),
    paidAmount: 0,
  };
}

function assertUserIsNotCarOwner(car: any, userId: string) {
  if (String(car?.ownerId || "") === String(userId)) {
    throw ErrorHelper.requestDataInvalid(
      "Không thể thuê xe do chính bạn sở hữu",
    );
  }
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRenterContactSnapshot(rawInfo: any, user: any) {
  const renterInfo = rawInfo || {};
  const fullName = getTrimmedString(user?.name);
  const phone = validatePhone(user?.phone, false);
  const email = getTrimmedString(user?.email).toLowerCase();
  const note = getTrimmedString(renterInfo.note);

  if (fullName.trim().length < 2 || !phone || !email) {
    throw ErrorHelper.requestDataInvalid(
      "Vui lòng cập nhật đầy đủ họ tên, số điện thoại và email trong hồ sơ cá nhân.",
    );
  }

  if (note.length > 500) {
    throw ErrorHelper.requestDataInvalid(
      "Ghi chú không được vượt quá 500 ký tự",
    );
  }

  return { fullName, phone, email, note };
}

async function getRenterBookingSnapshot(userId: string, rawInfo: any) {
  const user = await UserModel.findOne({
    _id: userId,
    isDeleted: false,
  }).select(
    "+cccdNumber +cccdFrontImage +cccdBackImage +driverLicenseNumber +driverLicenseImage",
  );

  if (!user) {
    throw ErrorHelper.userNotExist();
  }

  const driverLicenseClass = String(user.driverLicenseClass || "").toUpperCase();
  const validLicenseClass = DRIVER_LICENSE_CLASSES.includes(
    driverLicenseClass as (typeof DRIVER_LICENSE_CLASSES)[number],
  );
  const hasCompleteIdentityDocuments = Boolean(
    user.cccdNumber &&
      user.cccdFrontImage &&
      user.cccdBackImage &&
      user.driverLicenseNumber &&
      user.driverLicenseImage &&
      validLicenseClass,
  );
  const identityProfileCompleted =
    user.identityProfileCompleted === true && hasCompleteIdentityDocuments;

  if (!identityProfileCompleted) {
    throw ErrorHelper.requestDataInvalid(IDENTITY_PROFILE_REQUIRED_MESSAGE);
  }

  const identityVerificationStatus = getIdentityVerificationStatus(user);
  if (identityVerificationStatus === IdentityVerificationStatusEnum.PENDING) {
    throw ErrorHelper.requestDataInvalid(IDENTITY_VERIFICATION_PENDING_MESSAGE);
  }
  if (identityVerificationStatus === IdentityVerificationStatusEnum.REJECTED) {
    throw ErrorHelper.requestDataInvalid(IDENTITY_VERIFICATION_REJECTED_MESSAGE);
  }
  if (identityVerificationStatus !== IdentityVerificationStatusEnum.VERIFIED) {
    throw ErrorHelper.requestDataInvalid(IDENTITY_PROFILE_REQUIRED_MESSAGE);
  }

  const licenseEligible = validLicenseClass;
  if (!licenseEligible) {
    throw ErrorHelper.requestDataInvalid(LICENSE_NOT_ELIGIBLE_MESSAGE);
  }

  return {
    renterInfo: getRenterContactSnapshot(rawInfo, user),
    renterEligibilitySnapshot: {
      identityProfileCompleted,
      identityVerificationStatus,
      driverLicenseClass: driverLicenseClass as "B" | "B1" | "B2",
      licenseEligible,
      checkedAt: new Date(),
    },
  };
}

function hasEligibleRenterSnapshot(snapshot: any) {
  return Boolean(
    snapshot?.identityProfileCompleted === true &&
      (!snapshot?.identityVerificationStatus ||
        snapshot.identityVerificationStatus === IdentityVerificationStatusEnum.VERIFIED) &&
      snapshot?.licenseEligible === true &&
      DRIVER_LICENSE_CLASSES.includes(snapshot?.driverLicenseClass),
  );
}

async function ensureNoOverlappedActiveBooking(booking: any) {
  const start = new Date(booking.startDate);
  const end = new Date(booking.endDate);

  const overlappedBooking = await BookingModel.findOne({
    _id: { $ne: booking._id },
    carId: booking.carId,
    status: { $in: BLOCKING_BOOKING_STATUSES },
    isDeleted: false,
    startDate: { $lt: end },
    endDate: { $gt: start },
  } as any);

  if (overlappedBooking) {
    throw ErrorHelper.carTimeConflict({
      carId: String(booking.carId || ""),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      conflictType: "BOOKING",
    });
  }
}

export async function assertCarReadyForHandover(
  booking: any,
  options: { now?: Date; session?: ClientSession } = {},
) {
  const now = options.now || new Date();
  const startAt = new Date(booking.startDate);
  const endAt = new Date(booking.endDate);

  if (Number.isNaN(startAt.getTime())) {
    throw ErrorHelper.requestDataInvalid("Thời gian nhận xe không hợp lệ.");
  }

  if (Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    throw ErrorHelper.requestDataInvalid("Thời gian trả xe không hợp lệ.");
  }

  const earliestHandoverAt = new Date(
    startAt.getTime() - HANDOVER_EARLY_ALLOWANCE_MINUTES * 60 * 1000,
  );

  if (now < earliestHandoverAt) {
    throw ErrorHelper.requestDataInvalid(
      `Chưa đến khung giờ bàn giao. Chỉ được bàn giao sớm tối đa ${HANDOVER_EARLY_ALLOWANCE_MINUTES} phút trước giờ nhận xe.`,
    );
  }

  const activeBookingQuery = BookingModel.findOne({
    _id: { $ne: booking._id },
    carId: booking.carId,
    status: { $in: HANDOVER_BLOCKING_BOOKING_STATUSES },
    isDeleted: false,
  } as any).select("_id status");

  if (options.session) activeBookingQuery.session(options.session);

  if (await activeBookingQuery) {
    throw ErrorHelper.requestDataInvalid(
      "Xe vẫn đang trong chuyến thuê trước hoặc quy trình trả xe chưa hoàn tất.",
    );
  }

  const overlappingBookingQuery = BookingModel.findOne({
    _id: { $ne: booking._id },
    carId: booking.carId,
    status: { $in: HANDOVER_OVERLAP_BOOKING_STATUSES },
    isDeleted: false,
    startDate: { $lt: endAt },
    endDate: { $gt: startAt },
  } as any).select("_id status");

  if (options.session) overlappingBookingQuery.session(options.session);

  if (await overlappingBookingQuery) {
    throw ErrorHelper.requestDataInvalid(
      "Xe đã có booking khác trùng thời gian bàn giao.",
    );
  }

  const completedBookingQuery = BookingModel.findOne({
    _id: { $ne: booking._id },
    carId: booking.carId,
    status: BookingStatusEnum.COMPLETED,
    completedAt: { $ne: null, $lte: now },
    isDeleted: false,
  } as any)
    .select("_id completedAt")
    .sort({ completedAt: -1 });

  if (options.session) completedBookingQuery.session(options.session);

  const latestCompletedBooking = await completedBookingQuery;
  if (!latestCompletedBooking?.completedAt) return;

  const cleaningUntil = getCarCleaningUnavailableUntil(
    new Date(latestCompletedBooking.completedAt),
  );

  if (cleaningUntil > now) {
    throw ErrorHelper.carCleaningInProgress(cleaningUntil);
  }
}

class BookingRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post("/quote", this.route(this.quoteBooking));

    this.router.post(
      "/createBooking",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.createBooking),
    );

    this.router.post(
      "/bookingFromCart/:cartId",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.bookingFromCart),
    );

    this.router.get(
      "/getMyBookings",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyBookings),
    );

    this.router.get(
      "/my-active-holds",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyActiveHolds),
    );

    this.router.get(
      "/my-payment-todos",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyPaymentTodos),
    );

    this.router.get(
      "/getMyBooking/:id",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyBooking),
    );
    this.router.get(
      "/:id/recommended-car",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getRecommendedCar),
    );
    this.router.get(
      "/getBusinessBookings",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getOwnerBookings),
    );

    this.router.get(
      "/getOwnerBookings",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getOwnerBookings),
    );

    this.router.get(
      "/owner/history",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getOwnerBookingHistory),
    );

    this.router.post(
      "/cancelBooking/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.cancelBookingWithRefund),
    );

    this.router.post(
      "/cancellation-preview/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.previewCancellation),
    );

    this.router.post(
      "/confirmBooking/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.confirmBooking),
    );

    this.router.post(
      "/rejectBooking/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.rejectBooking),
    );

    this.router.post(
      "/completeBooking/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.completeBooking),
    );

    this.router.post(
      "/:id/receive-return",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.receiveReturn),
    );

    this.router.post(
      "/:id/inspection/clear",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.clearReturnInspection),
    );

    this.router.get(
      "/:id/return-inspection",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.ADMIN, UserRoleEnum.USER]),
      ],
      this.route(this.getReturnInspection),
    );

    this.router.post(
      "/handoverBooking/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.handoverBooking),
    );

    this.router.post(
      "/:id/confirm-handover-received",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.confirmHandoverReceived),
    );

    this.router.post(
      "/:id/confirm-return",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.confirmReturn),
    );

    this.router.post(
      "/:id/confirm-remaining-cash",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.confirmRemainingCash),
    );

    this.router.post(
      "/noShowBooking/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.noShowBooking),
    );

    this.router.post(
      "/:id/no-show",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.noShowBooking),
    );
  }

  private async getOwnerContext(authUser: any) {
    return {
      ownerId: authUser.userId,
    };
  }

  private buildOwnerFilter(owner: any) {
    return {
      ownerId: owner.ownerId,
    };
  }

  private getPickupAddressSnapshot(car: any) {
    return formatAddress(car, true) || "Địa chỉ nhận xe đang được cập nhật";
  }

  private getRequiredHandoverPaymentAmount(booking: any) {
    const totalPrice = Number(booking.totalPrice || 0);

    if (booking.paymentOption === PaymentOptionEnum.FULL) {
      return totalPrice;
    }

    return Number(
      booking.upfrontPaymentAmount || getBookingUpfrontPaymentAmount(booking),
    );
  }

  private getOutstandingAmount(booking: any) {
    const totalPrice = Number(booking.totalPrice || 0);
    const paidAmount = Number(booking.paidAmount || 0);
    const storedRemainingAmount = Number(booking.remainingAmount || 0);

    return Math.max(storedRemainingAmount || totalPrice - paidAmount, 0);
  }

  private assertHandoverPaymentIsSatisfied(booking: any) {
    const requiredAmount = this.getRequiredHandoverPaymentAmount(booking);
    const paidAmount = Number(booking.paidAmount || 0);

    if (requiredAmount > 0 && paidAmount < requiredAmount) {
      throw ErrorHelper.requestDataInvalid(
        booking.paymentOption === PaymentOptionEnum.FULL
          ? "Booking chưa đủ điều kiện bàn giao"
          : "Thanh toán cọc chưa thành công",
      );
    }
  }

  private assertBookingPaymentIsSettled(booking: any) {
    const totalPrice = Number(booking.totalPrice || 0);
    const paidAmount = Number(booking.paidAmount || 0);
    const remainingAmount = this.getOutstandingAmount(booking);

    if (remainingAmount > 0 || paidAmount < totalPrice) {
      throw ErrorHelper.requestDataInvalid(
        "Booking còn số tiền chưa thanh toán. Vui lòng xác nhận đã thu phần còn lại hoặc yêu cầu khách thanh toán trên hệ thống trước khi hoàn tất chuyến.",
      );
    }
  }

  private async confirmRemainingCashPayment(
    booking: any,
    authUser: any,
    note?: string,
  ) {
    await syncBookingPaymentFromPaidPayments(booking);

    const summary = await buildPaymentSummaryForBooking(booking);
    const remainingAmount = Number(summary.remainingAmount || 0);

    if (remainingAmount <= 0) {
      return {
        payment: null,
        summary,
        message: "Booking đã thanh toán đủ.",
      };
    }

    const confirmedAt = new Date();
    const confirmationNote =
      note?.slice(0, 500) ||
      "Chủ xe xác nhận đã thu phần còn lại trực tiếp từ khách khi trả xe.";
    let payment = await PaymentModel.findOneAndUpdate(
      {
        bookingId: booking._id,
        method: PaymentMethodEnum.CASH,
        paymentType: PaymentTypeEnum.REMAINING,
        status: PaymentStatusEnum.PENDING,
      },
      {
        $set: {
          amount: remainingAmount,
          status: PaymentStatusEnum.PAID,
          paidAt: confirmedAt,
          confirmedBy: authUser.userId,
          confirmedByRole: authUser.role,
          note: confirmationNote,
        },
      },
      { new: true, sort: { createdAt: -1 } },
    );

    if (!payment) {
      payment = await PaymentModel.create({
        bookingId: booking._id,
        userId: booking.userId,
        amount: remainingAmount,
        method: PaymentMethodEnum.CASH,
        paymentType: PaymentTypeEnum.REMAINING,
        status: PaymentStatusEnum.PAID,
        paidAt: confirmedAt,
        confirmedBy: authUser.userId,
        confirmedByRole: authUser.role,
        note: confirmationNote,
      });
    }

    await PaymentModel.updateMany(
      {
        _id: { $ne: payment._id },
        bookingId: booking._id,
        method: PaymentMethodEnum.CASH,
        paymentType: PaymentTypeEnum.REMAINING,
        status: PaymentStatusEnum.PENDING,
      },
      { $set: { status: PaymentStatusEnum.FAILED } },
    );

    const updatedSummary = await syncBookingPaymentFromPaidPayments(booking);
    await syncContractFromBooking(booking);
    void sendRemainingCashConfirmedMail(booking, payment);

    return {
      payment,
      summary: updatedSummary,
      message: "Đã xác nhận thu phần còn lại.",
    };
  }

  private parseRequiredNonNegativeInteger(value: unknown, fieldLabel: string) {
    const normalized = Number(value);

    if (!Number.isInteger(normalized) || normalized < 0) {
      throw ErrorHelper.requestDataInvalid(
        `${fieldLabel} phải là số nguyên không âm.`,
      );
    }

    return normalized;
  }

  private parseRequiredEnergyPercent(value: unknown, fieldLabel: string) {
    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) {
      throw ErrorHelper.requestDataInvalid(
        `${fieldLabel} phải nằm trong khoảng 0 đến 100.`,
      );
    }

    return normalized;
  }

  private parseRequiredBooleanChecklist<T extends readonly string[]>(
    value: unknown,
    keys: T,
    fieldLabel: string,
  ): Record<T[number], boolean> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw ErrorHelper.requestDataInvalid(
        `${fieldLabel} phải được ghi nhận đầy đủ trước khi xác nhận biên bản.`,
      );
    }

    const source = value as Record<string, unknown>;
    const result = {} as Record<T[number], boolean>;

    for (const key of keys) {
      const checklistKey = key as T[number];
      if (typeof source[checklistKey] !== "boolean") {
        throw ErrorHelper.requestDataInvalid(
          `${fieldLabel} phải ghi nhận rõ từng mục là đạt/có hoặc không đạt/không có.`,
        );
      }
      result[checklistKey] = source[checklistKey] as boolean;
    }

    return result;
  }

  private buildMileageEvaluation(
    booking: any,
    returnOdometerKm: number,
    fallbackHandoverOdometerKm?: number | null,
  ) {
    const snapshotOdometer = booking.handoverSnapshot?.handoverOdometerKm;
    const handoverSource = snapshotOdometer ?? fallbackHandoverOdometerKm;
    const handoverOdometerKm =
      handoverSource === null || handoverSource === undefined
        ? Number.NaN
        : Number(handoverSource);

    if (!Number.isFinite(handoverOdometerKm)) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chưa có ODO bàn giao để đối chiếu ODO nhận lại.",
      );
    }

    if (returnOdometerKm < handoverOdometerKm) {
      throw ErrorHelper.requestDataInvalid(
        "ODO nhận lại không được nhỏ hơn ODO lúc bàn giao.",
      );
    }

    const distanceTravelledKm = returnOdometerKm - handoverOdometerKm;
    const policy = booking.mileagePolicySnapshot;

    if (!policy) {
      return {
        distanceTravelledKm,
        mileageStatus: MileageStatusEnum.NOT_EVALUATED_KM,
      };
    }

    const totalIncludedKm = Math.max(Number(policy.totalIncludedKm || 0), 0);
    const graceKm = Math.max(Number(policy.graceKm || 0), 0);
    const overageKm = Math.max(distanceTravelledKm - totalIncludedKm, 0);
    const chargeableOverageKm = Math.max(overageKm - graceKm, 0);
    const suggestedOverageAmount = Math.round(
      chargeableOverageKm * Math.max(Number(policy.overageFeePerKm || 0), 0),
    );

    return {
      distanceTravelledKm,
      totalIncludedKm,
      overageKm,
      chargeableOverageKm,
      suggestedOverageAmount,
      mileageStatus:
        chargeableOverageKm > 0
          ? MileageStatusEnum.EXCEEDED_LIMIT_KM
          : MileageStatusEnum.WITHIN_LIMIT_KM,
    };
  }

  private validateRentalDateRange(start: Date, end: Date) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw ErrorHelper.requestDataInvalid("Thời gian thuê xe không hợp lệ");
    }

    if (start <= new Date()) {
      throw ErrorHelper.requestDataInvalid(
        "Thời gian nhận xe phải lớn hơn thời gian hiện tại",
      );
    }

    if (end <= start) {
      throw ErrorHelper.requestDataInvalid("Ngày thuê không hợp lệ");
    }
  }

  private buildQuoteResponse(rentalResult: any) {
    const breakdown = rentalResult.pricingSnapshot?.breakdown || [];
    const normalizedBreakdown = breakdown.map((item: any) => {
      return {
        dateOrTime: item.dateOrTime,
        priceType: item.priceType,
        label:
          item.priceType === PricingDateTypeEnum.HOLIDAY
            ? "Ngày lễ"
            : item.priceType === PricingDateTypeEnum.WEEKEND
              ? "Cuối tuần"
              : "Ngày thường",
        basePrice: Number(item.basePrice || 0),
        surchargeAmount: Number(item.surchargeAmount || 0),
        finalPrice: Number(item.finalPrice || 0),
        unitCount: Number(item.unitCount || 1),
        price: Number(item.price || 0),
      };
    });
    const uniqueTypes = Array.from(
      new Set(normalizedBreakdown.map((item: any) => item.priceType)),
    );
    const appliedPriceType =
      uniqueTypes.length === 1 ? uniqueTypes[0] : "MIXED";
    const appliedLabel =
      appliedPriceType === "MIXED"
        ? "Nhiều loại ngày"
        : normalizedBreakdown[0]?.label || "Ngày thường";

    return {
      rentalMode: rentalResult.rentalMode,
      appliedPriceType,
      appliedLabel,
      basePricePerUnit: Number(
        rentalResult.pricingSnapshot?.basePricePerUnit || 0,
      ),
      weekendSurchargePerUnit: Number(
        rentalResult.pricingSnapshot?.weekendSurchargePerUnit || 0,
      ),
      holidaySurchargePerUnit: Number(
        rentalResult.pricingSnapshot?.holidaySurchargePerUnit || 0,
      ),
      finalPrice:
        appliedPriceType === "MIXED"
          ? undefined
          : normalizedBreakdown[0]?.finalPrice,
      totalTime: rentalResult.totalTime,
      totalPrice: rentalResult.totalPrice,
      rentalSubtotal:
        rentalResult.pricingSnapshot?.rentalSubtotal ??
        rentalResult.pricingSnapshot?.subtotal ??
        rentalResult.totalPrice,
      deliveryFee: Number(rentalResult.pricingSnapshot?.deliveryFee || 0),
      rentalDepositRate: Number(
        rentalResult.pricingSnapshot?.rentalDepositRate || 0,
      ),

      rentalDepositAmount: Number(
        rentalResult.pricingSnapshot?.rentalDepositAmount || 0,
      ),

      platformFeeRate: Number(
        rentalResult.pricingSnapshot?.platformFeeRate || 0,
      ),

      platformFee: Number(rentalResult.pricingSnapshot?.platformFee || 0),

      insuranceFeePerDay: Number(
        rentalResult.pricingSnapshot?.insuranceFeePerDay || 0,
      ),

      insuranceDays: Number(rentalResult.pricingSnapshot?.insuranceDays || 0),

      insuranceFee: Number(rentalResult.pricingSnapshot?.insuranceFee || 0),

      upfrontPaymentAmount: Number(
        rentalResult.pricingSnapshot?.upfrontPaymentAmount || 0,
      ),
      delivery: rentalResult.pricingSnapshot?.delivery,
      breakdown: normalizedBreakdown,
    };
  }

  private async buildDeliveryPricing(car: any, deliveryInput: any = {}) {
    const deliveryType =
      deliveryInput?.deliveryType || DeliveryTypeEnum.PICKUP_AT_CAR_LOCATION;

    if (deliveryType !== DeliveryTypeEnum.DELIVERY_TO_CUSTOMER) {
      return {
        deliveryFee: 0,
        delivery: {
          deliveryType: DeliveryTypeEnum.PICKUP_AT_CAR_LOCATION,
        },
      };
    }

    if (!car.deliveryEnabled) {
      throw ErrorHelper.requestDataInvalid(
        "Xe này không hỗ trợ giao xe tận nơi.",
      );
    }

    const originLat = toCoordinate(car.pickupLat ?? car.latitude, -90, 90);
    const originLng = toCoordinate(car.pickupLng ?? car.longitude, -180, 180);
    const deliveryLat = toCoordinate(deliveryInput.deliveryLat, -90, 90);
    const deliveryLng = toCoordinate(deliveryInput.deliveryLng, -180, 180);
    const deliveryAddressText =
      cleanText(deliveryInput.deliveryAddressText) ||
      cleanText(deliveryInput.deliveryAddress);
    const deliveryFormattedAddress = cleanText(
      deliveryInput.deliveryFormattedAddress,
    );
    const deliveryAddress = deliveryAddressText || deliveryFormattedAddress;
    const deliveryAddressSource = normalizeDeliveryAddressSource(
      deliveryInput.deliveryAddressSource,
    );
    const deliveryNote = cleanText(deliveryInput.deliveryNote);

    if (
      originLat === undefined ||
      originLng === undefined ||
      deliveryLat === undefined ||
      deliveryLng === undefined
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu tọa độ để tính phí giao xe tận nơi.",
      );
    }

    if (!deliveryAddress) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập địa chỉ giao xe.");
    }

    const routeMetrics = await getDrivingDistanceKm(
      originLat,
      originLng,
      deliveryLat,
      deliveryLng,
    );
    const deliveryDistanceKm = routeMetrics.distanceKm;
    const deliveryMaxDistanceKm = Number(car.deliveryMaxDistanceKm || 0);

    if (
      deliveryMaxDistanceKm > 0 &&
      deliveryDistanceKm > deliveryMaxDistanceKm
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Khoảng cách giao xe vượt quá phạm vi hỗ trợ của chủ xe.",
      );
    }

    const deliveryBaseFee = Number(car.deliveryBaseFee || 0);
    const deliveryFeePerKm = Number(car.deliveryFeePerKm || 0);
    const deliveryFee = Math.round(
      deliveryBaseFee + deliveryDistanceKm * deliveryFeePerKm,
    );

    return {
      deliveryFee,
      delivery: {
        deliveryType: DeliveryTypeEnum.DELIVERY_TO_CUSTOMER,
        deliveryAddress,
        deliveryAddressText,
        deliveryFormattedAddress,
        deliveryAddressSource,
        deliveryLat,
        deliveryLng,
        deliveryDistanceKm,
        deliveryDurationText: routeMetrics.durationText,
        deliveryBaseFee,
        deliveryFeePerKm,
        deliveryMaxDistanceKm,
        deliveryFee,
        deliveryNote: deliveryNote || car.deliveryNote || "",
      },
    };
  }

  private async applyDeliveryToRentalResult(
    car: any,
    rentalResult: any,
    deliveryInput: any,
  ) {
    const deliveryPricing = await this.buildDeliveryPricing(car, deliveryInput);
    const rentalSubtotal = Number(
      rentalResult.pricingSnapshot?.subtotal || rentalResult.totalPrice || 0,
    );

    const deliveryFee = Number(deliveryPricing.deliveryFee || 0);

    // Phí dịch vụ mà BQDrive thu.
    const platformFee = Math.round(rentalSubtotal * PLATFORM_FEE_RATE);

    // Bảo hiểm tính theo số ngày bảo vệ chuyến đi.
    // Thuê theo giờ hiện chỉ tối đa 24 giờ nên tính 1 ngày bảo hiểm.
    const insuranceDays =
      rentalResult.rentalMode === RentalModeEnum.HOURLY
        ? 1
        : Math.max(1, Math.ceil(Number(rentalResult.totalTime || 1)));

    const insuranceFee = insuranceDays * INSURANCE_FEE_PER_DAY;

    // Tiền cọc chỉ lấy 50% phần tiền thuê xe.
    const rentalDepositAmount = Math.round(
      rentalSubtotal * RENTAL_DEPOSIT_RATE,
    );

    // Khoản khách phải thanh toán online để giữ xe.
    const upfrontPaymentAmount =
      rentalDepositAmount + platformFee + insuranceFee;

    // Tổng tiền thực tế khách phải chịu.
    const totalPrice =
      rentalSubtotal + deliveryFee + platformFee + insuranceFee;

    return {
      ...rentalResult,
      totalPrice,
      pricingSnapshot: {
        ...(rentalResult.pricingSnapshot || {}),

        subtotal: rentalSubtotal,
        rentalSubtotal,

        rentalDepositRate: RENTAL_DEPOSIT_RATE,
        rentalDepositAmount,

        platformFeeRate: PLATFORM_FEE_RATE,
        platformFee,

        insuranceFeePerDay: INSURANCE_FEE_PER_DAY,
        insuranceDays,
        insuranceFee,

        upfrontPaymentAmount,

        deliveryFee,
        totalPrice,
        delivery: deliveryPricing.delivery,
      },
    };
  }

  private async assertExtraChargesAreSettled(booking: any) {
    const pendingExtraCharge = await ExtraChargeModel.findOne({
      bookingId: booking._id,
      status: ExtraChargeStatusEnum.PENDING,
      isDeleted: false,
    } as any);

    if (pendingExtraCharge) {
      throw ErrorHelper.requestDataInvalid(
        "Booking còn phí phát sinh chưa xử lý, chưa thể hoàn tất chuyến thuê.",
      );
    }
  }

  private async hasPendingExtraCharge(booking: any) {
    const pendingExtraCharge = await ExtraChargeModel.findOne({
      bookingId: booking._id,
      status: ExtraChargeStatusEnum.PENDING,
      isDeleted: false,
    } as any).select("_id");

    return Boolean(pendingExtraCharge);
  }

  private normalizeReturnPhotos(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim())
      .slice(0, 8);
  }

  private withLateReturnCalculation(booking: any, inspection: any) {
    if (!inspection) return null;

    const plainInspection =
      typeof inspection.toObject === "function"
        ? inspection.toObject()
        : inspection;

    try {
      return {
        ...plainInspection,
        lateReturnCalculation: calculateLateReturnFee(
          booking.endDate,
          plainInspection.actualReturnAt,
        ),
      };
    } catch {
      return plainInspection;
    }
  }

  private async buildReturnCompletionState(booking: any, inspection?: any) {
    const blockers: string[] = [];

    await syncBookingPaymentFromPaidPayments(booking);

    if (!inspection) {
      blockers.push("RETURN_INSPECTION_NOT_FOUND");
    } else if (
      inspection.inspectionStatus !== ReturnInspectionStatusEnum.CLEARED &&
      !inspection.ownerConfirmedAt
    ) {
      blockers.push("INSPECTION_NOT_CLEARED");
    }

    if (!inspection?.ownerConfirmedAt) {
      blockers.push("OWNER_RETURN_CONFIRMATION_REQUIRED");
    }

    if (!inspection?.renterConfirmedAt) {
      blockers.push("RENTER_RETURN_CONFIRMATION_REQUIRED");
    }

    if (this.getOutstandingAmount(booking) > 0) {
      blockers.push("REMAINING_PAYMENT");
    }

    if (await this.hasPendingExtraCharge(booking)) {
      blockers.push("PENDING_EXTRA_CHARGE");
    }

    if (
      ![
        BookingStatusEnum.RETURN_INSPECTION,
        BookingStatusEnum.AWAITING_EXTRA_CHARGE,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      blockers.push("BOOKING_NOT_ACTIVE");
    }

    return {
      canComplete: blockers.length === 0,
      blockers,
    };
  }

  private async findReturnInspectionForBooking(bookingId: any) {
    return ReturnInspectionModel.findOne({
      bookingId,
      isDeleted: false,
    } as any);
  }

  private async findBookingForReturnInspectionRead(id: string, authUser: any) {
    if (authUser.role === UserRoleEnum.ADMIN) {
      return BookingModel.findOne({
        _id: id,
        isDeleted: false,
      } as any)
        .populate("userId", "-password -otpCode")
        .populate("carId")

        .populate("ownerId", "-password -otpCode");
    }
    return BookingModel.findOne({
      _id: id,
      isDeleted: false,
      $or: [
        { userId: authUser.userId },
        {
          ownerId: authUser.userId,
        },
      ],
    } as any)
      .populate("userId", "-password -otpCode")
      .populate("carId")

      .populate("ownerId", "-password -otpCode");
  }

  private async refreshInspectionStatusFromExtraCharges(booking: any) {
    const inspection = await this.findReturnInspectionForBooking(booking._id);

    if (
      !inspection ||
      inspection.inspectionStatus === ReturnInspectionStatusEnum.CLEARED
    ) {
      return inspection;
    }

    if (await this.hasPendingExtraCharge(booking)) {
      inspection.inspectionStatus = ReturnInspectionStatusEnum.CHARGES_PENDING;

      if (booking.status !== BookingStatusEnum.AWAITING_EXTRA_CHARGE) {
        transitionBookingStatus(
          booking,
          BookingStatusEnum.AWAITING_EXTRA_CHARGE,
        );

        await booking.save();
      }
    } else if (
      inspection.inspectionStatus === ReturnInspectionStatusEnum.CHARGES_PENDING
    ) {
      // Phụ phí đã được xử lý hết, quay lại bước kiểm tra xe.
      inspection.inspectionStatus = ReturnInspectionStatusEnum.INSPECTING;

      if (booking.status === BookingStatusEnum.AWAITING_EXTRA_CHARGE) {
        transitionBookingStatus(booking, BookingStatusEnum.RETURN_INSPECTION);

        await booking.save();
      }
    }

    await inspection.save();

    return inspection;
  }

  private assertBookingCanBeNoShow(booking: any) {
    if (booking.status === BookingStatusEnum.IN_PROGRESS) {
      throw ErrorHelper.requestDataInvalid(
        "Booking đã được bàn giao, không thể đánh dấu No-show.",
      );
    }

    if (
      [
        BookingStatusEnum.COMPLETED,
        BookingStatusEnum.CANCELLED,
        BookingStatusEnum.REJECTED,
        BookingStatusEnum.NO_SHOW,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking không còn khả dụng để đánh dấu No-show.",
      );
    }

    if (
      !NO_SHOW_ALLOWED_BOOKING_STATUSES.includes(
        booking.status as BookingStatusEnum,
      )
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chưa đủ điều kiện để đánh dấu No-show.",
      );
    }

    const pickupTime = new Date(booking.startDate);

    if (Number.isNaN(pickupTime.getTime())) {
      throw ErrorHelper.requestDataInvalid("Thời gian nhận xe không hợp lệ.");
    }

    const noShowAllowedAt =
      pickupTime.getTime() + PICKUP_GRACE_MINUTES * 60 * 1000;

    if (Date.now() < noShowAllowedAt) {
      throw ErrorHelper.requestDataInvalid(
        "Chưa đến giờ nhận xe, không thể đánh dấu No-show.",
      );
    }
  }

  private async validateCarAvailability(
    carId: string,
    start: Date,
    end: Date,
    ignoredCartId?: string,
    session?: ClientSession,
  ) {
    const now = new Date();

    if (!session) {
      await expireAbandonedPendingBookings(now);
      await expireOldCarts(now);
    }

    await assertCarAvailability({
      carId,
      start,
      end,
      now,
      ...(ignoredCartId ? { ignoredCartId } : {}),
      ...(session ? { session } : {}),
    });
  }

  private async assertActiveRenter(userId: string, session?: ClientSession) {
    const query = UserModel.findOne({
      _id: userId,
      isDeleted: false,
      isBlocked: { $ne: true },
      isVerified: true,
    } as any).select("_id");
    if (session) query.session(session);

    if (!(await query)) {
      throw ErrorHelper.forbidden(
        "Tài khoản người thuê không còn hoạt động hoặc chưa được xác thực",
      );
    }
  }

  private async lockBookableCar(carId: string, session: ClientSession) {
    const car = await CarModel.findOneAndUpdate(
      {
        _id: carId,
        status: { $in: BOOKABLE_CAR_STATUSES },
        isHidden: { $ne: true },
        isDeleted: false,
      } as any,
      { $inc: { bookingRevision: 1 } },
      { new: true, session },
    );

    if (!car) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    return car;
  }

  async createBooking(req: Request, res: Response) {
    const authUser = (req as any).user;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "bookingCode")) {
      throw ErrorHelper.requestDataInvalid(
        "Mã booking do hệ thống tự động tạo và không được gửi từ client",
      );
    }

    const {
      carId,
      startDate,
      endDate,
      rentalMode,
      note,
      paymentOption,
      renterInfo,
      delivery,
    } = req.body;
    await Promise.all([expireOldCarts(), expireAbandonedPendingBookings()]);

    if (!carId || !startDate || !endDate || !rentalMode) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu carId, startDate hoặc endDate",
      );
    }

    const renterSnapshot = await getRenterBookingSnapshot(
      authUser.userId,
      renterInfo,
    );

    if (!Object.values(RentalModeEnum).includes(rentalMode)) {
      throw ErrorHelper.requestDataInvalid("Hình thức thuê không hợp lệ");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    this.validateRentalDateRange(start, end);

    const selectedPaymentOption = paymentOption || PaymentOptionEnum.DEPOSIT;

    if (!Object.values(PaymentOptionEnum).includes(selectedPaymentOption)) {
      throw ErrorHelper.requestDataInvalid("Phương án thanh toán không hợp lệ");
    }

    const session = await mongoose.startSession();
    let booking: any;

    try {
      await session.withTransaction(async () => {
        await this.assertActiveRenter(authUser.userId, session);
        const car = await this.lockBookableCar(carId, session);

        assertUserIsNotCarOwner(car, authUser.userId);
        await this.validateCarAvailability(
          carId,
          start,
          end,
          undefined,
          session,
        );

        const ratePlanSnapshot = buildBookingRatePlanSnapshot(car);
        const rentalResult = await this.applyDeliveryToRentalResult(
          car,
          await calculateRentalPrice(car, start, end, rentalMode),
          delivery,
        );
        const totalPrice = rentalResult.totalPrice;
        const mileagePolicySnapshot = buildBookingMileagePolicySnapshot(
          ratePlanSnapshot,
          rentalResult.rentalMode,
          getRentalBillableUnits(rentalResult),
        );
        const paymentAmounts = calculatePaymentAmounts(
          totalPrice,
          Number(
            rentalResult.pricingSnapshot?.upfrontPaymentAmount || 0,
          ),
          selectedPaymentOption,
        );
        const bookingCode = await generateBookingCode();

        [booking] = await BookingModel.create(
          [
            {
              bookingCode,
              userId: authUser.userId,
              ownerId: car.ownerId,

              carId: car._id,
              startDate: start,
              endDate: end,
              rentalMode: rentalResult.rentalMode,
              ratePlanSnapshot,
              ...(mileagePolicySnapshot ? { mileagePolicySnapshot } : {}),
              totalPrice,
              pricingSnapshot: rentalResult.pricingSnapshot,
              paymentOption: selectedPaymentOption,
              upfrontPaymentAmount: paymentAmounts.upfrontPaymentAmount,
              remainingAmount: paymentAmounts.remainingAmount,
              paidAmount: paymentAmounts.paidAmount,
              isDepositRefundable: true,
              cancellationPolicySnapshot:
                cancellationRefundService.getPolicySnapshot(),
              pickupAddressSnapshot: this.getPickupAddressSnapshot(car),
              returnAddressSnapshot: this.getPickupAddressSnapshot(car),
              renterInfo: renterSnapshot.renterInfo,
              renterEligibilitySnapshot:
                renterSnapshot.renterEligibilitySnapshot,
              note,
              status: BookingStatusEnum.REQUESTED,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    if (!booking) {
      throw ErrorHelper.somethingWentWrong("Không thể tạo booking");
    }

    void sendBookingCreatedMail(booking);
    void notificationCenterService.notifyBookingCreated(
      booking,
      authUser.userId,
    );

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đã gửi yêu cầu đặt xe, vui lòng chờ chủ xe xác nhận",
      data: { booking },
    });
  }

  async bookingFromCart(req: Request, res: Response) {
    const authUser = (req as any).user;
    const cartId = String(req.params.cartId);

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "bookingCode")) {
      throw ErrorHelper.requestDataInvalid(
        "Mã booking do hệ thống tự động tạo và không được gửi từ client",
      );
    }

    const { paymentOption, renterInfo, delivery } = req.body;
    await Promise.all([expireOldCarts(), expireAbandonedPendingBookings()]);

    const renterSnapshot = await getRenterBookingSnapshot(
      authUser.userId,
      renterInfo,
    );

    const selectedPaymentOption = paymentOption || PaymentOptionEnum.DEPOSIT;

    if (!Object.values(PaymentOptionEnum).includes(selectedPaymentOption)) {
      throw ErrorHelper.requestDataInvalid("Phương án thanh toán không hợp lệ");
    }

    const session = await mongoose.startSession();
    let booking: any;

    try {
      await session.withTransaction(async () => {
        const now = new Date();
        await this.assertActiveRenter(authUser.userId, session);

        const cart = await CartModel.findOne({
          _id: cartId,
          userId: authUser.userId,
          status: CartStatusEnum.ACTIVE,
          expiredAt: { $gt: now },
        } as any).session(session);

        if (!cart) {
          throw ErrorHelper.recordNotFound("Giỏ hàng");
        }

        const car = await this.lockBookableCar(String(cart.carId), session);
        const start = new Date(cart.startDate);
        const end = new Date(cart.endDate);

        assertUserIsNotCarOwner(car, authUser.userId);
        this.validateRentalDateRange(start, end);
        await this.validateCarAvailability(
          String(car._id),
          start,
          end,
          String(cart._id),
          session,
        );

        const ratePlanSnapshot = buildBookingRatePlanSnapshot(car);
        const hasReusableCartPricing =
          hasValidPricingSnapshot(cart.pricingSnapshot) &&
          Number(cart.totalPrice) === Number(cart.pricingSnapshot?.subtotal);
        const baseRentalResult = hasReusableCartPricing
          ? {
              rentalMode: cart.rentalMode,
              totalPrice: Number(cart.pricingSnapshot?.subtotal),
              pricingSnapshot: cart.pricingSnapshot,
            }
          : await calculateRentalPrice(car, start, end, cart.rentalMode);
        const rentalResult = await this.applyDeliveryToRentalResult(
          car,
          baseRentalResult,
          delivery,
        );
        const totalPrice = Number(
          rentalResult.totalPrice || cart.totalPrice || 0,
        );
        const mileagePolicySnapshot = buildBookingMileagePolicySnapshot(
          ratePlanSnapshot,
          rentalResult.rentalMode,
          getRentalBillableUnits(rentalResult),
        );
        const paymentAmounts = calculatePaymentAmounts(
          totalPrice,
          Number(
            rentalResult.pricingSnapshot?.upfrontPaymentAmount || 0,
          ),
          selectedPaymentOption,
        );
        const bookingCode = await generateBookingCode();

        [booking] = await BookingModel.create(
          [
            {
              bookingCode,
              userId: authUser.userId,
              ownerId: car.ownerId,

              carId: car._id,
              cartId: cart._id,
              startDate: cart.startDate,
              endDate: cart.endDate,
              rentalMode: rentalResult.rentalMode,
              ratePlanSnapshot,
              ...(mileagePolicySnapshot ? { mileagePolicySnapshot } : {}),
              totalPrice,
              pricingSnapshot: rentalResult.pricingSnapshot,
              paymentOption: selectedPaymentOption,
              upfrontPaymentAmount: paymentAmounts.upfrontPaymentAmount,
              remainingAmount: paymentAmounts.remainingAmount,
              paidAmount: paymentAmounts.paidAmount,
              isDepositRefundable: true,
              cancellationPolicySnapshot:
                cancellationRefundService.getPolicySnapshot(),
              pickupAddressSnapshot: this.getPickupAddressSnapshot(car),
              returnAddressSnapshot: this.getPickupAddressSnapshot(car),
              renterInfo: renterSnapshot.renterInfo,
              renterEligibilitySnapshot:
                renterSnapshot.renterEligibilitySnapshot,
              status: BookingStatusEnum.REQUESTED,
            },
          ],
          { session },
        );

        const cartUpdate = await CartModel.updateOne(
          {
            _id: cart._id,
            userId: authUser.userId,
            status: CartStatusEnum.ACTIVE,
            expiredAt: { $gt: now },
          } as any,
          { status: CartStatusEnum.BOOKED },
          { session },
        );

        if (cartUpdate.modifiedCount !== 1) {
          throw ErrorHelper.requestDataInvalid(
            "Giỏ hàng không còn hiệu lực hoặc đã được sử dụng",
          );
        }
      });
    } finally {
      await session.endSession();
    }

    if (!booking) {
      throw ErrorHelper.somethingWentWrong("Không thể tạo booking từ giỏ hàng");
    }

    void sendBookingCreatedMail(booking);
    void notificationCenterService.notifyBookingCreated(
      booking,
      authUser.userId,
    );

    return res.status(201).json({
      status: 201,
      code: "201",
      message:
        "Đã gửi yêu cầu đặt xe từ giỏ hàng, vui lòng chờ chủ xe xác nhận",
      data: { booking },
    });
  }

  async getMyBookings(req: Request, res: Response) {
    const authUser = (req as any).user;

    await expireAbandonedPendingBookings();

    const bookings = await BookingModel.find({
      userId: authUser.userId,
      isDeleted: false,
    })
      .select(
        [
          "_id",
          "bookingCode",
          "userId",

          "ownerId",

          "carId",
          "startDate",
          "endDate",
          "actualReturnAt",
          "rentalMode",
          "totalPrice",
          "paymentOption",
          "upfrontPaymentAmount",
          "remainingAmount",
          "paidAmount",
          "isDepositRefundable",
          "pickupAddressSnapshot",
          "returnAddressSnapshot",
          "status",
          "cancelReason",
          "noShowReason",
          "noShowAt",
          "note",
          "createdAt",
          "updatedAt",
          "renterInfo.fullName",
          "renterInfo.phone",
          "renterInfo.email",
          "renterInfo.note",
          "renterEligibilitySnapshot",
        ].join(" "),
      )
      .populate({
        path: "carId",
        select: {
          _id: 1,
          name: 1,
          licensePlate: 1,
          brandId: 1,
          pricing: 1,
          rentalUnit: 1,
          seats: 1,
          fuelType: 1,
          transmission: 1,
          images: { $slice: 1 },
        },
      })
      .populate("ownerId", "_id name")
      .sort({ createdAt: -1 })
      .lean();
    const listBookings = bookings.map((booking: any) => {
      const car = booking.carId;

      if (!car || typeof car !== "object") return booking;

      const firstImage = Array.isArray(car.images)
        ? car.images.find(
            (image: unknown) => typeof image === "string" && image.trim(),
          ) || ""
        : "";
      const thumbnail = toCloudinaryCardThumbnailUrl(firstImage);
      const carPayload = { ...car, thumbnail };
      delete carPayload.images;

      return {
        ...booking,
        carId: carPayload,
      };
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { bookings: listBookings },
    });
  }

  async getMyActiveHolds(req: Request, res: Response) {
    const authUser = (req as any).user;
    const holdStartedAfter = new Date(Date.now() - 10 * 60 * 1000);

    await expireAbandonedPendingBookings();

    const bookings = await BookingModel.find({
      userId: authUser.userId,
      status: BookingStatusEnum.REQUESTED,
      paidAmount: { $lte: 0 },
      createdAt: { $gte: holdStartedAfter },
      isDeleted: false,
    } as any)
      .select("_id bookingCode carId status paidAmount createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "success",
      data: { bookings },
    });
  }

  private getPaymentTodoOwnerName(booking: any) {
    const owner = booking.ownerId;

    return {
      ownerName: owner?.name || "Chủ xe",
      ownerEmail: owner?.email || "",
      ownerPhone: owner?.phone || "",
    };
  }

  private buildPaymentTodoCarPayload(car: any) {
    return {
      carId: String(car?._id || ""),
      carName: car?.name || "Xe BQDrive",
      carImage: toCloudinaryCardThumbnailUrl(
        Array.isArray(car?.images) ? car.images.find(Boolean) || "" : "",
      ),
      licensePlate: car?.licensePlate || "",
    };
  }

  async getMyPaymentTodos(req: Request, res: Response) {
    const authUser = (req as any).user;

    await expireAbandonedPendingBookings();

    const excludedStatuses = [
      BookingStatusEnum.COMPLETED,
      BookingStatusEnum.CANCELLED,
      BookingStatusEnum.REJECTED,
      BookingStatusEnum.NO_SHOW,
    ];

    const bookings = await BookingModel.find({
      userId: authUser.userId,
      remainingAmount: { $gt: 0 },
      status: { $nin: excludedStatuses },
      isDeleted: false,
    } as any)
      .populate({
        path: "carId",
        select: {
          _id: 1,
          name: 1,
          licensePlate: 1,
          images: { $slice: 1 },
        },
      })
      .populate("ownerId", "_id name")
      .sort({ startDate: 1, createdAt: -1 });

    const todos = [];

    for (const booking of bookings) {
      const summary = await buildPaymentSummaryForBooking(booking);

      if (Number(summary.remainingAmount || 0) <= 0) {
        continue;
      }

      const plainBooking = booking.toObject();
      const carPayload = this.buildPaymentTodoCarPayload(plainBooking.carId);

      todos.push({
        bookingId: String(booking._id),
        bookingCode: getBookingDisplayCode(booking),
        ...carPayload,
        startDate: plainBooking.startDate,
        endDate: plainBooking.endDate,
        totalPrice: summary.totalPrice,
        paidAmount: summary.paidAmount,
        remainingAmount: summary.remainingAmount,
        paymentStatus: summary.paymentStatus,
        bookingStatus: plainBooking.status,
        ...this.getPaymentTodoOwnerName(plainBooking),
      });
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "success",
      data: { todos },
    });
  }

  async quoteBooking(req: Request, res: Response) {
    const { carId, startDate, endDate, rentalMode, delivery } = req.body;

    if (!carId || !startDate || !endDate || !rentalMode) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu carId, startDate hoặc endDate",
      );
    }

    if (!Object.values(RentalModeEnum).includes(rentalMode)) {
      throw ErrorHelper.requestDataInvalid("Hình thức thuê không hợp lệ");
    }

    const car = await CarModel.findOne({
      _id: carId,
      status: { $in: BOOKABLE_CAR_STATUSES },
      isDeleted: false,
    } as any);

    if (!car || (car as any).isHidden) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    this.validateRentalDateRange(start, end);

    const rentalResult = await this.applyDeliveryToRentalResult(
      car,
      await calculateRentalPrice(car, start, end, rentalMode),
      delivery,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        quote: this.buildQuoteResponse(rentalResult),
      },
    });
  }

  async getMyBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      userId: authUser.userId,
      isDeleted: false,
    } as any)
      .populate("carId")

      .populate("ownerId", "-password -otpCode");

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    const refunds = await RefundModel.find({
      bookingId: booking._id,
      isDeleted: false,
    }).sort({ createdAt: -1 });

    const bookingPayload =
      typeof (booking as any).toObject === "function"
        ? (booking as any).toObject()
        : booking;

    bookingPayload.renterInfo = {
      fullName: bookingPayload.renterInfo?.fullName,
      phone: bookingPayload.renterInfo?.phone,
      email: bookingPayload.renterInfo?.email,
      note: bookingPayload.renterInfo?.note,
    };
    if (bookingPayload.renterEligibilitySnapshot) {
      bookingPayload.renterEligibilitySnapshot = {
        identityProfileCompleted:
          bookingPayload.renterEligibilitySnapshot.identityProfileCompleted === true,
        ...(bookingPayload.renterEligibilitySnapshot.identityVerificationStatus
          ? {
              identityVerificationStatus:
                bookingPayload.renterEligibilitySnapshot.identityVerificationStatus,
            }
          : {}),
        driverLicenseClass:
          bookingPayload.renterEligibilitySnapshot.driverLicenseClass || null,
        licenseEligible:
          bookingPayload.renterEligibilitySnapshot.licenseEligible === true,
        checkedAt: bookingPayload.renterEligibilitySnapshot.checkedAt,
      };
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { booking: { ...bookingPayload, refunds } },
    });
  }

  async getRecommendedCar(req: Request, res: Response) {
    const authUser = (req as any).user;
    const bookingId = String(req.params.id || "");

    await Promise.all([expireOldCarts(), expireAbandonedPendingBookings()]);

    const booking = await BookingModel.findOne({
      _id: bookingId,
      userId: authUser.userId,
      isDeleted: false,
    } as any)
      .select("_id carId startDate endDate rentalMode status pricingSnapshot")
      .lean();

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    if (booking.status !== BookingStatusEnum.REJECTED) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Booking chưa ở trạng thái bị từ chối",
        data: { recommendation: null },
      });
    }

    const start = new Date(booking.startDate);
    const end = new Date(booking.endDate);
    const rentalMode = normalizeRentalMode(booking.rentalMode);

    if (!rentalMode || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Booking không có đủ dữ liệu để tìm xe thay thế",
        data: { recommendation: null },
      });
    }

    const originalCar = await CarModel.findById(booking.carId)
      .select("_id name brandId seats")
      .lean();

    if (!originalCar || !Number.isFinite(Number(originalCar.seats))) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Không tìm thấy thông tin xe cũ",
        data: { recommendation: null },
      });
    }

    let originalRentalSubtotal = Number(
      (booking.pricingSnapshot as any)?.rentalSubtotal ??
        (booking.pricingSnapshot as any)?.subtotal ??
        0,
    );

    if (!(originalRentalSubtotal > 0)) {
      const sourceCar = await CarModel.findById(booking.carId).lean();
      if (sourceCar) {
        try {
          const sourceRental = await calculateRentalPrice(
            sourceCar,
            start,
            end,
            rentalMode,
          );
          originalRentalSubtotal = Number(
            sourceRental.pricingSnapshot?.subtotal || sourceRental.totalPrice || 0,
          );
        } catch {
          originalRentalSubtotal = 0;
        }
      }
    }

    if (!(originalRentalSubtotal > 0)) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Không đủ dữ liệu giá để tìm xe tương tự",
        data: { recommendation: null },
      });
    }

    const rentalSupportFilter =
      rentalMode === RentalModeEnum.HOURLY
        ? { $or: [{ allowHourlyRental: true }, { rentalUnit: "HOUR" }] }
        : { $or: [{ allowDailyRental: true }, { rentalUnit: "DAY" }] };

    const candidates = await CarModel.find({
      _id: { $ne: booking.carId },
      ownerId: { $ne: authUser.userId },
      status: { $in: BOOKABLE_CAR_STATUSES },
      isHidden: { $ne: true },
      isDeleted: false,
      seats: Number(originalCar.seats),
      ...rentalSupportFilter,
    } as any)
      .select(
        "_id name brandId seats transmission fuelType images pricing allowDailyRental allowHourlyRental rentalUnit pickupAddress pickupFormattedAddress pickupLocationText pickupProvince pickupDistrict pickupWard province city district ward pickupLat pickupLng latitude longitude deliveryEnabled",
      )
      .populate("brandId", "_id name")
      .lean();

    if (candidates.length === 0) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Không có xe tương tự phù hợp",
        data: { recommendation: null },
      });
    }

    const candidateIds = candidates.map((candidate) => candidate._id);
    const reviewRows = await ReviewModel.aggregate([
      {
        $match: {
          carId: { $in: candidateIds },
          status: ReviewStatusEnum.VISIBLE,
        },
      },
      {
        $group: {
          _id: "$carId",
          averageRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]);
    const reviewMap = new Map(
      reviewRows.map((row: any) => [
        String(row._id),
        {
          averageRating: Number(Number(row.averageRating || 0).toFixed(1)),
          reviewCount: Number(row.reviewCount || 0),
        },
      ]),
    );

    const minSubtotal = originalRentalSubtotal * 0.8;
    const maxSubtotal = originalRentalSubtotal * 1.2;
    const validCandidates: Array<{
      car: any;
      rentalSubtotal: number;
      priceDifference: number;
      averageRating: number;
      reviewCount: number;
    }> = [];

    for (const candidate of candidates) {
      const support = getCarRentalSupport(candidate);
      if (
        (rentalMode === RentalModeEnum.DAILY && !support.allowDailyRental) ||
        (rentalMode === RentalModeEnum.HOURLY && !support.allowHourlyRental)
      ) {
        continue;
      }

      let rentalSubtotal = 0;
      try {
        const rentalResult = await calculateRentalPrice(
          candidate,
          start,
          end,
          rentalMode,
        );
        rentalSubtotal = Number(
          rentalResult.pricingSnapshot?.subtotal || rentalResult.totalPrice || 0,
        );
      } catch {
        continue;
      }

      if (!(rentalSubtotal >= minSubtotal && rentalSubtotal <= maxSubtotal)) {
        continue;
      }

      try {
        await assertCarAvailability({
          carId: String(candidate._id),
          start,
          end,
        });
      } catch {
        continue;
      }

      const review = reviewMap.get(String(candidate._id)) || {
        averageRating: 0,
        reviewCount: 0,
      };
      validCandidates.push({
        car: candidate,
        rentalSubtotal,
        priceDifference: Math.abs(rentalSubtotal - originalRentalSubtotal),
        averageRating: review.averageRating,
        reviewCount: review.reviewCount,
      });
    }

    validCandidates.sort(
      (left, right) =>
        left.priceDifference - right.priceDifference ||
        right.averageRating - left.averageRating ||
        right.reviewCount - left.reviewCount ||
        String(left.car._id).localeCompare(String(right.car._id)),
    );

    const selected = validCandidates[0];
    if (!selected) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Không có xe tương tự phù hợp",
        data: { recommendation: null },
      });
    }

    const candidate = selected.car;
    const brand = candidate.brandId
      ? {
          _id: String(candidate.brandId._id),
          name: String(candidate.brandId.name || ""),
        }
      : null;
    const pickupLocation =
      candidate.pickupFormattedAddress ||
      candidate.pickupAddress ||
      candidate.pickupLocationText ||
      [candidate.pickupWard || candidate.ward, candidate.pickupDistrict || candidate.district, candidate.pickupProvince || candidate.province || candidate.city]
        .filter(Boolean)
        .join(", ");
    const modePricing =
      rentalMode === RentalModeEnum.HOURLY
        ? {
            basePricePerUnit: Number(candidate.pricing?.basePricePerHour || 0),
            weekendSurchargePerUnit: Number(candidate.pricing?.weekendSurchargePerHour || 0),
            holidaySurchargePerUnit: Number(candidate.pricing?.holidaySurchargePerHour || 0),
          }
        : {
            basePricePerUnit: Number(candidate.pricing?.basePricePerDay || 0),
            weekendSurchargePerUnit: Number(candidate.pricing?.weekendSurchargePerDay || 0),
            holidaySurchargePerUnit: Number(candidate.pricing?.holidaySurchargePerDay || 0),
          };

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        recommendation: {
          bookingId: String(booking._id),
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          rentalMode,
          originalRentalSubtotal,
          candidateRentalSubtotal: selected.rentalSubtotal,
          estimatedTotal: selected.rentalSubtotal,
          priceDifference: selected.priceDifference,
          car: {
            _id: String(candidate._id),
            name: candidate.name,
            images: Array.isArray(candidate.images)
              ? candidate.images.filter(Boolean).slice(0, 1)
              : [],
            brand,
            seats: candidate.seats,
            transmission: candidate.transmission,
            fuelType: candidate.fuelType,
            pricing: modePricing,
            pickupLocation,
            pickupLat: candidate.pickupLat ?? candidate.latitude,
            pickupLng: candidate.pickupLng ?? candidate.longitude,
            deliveryEnabled: candidate.deliveryEnabled === true,
          },
          reviewSummary: {
            averageRating: selected.averageRating,
            reviewCount: selected.reviewCount,
          },
        },
      },
    });
  }

  async getOwnerBookings(req: Request, res: Response) {
    const authUser = (req as any).user;

    const owner = await this.getOwnerContext(authUser);
    await expireAbandonedPendingBookings();

    const bookings = await BookingModel.find({
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    })
      .populate("userId", "_id name email phone avatar")
      .populate("carId")
      .sort({ createdAt: -1 });
    const visibleBookingIds = bookings.map((booking) => booking._id);
    const [payments, returnInspections] = await Promise.all([
      PaymentModel.find({
        bookingId: { $in: visibleBookingIds },
      })
        .sort({ createdAt: -1 })
        .lean(),
      ReturnInspectionModel.find({
        bookingId: { $in: visibleBookingIds },
        isDeleted: false,
      } as any).lean(),
    ]);
    const paymentByBookingId = new Map<string, any>();
    const inspectionByBookingId = new Map<string, any>();

    for (const payment of payments) {
      const bookingId = String(payment.bookingId);
      const currentPayment = paymentByBookingId.get(bookingId);

      if (
        !currentPayment ||
        (payment.method === "CASH" && payment.status === "PENDING")
      ) {
        paymentByBookingId.set(bookingId, payment);
      }
    }

    returnInspections.forEach((inspection) => {
      inspectionByBookingId.set(String(inspection.bookingId || ""), inspection);
    });

    const bookingsWithPayment = bookings.map((booking) => {
      const payload = booking.toObject() as any;
      payload.renterInfo = {
        fullName: payload.renterInfo?.fullName,
        phone: payload.renterInfo?.phone,
        email: payload.renterInfo?.email,
        note: payload.renterInfo?.note,
      };
      if (payload.renterEligibilitySnapshot) {
        payload.renterEligibilitySnapshot = {
          identityProfileCompleted:
            payload.renterEligibilitySnapshot.identityProfileCompleted === true,
          ...(payload.renterEligibilitySnapshot.identityVerificationStatus
            ? {
                identityVerificationStatus:
                  payload.renterEligibilitySnapshot.identityVerificationStatus,
              }
            : {}),
          driverLicenseClass:
            payload.renterEligibilitySnapshot.driverLicenseClass || null,
          licenseEligible:
            payload.renterEligibilitySnapshot.licenseEligible === true,
          checkedAt: payload.renterEligibilitySnapshot.checkedAt,
        };
      }
      return {
        ...payload,
        payment: paymentByBookingId.get(String(booking._id)) || null,
        returnInspection: inspectionByBookingId.get(String(booking._id)) || null,
      };
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { bookings: bookingsWithPayment },
    });
  }

  private getOwnerHistoryPaymentStatus(
    totalPrice: number,
    upfrontPaymentAmount: number,
    paidAmount: number,
    paymentOption: string,
    payments: any[],
  ) {
    const hasPendingPayment = payments.some(
      (payment) => payment.status === PaymentStatusEnum.PENDING,
    );

    return deriveContractPaymentStatus({
      totalPrice,
      upfrontPaymentAmount,
      paidAmount,
      paymentOption,
      hasPendingPayment,
    });
  }

  private buildOwnerHistoryCarPayload(car: any) {
    const brand = car?.brandId;

    return {
      id: String(car?._id || ""),
      name: car?.name || "Xe đã bị xóa hoặc không còn tồn tại",
      brand:
        typeof brand === "object"
          ? brand?.name || ""
          : car?.brand || car?.brandName || "",
      model: car?.model || "",
      plateNumber: car?.licensePlate || "",
      image: Array.isArray(car?.images) ? car.images.find(Boolean) || "" : "",
    };
  }

  private buildOwnerHistoryRenterPayload(booking: any) {
    const renterInfo = booking?.renterInfo || {};
    const user = booking?.userId || {};

    return {
      id: String(user?._id || booking?.userId || ""),
      fullName: renterInfo.fullName || user.name || "--",
      email: renterInfo.email || user.email || "--",
      phone: renterInfo.phone || user.phone || "--",
      identityProfileCompleted:
        booking?.renterEligibilitySnapshot?.identityProfileCompleted === true,
      identityVerificationStatus:
        booking?.renterEligibilitySnapshot?.identityVerificationStatus || null,
      driverLicenseClass:
        booking?.renterEligibilitySnapshot?.driverLicenseClass || null,
      licenseEligible:
        booking?.renterEligibilitySnapshot?.licenseEligible === true,
    };
  }

  private buildOwnerHistoryOwnerPayload(owner: any, booking: any) {
    return {
      id: String((booking as any).ownerId || owner?.ownerId || ""),
      name: (booking as any).ownerId?.name || owner?.name || "Chủ xe",
    };
  }

  private buildOwnerHistoryPaymentPayload(payment: any) {
    return {
      id: String(payment._id || ""),
      paymentCode: String(payment._id || "")
        .slice(-8)
        .toUpperCase(),
      amount: Number(payment.amount || 0),
      method: payment.method || "",
      status: payment.status || "",
      paymentType: payment.paymentType || "",
      transactionCode: payment.transactionCode || "",
      paidAt: payment.paidAt || null,
      createdAt: payment.createdAt || null,
    };
  }

  private matchesOwnerHistoryKeyword(item: any, keyword: string) {
    if (!keyword) return true;

    const normalizedKeyword = keyword.toLowerCase();
    const fields = [
      item.bookingCode,
      item.car?.name,
      item.car?.brand,
      item.car?.plateNumber,
      item.renter?.fullName,
      item.renter?.email,
      item.renter?.phone,
    ];

    return fields.some((field) =>
      String(field || "")
        .toLowerCase()
        .includes(normalizedKeyword),
    );
  }

  async getOwnerBookingHistory(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);

    if (!owner) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "success",
        data: {
          bookings: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        },
      });
    }

    await expireAbandonedPendingBookings();

    const {
      status,
      paymentStatus,
      carId,
      keyword,
      fromDate,
      toDate,
      page = "1",
      limit = "10",
      sort = "newest",
    } = req.query as Record<string, string>;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const dateFilter: Record<string, Date> = {};

    if (fromDate) {
      const from = new Date(fromDate);
      if (!Number.isNaN(from.getTime())) dateFilter.$gte = from;
    }

    if (toDate) {
      const to = new Date(toDate);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        dateFilter.$lte = to;
      }
    }

    const bookingFilter: Record<string, any> = {
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    };

    if (status && status !== "ALL") {
      bookingFilter.status = status;
    }

    if (carId && carId !== "ALL") {
      bookingFilter.carId = carId;
    }

    if (Object.keys(dateFilter).length > 0) {
      bookingFilter.startDate = dateFilter;
    }

    const bookings = await BookingModel.find(bookingFilter as any)
      .populate("userId", "-password -otpCode")
      .populate({
        path: "carId",
        populate: { path: "brandId", select: "name logo" },
      })
      .sort(
        sort === "oldest"
          ? { createdAt: 1 }
          : sort === "startDate"
            ? { startDate: -1 }
            : { createdAt: -1 },
      );
    const bookingIds = bookings.map((booking) => booking._id);
    const [payments, contracts] = await Promise.all([
      PaymentModel.find({ bookingId: { $in: bookingIds } })
        .sort({ createdAt: 1 })
        .lean(),
      ContractModel.find({
        bookingId: { $in: bookingIds },
        isDeleted: false,
      })
        .select("_id contractCode status bookingId")
        .lean(),
    ]);
    const paymentsByBookingId = new Map<string, any[]>();
    const contractByBookingId = new Map<string, any>();

    payments.forEach((payment) => {
      const bookingId = String(payment.bookingId || "");
      paymentsByBookingId.set(bookingId, [
        ...(paymentsByBookingId.get(bookingId) || []),
        payment,
      ]);
    });

    contracts.forEach((contract) => {
      contractByBookingId.set(String(contract.bookingId || ""), contract);
    });

    const histories = bookings.map((booking) => {
      const plainBooking = booking.toObject();
      const bookingPayments =
        paymentsByBookingId.get(String(booking._id)) || [];
      const paidAmount = bookingPayments
        .filter((payment) => payment.status === PaymentStatusEnum.PAID)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const totalPrice = Number(plainBooking.totalPrice || 0);
      const upfrontPaymentAmount = Number(
        plainBooking.upfrontPaymentAmount || 0,
      );
      const remainingAmount = Math.max(
        totalPrice - Math.min(paidAmount, totalPrice),
        0,
      );
      const summaryStatus = this.getOwnerHistoryPaymentStatus(
        totalPrice,
        upfrontPaymentAmount,
        paidAmount,
        plainBooking.paymentOption,
        bookingPayments,
      );
      const contract = contractByBookingId.get(String(booking._id));

      return {
        bookingId: String(booking._id),
        bookingCode: getBookingDisplayCode(booking),
        status: plainBooking.status || "",
        paymentStatus: summaryStatus,
        rentalMode: plainBooking.rentalMode || "",
        startDate: plainBooking.startDate,
        endDate: plainBooking.endDate,
        actualReturnAt: plainBooking.actualReturnAt || null,
        pickupTime: plainBooking.startDate,
        returnTime: plainBooking.endDate,
        pickupAddressSnapshot: plainBooking.pickupAddressSnapshot || "",
        returnAddressSnapshot: plainBooking.returnAddressSnapshot || "",
        note: plainBooking.note || "",
        car: this.buildOwnerHistoryCarPayload(plainBooking.carId),
        renter: this.buildOwnerHistoryRenterPayload(plainBooking),
        owner: this.buildOwnerHistoryOwnerPayload(owner, plainBooking),
        pricing: {
          totalPrice,
          upfrontPaymentAmount,
          paidAmount: Math.min(paidAmount, totalPrice),
          remainingAmount,
        },
        paymentSummary: {
          totalPrice,
          paidAmount: Math.min(paidAmount, totalPrice),
          remainingAmount,
          status: summaryStatus,
        },
        payments: bookingPayments.map((payment) =>
          this.buildOwnerHistoryPaymentPayload(payment),
        ),
        contract: contract
          ? {
              id: String(contract._id || ""),
              contractCode: contract.contractCode || "",
              status: getContractStatusForBookingStatus(plainBooking.status),
            }
          : null,
        createdAt: plainBooking.createdAt,
        completedAt:
          plainBooking.completedAt ||
          (plainBooking.status === BookingStatusEnum.COMPLETED
            ? plainBooking.updatedAt
            : null),
        cancelledAt:
          plainBooking.status === BookingStatusEnum.CANCELLED
            ? plainBooking.updatedAt
            : null,
        noShowAt: plainBooking.noShowAt || null,
      };
    });
    const filteredHistories = histories.filter(
      (item) =>
        (!paymentStatus ||
          paymentStatus === "ALL" ||
          item.paymentStatus === paymentStatus) &&
        this.matchesOwnerHistoryKeyword(item, String(keyword || "").trim()),
    );
    const total = filteredHistories.length;
    const totalPages = Math.ceil(total / limitNumber);
    const pagedHistories = filteredHistories.slice(
      (pageNumber - 1) * limitNumber,
      pageNumber * limitNumber,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        bookings: pagedHistories,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages,
        },
      },
    });
  }

  async previewCancellation(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { reasonCode, reasonText, cancelReason } = req.body || {};

    await expireAbandonedPendingBookings();

    const preview = await cancellationRefundService.buildPreview(
      id,
      {
        userId: authUser.userId,
        role: authUser.role,
      },
      reasonCode,
      reasonText || cancelReason,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { preview },
    });
  }

  async cancelBookingWithRefund(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { reasonCode, reasonText, cancelReason, confirmed } = req.body || {};

    if (confirmed === false) {
      throw ErrorHelper.requestDataInvalid("Vui lòng xác nhận hủy booking");
    }

    await expireAbandonedPendingBookings();

    const { booking, refund } = await cancellationRefundService.cancelBooking(
      id,
      {
        userId: authUser.userId,
        role: authUser.role,
      },
      reasonCode,
      reasonText || cancelReason,
    );
    let autoRefundResult: any = null;

if (refund) {
  try {
    autoRefundResult =
      await cancellationRefundService.processAutomaticVnpayRefund(
        String(refund._id),
        String(req.ip || "127.0.0.1"),
      );
  } catch (error) {
    /*
     * Booking đã hủy thành công nên không làm request hủy thất bại
     * chỉ vì bước auto-refund gặp lỗi nội bộ.
     *
     * Refund vẫn còn trong DB để có thể recovery hoặc xử lý thủ công.
     */
    console.error(
      "[BQDrive][VNPay Refund] Auto-refund sau khi hủy booking thất bại:",
      error,
    );
  }
}
// Đọc lại dữ liệu mới nhất sau khi auto-refund xử lý.
const refreshedBooking =
  (await BookingModel.findById(booking._id)) ||
  booking;

const refreshedRefund = refund
  ? await RefundModel.findOne({
      _id: refund._id,
      isDeleted: false,
    })
  : null;

  void notificationCenterService.notifyBookingCancelled(
  refreshedBooking,
  authUser.userId,
);

if (refreshedRefund) {
  void notificationCenterService.notifyRefundCreated(
    refreshedRefund,
    refreshedBooking,
  );
}

void sendBookingCancellationRefundMail(
  refreshedBooking,
  refreshedRefund,
);

const refundStatus = String(
  refreshedRefund?.status || "",
);

const message = !refreshedRefund
  ? "Booking đã được hủy."
  : refundStatus === "SUCCEEDED"
    ? "Booking đã được hủy và hoàn tiền thành công."
    : refundStatus === "PROCESSING"
      ? "Booking đã được hủy. Yêu cầu hoàn tiền đang được xử lý."
      : "Booking đã được hủy. Yêu cầu hoàn tiền đang chờ xử lý.";

return res.status(200).json({
  status: 200,
  code: "200",
  message,
  data: {
    booking: refreshedBooking,
    refund: refreshedRefund,

    autoRefund: autoRefundResult
      ? {
          eligible:
            autoRefundResult.eligible ?? false,
          completed:
            autoRefundResult.completed ?? false,
          reason:
            autoRefundResult.reason || null,
          operationStatus:
            autoRefundResult.operationStatus ||
            null,
        }
      : null,
  },
});
  }

  async cancelBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { cancelReason } = req.body;

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      userId: authUser.userId,
      status: {
        $in: [
          BookingStatusEnum.REQUESTED, // Khách được hủy khi chủ xe chưa duyệt
          BookingStatusEnum.OWNER_APPROVED, // Khách được hủy khi đã duyệt nhưng chưa thanh toán
          BookingStatusEnum.PAYMENT_PENDING, // Khách được hủy nếu đang chờ thanh toán và chưa trả tiền
        ],
      },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    transitionBookingStatus(booking, BookingStatusEnum.CANCELLED);
    booking.cancelReason = cancelReason || "Customer hủy booking";
    await booking.save();
    void notificationCenterService.notifyBookingCancelled(
      booking,
      authUser.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Hủy booking thành công",
      data: { booking },
    });
  }

  async confirmBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    const owner = await this.getOwnerContext(authUser);
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: { $in: OWNER_REVIEW_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    if (!hasEligibleRenterSnapshot(booking.renterEligibilitySnapshot)) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chưa có hồ sơ giấy tờ hợp lệ để duyệt.",
      );
    }

    await ensureNoOverlappedActiveBooking(booking);

    const car = await CarModel.findOne({
      _id: booking.carId,
      ...this.buildOwnerFilter(owner),
      status: { $in: BOOKABLE_CAR_STATUSES },
      isDeleted: false,
    } as any);

    if (!car) {
      throw ErrorHelper.requestDataInvalid(
        "Xe hiện không khả dụng để xác nhận",
      );
    }
    const ownerApprovedAt = new Date();
    const updatedBooking = await BookingModel.findOneAndUpdate(
      {
        _id: booking._id,
        ...this.buildOwnerFilter(owner),
        status: BookingStatusEnum.REQUESTED,
        isDeleted: false,
      } as any,
      {
        $set: {
          status: BookingStatusEnum.OWNER_APPROVED,
          ownerApprovedAt,
          paymentDeadlineAt: getBookingHoldExpiresAt(ownerApprovedAt),
        },
      },
      { new: true, runValidators: true },
    );

    if (!updatedBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Booking đã được xử lý ở một phiên làm việc khác.",
      );
    }

    void sendBookingApprovedMail(updatedBooking);
    void notificationCenterService.notifyBookingApproved(
      updatedBooking,
      authUser.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xác nhận booking thành công",
      data: { booking: updatedBooking },
    });
  }

  async rejectBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const rejectReason = String(req.body?.rejectReason || "").trim();

    if (!rejectReason) {
      throw ErrorHelper.requestDataInvalid(
        "Vui lòng nhập lý do từ chối booking.",
      );
    }

    if (rejectReason.length > 500) {
      throw ErrorHelper.requestDataInvalid(
        "Lý do từ chối không được vượt quá 500 ký tự.",
      );
    }

    const owner = await this.getOwnerContext(authUser);
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: { $in: OWNER_REVIEW_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    const updatedBooking = await BookingModel.findOneAndUpdate(
      {
        _id: booking._id,
        ...this.buildOwnerFilter(owner),
        status: BookingStatusEnum.REQUESTED,
        isDeleted: false,
      } as any,
      {
        $set: {
          status: BookingStatusEnum.REJECTED,
          cancelReason: rejectReason,
        },
      },
      { new: true, runValidators: true },
    );

    if (!updatedBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Booking đã được xử lý ở một phiên làm việc khác.",
      );
    }

    void sendBookingRejectedMail(updatedBooking);
    void notificationCenterService.notifyBookingRejected(
      updatedBooking,
      rejectReason,
      authUser.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã từ chối booking.",
      data: { booking: updatedBooking },
    });
  }

  async confirmRemainingCash(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const note = String(req.body?.note || "").trim();
    const owner = await this.getOwnerContext(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: {
        $nin: [
          BookingStatusEnum.COMPLETED,
          BookingStatusEnum.CANCELLED,
          BookingStatusEnum.REJECTED,
          BookingStatusEnum.NO_SHOW,
        ],
      },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn không có quyền xác nhận thanh toán booking này.",
      );
    }

    const allowedStatuses = [
      BookingStatusEnum.RETURN_INSPECTION,
      BookingStatusEnum.AWAITING_EXTRA_CHARGE,
    ];

    if (!allowedStatuses.includes(booking.status as BookingStatusEnum)) {
      throw ErrorHelper.requestDataInvalid(
        "Chỉ được xác nhận tiền mặt sau khi đã tiếp nhận xe trả.",
      );
    }

    const result = await this.confirmRemainingCashPayment(
      booking,
      authUser,
      note,
    );
    if (result.payment) {
      void notificationCenterService.notifyCashPaymentConfirmed(
        booking,
        result.payment,
        authUser.userId,
      );
    }
    const freshBooking = await BookingModel.findById(booking._id)
      .populate("userId", "-password")
      .populate("carId")

      .populate("ownerId", "-password -otpCode");

    return res.status(200).json({
      status: 200,
      code: "200",
      message: result.message,
      data: {
        booking: freshBooking || booking,
        payment: result.payment,
        paymentSummary: result.summary,
      },
    });
  }

  async handoverBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const owner = await this.getOwnerContext(authUser);
    const handoverOdometerKm = this.parseRequiredNonNegativeInteger(
      req.body?.handoverOdometerKm,
      "ODO bàn giao",
    );
    const handoverEnergyLevelPercent = this.parseRequiredEnergyPercent(
      req.body?.handoverEnergyLevelPercent,
      "Mức nhiên liệu/năng lượng bàn giao",
    );
    const handoverDashboardImage = String(
      req.body?.handoverDashboardImage || "",
    ).trim();
    const handoverPhotos = this.normalizeReturnPhotos(req.body?.handoverPhotos);
    const handoverConditionNotes = String(
      req.body?.handoverConditionNotes || "",
    ).trim();
    const preparationOdometerKm = this.parseRequiredNonNegativeInteger(
      req.body?.preparation?.odometerKm ?? handoverOdometerKm,
      "ODO kiểm tra trước khi giao",
    );
    const preparationEnergyLevelPercent = this.parseRequiredEnergyPercent(
      req.body?.preparation?.energyLevelPercent ?? handoverEnergyLevelPercent,
      "Mức nhiên liệu/năng lượng kiểm tra trước khi giao",
    );
    const preparationNote = String(req.body?.preparation?.note || "").trim();
    const preparationImages = this.normalizeReturnPhotos(
      req.body?.preparation?.images,
    );
    const preparationDashboardImage = String(
      req.body?.preparation?.dashboardImage || "",
    ).trim();
    const vehicleCondition = this.parseRequiredBooleanChecklist(
      req.body?.vehicleCondition,
      VEHICLE_CONDITION_KEYS,
      "Tình trạng xe",
    );
    const accessoriesSnapshot = this.parseRequiredBooleanChecklist(
      req.body?.accessoriesSnapshot,
      VEHICLE_ACCESSORY_KEYS,
      "Phụ kiện theo xe",
    );
    const vehicleDocumentsSnapshot = this.parseRequiredBooleanChecklist(
      req.body?.vehicleDocumentsSnapshot,
      VEHICLE_DOCUMENT_KEYS,
      "Giấy tờ theo xe",
    );

    if (!accessoriesSnapshot.chargingCableApplicable) {
      accessoriesSnapshot.chargingCablePresent = false;
    }

    if (handoverConditionNotes.length > 1000 || preparationNote.length > 1000) {
      throw ErrorHelper.requestDataInvalid(
        "Ghi chú tình trạng xe không được vượt quá 1000 ký tự.",
      );
    }

    if (
      Object.values(vehicleCondition).some((isOk) => !isOk) &&
      !handoverConditionNotes
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Vui lòng ghi chú cụ thể khi có hạng mục tình trạng xe không đạt.",
      );
    }

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: { $in: HANDOVER_ALLOWED_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chưa đủ điều kiện bàn giao",
      );
    }

    if (booking.handoverSnapshot?.ownerConfirmedAt) {
      throw ErrorHelper.requestDataInvalid(
        "Chủ xe đã xác nhận biên bản bàn giao; dữ liệu này đã được khóa.",
      );
    }

    await syncBookingPaymentFromPaidPayments(booking);
    await assertCarReadyForHandover(booking);

    const car = await CarModel.findOne({
      _id: booking.carId,
      ...this.buildOwnerFilter(owner),
      status: { $in: [CarStatusEnum.APPROVED, CarStatusEnum.RENTED] },
      isDeleted: false,
    } as any).select("currentOdometerKm status");

    if (!car) {
      throw ErrorHelper.requestDataInvalid(
        "Xe không tồn tại hoặc không đủ điều kiện bàn giao.",
      );
    }

    if (
      car.currentOdometerKm !== null &&
      car.currentOdometerKm !== undefined &&
      handoverOdometerKm < Number(car.currentOdometerKm)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "ODO bàn giao không được nhỏ hơn ODO hiện tại của xe.",
      );
    }

    this.assertHandoverPaymentIsSatisfied(booking);
    const recordedAt = new Date();
    const updatedBooking = await BookingModel.findOneAndUpdate(
      {
        _id: booking._id,
        ...this.buildOwnerFilter(owner),
        status: { $in: HANDOVER_ALLOWED_BOOKING_STATUSES },
        actualPickupAt: null,
        "handoverSnapshot.ownerConfirmedAt": { $in: [null] },
        isDeleted: false,
      } as any,
      {
        $set: {
          handoverSnapshot: {
            preparation: {
              odometerKm: preparationOdometerKm,
              energyLevelPercent: preparationEnergyLevelPercent,
              images: preparationImages,
              ...(preparationDashboardImage ? { dashboardImage: preparationDashboardImage } : {}),
              ...(preparationNote ? { note: preparationNote } : {}),
              recordedAt,
              recordedBy: authUser.userId,
            },
            handoverOdometerKm,
            handoverEnergyLevelPercent,
            handoverPhotos,
            ...(handoverDashboardImage ? { handoverDashboardImage } : {}),
            ...(handoverConditionNotes
              ? { handoverConditionNotes }
              : {}),
            vehicleCondition,
            accessoriesSnapshot,
            vehicleDocumentsSnapshot,
            handoverRecordedAt: recordedAt,
            handoverRecordedBy: authUser.userId,
            ownerConfirmedAt: recordedAt,
            ownerConfirmedBy: authUser.userId,
          },
        },
      },
      { new: true, runValidators: true },
    );

    if (!updatedBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Booking đã được xác nhận bàn giao hoặc thay đổi trạng thái ở phiên khác.",
      );
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã xác nhận biên bản bàn giao, đang chờ người thuê xác nhận nhận xe.",
      data: { booking: updatedBooking },
    });
  }

  async confirmHandoverReceived(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const session = await mongoose.startSession();
    let booking: any = null;

    try {
      await session.withTransaction(async () => {
        const currentBooking = await BookingModel.findOne({
          _id: id,
          userId: authUser.userId,
          status: { $in: HANDOVER_ALLOWED_BOOKING_STATUSES },
          actualPickupAt: null,
          "handoverSnapshot.ownerConfirmedAt": { $ne: null },
          "handoverSnapshot.renterConfirmedAt": { $in: [null] },
          isDeleted: false,
        } as any).session(session);

        if (!currentBooking) {
          throw ErrorHelper.requestDataInvalid(
            "Biên bản bàn giao chưa sẵn sàng để bạn xác nhận hoặc đã được xác nhận trước đó.",
          );
        }

        this.assertHandoverPaymentIsSatisfied(currentBooking);
        const confirmedAt = new Date();
        await assertCarReadyForHandover(currentBooking, {
          now: confirmedAt,
          session,
        });
        booking = await BookingModel.findOneAndUpdate(
          {
            _id: currentBooking._id,
            userId: authUser.userId,
            status: currentBooking.status,
            actualPickupAt: null,
            "handoverSnapshot.ownerConfirmedAt": { $ne: null },
            "handoverSnapshot.renterConfirmedAt": { $in: [null] },
            isDeleted: false,
          } as any,
          {
            $set: {
              status: BookingStatusEnum.IN_PROGRESS,
              actualPickupAt: confirmedAt,
              "handoverSnapshot.renterConfirmedAt": confirmedAt,
              "handoverSnapshot.renterConfirmedBy": authUser.userId,
            },
          },
          { new: true, runValidators: true, session },
        );

        if (!booking) {
          throw ErrorHelper.requestDataInvalid(
            "Booking đã thay đổi ở phiên khác, vui lòng tải lại.",
          );
        }

        const updatedCar = await CarModel.findOneAndUpdate(
          {
            _id: booking.carId,
            status: { $in: [CarStatusEnum.APPROVED, CarStatusEnum.RENTED] },
            isDeleted: false,
          } as any,
          {
            $set: {
              status: CarStatusEnum.RENTED,
              currentOdometerKm: booking.handoverSnapshot.handoverOdometerKm,
            },
          },
          { new: true, runValidators: true, session },
        );

        if (!updatedCar) {
          throw ErrorHelper.requestDataInvalid(
            "Xe không còn đủ điều kiện để bắt đầu chuyến thuê.",
          );
        }
      });
    } finally {
      await session.endSession();
    }

    void sendBookingHandoverMail(booking);
    void notificationCenterService.notifyHandoverCompleted(booking, authUser.userId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã xác nhận nhận xe. Booking bắt đầu được tính là đang thuê.",
      data: { booking },
    });
  }

  async receiveReturn(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const owner = await this.getOwnerContext(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.requestDataInvalid(
        "Booking không tồn tại hoặc bạn không có quyền tiếp nhận xe trả.",
      );
    }

    if (booking.actualReturnAt) {
      throw ErrorHelper.requestDataInvalid(
        "Thời gian trả xe thực tế đã được ghi nhận trước đó.",
      );
    }

    if (booking.status !== BookingStatusEnum.IN_PROGRESS) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chưa ở trạng thái đang thuê, không thể tiếp nhận xe trả.",
      );
    }

    const existedInspection = await this.findReturnInspectionForBooking(
      booking._id,
    );

    if (existedInspection) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đã được tiếp nhận trả trước đó.",
      );
    }

    const actualReturnAt = new Date();
    const returnOdometerKm = this.parseRequiredNonNegativeInteger(
      req.body?.returnOdometerKm ?? req.body?.returnOdometer,
      "ODO nhận lại",
    );
    const returnEnergyLevelPercent = this.parseRequiredEnergyPercent(
      req.body?.returnEnergyLevelPercent ?? req.body?.returnFuelLevel,
      "Mức nhiên liệu/năng lượng nhận lại",
    );
    const returnDashboardImage = String(
      req.body?.returnDashboardImage || "",
    ).trim();

    const carAtReturn = await CarModel.findOne({
      _id: booking.carId,
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    } as any).select("currentOdometerKm");

    if (!carAtReturn) {
      throw ErrorHelper.requestDataInvalid(
        "Xe không tồn tại hoặc bạn không có quyền tiếp nhận xe trả.",
      );
    }

    const mileageEvaluation = this.buildMileageEvaluation(
      booking,
      returnOdometerKm,
      carAtReturn.currentOdometerKm,
    );

    const conditionNotes = String(req.body?.conditionNotes || "").trim();
    const vehicleCondition = this.parseRequiredBooleanChecklist(
      req.body?.vehicleCondition,
      VEHICLE_CONDITION_KEYS,
      "Tình trạng xe khi nhận lại",
    );
    const accessoriesSnapshot = this.parseRequiredBooleanChecklist(
      req.body?.accessoriesSnapshot,
      VEHICLE_ACCESSORY_KEYS,
      "Phụ kiện khi nhận lại",
    );
    const vehicleDocumentsSnapshot = this.parseRequiredBooleanChecklist(
      req.body?.vehicleDocumentsSnapshot,
      VEHICLE_DOCUMENT_KEYS,
      "Giấy tờ khi nhận lại",
    );
    const handoverChargingCableApplicable =
      booking.handoverSnapshot?.accessoriesSnapshot?.chargingCableApplicable;

    if (typeof handoverChargingCableApplicable === "boolean") {
      accessoriesSnapshot.chargingCableApplicable =
        handoverChargingCableApplicable;
    }
    if (!accessoriesSnapshot.chargingCableApplicable) {
      accessoriesSnapshot.chargingCablePresent = false;
    }

    if (conditionNotes.length > 1000) {
      throw ErrorHelper.requestDataInvalid(
        "Ghi chú tình trạng xe không được vượt quá 1000 ký tự.",
      );
    }

    if (
      Object.values(vehicleCondition).some((isOk) => !isOk) &&
      !conditionNotes
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Vui lòng ghi chú cụ thể khi có hạng mục tình trạng xe không đạt.",
      );
    }

    const lateReturnCalculation = calculateLateReturnFee(
      booking.endDate,
      actualReturnAt,
    );

    const inspectionPayload: any = {
      bookingId: booking._id,
      carId: booking.carId,
      renterId: booking.userId,
      ownerId: booking.ownerId,

      receivedAt: new Date(),
      receivedBy: authUser.userId,
      actualReturnAt,
      returnOdometerKm,
      returnEnergyLevelPercent,
      ...(returnDashboardImage ? { returnDashboardImage } : {}),
      ...mileageEvaluation,
      returnPhotos: this.normalizeReturnPhotos(req.body?.returnPhotos),
      conditionNotes,
      isLate: lateReturnCalculation.lateMinutes > 0,
      lateMinutes: lateReturnCalculation.lateMinutes,
      hasDamage: Boolean(req.body?.hasDamage),
      hasCleaningIssue: Boolean(req.body?.hasCleaningIssue),
      hasFuelShortage: Boolean(req.body?.hasFuelShortage),
      vehicleCondition,
      accessoriesSnapshot,
      vehicleDocumentsSnapshot,
      inspectionStatus: ReturnInspectionStatusEnum.RECEIVED,
    };

    const session = await mongoose.startSession();
    let updatedBooking: any = null;
    let inspection: any = null;

    try {
      await session.withTransaction(async () => {
        updatedBooking = await BookingModel.findOneAndUpdate(
          {
            _id: booking._id,
            ...this.buildOwnerFilter(owner),
            status: BookingStatusEnum.IN_PROGRESS,
            actualReturnAt: null,
            isDeleted: false,
          } as any,
          {
            $set: {
              status: BookingStatusEnum.RETURN_INSPECTION,
              actualReturnAt,
            },
          },
          { new: true, runValidators: true, session },
        );

        if (!updatedBooking) {
          throw ErrorHelper.requestDataInvalid(
            "Booking đã được tiếp nhận xe trả hoặc thay đổi trạng thái ở phiên khác.",
          );
        }

        const createdInspections = await ReturnInspectionModel.create(
          [inspectionPayload],
          { session },
        );
        inspection = createdInspections[0];

        const updatedCar = await CarModel.findOneAndUpdate(
          {
            _id: booking.carId,
            ...this.buildOwnerFilter(owner),
            isDeleted: false,
          } as any,
          { $set: { currentOdometerKm: returnOdometerKm } },
          { new: true, runValidators: true, session },
        );

        if (!updatedCar) {
          throw ErrorHelper.requestDataInvalid(
            "Không thể cập nhật ODO của xe khi tiếp nhận xe trả.",
          );
        }
      });
    } finally {
      await session.endSession();
    }

    void notificationCenterService.notifyReturnReceived(
      updatedBooking,
      authUser.userId,
    );
    void sendReturnInspectionCompletedMail(updatedBooking, inspection);

    const completionState = await this.buildReturnCompletionState(
      updatedBooking,
      inspection,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã tiếp nhận xe trả. Vui lòng kiểm tra tình trạng xe.",
      data: {
        booking: updatedBooking,
        inspection: this.withLateReturnCalculation(updatedBooking, inspection),
        completionState,
      },
    });
  }

  async getReturnInspection(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const booking = await this.findBookingForReturnInspectionRead(id, authUser);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    const inspection =
      await this.refreshInspectionStatusFromExtraCharges(booking);
    const extraCharges = await ExtraChargeModel.find({
      bookingId: booking._id,
      isDeleted: false,
    } as any).sort({ createdAt: -1 });
    const completionState = await this.buildReturnCompletionState(
      booking,
      inspection,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        booking,
        inspection: this.withLateReturnCalculation(booking, inspection),
        extraCharges,
        completionState,
      },
    });
  }

  async clearReturnInspection(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const owner = await this.getOwnerContext(authUser);
    const conditionNotes = String(req.body?.conditionNotes || "").trim();
    const session = await mongoose.startSession();
    let booking: any;
    let inspection: any;
    let hasPendingExtraCharge = false;

    try {
      await session.withTransaction(async () => {
        booking = await BookingModel.findOne({
          _id: id,
          ...this.buildOwnerFilter(owner),
          status: {
            $in: [
              BookingStatusEnum.RETURN_INSPECTION,
              BookingStatusEnum.AWAITING_EXTRA_CHARGE,
            ],
          },
          isDeleted: false,
        } as any).session(session);

        if (!booking) {
          throw ErrorHelper.requestDataInvalid(
            "Bạn không có quyền kiểm tra xe hoặc booking chưa ở bước kiểm tra.",
          );
        }

        inspection = await ReturnInspectionModel.findOne({
          bookingId: booking._id,
          isDeleted: false,
        } as any).session(session);

        if (!inspection) {
          throw ErrorHelper.requestDataInvalid(
            "Bạn phải tiếp nhận xe trả trước khi xác nhận kiểm tra.",
          );
        }

        if (inspection.ownerConfirmedAt) {
          throw ErrorHelper.requestDataInvalid(
            "Chủ xe đã xác nhận biên bản trả xe; dữ liệu này đã được khóa.",
          );
        }

        const pendingExtraCharge = await ExtraChargeModel.findOne({
          bookingId: booking._id,
          status: ExtraChargeStatusEnum.PENDING,
          isDeleted: false,
        } as any)
          .select("_id")
          .session(session);

        if (pendingExtraCharge) {
          hasPendingExtraCharge = true;
          inspection = await ReturnInspectionModel.findOneAndUpdate(
            {
              _id: inspection._id,
              ownerConfirmedAt: { $in: [null] },
              isDeleted: false,
            } as any,
            {
              $set: {
                inspectionStatus: ReturnInspectionStatusEnum.CHARGES_PENDING,
                ownerConfirmedAt: new Date(),
                ownerConfirmedBy: authUser.userId,
              },
            },
            { new: true, session },
          );
          booking = await BookingModel.findOneAndUpdate(
            {
              _id: booking._id,
              status: {
                $in: [
                  BookingStatusEnum.RETURN_INSPECTION,
                  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
                ],
              },
              isDeleted: false,
            } as any,
            { $set: { status: BookingStatusEnum.AWAITING_EXTRA_CHARGE } },
            { new: true, session },
          );
          return;
        }

        inspection = await ReturnInspectionModel.findOneAndUpdate(
          {
            _id: inspection._id,
            ownerConfirmedAt: { $in: [null] },
            isDeleted: false,
          } as any,
          {
            $set: {
              ...(conditionNotes
                ? { conditionNotes: conditionNotes.slice(0, 1000) }
                : {}),
              inspectionStatus: ReturnInspectionStatusEnum.CLEARED,
              inspectedAt: new Date(),
              inspectedBy: authUser.userId,
              ownerConfirmedAt: new Date(),
              ownerConfirmedBy: authUser.userId,
            },
          },
          { new: true, session },
        );
        if (!inspection) {
          throw ErrorHelper.requestDataInvalid(
            "Trạng thái booking đã thay đổi, vui lòng tải lại.",
          );
        }
      });
    } finally {
      await session.endSession();
    }

    void notificationCenterService.notifyReturnInspectionCleared(
      booking,
      authUser.userId,
    );

    const completionState = await this.buildReturnCompletionState(
      booking,
      inspection,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: hasPendingExtraCharge
        ? "Đã xác nhận nhận lại xe. Booking đang chờ xử lý phụ phí."
        : "Đã xác nhận nhận lại xe, đang chờ người thuê xác nhận đã trả xe.",
      data: {
        booking,
        inspection: this.withLateReturnCalculation(booking, inspection),
        completionState,
      },
    });
  }

  async completeBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const owner = await this.getOwnerContext(authUser);
    const paymentSyncBooking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: {
        $in: [
          BookingStatusEnum.RETURN_INSPECTION,
          BookingStatusEnum.AWAITING_EXTRA_CHARGE,
        ],
      },
      isDeleted: false,
    } as any);

    if (!paymentSyncBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn phải tiếp nhận và kiểm tra xe trước khi hoàn tất booking.",
      );
    }

    await syncBookingPaymentFromPaidPayments(paymentSyncBooking);

    const session = await mongoose.startSession();
    let booking: any;

    try {
      await session.withTransaction(async () => {
        const currentBooking = await BookingModel.findOne({
          _id: id,
          ...this.buildOwnerFilter(owner),
          status: {
            $in: [
              BookingStatusEnum.RETURN_INSPECTION,
              BookingStatusEnum.AWAITING_EXTRA_CHARGE,
            ],
          },
          isDeleted: false,
        } as any).session(session);

        if (!currentBooking) {
          throw ErrorHelper.requestDataInvalid(
            "Booking không còn ở trạng thái có thể hoàn tất.",
          );
        }

        const inspection = await ReturnInspectionModel.findOne({
          bookingId: currentBooking._id,
          ownerConfirmedAt: { $ne: null },
          renterConfirmedAt: { $ne: null },
          isDeleted: false,
        } as any).session(session);

        if (!inspection) {
          throw ErrorHelper.requestDataInvalid(
            "Việc kiểm tra tình trạng xe chưa hoàn tất.",
          );
        }

        this.assertBookingPaymentIsSettled(currentBooking);
        const pendingExtraCharge = await ExtraChargeModel.findOne({
          bookingId: currentBooking._id,
          status: ExtraChargeStatusEnum.PENDING,
          isDeleted: false,
        } as any)
          .select("_id")
          .session(session);

        if (pendingExtraCharge) {
          throw ErrorHelper.requestDataInvalid(
            "Booking còn phí phát sinh chưa xử lý, chưa thể hoàn tất chuyến thuê.",
          );
        }

        booking = await BookingModel.findOneAndUpdate(
          {
            _id: currentBooking._id,
            status: currentBooking.status,
            isDeleted: false,
          } as any,
          {
            $set: {
              status: BookingStatusEnum.COMPLETED,
              completedAt: new Date(),
            },
          },
          { new: true, session },
        );

        if (!booking) {
          throw ErrorHelper.requestDataInvalid(
            "Booking đã được xử lý ở phiên khác, vui lòng tải lại.",
          );
        }
      });
    } finally {
      await session.endSession();
    }

    await syncContractFromBooking(booking);
    await releaseCarIfNoConfirmedBooking(booking.carId);
    void sendBookingCompletedMail(booking);
    void notificationCenterService.notifyBookingCompleted(
      booking,
      authUser.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Hoàn tất booking thành công",
      data: { booking },
    });
  }

  async confirmReturn(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const session = await mongoose.startSession();
    let booking: any = null;
    let inspection: any = null;
    let hasPendingExtraCharge = false;

    try {
      await session.withTransaction(async () => {
        booking = await BookingModel.findOne({
          _id: id,
          userId: authUser.userId,
          status: {
            $in: [
              BookingStatusEnum.RETURN_INSPECTION,
              BookingStatusEnum.AWAITING_EXTRA_CHARGE,
            ],
          },
          isDeleted: false,
        } as any).session(session);

        if (!booking) {
          throw ErrorHelper.requestDataInvalid(
            "Booking chưa ở bước xác nhận trả xe hoặc không thuộc tài khoản của bạn.",
          );
        }

        inspection = await ReturnInspectionModel.findOne({
          bookingId: booking._id,
          renterId: authUser.userId,
          ownerConfirmedAt: { $ne: null },
          renterConfirmedAt: { $in: [null] },
          isDeleted: false,
        } as any).session(session);

        if (!inspection) {
          throw ErrorHelper.requestDataInvalid(
            "Chủ xe chưa xác nhận biên bản trả xe hoặc biên bản đã được xác nhận trước đó.",
          );
        }

        const confirmedAt = new Date();
        inspection = await ReturnInspectionModel.findOneAndUpdate(
          {
            _id: inspection._id,
            renterConfirmedAt: { $in: [null] },
            isDeleted: false,
          } as any,
          {
            $set: {
              renterConfirmedAt: confirmedAt,
              renterConfirmedBy: authUser.userId,
            },
          },
          { new: true, runValidators: true, session },
        );

        if (!inspection) {
          throw ErrorHelper.requestDataInvalid(
            "Biên bản trả xe đã thay đổi ở phiên khác, vui lòng tải lại.",
          );
        }

        const pendingCharge = await ExtraChargeModel.findOne({
          bookingId: booking._id,
          status: ExtraChargeStatusEnum.PENDING,
          isDeleted: false,
        } as any)
          .select("_id")
          .session(session);

        hasPendingExtraCharge = Boolean(pendingCharge);
        if (hasPendingExtraCharge && booking.status !== BookingStatusEnum.AWAITING_EXTRA_CHARGE) {
          booking = await BookingModel.findOneAndUpdate(
            { _id: booking._id, isDeleted: false } as any,
            { $set: { status: BookingStatusEnum.AWAITING_EXTRA_CHARGE } },
            { new: true, session },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    if (!hasPendingExtraCharge) {
      await syncBookingPaymentFromPaidPayments(booking);
      if (this.getOutstandingAmount(booking) <= 0) {
        const completedBooking = await BookingModel.findOneAndUpdate(
          {
            _id: booking._id,
            status: BookingStatusEnum.RETURN_INSPECTION,
            isDeleted: false,
          } as any,
          {
            $set: {
              status: BookingStatusEnum.COMPLETED,
              completedAt: new Date(),
            },
          },
          { new: true },
        );

        if (completedBooking) {
          booking = completedBooking;
          await syncContractFromBooking(booking);
          await releaseCarIfNoConfirmedBooking(booking.carId);
          void sendBookingCompletedMail(booking);
          void notificationCenterService.notifyBookingCompleted(booking, authUser.userId);
        }
      }
    }

    const completionState = await this.buildReturnCompletionState(booking, inspection);
    return res.status(200).json({
      status: 200,
      code: "200",
      message: hasPendingExtraCharge
        ? "Đã xác nhận trả xe. Phụ phí (nếu có) vẫn được xử lý độc lập."
        : booking.status === BookingStatusEnum.COMPLETED
          ? "Đã xác nhận trả xe và hoàn tất booking."
          : "Đã xác nhận trả xe. Booking sẽ hoàn tất sau khi đủ điều kiện thanh toán.",
      data: {
        booking,
        inspection: this.withLateReturnCalculation(booking, inspection),
        completionState,
      },
    });
  }

async noShowBooking(req: Request, res: Response) {
  const authUser = (req as any).user;
  const id = String(req.params.id);
  const { noShowReason } = req.body;

  const owner = await this.getOwnerContext(authUser);

  const booking = await BookingModel.findOne({
    _id: id,
    ...this.buildOwnerFilter(owner),
    isDeleted: false,
  } as any);

  if (!booking) {
    throw ErrorHelper.requestDataInvalid(
      "Bạn không có quyền xử lý booking này.",
    );
  }

  /*
   * Trường hợp recovery:
   *
   * Booking có thể đã chuyển sang NO_SHOW thành công nhưng request trước
   * bị lỗi trước khi Refund được tạo.
   *
   * Khi chủ xe gửi lại request, không chặn ngay mà cho service kiểm tra
   * và tạo Refund còn thiếu bằng idempotencyKey.
   */
  if (
    String(booking.status || "") ===
    BookingStatusEnum.NO_SHOW
  ) {
    const refundResult =
      await cancellationRefundService.ensureNoShowRefund(
        booking,
        authUser.userId,
      );

    const refreshedBooking =
      (await BookingModel.findById(booking._id)) ||
      booking;

    await syncContractFromBooking(
      refreshedBooking,
    );

    await releaseCarIfNoConfirmedBooking(
      refreshedBooking.carId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message:
        "Booking đã được đánh dấu khách không nhận xe.",
      data: {
        booking: refreshedBooking,
        refund: refundResult.refund,
        refundSummary: {
          paidAmountAtNoShow:
            refundResult.paidAmountAtNoShow,
          cancellationFee:
            refundResult.cancellationFee,
          refundAmount:
            refundResult.refundAmount,
          rentalDepositAmount:
            refundResult.rentalDepositAmount,
          platformFee:
            refundResult.platformFee,
          deliveryFee:
            refundResult.deliveryFee,
          retainedDeliveryFee:
            refundResult.retainedDeliveryFee,
          policyRuleApplied:
            refundResult.policyRuleApplied,
        },
      },
    });
  }

  /*
   * Với booking chưa phải NO_SHOW, vẫn áp dụng toàn bộ kiểm tra cũ:
   * - đúng trạng thái;
   * - chưa bàn giao;
   * - đã qua giờ nhận xe + 30 phút.
   */
  this.assertBookingCanBeNoShow(booking);

  transitionBookingStatus(
    booking,
    BookingStatusEnum.NO_SHOW,
  );

  /*
   * Cọc thuê không được hoàn khi khách NO_SHOW.
   * Phí bảo hiểm và phần tiền trả vượt cọc vẫn có thể được hoàn
   * theo chính sách Refund riêng.
   */
  booking.isDepositRefundable = false;

  booking.noShowReason =
    String(noShowReason || "").trim() ||
    "Khách hàng không đến nhận xe đúng thời gian.";

  booking.noShowAt = new Date();

  await booking.save();

  /*
   * Phải tạo/khôi phục Refund sau khi booking đã thực sự ở NO_SHOW.
   *
   * Nếu bước này lỗi:
   * - booking vẫn là NO_SHOW;
   * - request trả lỗi;
   * - lần gọi lại sẽ đi vào nhánh recovery phía trên;
   * - idempotencyKey ngăn tạo hai Refund.
   */
  const refundResult =
    await cancellationRefundService.ensureNoShowRefund(
      booking,
      authUser.userId,
    );

  /*
   * ensureNoShowRefund cập nhật cancellationSummary trực tiếp trong DB,
   * nên đọc lại booking để response và Contract sử dụng dữ liệu mới nhất.
   */
  const refreshedBooking =
    (await BookingModel.findById(booking._id)) ||
    booking;

  await syncContractFromBooking(
    refreshedBooking,
  );

  await releaseCarIfNoConfirmedBooking(
    refreshedBooking.carId,
  );

  void sendBookingNoShowMail(
    refreshedBooking,
  );

  void notificationCenterService.notifyNoShow(
    refreshedBooking,
    authUser.userId,
  );

  return res.status(200).json({
    status: 200,
    code: "200",
    message: "Đã đánh dấu khách không nhận xe.",
    data: {
      booking: refreshedBooking,

      refund: refundResult.refund,

      refundSummary: {
        paidAmountAtNoShow:
          refundResult.paidAmountAtNoShow,

        cancellationFee:
          refundResult.cancellationFee,

        refundAmount:
          refundResult.refundAmount,

        rentalDepositAmount:
          refundResult.rentalDepositAmount,

        platformFee:
          refundResult.platformFee,

        deliveryFee:
          refundResult.deliveryFee,

        retainedDeliveryFee:
          refundResult.retainedDeliveryFee,

        policyRuleApplied:
          refundResult.policyRuleApplied,
      },
    },
  });
}
}

export default new BookingRoute().router;
