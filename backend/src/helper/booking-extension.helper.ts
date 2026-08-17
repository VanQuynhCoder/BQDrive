import mongoose, { type ClientSession } from "mongoose";

import { BaseError, ErrorHelper } from "../base/error";
import {
  BookingExtensionRequestTypeEnum,
  BookingExtensionStatusEnum,
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  RentalModeEnum,
} from "../constants/model.const";
import {
  DAILY_EXTENSION_MIN_DAYS,
  DAY_MS,
  HOUR_MS,
  HOURLY_EXTENSION_MIN_HOURS,
  HOURLY_RENTAL_MAX_TOTAL_HOURS,
} from "../constants/rental-policy.const";
import { BookingExtensionModel } from "../models/booking-extension/bookingExtension.model";
import { BookingModel } from "../models/booking/booking.model";
import { CarModel } from "../models/car/car.model";
import { ContractModel } from "../models/contract/contract.model";
import { PaymentModel } from "../models/payment/payment.model";
import { notificationCenterService } from "../services/notification-center.service";
import { assertCarAvailability } from "./car-availability.helper";
import {
  sendBookingExtensionActivatedMail,
  sendBookingExtensionExpiredMail,
} from "./mail.helper";
import { assertPaymentMethodAllowed } from "./payment-method-policy.helper";
import {
  calculateRentalPrice,
  getCarRentalSupport,
  normalizeRentalMode,
} from "./rental.helper";
import { buildBookingMileagePolicySnapshot } from "./booking-rate-plan-snapshot.helper";

export const BOOKING_EXTENSION_PAYMENT_MINUTES = 10;
export const BOOKING_EXTENSION_REQUEST_MIN_LEAD_MINUTES = 30;
const BOOKING_EXTENSION_REQUEST_MIN_LEAD_MS =
  BOOKING_EXTENSION_REQUEST_MIN_LEAD_MINUTES * 60 * 1000;
export { HOURLY_EXTENSION_MIN_HOURS };
export const HOURLY_BOOKING_MAX_TOTAL_HOURS =
  HOURLY_RENTAL_MAX_TOTAL_HOURS;
export const HOURLY_BOOKING_MAX_DURATION_MESSAGE =
  `Tổng thời lượng của booking thuê theo giờ không được vượt quá ${HOURLY_RENTAL_MAX_TOTAL_HOURS} giờ.`;
const EXTENSION_EXPIRATION_BATCH_SIZE = 25;
const EXTENSION_EXPIRATION_JOB_INTERVAL_MS = 60 * 1000;
let extensionExpirationJobStarted = false;
let extensionExpirationJobRunning = false;

function bookingExtensionDurationError(message: string) {
  return new BaseError(400, "-3", message, message);
}

export function assertBookingExtensionStillWithinCurrentRentalTime(
  booking: any,
  now = new Date(),
) {
  const currentEndAt = new Date(booking?.endDate);
  if (
    Number.isNaN(currentEndAt.getTime()) ||
    now.getTime() >= currentEndAt.getTime()
  ) {
    throw bookingExtensionDurationError(
      "Không thể xử lý gia hạn khi booking đã đến hoặc quá thời gian trả xe hiện tại.",
    );
  }
}

export function assertCanRequestBookingExtension(
  booking: any,
  now = new Date(),
) {
  assertBookingExtensionStillWithinCurrentRentalTime(booking, now);
  const currentEndAt = new Date(booking?.endDate);
  const remainingTimeMs = currentEndAt.getTime() - now.getTime();
  if (remainingTimeMs <= BOOKING_EXTENSION_REQUEST_MIN_LEAD_MS) {
    throw bookingExtensionDurationError(
      "Yêu cầu gia hạn phải được gửi trước thời gian trả xe ít nhất 30 phút.",
    );
  }
}

function keepsSameUtcClock(left: Date, right: Date) {
  return (
    left.getUTCHours() === right.getUTCHours() &&
    left.getUTCMinutes() === right.getUTCMinutes() &&
    left.getUTCSeconds() === right.getUTCSeconds() &&
    left.getUTCMilliseconds() === right.getUTCMilliseconds()
  );
}

function calendarDayDifference(start: Date, end: Date) {
  const startDate = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const endDate = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  return (endDate - startDate) / DAY_MS;
}

function getRequestType(extension: any) {
  return extension?.requestType ===
    BookingExtensionRequestTypeEnum.PLAN_CONVERSION
    ? BookingExtensionRequestTypeEnum.PLAN_CONVERSION
    : BookingExtensionRequestTypeEnum.EXTENSION;
}

export const ACTIVE_BOOKING_EXTENSION_STATUSES = [
  BookingExtensionStatusEnum.REQUESTED,
  BookingExtensionStatusEnum.OWNER_APPROVED,
  BookingExtensionStatusEnum.PAYMENT_PENDING,
];

export function getBookingExtensionPaymentDeadline(
  now = new Date(),
  bookingEndAt?: Date,
) {
  const regularDeadline = new Date(
    now.getTime() + BOOKING_EXTENSION_PAYMENT_MINUTES * 60 * 1000,
  );
  if (!bookingEndAt || Number.isNaN(bookingEndAt.getTime())) {
    return regularDeadline;
  }
  return new Date(Math.min(regularDeadline.getTime(), bookingEndAt.getTime()));
}

export function calculateBookingFinanceAfterExtension(input: {
  totalPrice: number;
  paidAmount: number;
  additionalAmount: number;
}) {
  const totalPrice =
    Number(input.totalPrice || 0) + Number(input.additionalAmount || 0);
  const paidAmount =
    Number(input.paidAmount || 0) + Number(input.additionalAmount || 0);

  return {
    totalPrice,
    paidAmount,
    remainingAmount: Math.max(totalPrice - paidAmount, 0),
  };
}

export function calculateBookingFinanceForAppliedExtension(
  booking: any,
  extension: any,
) {
  const additionalAmount = Number(extension?.additionalAmount || 0);
  if (
    getRequestType(extension) !==
    BookingExtensionRequestTypeEnum.PLAN_CONVERSION
  ) {
    return calculateBookingFinanceAfterExtension({
      totalPrice: Number(booking?.totalPrice || 0),
      paidAmount: Number(booking?.paidAmount || 0),
      additionalAmount,
    });
  }

  const conversionSnapshot = extension?.conversionSnapshot;
  const totalPrice = Number(conversionSnapshot?.appliedConvertedTotal);
  const previousContractedTotal = Number(
    conversionSnapshot?.previousContractedTotal,
  );
  if (
    !Number.isFinite(totalPrice) ||
    totalPrice < 0 ||
    !Number.isFinite(previousContractedTotal) ||
    previousContractedTotal < 0
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Yêu cầu chuyển gói thiếu tổng tiền đã chốt hợp lệ",
    );
  }
  if (
    Number(booking?.totalPrice || 0) !== previousContractedTotal ||
    additionalAmount !== Math.max(totalPrice - previousContractedTotal, 0)
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Dữ liệu tài chính booking không còn khớp báo giá chuyển gói đã duyệt",
    );
  }
  const paidAmount = Number(booking?.paidAmount || 0) + additionalAmount;

  return {
    totalPrice,
    paidAmount,
    remainingAmount: Math.max(totalPrice - paidAmount, 0),
  };
}

export function assertBookingExtensionDuration(
  booking: any,
  requestedEndAt: Date,
) {
  const rentalMode = normalizeRentalMode(
    booking?.rentalMode || booking?.pricingSnapshot?.rentalMode,
  );
  const startAt = new Date(booking.startDate);
  const oldEndAt = new Date(booking.endDate);
  const requestedEndTime = requestedEndAt.getTime();
  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(oldEndAt.getTime()) ||
    Number.isNaN(requestedEndTime)
  ) {
    throw ErrorHelper.requestDataInvalid("Thời gian gia hạn không hợp lệ");
  }

  if (rentalMode === RentalModeEnum.DAILY) {
    const keepsReturnTime = keepsSameUtcClock(requestedEndAt, oldEndAt);
    const extensionDays = calendarDayDifference(oldEndAt, requestedEndAt);

    if (!keepsReturnTime || extensionDays < DAILY_EXTENSION_MIN_DAYS) {
      throw bookingExtensionDurationError(
        "Gia hạn thuê theo ngày chỉ được chọn ngày trả mới và phải giữ nguyên giờ trả hiện tại.",
      );
    }
    return;
  }

  if (rentalMode !== RentalModeEnum.HOURLY) return;

  const extensionBillableHours = Math.ceil(
    (requestedEndTime - oldEndAt.getTime()) / HOUR_MS,
  );
  if (extensionBillableHours < HOURLY_EXTENSION_MIN_HOURS) {
    throw bookingExtensionDurationError(
      "Mỗi lần gia hạn thuê theo giờ tối thiểu là 2 giờ.",
    );
  }

  const totalBillableHours = Math.ceil(
    (requestedEndTime - startAt.getTime()) / HOUR_MS,
  );
  if (totalBillableHours > HOURLY_BOOKING_MAX_TOTAL_HOURS) {
    throw bookingExtensionDurationError(
      HOURLY_BOOKING_MAX_DURATION_MESSAGE,
    );
  }
}

export function assertBookingPlanConversionDuration(
  booking: any,
  requestedEndAt: Date,
) {
  const sourceRentalMode = normalizeRentalMode(
    booking?.rentalMode || booking?.pricingSnapshot?.rentalMode,
  );
  if (sourceRentalMode !== RentalModeEnum.HOURLY) {
    throw bookingExtensionDurationError(
      "Chỉ booking thuê theo giờ mới có thể chuyển sang gói thuê theo ngày.",
    );
  }

  const oldEndAt = new Date(booking.endDate);
  if (
    Number.isNaN(oldEndAt.getTime()) ||
    Number.isNaN(requestedEndAt.getTime()) ||
    requestedEndAt <= oldEndAt
  ) {
    throw ErrorHelper.requestDataInvalid("Thời gian chuyển gói không hợp lệ");
  }
}

export function assertBookingPlanConversionRequestTiming(
  booking: any,
  requestedEndAt: Date,
  now = new Date(),
) {
  assertBookingPlanConversionDuration(booking, requestedEndAt);
  assertCanRequestBookingExtension(booking, now);
}

export function assertCarSupportsDailyPlan(car: any) {
  const { allowDailyRental } = getCarRentalSupport(car);
  if (!allowDailyRental || Number(car?.pricing?.basePricePerDay || 0) <= 0) {
    throw ErrorHelper.requestDataInvalid(
      "Xe không hỗ trợ chuyển sang gói thuê theo ngày.",
    );
  }
}

export function assertBookingHasDailyRatePlanSnapshot(booking: any) {
  const dailySnapshot = booking?.ratePlanSnapshot?.daily;
  if (
    !dailySnapshot ||
    !Number.isFinite(Number(dailySnapshot.basePricePerDay)) ||
    Number(dailySnapshot.basePricePerDay) <= 0
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Không thể chuyển sang gói ngày vì booking này không có bảng giá DAILY đã được lưu tại thời điểm đặt xe.",
    );
  }

  return dailySnapshot;
}

export function assertBookingExtensionRequestDuration(
  booking: any,
  extension: any,
) {
  const requestedEndAt = new Date(extension.requestedEndAt);
  if (
    getRequestType(extension) ===
    BookingExtensionRequestTypeEnum.PLAN_CONVERSION
  ) {
    assertBookingPlanConversionDuration(booking, requestedEndAt);
    return;
  }
  assertBookingExtensionDuration(booking, requestedEndAt);
}

function buildPricingCarFromBooking(booking: any) {
  const snapshot = booking?.pricingSnapshot;

  if (
    !snapshot ||
    !Object.values(RentalModeEnum).includes(snapshot.rentalMode) ||
    !Number.isFinite(Number(snapshot.basePricePerUnit))
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Booking thiếu bảng giá đã chốt để tính tiền gia hạn",
    );
  }

  const isHourly = snapshot.rentalMode === RentalModeEnum.HOURLY;
  const base = Number(snapshot.basePricePerUnit || 0);
  const weekend = Number(snapshot.weekendSurchargePerUnit || 0);
  const holiday = Number(snapshot.holidaySurchargePerUnit || 0);

  return {
    rentalMode: snapshot.rentalMode,
    allowDailyRental: !isHourly,
    allowHourlyRental: isHourly,
    pricing: {
      basePricePerDay: isHourly ? 0 : base,
      weekendSurchargePerDay: isHourly ? 0 : weekend,
      holidaySurchargePerDay: isHourly ? 0 : holiday,
      basePricePerHour: isHourly ? base : 0,
      weekendSurchargePerHour: isHourly ? weekend : 0,
      holidaySurchargePerHour: isHourly ? holiday : 0,
    },
  };
}

function buildDailyPricingCarFromBookingSnapshot(booking: any) {
  const dailySnapshot = assertBookingHasDailyRatePlanSnapshot(booking);

  return {
    rentalMode: RentalModeEnum.DAILY,
    allowDailyRental: true,
    allowHourlyRental: false,
    pricing: {
      basePricePerDay: Number(dailySnapshot.basePricePerDay),
      weekendSurchargePerDay: Number(
        dailySnapshot.weekendSurchargePerDay || 0,
      ),
      holidaySurchargePerDay: Number(
        dailySnapshot.holidaySurchargePerDay || 0,
      ),
    },
  };
}

function toPlainSnapshot(value: any) {
  if (value === undefined || value === null) return undefined;
  const plain = typeof value.toObject === "function" ? value.toObject() : value;
  return JSON.parse(JSON.stringify(plain));
}

function buildConversionPricingBeforeSnapshot(booking: any) {
  const snapshot = booking?.pricingSnapshot;
  if (!snapshot) return undefined;

  return {
    rentalMode: snapshot.rentalMode,
    basePricePerUnit: Number(snapshot.basePricePerUnit || 0),
    weekendSurchargePerUnit: Number(
      snapshot.weekendSurchargePerUnit || 0,
    ),
    holidaySurchargePerUnit: Number(
      snapshot.holidaySurchargePerUnit || 0,
    ),
    breakdown: toPlainSnapshot(snapshot.breakdown || []),
    subtotal: Number(snapshot.subtotal || 0),
    ...(snapshot.rentalSubtotal !== undefined
      ? { rentalSubtotal: Number(snapshot.rentalSubtotal) }
      : {}),
    ...(snapshot.platformFeeRate !== undefined
      ? { platformFeeRate: Number(snapshot.platformFeeRate) }
      : {}),
    ...(snapshot.platformFee !== undefined
      ? { platformFee: Number(snapshot.platformFee) }
      : {}),
    ...(snapshot.insuranceFeePerDay !== undefined
      ? { insuranceFeePerDay: Number(snapshot.insuranceFeePerDay) }
      : {}),
    ...(snapshot.insuranceDays !== undefined
      ? { insuranceDays: Number(snapshot.insuranceDays) }
      : {}),
    ...(snapshot.insuranceFee !== undefined
      ? { insuranceFee: Number(snapshot.insuranceFee) }
      : {}),
    ...(snapshot.deliveryFee !== undefined
      ? { deliveryFee: Number(snapshot.deliveryFee) }
      : {}),
    ...(snapshot.totalPrice !== undefined
      ? { totalPrice: Number(snapshot.totalPrice) }
      : {}),
  };
}

export function calculateBookingPlanConversionFinancials(
  booking: any,
  convertedRentalResult: any,
) {
  const currentContractedTotal = Math.max(
    Number(booking?.totalPrice || 0),
    0,
  );
  const currentPricing = booking?.pricingSnapshot || {};
  const rentalSubtotal = Math.max(
    Math.round(Number(convertedRentalResult?.totalPrice || 0)),
    0,
  );
  const platformFeeRate = Math.max(
    Number(currentPricing.platformFeeRate || 0),
    0,
  );
  const platformFee = Math.round(rentalSubtotal * platformFeeRate);
  const insuranceFeePerDay = Math.max(
    Number(currentPricing.insuranceFeePerDay || 0),
    0,
  );
  const insuranceDays = Math.max(
    1,
    Math.ceil(Number(convertedRentalResult?.totalTime || 1)),
  );
  const insuranceFee = Math.round(insuranceDays * insuranceFeePerDay);
  const deliveryFee = Math.max(Number(currentPricing.deliveryFee || 0), 0);
  const calculatedConvertedTotal =
    rentalSubtotal + platformFee + insuranceFee + deliveryFee;
  const appliedConvertedTotal = Math.max(
    currentContractedTotal,
    calculatedConvertedTotal,
  );

  return {
    currentContractedTotal,
    calculatedConvertedTotal,
    appliedConvertedTotal,
    additionalAmount: Math.max(
      appliedConvertedTotal - currentContractedTotal,
      0,
    ),
    financialAfter: {
      rentalSubtotal,
      platformFeeRate,
      platformFee,
      insuranceFeePerDay,
      insuranceDays,
      insuranceFee,
      deliveryFee,
      totalPrice: appliedConvertedTotal,
    },
  };
}

export async function calculateBookingExtensionPrice(
  booking: any,
  requestedEndAt: Date,
) {
  assertBookingExtensionDuration(booking, requestedEndAt);
  const oldEndAt = new Date(booking.endDate);
  const result = await calculateRentalPrice(
    buildPricingCarFromBooking(booking),
    oldEndAt,
    requestedEndAt,
    booking.rentalMode,
    HOURLY_EXTENSION_MIN_HOURS,
  );

  return {
    requestType: BookingExtensionRequestTypeEnum.EXTENSION,
    sourceRentalMode: result.rentalMode,
    targetRentalMode: result.rentalMode,
    oldEndAt,
    requestedEndAt,
    additionalDurationMinutes: Math.max(
      1,
      Math.ceil((requestedEndAt.getTime() - oldEndAt.getTime()) / 60000),
    ),
    billableUnits: Number(result.totalTime || 0),
    additionalAmount: Math.round(Number(result.totalPrice || 0)),
    pricingSnapshot: result.pricingSnapshot,
  };
}

export async function calculateBookingPlanConversionPrice(
  booking: any,
  requestedEndAt: Date,
) {
  assertBookingPlanConversionDuration(booking, requestedEndAt);
  const bookingStartAt = new Date(booking.startDate);
  const oldEndAt = new Date(booking.endDate);
  const result = await calculateRentalPrice(
    buildDailyPricingCarFromBookingSnapshot(booking),
    bookingStartAt,
    requestedEndAt,
    RentalModeEnum.DAILY,
  );
  const financial = calculateBookingPlanConversionFinancials(booking, result);
  const mileageBefore = toPlainSnapshot(booking.mileagePolicySnapshot);
  const mileageAfter = buildBookingMileagePolicySnapshot(
    booking.ratePlanSnapshot,
    RentalModeEnum.DAILY,
    Number(result.totalTime || 0),
  );
  const currentIncludedKm = Number(mileageBefore?.totalIncludedKm || 0);
  const convertedIncludedKm = Number(mileageAfter?.totalIncludedKm || 0);

  return {
    requestType: BookingExtensionRequestTypeEnum.PLAN_CONVERSION,
    sourceRentalMode: RentalModeEnum.HOURLY,
    targetRentalMode: RentalModeEnum.DAILY,
    targetIncludedKmPerUnit:
      Number(booking.ratePlanSnapshot.daily?.includedKmPerDay || 0) > 0
        ? Number(booking.ratePlanSnapshot.daily.includedKmPerDay)
        : undefined,
    oldEndAt,
    requestedEndAt,
    additionalDurationMinutes: Math.max(
      1,
      Math.ceil((requestedEndAt.getTime() - oldEndAt.getTime()) / 60000),
    ),
    billableUnits: Number(result.totalTime || 0),
    dailyUnits: Number(result.totalTime || 0),
    currentContractedTotal: financial.currentContractedTotal,
    calculatedConvertedTotal: financial.calculatedConvertedTotal,
    appliedConvertedTotal: financial.appliedConvertedTotal,
    additionalAmount: financial.additionalAmount,
    currentIncludedKm,
    convertedIncludedKm,
    pricingSnapshot: result.pricingSnapshot,
    conversionSnapshot: {
      bookingStartAt,
      previousContractedTotal: financial.currentContractedTotal,
      calculatedConvertedTotal: financial.calculatedConvertedTotal,
      appliedConvertedTotal: financial.appliedConvertedTotal,
      pricingBefore: buildConversionPricingBeforeSnapshot(booking),
      financialAfter: financial.financialAfter,
      ...(mileageBefore ? { mileageBefore } : {}),
      ...(mileageAfter ? { mileageAfter } : {}),
    },
  };
}

export async function assertBookingPlanConversionQuoteIsCurrent(
  booking: any,
  extension: any,
) {
  const recalculated = await calculateBookingPlanConversionPrice(
    booking,
    new Date(extension.requestedEndAt),
  );
  const storedQuote = {
    billableUnits: Number(extension.billableUnits || 0),
    additionalAmount: Number(extension.additionalAmount || 0),
    pricingSnapshot: toPlainSnapshot(extension.pricingSnapshot),
    conversionSnapshot: toPlainSnapshot(extension.conversionSnapshot),
  };
  const recalculatedQuote = {
    billableUnits: Number(recalculated.billableUnits || 0),
    additionalAmount: Number(recalculated.additionalAmount || 0),
    pricingSnapshot: toPlainSnapshot(recalculated.pricingSnapshot),
    conversionSnapshot: toPlainSnapshot(recalculated.conversionSnapshot),
  };

  if (JSON.stringify(storedQuote) !== JSON.stringify(recalculatedQuote)) {
    throw ErrorHelper.requestDataInvalid(
      "Báo giá chuyển gói không còn khớp dữ liệu booking đã chốt. Vui lòng tạo yêu cầu mới.",
    );
  }
}

export async function prepareBookingExtensionPayment(input: {
  extensionId: string;
  userId: string;
  method: PaymentMethodEnum;
}) {
  assertPaymentMethodAllowed(PaymentTypeEnum.EXTENSION, input.method);
  await expireStaleBookingExtensions();
  const session = await mongoose.startSession();
  let prepared:
    | { booking: any; extension: any; payment: any; reusedPayment: boolean }
    | undefined;

  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const extension = await BookingExtensionModel.findOne({
        _id: input.extensionId,
        requestedBy: input.userId,
        status: {
          $in: [
            BookingExtensionStatusEnum.OWNER_APPROVED,
            BookingExtensionStatusEnum.PAYMENT_PENDING,
          ],
        },
        paymentDeadlineAt: { $gt: now },
        isDeleted: false,
      }).session(session);

      if (!extension) {
        throw ErrorHelper.requestDataInvalid(
          "Yêu cầu gia hạn không còn trong thời gian thanh toán",
        );
      }

      if (Number(extension.additionalAmount || 0) <= 0) {
        throw ErrorHelper.requestDataInvalid(
          "Yêu cầu này không phát sinh số tiền cần thanh toán",
        );
      }

      const booking = await BookingModel.findOne({
        _id: extension.bookingId,
        userId: input.userId,
        status: BookingStatusEnum.IN_PROGRESS,
        isDeleted: false,
      }).session(session);

      if (!booking) {
        throw ErrorHelper.requestDataInvalid(
          "Chỉ booking đang thuê mới được thanh toán gia hạn",
        );
      }

      if (
        new Date(booking.endDate).getTime() !==
        new Date(extension.oldEndAt).getTime()
      ) {
        throw ErrorHelper.requestDataInvalid(
          "Thời gian booking đã thay đổi, vui lòng tạo yêu cầu gia hạn mới",
        );
      }

      assertBookingExtensionRequestDuration(booking, extension);
      if (
        getRequestType(extension) ===
        BookingExtensionRequestTypeEnum.PLAN_CONVERSION
      ) {
        const car = await CarModel.findOne({
          _id: extension.carId,
          isDeleted: false,
        }).session(session);
        if (!car) throw ErrorHelper.recordNotFound("Xe");
      }

      await PaymentModel.updateMany(
        {
          extensionId: extension._id,
          paymentType: PaymentTypeEnum.EXTENSION,
          status: PaymentStatusEnum.PENDING,
          method: { $ne: input.method },
        },
        { $set: { status: PaymentStatusEnum.FAILED } },
        { session },
      );

      let payment = await PaymentModel.findOne({
        extensionId: extension._id,
        paymentType: PaymentTypeEnum.EXTENSION,
        method: input.method,
        status: PaymentStatusEnum.PENDING,
      }).session(session);
      const reusedPayment = Boolean(payment);

      if (!payment) {
        const created = await PaymentModel.create(
          [
            {
              bookingId: booking._id,
              extensionId: extension._id,
              userId: input.userId,
              amount: extension.additionalAmount,
              method: input.method,
              paymentType: PaymentTypeEnum.EXTENSION,
              status: PaymentStatusEnum.PENDING,
            },
          ],
          { session },
        );
        payment = created[0] || null;
      }

      if (!payment) {
        throw ErrorHelper.requestDataInvalid(
          "Không thể tạo thanh toán gia hạn",
        );
      }

      extension.status = BookingExtensionStatusEnum.PAYMENT_PENDING;
      extension.paymentId = payment._id;
      await extension.save({ session });
      prepared = { booking, extension, payment, reusedPayment };
    });
  } finally {
    await session.endSession();
  }

  if (!prepared) {
    throw ErrorHelper.requestDataInvalid("Không thể chuẩn bị thanh toán gia hạn");
  }

  return prepared;
}

type MarkBookingExtensionPaymentPaidInput = {
  paymentId: string;
  paidAt: Date;
  transactionCode?: string | undefined;
  gatewayOrderId?: string | undefined;
  gatewayTransactionId?: string | undefined;
  gatewayPayDate?: string | undefined;
};

export async function markBookingExtensionPaymentPaid(
  input: MarkBookingExtensionPaymentPaidInput,
) {
  const session = await mongoose.startSession();
  let paidPayment: any;

  try {
    await session.withTransaction(async () => {
      const payment = await PaymentModel.findOne({
        _id: input.paymentId,
        paymentType: PaymentTypeEnum.EXTENSION,
        status: {
          $in: [PaymentStatusEnum.PENDING, PaymentStatusEnum.PAID],
        },
      }).session(session);

      if (!payment?.extensionId) {
        throw ErrorHelper.requestDataInvalid(
          "Thanh toán gia hạn không còn khả dụng",
        );
      }

      const extension = await BookingExtensionModel.findOne({
        _id: payment.extensionId,
        paymentId: payment._id,
        status: {
          $in: [
            BookingExtensionStatusEnum.OWNER_APPROVED,
            BookingExtensionStatusEnum.PAYMENT_PENDING,
            BookingExtensionStatusEnum.APPLIED,
          ],
        },
        isDeleted: false,
      }).session(session);

      if (!extension) {
        throw ErrorHelper.requestDataInvalid(
          "Yêu cầu gia hạn không còn khả dụng để ghi nhận thanh toán",
        );
      }

      if (payment.status === PaymentStatusEnum.PAID) {
        paidPayment = payment;
        return;
      }

      const paidFields: Record<string, unknown> = {
        status: PaymentStatusEnum.PAID,
        paidAt: input.paidAt,
      };
      for (const [key, value] of Object.entries({
        transactionCode: input.transactionCode,
        gatewayOrderId: input.gatewayOrderId,
        gatewayTransactionId: input.gatewayTransactionId,
        gatewayPayDate: input.gatewayPayDate,
      })) {
        if (value) paidFields[key] = value;
      }

      paidPayment = await PaymentModel.findOneAndUpdate(
        {
          _id: payment._id,
          extensionId: extension._id,
          paymentType: PaymentTypeEnum.EXTENSION,
          status: PaymentStatusEnum.PENDING,
        },
        { $set: paidFields },
        { new: true, session },
      );

      if (!paidPayment) {
        throw ErrorHelper.requestDataInvalid(
          "Thanh toán gia hạn đã được xử lý đồng thời",
        );
      }
    });
  } finally {
    await session.endSession();
  }

  if (!paidPayment) {
    throw ErrorHelper.requestDataInvalid(
      "Không thể ghi nhận thanh toán gia hạn",
    );
  }

  return paidPayment;
}

export function updateMileagePolicyForExtension(
  booking: any,
  extension: any,
) {
  const isPlanConversion =
    getRequestType(extension) ===
    BookingExtensionRequestTypeEnum.PLAN_CONVERSION;

  if (isPlanConversion) {
    const mileageAfter = toPlainSnapshot(
      extension?.conversionSnapshot?.mileageAfter,
    );
    if (!mileageAfter) {
      throw ErrorHelper.requestDataInvalid(
        "Yêu cầu chuyển gói thiếu chính sách quãng đường đã chốt",
      );
    }
    booking.mileagePolicySnapshot = mileageAfter;
    booking.markModified("mileagePolicySnapshot");
    return;
  }

  const policy = booking.mileagePolicySnapshot;
  if (!policy) return;
  const billableUnits = Number(extension.billableUnits || 0);
  const targetRentalMode =
    normalizeRentalMode(policy.rentalMode) || booking.rentalMode;
  const includedPerUnit =
    targetRentalMode === RentalModeEnum.HOURLY
      ? Number(policy.includedKmPerHour || 0)
      : Number(policy.includedKmPerDay || 0);
  policy.billableUnits = Number(policy.billableUnits || 0) + billableUnits;
  policy.totalIncludedKm =
    Number(policy.totalIncludedKm || 0) + billableUnits * includedPerUnit;
  booking.markModified("mileagePolicySnapshot");
}

export function updatePricingSnapshotForExtension(
  booking: any,
  extension: any,
) {
  const isPlanConversion =
    getRequestType(extension) ===
    BookingExtensionRequestTypeEnum.PLAN_CONVERSION;

  if (isPlanConversion) {
    const quotedPricing = toPlainSnapshot(extension?.pricingSnapshot);
    const financialAfter = toPlainSnapshot(
      extension?.conversionSnapshot?.financialAfter,
    );
    const appliedConvertedTotal = Number(
      extension?.conversionSnapshot?.appliedConvertedTotal,
    );
    if (
      !quotedPricing ||
      !financialAfter ||
      !Number.isFinite(appliedConvertedTotal) ||
      appliedConvertedTotal < 0 ||
      Number(financialAfter.totalPrice) !== appliedConvertedTotal
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Yêu cầu chuyển gói thiếu báo giá đã chốt hợp lệ",
      );
    }

    booking.pricingSnapshot = {
      ...toPlainSnapshot(booking.pricingSnapshot),
      rentalMode: RentalModeEnum.DAILY,
      basePricePerUnit: Number(quotedPricing.basePricePerUnit || 0),
      weekendSurchargePerUnit: Number(
        quotedPricing.weekendSurchargePerUnit || 0,
      ),
      holidaySurchargePerUnit: Number(
        quotedPricing.holidaySurchargePerUnit || 0,
      ),
      breakdown: toPlainSnapshot(quotedPricing.breakdown || []),
      subtotal: Number(quotedPricing.subtotal || 0),
      rentalSubtotal: Number(financialAfter.rentalSubtotal || 0),
      platformFeeRate: Number(financialAfter.platformFeeRate || 0),
      platformFee: Number(financialAfter.platformFee || 0),
      insuranceFeePerDay: Number(financialAfter.insuranceFeePerDay || 0),
      insuranceDays: Number(financialAfter.insuranceDays || 0),
      insuranceFee: Number(financialAfter.insuranceFee || 0),
      deliveryFee: Number(financialAfter.deliveryFee || 0),
      totalPrice: appliedConvertedTotal,
    };
    booking.markModified("pricingSnapshot");
    return;
  }

  const snapshot = booking.pricingSnapshot;
  if (!snapshot) return;
  const amount = Number(extension.additionalAmount || 0);
  snapshot.breakdown = [
    ...(snapshot.breakdown || []),
    ...(extension.pricingSnapshot?.breakdown || []),
  ];
  snapshot.subtotal = Number(snapshot.subtotal || 0) + amount;
  snapshot.rentalSubtotal =
    Number(snapshot.rentalSubtotal ?? snapshot.subtotal - amount) + amount;
  snapshot.totalPrice = Number(booking.totalPrice || 0);
  booking.markModified("pricingSnapshot");
}

type ApplyBookingExtensionInput =
  | { paymentId: string; extensionId?: never }
  | { extensionId: string; paymentId?: never };

type ApplyBookingExtensionOptions = {
  session?: ClientSession;
  notifyAfterApply?: boolean;
  carAlreadyLocked?: boolean;
};

async function applyBookingExtension(
  input: ApplyBookingExtensionInput,
  options: ApplyBookingExtensionOptions = {},
) {
  const ownsSession = !options.session;
  const session = options.session || (await mongoose.startSession());
  let activated = false;
  let result:
    | { booking: any; extension: any; payment?: any; activated: boolean }
    | undefined;

  try {
    const applyWithinTransaction = async () => {
      let payment: any;
      let extensionId = input.extensionId;

      if (input.paymentId) {
        payment = await PaymentModel.findOne({
          _id: input.paymentId,
          paymentType: PaymentTypeEnum.EXTENSION,
          status: PaymentStatusEnum.PAID,
        }).session(session);

        if (!payment?.extensionId) {
          throw ErrorHelper.requestDataInvalid(
            "Thanh toán gia hạn không hợp lệ",
          );
        }
        extensionId = String(payment.extensionId);
      }

      if (!extensionId) {
        throw ErrorHelper.requestDataInvalid("Thiếu yêu cầu gia hạn cần áp dụng");
      }

      const extension = await BookingExtensionModel.findOne({
        _id: extensionId,
        isDeleted: false,
      }).session(session);

      if (!extension) {
        throw ErrorHelper.recordNotFound("Yêu cầu gia hạn");
      }

      if (extension.status === BookingExtensionStatusEnum.APPLIED) {
        const booking = await BookingModel.findById(extension.bookingId).session(
          session,
        );
        result = { booking, extension, payment, activated: false };
        return;
      }

      const isZeroPaymentConversion =
        !payment &&
        getRequestType(extension) ===
          BookingExtensionRequestTypeEnum.PLAN_CONVERSION &&
        Number(extension.additionalAmount || 0) === 0;

      if (!payment && !isZeroPaymentConversion) {
        throw ErrorHelper.requestDataInvalid(
          "Chỉ yêu cầu chuyển gói 0 đồng mới được áp dụng không qua thanh toán",
        );
      }

      if (
        ![
          BookingExtensionStatusEnum.OWNER_APPROVED,
          BookingExtensionStatusEnum.PAYMENT_PENDING,
        ].includes(extension.status)
      ) {
        throw ErrorHelper.requestDataInvalid(
          "Yêu cầu gia hạn không còn khả dụng để áp dụng",
        );
      }

      const booking = await BookingModel.findOne({
        _id: extension.bookingId,
        status: BookingStatusEnum.IN_PROGRESS,
        isDeleted: false,
      }).session(session);

      if (!booking) {
        throw ErrorHelper.requestDataInvalid(
          "Booking không còn ở trạng thái đang thuê",
        );
      }

      if (
        new Date(booking.endDate).getTime() !==
        new Date(extension.oldEndAt).getTime()
      ) {
        throw ErrorHelper.requestDataInvalid(
          "Thời gian trả xe hiện tại không còn khớp yêu cầu gia hạn",
        );
      }

      assertBookingExtensionStillWithinCurrentRentalTime(booking);
      assertBookingExtensionRequestDuration(booking, extension);

      const lockedCar = options.carAlreadyLocked
        ? await CarModel.findOne({
            _id: extension.carId,
            isDeleted: false,
          }).session(session)
        : await CarModel.findOneAndUpdate(
            { _id: extension.carId, isDeleted: false },
            { $inc: { bookingRevision: 1 } },
            { new: true, session },
          );
      if (!lockedCar) throw ErrorHelper.recordNotFound("Xe");
      await assertCarAvailability({
        carId: String(extension.carId),
        start: new Date(extension.oldEndAt),
        end: new Date(extension.requestedEndAt),
        ignoredBookingId: String(booking._id),
        ignoredExtensionId: String(extension._id),
        session,
      });

      const finance = calculateBookingFinanceForAppliedExtension(
        booking,
        extension,
      );
      booking.endDate = extension.requestedEndAt;
      booking.totalPrice = finance.totalPrice;
      booking.paidAmount = finance.paidAmount;
      booking.remainingAmount = finance.remainingAmount;
      if (
        getRequestType(extension) ===
        BookingExtensionRequestTypeEnum.PLAN_CONVERSION
      ) {
        booking.rentalMode = RentalModeEnum.DAILY;
        booking.rentalPlanConversionSnapshot = {
          sourceRentalMode: RentalModeEnum.HOURLY,
          targetRentalMode: RentalModeEnum.DAILY,
          effectiveFrom: booking.startDate,
          convertedAt: payment?.paidAt || new Date(),
          extensionId: extension._id,
        };
      }
      booking.set("returnReminderSentAt", null);
      updateMileagePolicyForExtension(booking, extension);
      updatePricingSnapshotForExtension(booking, extension);
      await booking.save({ session });

      const contract = await ContractModel.findOne({
        bookingId: booking._id,
        isDeleted: false,
      }).session(session);
      if (!contract) {
        throw ErrorHelper.requestDataInvalid(
          "Không thể áp dụng gia hạn vì booking chưa có hợp đồng hợp lệ",
        );
      }
      // Contract là thỏa thuận gốc tại thời điểm booking được xác lập.
      // Gia hạn chỉ thay đổi Booking và được tổng hợp động ở phụ lục hợp đồng;
      // không ghi đè thời gian hoặc giá trị ban đầu của Contract.

      extension.status = BookingExtensionStatusEnum.APPLIED;
      if (payment) extension.paymentId = payment._id;
      extension.activatedAt = payment?.paidAt || new Date();
      extension.set("activeLockKey", undefined);
      await extension.save({ session });
      activated = true;
      result = { booking, extension, payment, activated: true };
    };

    if (ownsSession) {
      await session.withTransaction(applyWithinTransaction);
    } else {
      await applyWithinTransaction();
    }
  } finally {
    if (ownsSession) await session.endSession();
  }

  if (!result) {
    throw ErrorHelper.requestDataInvalid("Không thể áp dụng gia hạn");
  }

  if (activated && options.notifyAfterApply !== false) {
    void notificationCenterService.notifyBookingExtensionPaid(
      result.extension,
      result.booking,
    );
    void sendBookingExtensionActivatedMail(result.booking, result.extension);
  }

  return { ...result, activated };
}

export async function activatePaidBookingExtension(paymentId: string) {
  return applyBookingExtension({ paymentId });
}

export async function applyZeroPaymentBookingExtension(
  extensionId: string,
  options: ApplyBookingExtensionOptions = {},
) {
  return applyBookingExtension({ extensionId }, options);
}

export async function expireStaleBookingExtensions(now = new Date()) {
  const stale = await BookingExtensionModel.find({
    status: {
      $in: [
        BookingExtensionStatusEnum.OWNER_APPROVED,
        BookingExtensionStatusEnum.PAYMENT_PENDING,
      ],
    },
    paymentDeadlineAt: { $lte: now },
    isDeleted: false,
  })
    .select("_id bookingId")
    .sort({ paymentDeadlineAt: 1 })
    .limit(EXTENSION_EXPIRATION_BATCH_SIZE)
    .lean();

  let expiredCount = 0;

  for (const item of stale) {
    const session = await mongoose.startSession();
    let extension: any;

    try {
      await session.withTransaction(async () => {
        const staleExtension = await BookingExtensionModel.findOne({
          _id: item._id,
          status: {
            $in: [
              BookingExtensionStatusEnum.OWNER_APPROVED,
              BookingExtensionStatusEnum.PAYMENT_PENDING,
            ],
          },
          paymentDeadlineAt: { $lte: now },
          isDeleted: false,
        }).session(session);

        if (!staleExtension) return;

        const canonicalPaymentFilter = staleExtension.paymentId
          ? {
              _id: staleExtension.paymentId,
              extensionId: staleExtension._id,
              paymentType: PaymentTypeEnum.EXTENSION,
            }
          : {
              extensionId: staleExtension._id,
              paymentType: PaymentTypeEnum.EXTENSION,
            };
        const paidPayment = await PaymentModel.exists({
          ...canonicalPaymentFilter,
          status: PaymentStatusEnum.PAID,
        }).session(session);
        if (paidPayment) return;

        if (staleExtension.paymentId) {
          const claimedPayment = await PaymentModel.findOneAndUpdate(
            {
              ...canonicalPaymentFilter,
              status: PaymentStatusEnum.PENDING,
            },
            {
              $set: {
                status: PaymentStatusEnum.FAILED,
                note: "Yêu cầu gia hạn đã hết thời gian thanh toán",
              },
            },
            { new: true, session },
          );

          if (!claimedPayment) {
            const paymentAfterClaim = await PaymentModel.findOne(
              canonicalPaymentFilter,
            )
              .select("status")
              .session(session);
            if (paymentAfterClaim?.status === PaymentStatusEnum.PAID) return;
          }
        }

        extension = await BookingExtensionModel.findOneAndUpdate(
          {
            _id: staleExtension._id,
            status: {
              $in: [
                BookingExtensionStatusEnum.OWNER_APPROVED,
                BookingExtensionStatusEnum.PAYMENT_PENDING,
              ],
            },
            paymentDeadlineAt: { $lte: now },
            isDeleted: false,
          },
          {
            $set: { status: BookingExtensionStatusEnum.EXPIRED },
            $unset: { activeLockKey: 1 },
          },
          { new: true, session },
        );

        if (!extension) return;

        await PaymentModel.updateMany(
          {
            extensionId: extension._id,
            paymentType: PaymentTypeEnum.EXTENSION,
            status: PaymentStatusEnum.PENDING,
          },
          {
            $set: {
              status: PaymentStatusEnum.FAILED,
              note: "Yêu cầu gia hạn đã hết thời gian thanh toán",
            },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    if (!extension) continue;

    expiredCount += 1;
    const booking = await BookingModel.findById(extension.bookingId);
    if (booking) {
      void notificationCenterService.notifyBookingExtensionExpired(
        extension,
        booking,
      );
      void sendBookingExtensionExpiredMail(booking, extension);
    }
  }

  return { expiredCount };
}

export function startBookingExtensionExpirationJob() {
  if (extensionExpirationJobStarted) return;
  extensionExpirationJobStarted = true;

  const runJob = async () => {
    if (extensionExpirationJobRunning) return;
    extensionExpirationJobRunning = true;
    try {
      await expireStaleBookingExtensions();
    } catch (error: any) {
      console.error("Booking extension expiration job failed", {
        message: error?.message,
        stack: error?.stack,
      });
    } finally {
      extensionExpirationJobRunning = false;
    }
  };

  void runJob();
  const interval = setInterval(
    () => void runJob(),
    EXTENSION_EXPIRATION_JOB_INTERVAL_MS,
  );
  interval.unref?.();
}
