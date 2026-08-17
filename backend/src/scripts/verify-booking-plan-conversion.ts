import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

import { BaseError } from "../base/error";
import {
  BookingExtensionRequestTypeEnum,
  RentalModeEnum,
} from "../constants/model.const";
import {
  assertBookingExtensionStillWithinCurrentRentalTime,
  assertBookingPlanConversionDuration,
  assertBookingPlanConversionQuoteIsCurrent,
  assertBookingPlanConversionRequestTiming,
  calculateBookingExtensionPrice,
  calculateBookingFinanceForAppliedExtension,
  calculateBookingPlanConversionFinancials,
  calculateBookingPlanConversionPrice,
  getBookingExtensionPaymentDeadline,
  updateMileagePolicyForExtension,
  updatePricingSnapshotForExtension,
} from "../helper/booking-extension.helper";
import { calculateEligiblePaidAmount } from "../helper/payment-sync.helper";
import { BookingExtensionModel } from "../models/booking-extension/bookingExtension.model";
import { HolidayCalendarModel } from "../models/holiday-calendar/holidayCalendar.model";

const originalHolidayFind = HolidayCalendarModel.find;
(HolidayCalendarModel as any).find = () => ({
  lean: async () => [],
});

function buildHourlyBooking(overrides: Record<string, any> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    carId: new mongoose.Types.ObjectId(),
    startDate: new Date("2026-08-15T14:00:00.000Z"),
    endDate: new Date("2026-08-15T18:00:00.000Z"),
    rentalMode: RentalModeEnum.HOURLY,
    totalPrice: 400_000,
    pricingSnapshot: {
      rentalMode: RentalModeEnum.HOURLY,
      basePricePerUnit: 100_000,
      weekendSurchargePerUnit: 0,
      holidaySurchargePerUnit: 0,
      breakdown: [],
      subtotal: 400_000,
      rentalSubtotal: 400_000,
      platformFeeRate: 0,
      platformFee: 0,
      insuranceFeePerDay: 0,
      insuranceDays: 1,
      insuranceFee: 0,
      deliveryFee: 0,
      totalPrice: 400_000,
    },
    ratePlanSnapshot: {
      hourly: {
        basePricePerHour: 100_000,
        weekendSurchargePerHour: 0,
        holidaySurchargePerHour: 0,
        includedKmPerHour: 12,
      },
      daily: {
        basePricePerDay: 900_000,
        weekendSurchargePerDay: 0,
        holidaySurchargePerDay: 0,
        includedKmPerDay: 250,
      },
      overageFeePerKm: 5_000,
      graceKm: 5,
    },
    mileagePolicySnapshot: {
      rentalMode: RentalModeEnum.HOURLY,
      includedKmPerHour: 12,
      overageFeePerKm: 5_000,
      graceKm: 5,
      billableUnits: 4,
      totalIncludedKm: 48,
    },
    ...overrides,
  };
}

function getBusinessErrorData(action: () => unknown) {
  try {
    action();
  } catch (error) {
    if (error instanceof BaseError) return String(error.info.data || error.message);
    throw error;
  }
  assert.fail("Expected business error");
}

async function run() {
  const booking = buildHourlyBooking();

  // Case 1: không còn bắt oldEnd + 24 giờ.
  assert.doesNotThrow(() =>
    assertBookingPlanConversionDuration(
      booking,
      new Date("2026-08-16T10:00:00.000Z"),
    ),
  );

  // Case 2: không còn bắt cùng giờ trả.
  assert.doesNotThrow(() =>
    assertBookingPlanConversionDuration(
      booking,
      new Date("2026-08-16T08:00:00.000Z"),
    ),
  );

  // Case 3: reprice toàn chuyến, không cộng HOURLY cũ với một DAILY mới.
  const convertedQuote = await calculateBookingPlanConversionPrice(
    booking,
    new Date("2026-08-16T08:00:00.000Z"),
  );
  assert.equal(convertedQuote.calculatedConvertedTotal, 900_000);
  assert.equal(convertedQuote.appliedConvertedTotal, 900_000);
  assert.equal(convertedQuote.additionalAmount, 500_000);
  assert.equal(convertedQuote.pricingSnapshot.subtotal, 900_000);

  // Các component tài chính duration-dependent được tính lại; delivery giữ một lần.
  const componentFinance = calculateBookingPlanConversionFinancials(
    buildHourlyBooking({
      pricingSnapshot: {
        ...booking.pricingSnapshot,
        platformFeeRate: 0.1,
        insuranceFeePerDay: 30_000,
        deliveryFee: 50_000,
      },
    }),
    { totalPrice: 900_000, totalTime: 1 },
  );
  assert.equal(componentFinance.calculatedConvertedTotal, 1_070_000);
  assert.equal(componentFinance.financialAfter.deliveryFee, 50_000);

  // Case 4: đúng 24 giờ là một DAILY unit.
  const quote24Hours = await calculateBookingPlanConversionPrice(
    buildHourlyBooking({
      startDate: new Date("2026-08-15T10:00:00.000Z"),
      endDate: new Date("2026-08-15T18:00:00.000Z"),
    }),
    new Date("2026-08-16T10:00:00.000Z"),
  );
  assert.equal(quote24Hours.dailyUnits, 1);

  // Case 5: đúng 48 giờ là hai DAILY units.
  const quote48Hours = await calculateBookingPlanConversionPrice(
    buildHourlyBooking({
      startDate: new Date("2026-08-15T10:00:00.000Z"),
      endDate: new Date("2026-08-15T18:00:00.000Z"),
    }),
    new Date("2026-08-17T10:00:00.000Z"),
  );
  assert.equal(quote48Hours.dailyUnits, 2);

  // Case 6: DAILY rẻ hơn thì không âm và không tự hoàn tiền.
  const zeroQuote = await calculateBookingPlanConversionPrice(
    buildHourlyBooking({ totalPrice: 1_000_000 }),
    new Date("2026-08-16T08:00:00.000Z"),
  );
  assert.equal(zeroQuote.calculatedConvertedTotal, 900_000);
  assert.equal(zeroQuote.appliedConvertedTotal, 1_000_000);
  assert.equal(zeroQuote.additionalAmount, 0);

  // Case 7: mileage DAILY thay thế 48 km HOURLY, không cộng dồn.
  assert.equal(convertedQuote.currentIncludedKm, 48);
  assert.equal(convertedQuote.convertedIncludedKm, 250);
  assert.equal(
    convertedQuote.conversionSnapshot.mileageAfter?.totalIncludedKm,
    250,
  );

  // Case 8: hai ngày có 500 km.
  assert.equal(quote48Hours.convertedIncludedKm, 500);

  // Case 9: thay đổi Car không tham gia conversion; snapshot vẫn là 900.000.
  const changedCar = { pricing: { basePricePerDay: 1_500_000 } };
  changedCar.pricing.basePricePerDay = 2_000_000;
  const immutableQuote = await calculateBookingPlanConversionPrice(
    buildHourlyBooking({
      startDate: new Date("2026-08-16T06:00:00.000Z"),
      endDate: new Date("2026-08-16T10:00:00.000Z"),
      ratePlanSnapshot: {
        ...booking.ratePlanSnapshot,
        daily: {
          ...booking.ratePlanSnapshot.daily,
          weekendSurchargePerDay: 100_000,
        },
      },
    }),
    new Date("2026-08-17T00:00:00.000Z"),
  );
  assert.equal(immutableQuote.pricingSnapshot.basePricePerUnit, 900_000);
  assert.equal(immutableQuote.pricingSnapshot.subtotal, 1_000_000);

}

async function runRemainingCases() {
  const booking = buildHourlyBooking();

  const missingSnapshotBooking = buildHourlyBooking({
    ratePlanSnapshot: undefined,
  });
  await assert.rejects(
    () =>
      calculateBookingPlanConversionPrice(
        missingSnapshotBooking,
        new Date("2026-08-16T08:00:00.000Z"),
      ),
    (error: any) =>
      String(error?.info?.data || "").includes("không có bảng giá DAILY"),
  );

  // Case 11: không cho request khi đã đến/quá currentEnd.
  const lateMessage = getBusinessErrorData(() =>
    assertBookingPlanConversionRequestTiming(
      booking,
      new Date("2026-08-16T08:00:00.000Z"),
      new Date(booking.endDate),
    ),
  );
  assert.ok(lateMessage.includes("đã đến hoặc quá"));

  const lateHourlyMessage = getBusinessErrorData(() =>
    assertBookingExtensionStillWithinCurrentRentalTime(
      booking,
      new Date("2026-08-15T18:05:00.000Z"),
    ),
  );
  assert.ok(lateHourlyMessage.includes("đã đến hoặc quá"));
  assert.doesNotThrow(() =>
    assertBookingExtensionStillWithinCurrentRentalTime(
      booking,
      new Date("2026-08-15T17:59:59.000Z"),
    ),
  );

  // Immutable conversion snapshot survive Mongoose casting and owner revalidation.
  const quote = await calculateBookingPlanConversionPrice(
    booking,
    new Date("2026-08-16T08:00:00.000Z"),
  );
  const extension = new BookingExtensionModel({
    bookingId: booking._id,
    carId: booking.carId,
    requestedBy: new mongoose.Types.ObjectId(),
    carBookingRevision: 3,
    ...quote,
    requestType: BookingExtensionRequestTypeEnum.PLAN_CONVERSION,
  });
  assert.equal(extension.validateSync(), undefined);
  await assert.doesNotReject(() =>
    assertBookingPlanConversionQuoteIsCurrent(booking, extension),
  );
  await assert.rejects(
    () =>
      assertBookingPlanConversionQuoteIsCurrent(
        { ...booking, totalPrice: 450_000 },
        extension,
      ),
    (error: any) =>
      String(error?.info?.data || "").includes("không còn khớp"),
  );

  // Case 12: TIME_EXTENSION HOURLY và DAILY giữ công thức cũ.
  const hourlyExtension = await calculateBookingExtensionPrice(
    booking,
    new Date("2026-08-15T22:00:00.000Z"),
  );
  assert.equal(hourlyExtension.billableUnits, 4);
  assert.equal(hourlyExtension.additionalAmount, 400_000);

  const dailyBooking = {
    startDate: new Date("2026-08-15T10:00:00.000Z"),
    endDate: new Date("2026-08-16T10:00:00.000Z"),
    rentalMode: RentalModeEnum.DAILY,
    pricingSnapshot: {
      rentalMode: RentalModeEnum.DAILY,
      basePricePerUnit: 900_000,
      weekendSurchargePerUnit: 0,
      holidaySurchargePerUnit: 0,
      breakdown: [],
      subtotal: 900_000,
    },
  };
  const dailyExtension = await calculateBookingExtensionPrice(
    dailyBooking,
    new Date("2026-08-17T10:00:00.000Z"),
  );
  assert.equal(dailyExtension.billableUnits, 1);
  assert.equal(dailyExtension.additionalAmount, 900_000);
}

async function runApplyCorrectnessCases() {
  const markModified = () => undefined;

  // Case 1: TIME_EXTENSION HOURLY vẫn cộng pricing và mileage.
  const hourlyBooking: any = buildHourlyBooking({
    paidAmount: 200_000,
    remainingAmount: 200_000,
    markModified,
  });
  hourlyBooking.pricingSnapshot.breakdown = [{ dateOrTime: "HOURLY_OLD" }];
  const hourlyExtension: any = {
    requestType: BookingExtensionRequestTypeEnum.EXTENSION,
    additionalAmount: 200_000,
    billableUnits: 2,
    pricingSnapshot: { breakdown: [{ dateOrTime: "HOURLY_EXTENSION" }] },
  };
  updatePricingSnapshotForExtension(hourlyBooking, hourlyExtension);
  updateMileagePolicyForExtension(hourlyBooking, hourlyExtension);
  assert.deepEqual(
    hourlyBooking.pricingSnapshot.breakdown.map((item: any) => item.dateOrTime),
    ["HOURLY_OLD", "HOURLY_EXTENSION"],
  );
  assert.equal(hourlyBooking.mileagePolicySnapshot.billableUnits, 6);
  assert.equal(hourlyBooking.mileagePolicySnapshot.totalIncludedKm, 72);

  // Case 2: TIME_EXTENSION DAILY vẫn cộng pricing và mileage.
  const dailyBooking: any = {
    rentalMode: RentalModeEnum.DAILY,
    totalPrice: 900_000,
    paidAmount: 300_000,
    pricingSnapshot: {
      rentalMode: RentalModeEnum.DAILY,
      breakdown: [{ dateOrTime: "DAILY_OLD" }],
      subtotal: 900_000,
      rentalSubtotal: 900_000,
    },
    mileagePolicySnapshot: {
      rentalMode: RentalModeEnum.DAILY,
      includedKmPerDay: 250,
      billableUnits: 1,
      totalIncludedKm: 250,
    },
    markModified,
  };
  const dailyExtension: any = {
    requestType: BookingExtensionRequestTypeEnum.EXTENSION,
    additionalAmount: 900_000,
    billableUnits: 1,
    pricingSnapshot: { breakdown: [{ dateOrTime: "DAILY_EXTENSION" }] },
  };
  updatePricingSnapshotForExtension(dailyBooking, dailyExtension);
  updateMileagePolicyForExtension(dailyBooking, dailyExtension);
  assert.deepEqual(
    dailyBooking.pricingSnapshot.breakdown.map((item: any) => item.dateOrTime),
    ["DAILY_OLD", "DAILY_EXTENSION"],
  );
  assert.equal(dailyBooking.mileagePolicySnapshot.billableUnits, 2);
  assert.equal(dailyBooking.mileagePolicySnapshot.totalIncludedKm, 500);

  const conversionBooking: any = buildHourlyBooking({
    paidAmount: 200_000,
    remainingAmount: 200_000,
    markModified,
  });
  conversionBooking.pricingSnapshot.breakdown = [
    { dateOrTime: "HOURLY_MUST_BE_REPLACED" },
  ];
  const conversionQuote = await calculateBookingPlanConversionPrice(
    conversionBooking,
    new Date("2026-08-16T08:00:00.000Z"),
  );
  const conversionExtension: any = {
    ...conversionQuote,
    requestType: BookingExtensionRequestTypeEnum.PLAN_CONVERSION,
  };

  // Case 3: PLAN_CONVERSION pricing thay thế toàn bộ HOURLY breakdown.
  updatePricingSnapshotForExtension(conversionBooking, conversionExtension);
  assert.deepEqual(
    conversionBooking.pricingSnapshot.breakdown,
    conversionQuote.pricingSnapshot.breakdown,
  );
  assert.equal(
    conversionBooking.pricingSnapshot.breakdown.some(
      (item: any) => item.dateOrTime === "HOURLY_MUST_BE_REPLACED",
    ),
    false,
  );
  assert.equal(conversionBooking.pricingSnapshot.rentalMode, RentalModeEnum.DAILY);
  assert.equal(conversionBooking.pricingSnapshot.rentalSubtotal, 900_000);
  assert.equal(conversionBooking.pricingSnapshot.totalPrice, 900_000);

  // Case 4: mileage 48 km được thay bằng 250 km, không thành 298 km.
  updateMileagePolicyForExtension(conversionBooking, conversionExtension);
  assert.equal(conversionBooking.mileagePolicySnapshot.rentalMode, RentalModeEnum.DAILY);
  assert.equal(conversionBooking.mileagePolicySnapshot.totalIncludedKm, 250);

  // Case 5: hai DAILY units có đúng 500 km.
  const twoDayBooking: any = buildHourlyBooking({ markModified });
  const twoDayQuote = await calculateBookingPlanConversionPrice(
    twoDayBooking,
    new Date("2026-08-17T14:00:00.000Z"),
  );
  updateMileagePolicyForExtension(twoDayBooking, {
    ...twoDayQuote,
    requestType: BookingExtensionRequestTypeEnum.PLAN_CONVERSION,
  });
  assert.equal(twoDayBooking.mileagePolicySnapshot.billableUnits, 2);
  assert.equal(twoDayBooking.mileagePolicySnapshot.totalIncludedKm, 500);

  // Case 6: converted total là canonical; payment chỉ cộng phần phát sinh.
  assert.deepEqual(
    calculateBookingFinanceForAppliedExtension(
      { totalPrice: 400_000, paidAmount: 200_000 },
      conversionExtension,
    ),
    { totalPrice: 900_000, paidAmount: 700_000, remainingAmount: 200_000 },
  );

  // Case 7: remaining cũ 600k được giữ nguyên sau khi trả thêm 500k.
  assert.deepEqual(
    calculateBookingFinanceForAppliedExtension(
      { totalPrice: 900_000, paidAmount: 300_000 },
      {
        requestType: BookingExtensionRequestTypeEnum.PLAN_CONVERSION,
        additionalAmount: 500_000,
        conversionSnapshot: {
          previousContractedTotal: 900_000,
          appliedConvertedTotal: 1_400_000,
        },
      },
    ),
    { totalPrice: 1_400_000, paidAmount: 800_000, remainingAmount: 600_000 },
  );

  // Case 8: zero-payment giữ paidAmount và không tạo credit/refund.
  assert.deepEqual(
    calculateBookingFinanceForAppliedExtension(
      { totalPrice: 1_000_000, paidAmount: 400_000 },
      {
        requestType: BookingExtensionRequestTypeEnum.PLAN_CONVERSION,
        additionalAmount: 0,
        conversionSnapshot: {
          previousContractedTotal: 1_000_000,
          appliedConvertedTotal: 1_000_000,
        },
      },
    ),
    { totalPrice: 1_000_000, paidAmount: 400_000, remainingAmount: 600_000 },
  );

  // Case 10: Extension PAID chỉ được aggregation tính sau khi APPLIED.
  const extensionId = new mongoose.Types.ObjectId();
  const extensionPaymentId = new mongoose.Types.ObjectId();
  const paidPayments = [
    { paymentType: "DEPOSIT", amount: 200_000 },
    {
      _id: extensionPaymentId,
      paymentType: "EXTENSION",
      extensionId,
      amount: 500_000,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      paymentType: "EXTENSION",
      extensionId,
      amount: 500_000,
    },
  ];
  assert.equal(
    calculateEligiblePaidAmount({
      paidPayments,
      appliedExtensionPaymentIds: [],
      totalPrice: 900_000,
    }),
    200_000,
  );
  assert.equal(
    calculateEligiblePaidAmount({
      paidPayments,
      appliedExtensionPaymentIds: [String(extensionPaymentId)],
      totalPrice: 900_000,
    }),
    700_000,
  );

  // Case 12: deadline không vượt current booking end.
  assert.equal(
    getBookingExtensionPaymentDeadline(
      new Date("2026-08-15T18:00:00.000Z"),
      new Date("2026-08-15T18:05:00.000Z"),
    ).toISOString(),
    "2026-08-15T18:05:00.000Z",
  );

  // Case 13/14: apply dùng snapshot Extension, không dùng giá/flag Car hiện tại.
  const independentBooking: any = buildHourlyBooking({ markModified });
  updatePricingSnapshotForExtension(independentBooking, conversionExtension);
  assert.equal(independentBooking.pricingSnapshot.totalPrice, 900_000);
  const helperSource = readFileSync(
    path.resolve(__dirname, "../helper/booking-extension.helper.ts"),
    "utf8",
  );
  const paymentAndApplySource = helperSource.slice(
    helperSource.indexOf("export async function prepareBookingExtensionPayment"),
    helperSource.indexOf("export async function expireStaleBookingExtensions"),
  );
  assert.equal(paymentAndApplySource.includes("assertCarSupportsDailyPlan("), false);
  assert.equal(paymentAndApplySource.includes("basePricePerDay"), false);
}

run()
  .then(runRemainingCases)
  .then(runApplyCorrectnessCases)
  .then(() =>
    console.log("PASS: PHASE 3 apply correctness scenarios"),
  )
  .finally(() => {
    (HolidayCalendarModel as any).find = originalHolidayFind;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
