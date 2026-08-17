import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

import * as ModelConstants from "../constants/model.const";
import {
  BookingExtensionRequestTypeEnum,
  BookingExtensionStatusEnum,
  BookingStatusEnum,
  CarStatusEnum,
  ContractPaymentStatusEnum,
  ContractStatusEnum,
  PaymentRefundStatusEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  RentalModeEnum,
  RefundStatusEnum,
} from "../constants/model.const";
import {
  canTransitionBookingStatus,
  canTransitionRefundStatus,
  deriveContractPaymentStatus,
  derivePaymentRefundStatus,
} from "../helper/status.helper";
import {
  ACTIVE_BOOKING_EXTENSION_STATUSES,
  activatePaidBookingExtension,
  applyZeroPaymentBookingExtension,
  assertCanRequestBookingExtension,
  assertBookingExtensionStillWithinCurrentRentalTime,
  calculateBookingFinanceAfterExtension,
  expireStaleBookingExtensions,
  markBookingExtensionPaymentPaid,
} from "../helper/booking-extension.helper";
import { BookingExtensionModel } from "../models/booking-extension/bookingExtension.model";
import { BookingModel } from "../models/booking/booking.model";
import { CarModel } from "../models/car/car.model";
import { CartModel } from "../models/cart/cart.model";
import { ContractModel } from "../models/contract/contract.model";
import { PaymentModel } from "../models/payment/payment.model";
import { RefundModel } from "../models/refund/refund.model";

function run() {
  const newBooking = new BookingModel();
  assert.equal(newBooking.status, BookingStatusEnum.REQUESTED);

  const newBookingExtension = new BookingExtensionModel();
  assert.equal(
    newBookingExtension.status,
    BookingExtensionStatusEnum.REQUESTED,
  );

  const newPayment = new PaymentModel();
  assert.equal(newPayment.status, PaymentStatusEnum.PENDING);
  assert.equal(
    newPayment.refundStatus,
    PaymentRefundStatusEnum.NOT_REFUNDED,
  );

  const newRefund = new RefundModel();
  assert.equal(
    newRefund.status,
    RefundStatusEnum.WAITING_FOR_REFUND_INFO,
  );

  const newContract = new ContractModel();
  assert.equal(newContract.status, ContractStatusEnum.ACTIVE);
  assert.equal(
    newContract.paymentStatus,
    ContractPaymentStatusEnum.UNPAID,
  );

  const newCar = new CarModel();
  assert.equal(newCar.status, CarStatusEnum.PENDING);
  assert.equal(newCar.isHidden, false);

  assert.deepEqual(Object.values(BookingStatusEnum), [
    "REQUESTED",
    "OWNER_APPROVED",
    "PAYMENT_PENDING",
    "PAID",
    "IN_PROGRESS",
    "RETURN_INSPECTION",
    "AWAITING_EXTRA_CHARGE",
    "COMPLETED",
    "CANCELLED",
    "REJECTED",
    "NO_SHOW",
  ]);
  assert.deepEqual(Object.values(PaymentStatusEnum), [
    "PENDING",
    "PAID",
    "FAILED",
  ]);
  assert.deepEqual(Object.values(BookingExtensionStatusEnum), [
    "REQUESTED",
    "OWNER_APPROVED",
    "PAYMENT_PENDING",
    "APPLIED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
  ]);
  assert.deepEqual(ACTIVE_BOOKING_EXTENSION_STATUSES, [
    BookingExtensionStatusEnum.REQUESTED,
    BookingExtensionStatusEnum.OWNER_APPROVED,
    BookingExtensionStatusEnum.PAYMENT_PENDING,
  ]);
  assert.equal(
    Object.values(PaymentTypeEnum).includes(PaymentTypeEnum.EXTENSION),
    true,
  );

  assert.deepEqual(
    calculateBookingFinanceAfterExtension({
      totalPrice: 400_000,
      paidAmount: 400_000,
      additionalAmount: 100_000,
    }),
    { totalPrice: 500_000, paidAmount: 500_000, remainingAmount: 0 },
  );
  assert.deepEqual(
    calculateBookingFinanceAfterExtension({
      totalPrice: 400_000,
      paidAmount: 120_000,
      additionalAmount: 100_000,
    }),
    { totalPrice: 500_000, paidAmount: 220_000, remainingAmount: 280_000 },
  );
  assert.deepEqual(Object.values(RefundStatusEnum), [
    "WAITING_FOR_REFUND_INFO",
    "PROCESSING",
    "SUCCEEDED",
    "MANUAL_REQUIRED",
  ]);
  assert.deepEqual(Object.values(ContractStatusEnum), [
    "ACTIVE",
    "COMPLETED",
    "CANCELLED",
  ]);
  assert.deepEqual(Object.values(CarStatusEnum), [
    "PENDING",
    "APPROVED",
    "RENTED",
    "REJECTED",
  ]);
  for (const exportName of [
    "LegacyCarStatusEnum",
    "LegacyBookingStatusEnum",
    "LegacyPaymentStatusEnum",
    "LegacyRefundStatusEnum",
    "LegacyContractStatusEnum",
  ]) {
    assert.equal(exportName in ModelConstants, false);
  }

  assert.equal(
    canTransitionBookingStatus("REQUESTED", BookingStatusEnum.OWNER_APPROVED),
    true,
  );
  assert.equal(
    canTransitionBookingStatus("REQUESTED", BookingStatusEnum.REJECTED),
    true,
  );
  assert.equal(
    canTransitionBookingStatus("OWNER_APPROVED", BookingStatusEnum.PAID),
    true,
  );
  assert.equal(
    canTransitionBookingStatus("PAID", BookingStatusEnum.IN_PROGRESS),
    true,
  );
  assert.equal(
    canTransitionBookingStatus(
      "IN_PROGRESS",
      BookingStatusEnum.RETURN_INSPECTION,
    ),
    true,
  );
  assert.equal(
    canTransitionBookingStatus(
      "RETURN_INSPECTION",
      BookingStatusEnum.AWAITING_EXTRA_CHARGE,
    ),
    true,
  );
assert.equal(
  canTransitionBookingStatus(
    "AWAITING_EXTRA_CHARGE",
    BookingStatusEnum.RETURN_INSPECTION,
  ),
  true,
);

assert.equal(
  canTransitionBookingStatus(
    "AWAITING_EXTRA_CHARGE",
    BookingStatusEnum.COMPLETED,
  ),
  false,
);
  assert.equal(
    canTransitionBookingStatus("COMPLETED", BookingStatusEnum.IN_PROGRESS),
    false,
  );

  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      upfrontPaymentAmount: 180_000,
      paidAmount: 0,
      hasPendingPayment: false,
    }),
    ContractPaymentStatusEnum.UNPAID,
  );
  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      upfrontPaymentAmount: 180_000,
      paidAmount: 0,
      hasPendingPayment: true,
    }),
    ContractPaymentStatusEnum.PENDING,
  );
  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      upfrontPaymentAmount: 180_000,
      paidAmount: 180_000,
    }),
    ContractPaymentStatusEnum.DEPOSIT_PAID,
  );
  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      upfrontPaymentAmount: 180_000,
      paidAmount: 100_000,
    }),
    ContractPaymentStatusEnum.PARTIAL,
  );
  assert.equal(
    deriveContractPaymentStatus({
      totalPrice: 600_000,
      upfrontPaymentAmount: 180_000,
      paidAmount: 600_000,
    }),
    ContractPaymentStatusEnum.PAID_FULL,
  );

  assert.equal(
    derivePaymentRefundStatus(600_000, 0),
    PaymentRefundStatusEnum.NOT_REFUNDED,
  );
  assert.equal(
    derivePaymentRefundStatus(600_000, 180_000),
    PaymentRefundStatusEnum.PARTIALLY_REFUNDED,
  );
  assert.equal(
    derivePaymentRefundStatus(600_000, 600_000),
    PaymentRefundStatusEnum.REFUNDED,
  );

  assert.equal(
    canTransitionRefundStatus(
      RefundStatusEnum.WAITING_FOR_REFUND_INFO,
      RefundStatusEnum.MANUAL_REQUIRED,
    ),
    true,
  );
  assert.equal(
    canTransitionRefundStatus(
      RefundStatusEnum.MANUAL_REQUIRED,
      RefundStatusEnum.PROCESSING,
    ),
    true,
  );
  assert.equal(
    canTransitionRefundStatus(
      RefundStatusEnum.PROCESSING,
      RefundStatusEnum.SUCCEEDED,
    ),
    true,
  );
  assert.equal(
    canTransitionRefundStatus(
      RefundStatusEnum.SUCCEEDED,
      RefundStatusEnum.PROCESSING,
    ),
    false,
  );

  assert.equal("HIDDEN" in CarStatusEnum, false);

  const invalidDocuments = [
    new CarModel({ status: "HIDDEN" }),
    new BookingModel({ status: "PENDING" }),
    new BookingModel({ status: "WAITING_PAYMENT" }),
    new BookingModel({ status: "CONFIRMED" }),
    new PaymentModel({ status: "REFUNDED" }),
    new RefundModel({ status: "PENDING" }),
    new RefundModel({ status: "FAILED" }),
    new RefundModel({ status: "CANCELLED" }),
    new ContractModel({ status: "DRAFT" }),
    new BookingExtensionModel({ status: "ACTIVE" }),
    new BookingExtensionModel({ status: "PAID" }),
  ];

  for (const document of invalidDocuments) {
    const validationError = document.validateSync();
    assert.ok(validationError?.errors.status);
  }

  const zeroPaymentExtension = new BookingExtensionModel({
    additionalAmount: 0,
  });
  assert.equal(
    zeroPaymentExtension.validateSync()?.errors.additionalAmount,
    undefined,
  );

  const extensionHelperSource = readFileSync(
    path.resolve(__dirname, "../helper/booking-extension.helper.ts"),
    "utf8",
  );
  const extensionRouteSource = readFileSync(
    path.resolve(__dirname, "../routers/apis/booking-extension.route.ts"),
    "utf8",
  );
  const availabilitySource = readFileSync(
    path.resolve(__dirname, "../helper/car-availability.helper.ts"),
    "utf8",
  );
  const paymentRouteSource = readFileSync(
    path.resolve(__dirname, "../routers/apis/payment.route.ts"),
    "utf8",
  );
  const extensionFrontendSource = readFileSync(
    path.resolve(
      __dirname,
      "../../../frontend/src/services/bookingExtension.service.ts",
    ),
    "utf8",
  );

  assert.equal(
    extensionHelperSource.includes("BookingExtensionStatusEnum.PAID"),
    false,
  );
  assert.ok(
    extensionHelperSource.includes(
      "extension.status === BookingExtensionStatusEnum.APPLIED",
    ),
  );
  assert.ok(
    extensionHelperSource.includes(
      "extension.status = BookingExtensionStatusEnum.APPLIED",
    ),
  );
  assert.ok(
    extensionHelperSource.indexOf(
      "extension.status === BookingExtensionStatusEnum.APPLIED",
    ) < extensionHelperSource.indexOf("booking.endDate = extension.requestedEndAt"),
  );
  assert.ok(extensionHelperSource.includes("PaymentStatusEnum.PAID"));
  assert.ok(
    extensionHelperSource.indexOf("const paidPayment = await PaymentModel.exists") <
      extensionHelperSource.indexOf(
        "extension = await BookingExtensionModel.findOneAndUpdate",
        extensionHelperSource.indexOf("export async function expireStaleBookingExtensions"),
      ),
  );
  assert.ok(
    extensionRouteSource.includes("applyZeroPaymentBookingExtension"),
  );
  const requestQuoteSource = extensionRouteSource.slice(
    extensionRouteSource.indexOf("private async buildExtensionQuote"),
    extensionRouteSource.indexOf("async quoteExtension"),
  );
  assert.ok(
    requestQuoteSource.includes(
      "assertCanRequestBookingExtension(booking, now)",
    ),
  );
  const ownerApprovalSource = extensionRouteSource.slice(
    extensionRouteSource.indexOf("async approveExtension"),
    extensionRouteSource.indexOf("async rejectExtension"),
  );
  assert.ok(
    ownerApprovalSource.includes(
      "assertBookingExtensionStillWithinCurrentRentalTime(approvedBooking)",
    ),
  );
  assert.equal(
    ownerApprovalSource.includes("assertCanRequestBookingExtension"),
    false,
  );
  const finalApplySource = extensionHelperSource.slice(
    extensionHelperSource.indexOf("async function applyBookingExtension"),
    extensionHelperSource.indexOf("export async function activatePaidBookingExtension"),
  );
  assert.ok(
    finalApplySource.indexOf(
      "assertBookingExtensionStillWithinCurrentRentalTime(booking)",
    ) < finalApplySource.indexOf("booking.endDate = extension.requestedEndAt"),
  );
  assert.equal(
    finalApplySource.includes("assertCanRequestBookingExtension"),
    false,
  );
  const expirySource = extensionHelperSource.slice(
    extensionHelperSource.indexOf("export async function expireStaleBookingExtensions"),
    extensionHelperSource.indexOf("export function startBookingExtensionExpirationJob"),
  );
  assert.ok(expirySource.includes("session.withTransaction"));
  assert.ok(expirySource.includes("canonicalPaymentFilter"));
  assert.ok(expirySource.includes("status: PaymentStatusEnum.PENDING"));
  assert.equal(
    availabilitySource.includes("BookingExtensionStatusEnum.APPLIED"),
    false,
  );
  assert.ok(
    paymentRouteSource.indexOf("payment.status = PaymentStatusEnum.PAID") <
      paymentRouteSource.indexOf("await this.applyPaidPaymentEffects"),
  );
  const extensionStatusTypeSource = extensionFrontendSource.slice(
    extensionFrontendSource.indexOf("export type BookingExtensionStatus"),
    extensionFrontendSource.indexOf("export type BookingExtensionRequestType"),
  );
  assert.ok(extensionStatusTypeSource.includes('| "APPLIED"'));
  assert.equal(extensionStatusTypeSource.includes('| "PAID"'), false);

  const fullyRefundedPayment = new PaymentModel({
    amount: 600_000,
    refundedAmount: 600_000,
    status: PaymentStatusEnum.PAID,
    refundStatus: PaymentRefundStatusEnum.REFUNDED,
  });
  assert.equal(fullyRefundedPayment.validateSync()?.errors.status, undefined);

  const frontendStatusConstants = readFileSync(
    path.resolve(
      __dirname,
      "../../../frontend/src/constants/status.constants.ts",
    ),
    "utf8",
  );
  for (const forbiddenFrontendToken of [
    "LegacyBookingStatus",
    "LegacyPaymentStatus",
    "LegacyRefundStatus",
    "LegacyContractStatus",
    "LegacyCarStatus",
    "WAITING_PAYMENT",
    "CONFIRMED",
    "DRAFT",
  ]) {
    assert.equal(frontendStatusConstants.includes(forbiddenFrontendToken), false);
  }

  console.log("[PASS] Status constants and transition rules are consistent.");
}

function verifyBookingExtensionTimingBoundaries() {
  const booking = { endDate: new Date("2026-08-15T18:00:00.000Z") };

  assert.doesNotThrow(() =>
    assertCanRequestBookingExtension(
      booking,
      new Date("2026-08-15T17:00:00.000Z"),
    ),
  );
  assert.doesNotThrow(() =>
    assertCanRequestBookingExtension(
      booking,
      new Date("2026-08-15T17:29:59.000Z"),
    ),
  );

  for (const rejectedAt of [
    "2026-08-15T17:30:00.000Z",
    "2026-08-15T17:45:00.000Z",
  ]) {
    assert.throws(
      () => assertCanRequestBookingExtension(booking, new Date(rejectedAt)),
      (error: any) => String(error?.info?.data || "").includes("ít nhất 30 phút"),
    );
  }

  assert.throws(
    () =>
      assertCanRequestBookingExtension(
        booking,
        new Date("2026-08-15T18:00:00.000Z"),
      ),
    (error: any) => String(error?.info?.data || "").includes("đã đến hoặc quá"),
  );

  assert.doesNotThrow(() =>
    assertBookingExtensionStillWithinCurrentRentalTime(
      booking,
      new Date("2026-08-15T17:40:00.000Z"),
    ),
  );
  assert.doesNotThrow(() =>
    assertBookingExtensionStillWithinCurrentRentalTime(
      booking,
      new Date("2026-08-15T17:55:00.000Z"),
    ),
  );
  for (const rejectedAt of [
    "2026-08-15T18:00:00.000Z",
    "2026-08-15T18:01:00.000Z",
  ]) {
    assert.throws(() =>
      assertBookingExtensionStillWithinCurrentRentalTime(
        booking,
        new Date(rejectedAt),
      ),
    );
  }

  console.log(
    "[PASS] Extension request cutoff is strict at 30 minutes while approve/apply remain valid until endDate.",
  );
}

async function verifyBookingExtensionApplyGuards() {
  assert.throws(
    () =>
      assertBookingExtensionStillWithinCurrentRentalTime(
        { endDate: new Date("2026-08-15T18:00:00.000Z") },
        new Date("2026-08-15T18:01:00.000Z"),
      ),
    (error: any) => String(error?.info?.data || "").includes("đã đến hoặc quá"),
  );

  const originalStartSession = mongoose.startSession;
  const originalPaymentFindOne = PaymentModel.findOne;
  const originalExtensionFindOne = BookingExtensionModel.findOne;
  const originalBookingFindOne = BookingModel.findOne;
  const originalBookingFindById = BookingModel.findById;
  const originalCarFindOneAndUpdate = CarModel.findOneAndUpdate;

  const payment = {
    _id: new mongoose.Types.ObjectId(),
    extensionId: new mongoose.Types.ObjectId(),
    status: PaymentStatusEnum.PAID,
  };
  const extension = {
    _id: payment.extensionId,
    bookingId: new mongoose.Types.ObjectId(),
    carId: new mongoose.Types.ObjectId(),
    status: BookingExtensionStatusEnum.PAYMENT_PENDING,
    requestType: BookingExtensionRequestTypeEnum.EXTENSION,
    oldEndAt: new Date(Date.now() - 60_000),
    requestedEndAt: new Date(Date.now() + 60 * 60_000),
  };
  const fakeSession = {
    withTransaction: async (operation: () => Promise<void>) => operation(),
    endSession: async () => undefined,
  };
  const sessionQuery = (value: any) => ({
    session: async () => value,
  });

  try {
    (mongoose as any).startSession = async () => fakeSession;
    (PaymentModel as any).findOne = () => sessionQuery(payment);
    (BookingExtensionModel as any).findOne = () => sessionQuery(extension);
    let bookingLookupCount = 0;
    (BookingModel as any).findOne = () => {
      bookingLookupCount += 1;
      return sessionQuery(null);
    };

    await assert.rejects(() =>
      activatePaidBookingExtension(String(payment._id)),
    );
    await assert.rejects(() =>
      activatePaidBookingExtension(String(payment._id)),
    );
    assert.equal(bookingLookupCount, 2);
    assert.equal(payment.status, PaymentStatusEnum.PAID);
    assert.equal(
      extension.status,
      BookingExtensionStatusEnum.PAYMENT_PENDING,
    );

    const lateBooking = {
      _id: extension.bookingId,
      endDate: extension.oldEndAt,
      status: BookingStatusEnum.IN_PROGRESS,
    };
    (BookingModel as any).findOne = () => sessionQuery(lateBooking);
    (CarModel as any).findOneAndUpdate = () => {
      throw new Error("Late apply must fail before locking or mutating Car");
    };
    await assert.rejects(
      () => activatePaidBookingExtension(String(payment._id)),
      (error: any) => String(error?.info?.data || "").includes("đã đến hoặc quá"),
    );
    assert.equal(extension.status, BookingExtensionStatusEnum.PAYMENT_PENDING);

    extension.status = BookingExtensionStatusEnum.APPLIED;
    (BookingModel as any).findOne = () => {
      throw new Error("APPLIED guard must return before applying Booking again");
    };
    (BookingModel as any).findById = () => sessionQuery({
      _id: extension.bookingId,
    });

    const duplicateResult = await activatePaidBookingExtension(
      String(payment._id),
    );
    assert.equal(duplicateResult.activated, false);
    assert.equal(extension.status, BookingExtensionStatusEnum.APPLIED);
  } finally {
    (mongoose as any).startSession = originalStartSession;
    (PaymentModel as any).findOne = originalPaymentFindOne;
    (BookingExtensionModel as any).findOne = originalExtensionFindOne;
    (BookingModel as any).findOne = originalBookingFindOne;
    (BookingModel as any).findById = originalBookingFindById;
    (CarModel as any).findOneAndUpdate = originalCarFindOneAndUpdate;
  }

  console.log(
    "[PASS] Payment-paid/apply-failed separation and APPLIED idempotency guard.",
  );
}

async function verifyZeroPaymentPlanConversionApply() {
  const originalStartSession = mongoose.startSession;
  const originalExtensionFindOne = BookingExtensionModel.findOne;
  const originalBookingFindOne = BookingModel.findOne;
  const originalCarFindOneAndUpdate = CarModel.findOneAndUpdate;
  const originalCartFindOne = CartModel.findOne;
  const originalContractFindOne = ContractModel.findOne;
  const originalPaymentFindOne = PaymentModel.findOne;

  const bookingId = new mongoose.Types.ObjectId();
  const extensionId = new mongoose.Types.ObjectId();
  const oldEndAt = new Date("2099-08-15T18:00:00.000Z");
  const requestedEndAt = new Date("2099-08-16T14:00:00.000Z");
  const booking: any = {
    _id: bookingId,
    carId: new mongoose.Types.ObjectId(),
    startDate: new Date("2099-08-15T14:00:00.000Z"),
    endDate: oldEndAt,
    status: BookingStatusEnum.IN_PROGRESS,
    rentalMode: RentalModeEnum.HOURLY,
    totalPrice: 1_000_000,
    paidAmount: 400_000,
    remainingAmount: 600_000,
    pricingSnapshot: {
      rentalMode: RentalModeEnum.HOURLY,
      breakdown: [{ dateOrTime: "HOURLY_OLD" }],
      subtotal: 1_000_000,
    },
    mileagePolicySnapshot: {
      rentalMode: RentalModeEnum.HOURLY,
      includedKmPerHour: 12,
      billableUnits: 4,
      totalIncludedKm: 48,
    },
    set(key: string, value: unknown) {
      this[key] = value;
    },
    markModified: () => undefined,
    save: async () => undefined,
  };
  const extension: any = {
    _id: extensionId,
    bookingId,
    carId: booking.carId,
    requestType: BookingExtensionRequestTypeEnum.PLAN_CONVERSION,
    status: BookingExtensionStatusEnum.OWNER_APPROVED,
    oldEndAt,
    requestedEndAt,
    additionalAmount: 0,
    billableUnits: 1,
    pricingSnapshot: {
      rentalMode: RentalModeEnum.DAILY,
      basePricePerUnit: 900_000,
      weekendSurchargePerUnit: 0,
      holidaySurchargePerUnit: 0,
      breakdown: [{ dateOrTime: "DAILY_FULL_TRIP" }],
      subtotal: 900_000,
    },
    conversionSnapshot: {
      previousContractedTotal: 1_000_000,
      appliedConvertedTotal: 1_000_000,
      financialAfter: {
        rentalSubtotal: 900_000,
        platformFeeRate: 0,
        platformFee: 0,
        insuranceFeePerDay: 100_000,
        insuranceDays: 1,
        insuranceFee: 100_000,
        deliveryFee: 0,
        totalPrice: 1_000_000,
      },
      mileageAfter: {
        rentalMode: RentalModeEnum.DAILY,
        includedKmPerDay: 250,
        overageFeePerKm: 5_000,
        graceKm: 5,
        billableUnits: 1,
        totalIncludedKm: 250,
      },
    },
    set(key: string, value: unknown) {
      this[key] = value;
    },
    save: async () => undefined,
  };
  const contract: any = {
    endDate: oldEndAt,
    totalPrice: 1_000_000,
    paidAmount: 400_000,
    remainingAmount: 600_000,
    save: async () => undefined,
  };
  const fakeSession = {
    withTransaction: async (operation: () => Promise<void>) => operation(),
    endSession: async () => undefined,
  };
  const chainQuery = (value: any) => {
    const query: any = {
      select: () => query,
      sort: () => query,
      session: () => query,
      lean: async () => value,
      then: (resolve: (result: any) => unknown, reject: (error: any) => unknown) =>
        Promise.resolve(value).then(resolve, reject),
    };
    return query;
  };

  try {
    (mongoose as any).startSession = async () => fakeSession;
    (BookingExtensionModel as any).findOne = (filter: any) =>
      chainQuery(String(filter?._id || "") === String(extensionId) ? extension : null);
    (BookingModel as any).findOne = (filter: any) =>
      chainQuery(String(filter?._id || "") === String(bookingId) ? booking : null);
    (CarModel as any).findOneAndUpdate = async () => ({
      _id: booking.carId,
      allowDailyRental: false,
      pricing: { basePricePerDay: 1 },
    });
    (CartModel as any).findOne = () => chainQuery(null);
    (ContractModel as any).findOne = () => chainQuery(contract);
    (PaymentModel as any).findOne = () => {
      throw new Error("Zero-payment conversion must not query Payment");
    };

    const result = await applyZeroPaymentBookingExtension(String(extensionId), {
      notifyAfterApply: false,
    });
    assert.equal(result.activated, true);
    assert.equal(extension.status, BookingExtensionStatusEnum.APPLIED);
    assert.equal(booking.rentalMode, RentalModeEnum.DAILY);
    assert.equal(booking.endDate, requestedEndAt);
    assert.equal(booking.totalPrice, 1_000_000);
    assert.equal(booking.paidAmount, 400_000);
    assert.equal(booking.remainingAmount, 600_000);
    assert.deepEqual(booking.pricingSnapshot.breakdown, [
      { dateOrTime: "DAILY_FULL_TRIP" },
    ]);
    assert.equal(booking.pricingSnapshot.basePricePerUnit, 900_000);
    assert.equal(booking.mileagePolicySnapshot.totalIncludedKm, 250);
    assert.equal(contract.endDate, oldEndAt);
    assert.equal(contract.totalPrice, 1_000_000);
    assert.equal(contract.paidAmount, 400_000);
    assert.equal(contract.remainingAmount, 600_000);
  } finally {
    (mongoose as any).startSession = originalStartSession;
    (BookingExtensionModel as any).findOne = originalExtensionFindOne;
    (BookingModel as any).findOne = originalBookingFindOne;
    (CarModel as any).findOneAndUpdate = originalCarFindOneAndUpdate;
    (CartModel as any).findOne = originalCartFindOne;
    (ContractModel as any).findOne = originalContractFindOne;
    (PaymentModel as any).findOne = originalPaymentFindOne;
  }

  console.log("[PASS] Zero-payment PLAN_CONVERSION applies atomically without Payment.");
}

async function verifyPaymentExpiryAtomicity() {
  const originalStartSession = mongoose.startSession;
  const originalExtensionFind = BookingExtensionModel.find;
  const originalExtensionFindOne = BookingExtensionModel.findOne;
  const originalExtensionFindOneAndUpdate = BookingExtensionModel.findOneAndUpdate;
  const originalPaymentExists = PaymentModel.exists;
  const originalPaymentFindOne = PaymentModel.findOne;
  const originalPaymentFindOneAndUpdate = PaymentModel.findOneAndUpdate;
  const originalPaymentUpdateMany = PaymentModel.updateMany;
  const originalBookingFindById = BookingModel.findById;
  const extensionId = new mongoose.Types.ObjectId();
  const paymentId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const extension: any = {
    _id: extensionId,
    bookingId,
    paymentId,
    status: BookingExtensionStatusEnum.PAYMENT_PENDING,
    isDeleted: false,
  };
  const payment: any = {
    _id: paymentId,
    extensionId,
    paymentType: PaymentTypeEnum.EXTENSION,
    status: PaymentStatusEnum.PENDING,
  };
  let injectPaidCallbackDuringExpiryRead = false;
  let callbackInjected = false;
  const fakeSession = {
    withTransaction: async (operation: () => Promise<void>) => operation(),
    endSession: async () => undefined,
  };
  const chainQuery = (value: any) => {
    const query: any = {
      select: () => query,
      sort: () => query,
      limit: () => query,
      session: async () => value,
      lean: async () => value,
    };
    return query;
  };
  const statusMatches = (filterStatus: any, actualStatus: string) => {
    if (!filterStatus) return true;
    if (typeof filterStatus === "string") return filterStatus === actualStatus;
    if (Array.isArray(filterStatus?.$in)) {
      return filterStatus.$in.includes(actualStatus);
    }
    return true;
  };
  const reset = (
    extensionStatus: BookingExtensionStatusEnum,
    paymentStatus: PaymentStatusEnum,
  ) => {
    extension.status = extensionStatus;
    extension.activeLockKey = String(bookingId);
    payment.status = paymentStatus;
    payment.note = undefined;
    callbackInjected = false;
    injectPaidCallbackDuringExpiryRead = false;
  };

  try {
    (mongoose as any).startSession = async () => fakeSession;
    (BookingExtensionModel as any).find = () =>
      chainQuery([{ _id: extensionId, bookingId }]);
    (BookingExtensionModel as any).findOne = (filter: any) =>
      chainQuery(
        statusMatches(filter?.status, extension.status) ? extension : null,
      );
    (PaymentModel as any).findOne = (filter: any) =>
      chainQuery(statusMatches(filter?.status, payment.status) ? payment : null);
    (PaymentModel as any).exists = (filter: any) => ({
      session: async () => {
        const observedPaid = statusMatches(filter?.status, payment.status);
        if (injectPaidCallbackDuringExpiryRead && !callbackInjected) {
          callbackInjected = true;
          await markBookingExtensionPaymentPaid({
            paymentId: String(paymentId),
            paidAt: new Date("2026-08-15T17:59:59.000Z"),
            transactionCode: "RACE-SUCCESS",
          });
        }
        return observedPaid ? { _id: paymentId } : null;
      },
    });
    (PaymentModel as any).findOneAndUpdate = async (filter: any, update: any) => {
      if (!statusMatches(filter?.status, payment.status)) return null;
      Object.assign(payment, update?.$set || {});
      return payment;
    };
    (BookingExtensionModel as any).findOneAndUpdate = async (
      filter: any,
      update: any,
    ) => {
      if (!statusMatches(filter?.status, extension.status)) return null;
      Object.assign(extension, update?.$set || {});
      if (update?.$unset?.activeLockKey) delete extension.activeLockKey;
      return extension;
    };
    (PaymentModel as any).updateMany = async (_filter: any, update: any) => {
      if (payment.status === PaymentStatusEnum.PENDING) {
        Object.assign(payment, update?.$set || {});
      }
      return { modifiedCount: 1 };
    };
    (BookingModel as any).findById = async () => null;

    reset(
      BookingExtensionStatusEnum.PAYMENT_PENDING,
      PaymentStatusEnum.PAID,
    );
    const paidResult = await expireStaleBookingExtensions(
      new Date("2026-08-15T18:00:00.000Z"),
    );
    assert.equal(paidResult.expiredCount, 0);
    assert.equal(extension.status, BookingExtensionStatusEnum.PAYMENT_PENDING);

    reset(
      BookingExtensionStatusEnum.PAYMENT_PENDING,
      PaymentStatusEnum.PENDING,
    );
    const expiredResult = await expireStaleBookingExtensions(
      new Date("2026-08-15T18:00:00.000Z"),
    );
    assert.equal(expiredResult.expiredCount, 1);
    assert.equal(extension.status, BookingExtensionStatusEnum.EXPIRED);
    assert.equal(payment.status, PaymentStatusEnum.FAILED);

    reset(BookingExtensionStatusEnum.APPLIED, PaymentStatusEnum.PAID);
    const appliedResult = await expireStaleBookingExtensions(
      new Date("2026-08-15T18:00:00.000Z"),
    );
    assert.equal(appliedResult.expiredCount, 0);
    assert.equal(extension.status, BookingExtensionStatusEnum.APPLIED);

    reset(
      BookingExtensionStatusEnum.PAYMENT_PENDING,
      PaymentStatusEnum.PENDING,
    );
    injectPaidCallbackDuringExpiryRead = true;
    const raceResult = await expireStaleBookingExtensions(
      new Date("2026-08-15T18:00:00.000Z"),
    );
    assert.equal(raceResult.expiredCount, 0);
    assert.equal(payment.status, PaymentStatusEnum.PAID);
    assert.notEqual(extension.status, BookingExtensionStatusEnum.EXPIRED);
  } finally {
    (mongoose as any).startSession = originalStartSession;
    (BookingExtensionModel as any).find = originalExtensionFind;
    (BookingExtensionModel as any).findOne = originalExtensionFindOne;
    (BookingExtensionModel as any).findOneAndUpdate =
      originalExtensionFindOneAndUpdate;
    (PaymentModel as any).exists = originalPaymentExists;
    (PaymentModel as any).findOne = originalPaymentFindOne;
    (PaymentModel as any).findOneAndUpdate = originalPaymentFindOneAndUpdate;
    (PaymentModel as any).updateMany = originalPaymentUpdateMany;
    (BookingModel as any).findById = originalBookingFindById;
  }

  console.log(
    "[PASS] Extension expiry is atomic with canonical Payment claim, including race simulation.",
  );
}

run();
verifyBookingExtensionTimingBoundaries();
verifyBookingExtensionApplyGuards()
  .then(verifyZeroPaymentPlanConversionApply)
  .then(verifyPaymentExpiryAtomicity)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
