import mongoose, { type ClientSession } from "mongoose";

import { BaseError, ErrorHelper } from "../base/error";
import {
  BookingExtensionStatusEnum,
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  RentalModeEnum,
} from "../constants/model.const";
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
import { calculateRentalPrice, normalizeRentalMode } from "./rental.helper";
import { deriveContractPaymentStatus } from "./status.helper";

export const BOOKING_EXTENSION_PAYMENT_MINUTES = 10;
export const HOURLY_EXTENSION_MIN_HOURS = 2;
export const HOURLY_BOOKING_MAX_TOTAL_HOURS = 8;
export const HOURLY_BOOKING_MAX_DURATION_MESSAGE =
  "Thời lượng thuê theo giờ tối đa là 8 giờ. Vui lòng chuyển sang hình thức thuê theo ngày.";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const EXTENSION_EXPIRATION_BATCH_SIZE = 25;
const EXTENSION_EXPIRATION_JOB_INTERVAL_MS = 60 * 1000;
let extensionExpirationJobStarted = false;
let extensionExpirationJobRunning = false;

function bookingExtensionDurationError(message: string) {
  return new BaseError(400, "-3", message, message);
}

export const ACTIVE_BOOKING_EXTENSION_STATUSES = [
  BookingExtensionStatusEnum.REQUESTED,
  BookingExtensionStatusEnum.OWNER_APPROVED,
  BookingExtensionStatusEnum.PAYMENT_PENDING,
];

export function getBookingExtensionPaymentDeadline(now = new Date()) {
  return new Date(
    now.getTime() + BOOKING_EXTENSION_PAYMENT_MINUTES * 60 * 1000,
  );
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
    const keepsReturnTime =
      requestedEndAt.getUTCHours() === oldEndAt.getUTCHours() &&
      requestedEndAt.getUTCMinutes() === oldEndAt.getUTCMinutes() &&
      requestedEndAt.getUTCSeconds() === oldEndAt.getUTCSeconds() &&
      requestedEndAt.getUTCMilliseconds() === oldEndAt.getUTCMilliseconds();
    const oldEndDate = Date.UTC(
      oldEndAt.getUTCFullYear(),
      oldEndAt.getUTCMonth(),
      oldEndAt.getUTCDate(),
    );
    const requestedEndDate = Date.UTC(
      requestedEndAt.getUTCFullYear(),
      requestedEndAt.getUTCMonth(),
      requestedEndAt.getUTCDate(),
    );
    const extensionDays = (requestedEndDate - oldEndDate) / DAY_MS;

    if (!keepsReturnTime || extensionDays < 1) {
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
  );

  return {
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

export async function prepareBookingExtensionPayment(input: {
  extensionId: string;
  userId: string;
  method: PaymentMethodEnum;
}) {
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

      assertBookingExtensionDuration(
        booking,
        new Date(extension.requestedEndAt),
      );

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

function updateMileagePolicyForExtension(booking: any, extension: any) {
  const policy = booking.mileagePolicySnapshot;
  if (!policy) return;

  const billableUnits = Number(extension.billableUnits || 0);
  const includedPerUnit =
    policy.rentalMode === RentalModeEnum.HOURLY
      ? Number(policy.includedKmPerHour || 0)
      : Number(policy.includedKmPerDay || 0);

  policy.billableUnits = Number(policy.billableUnits || 0) + billableUnits;
  policy.totalIncludedKm =
    Number(policy.totalIncludedKm || 0) + billableUnits * includedPerUnit;
  booking.markModified("mileagePolicySnapshot");
}

function updatePricingSnapshotForExtension(booking: any, extension: any) {
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

export async function activatePaidBookingExtension(paymentId: string) {
  const session = await mongoose.startSession();
  let activated = false;
  let result: { booking: any; extension: any; payment: any } | undefined;

  try {
    await session.withTransaction(async () => {
      const payment = await PaymentModel.findOne({
        _id: paymentId,
        paymentType: PaymentTypeEnum.EXTENSION,
        status: PaymentStatusEnum.PAID,
      }).session(session);

      if (!payment?.extensionId) {
        throw ErrorHelper.requestDataInvalid(
          "Thanh toán gia hạn không hợp lệ",
        );
      }

      const extension = await BookingExtensionModel.findOne({
        _id: payment.extensionId,
        isDeleted: false,
      }).session(session);

      if (!extension) {
        throw ErrorHelper.recordNotFound("Yêu cầu gia hạn");
      }

      if (
        extension.status === BookingExtensionStatusEnum.PAID &&
        extension.activatedAt
      ) {
        const booking = await BookingModel.findById(extension.bookingId).session(
          session,
        );
        result = { booking, extension, payment };
        return;
      }

      if (
        ![
          BookingExtensionStatusEnum.OWNER_APPROVED,
          BookingExtensionStatusEnum.PAYMENT_PENDING,
        ].includes(extension.status)
      ) {
        throw ErrorHelper.requestDataInvalid(
          "Yêu cầu gia hạn không còn khả dụng để kích hoạt",
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

      assertBookingExtensionDuration(
        booking,
        new Date(extension.requestedEndAt),
      );

      const lockedCar = await CarModel.findOneAndUpdate(
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

      const additionalAmount = Number(extension.additionalAmount || 0);
      const finance = calculateBookingFinanceAfterExtension({
        totalPrice: Number(booking.totalPrice || 0),
        paidAmount: Number(booking.paidAmount || 0),
        additionalAmount,
      });
      booking.endDate = extension.requestedEndAt;
      booking.totalPrice = finance.totalPrice;
      booking.paidAmount = finance.paidAmount;
      booking.remainingAmount = finance.remainingAmount;
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
          "Không thể kích hoạt gia hạn vì booking chưa có hợp đồng hợp lệ",
        );
      }
      contract.endDate = booking.endDate;
      contract.totalPrice = booking.totalPrice;
      contract.paidAmount = booking.paidAmount;
      contract.remainingAmount = booking.remainingAmount;
      contract.paymentStatus = deriveContractPaymentStatus({
        totalPrice: booking.totalPrice,
        depositAmount: booking.depositAmount,
        paidAmount: booking.paidAmount,
      });
      await contract.save({ session });

      extension.status = BookingExtensionStatusEnum.PAID;
      extension.paymentId = payment._id;
      extension.activatedAt = payment.paidAt || new Date();
      extension.set("activeLockKey", undefined);
      await extension.save({ session });
      activated = true;
      result = { booking, extension, payment };
    });
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw ErrorHelper.requestDataInvalid("Không thể kích hoạt gia hạn");
  }

  if (activated) {
    void notificationCenterService.notifyBookingExtensionPaid(
      result.extension,
      result.booking,
    );
    void sendBookingExtensionActivatedMail(result.booking, result.extension);
  }

  return { ...result, activated };
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
    const extension = await BookingExtensionModel.findOneAndUpdate(
      {
        _id: item._id,
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
      { new: true },
    );

    if (!extension) continue;

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
    );

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
