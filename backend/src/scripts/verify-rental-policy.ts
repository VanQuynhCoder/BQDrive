import assert from "node:assert/strict";

import {
  PaymentMethodEnum,
  PaymentTypeEnum,
  RentalModeEnum,
} from "../constants/model.const";
import {
  HOURLY_EXTENSION_MIN_HOURS,
  HOURLY_RENTAL_MAX_TOTAL_HOURS,
  HOURLY_RENTAL_MIN_HOURS,
} from "../constants/rental-policy.const";
import {
  assertBookingExtensionDuration,
  assertBookingPlanConversionDuration,
} from "../helper/booking-extension.helper";
import { assertPaymentMethodAllowed } from "../helper/payment-method-policy.helper";

function expectThrows(task: () => void, expectedText: string) {
  assert.throws(task, (error: any) => {
    const message = [error?.message, error?.info?.message, error?.info?.data]
      .filter(Boolean)
      .join(" ");
    return message.includes(expectedText);
  });
}

const hourlyBooking = {
  rentalMode: RentalModeEnum.HOURLY,
  startDate: new Date("2026-08-15T01:00:00.000Z"),
  endDate: new Date("2026-08-15T23:00:00.000Z"),
};

assert.equal(HOURLY_RENTAL_MIN_HOURS, 4);
assert.equal(HOURLY_RENTAL_MAX_TOTAL_HOURS, 24);
assert.equal(HOURLY_EXTENSION_MIN_HOURS, 2);
assert.doesNotThrow(() =>
  assertBookingExtensionDuration(
    hourlyBooking,
    new Date("2026-08-16T01:00:00.000Z"),
  ),
);
expectThrows(
  () =>
    assertBookingExtensionDuration(
      hourlyBooking,
      new Date("2026-08-16T02:00:00.000Z"),
    ),
  "24 giờ",
);

assert.doesNotThrow(() =>
  assertBookingPlanConversionDuration(
    hourlyBooking,
    new Date("2026-08-16T23:00:00.000Z"),
  ),
);
assert.doesNotThrow(
  () =>
    assertBookingPlanConversionDuration(
      hourlyBooking,
      new Date("2026-08-16T22:00:00.000Z"),
    ),
);
expectThrows(
  () =>
    assertBookingPlanConversionDuration(
      hourlyBooking,
      new Date("2026-08-15T23:00:00.000Z"),
    ),
  "Thời gian chuyển gói không hợp lệ",
);
expectThrows(
  () =>
    assertBookingPlanConversionDuration(
      { ...hourlyBooking, rentalMode: RentalModeEnum.DAILY },
      new Date("2026-08-16T23:00:00.000Z"),
    ),
  "Chỉ booking thuê theo giờ",
);

assert.doesNotThrow(() =>
  assertPaymentMethodAllowed(
    PaymentTypeEnum.EXTENSION,
    PaymentMethodEnum.MOMO,
  ),
);
assert.doesNotThrow(() =>
  assertPaymentMethodAllowed(
    PaymentTypeEnum.EXTENSION,
    PaymentMethodEnum.VNPAY,
  ),
);
expectThrows(
  () =>
    assertPaymentMethodAllowed(
      PaymentTypeEnum.EXTENSION,
      PaymentMethodEnum.CASH,
    ),
  "MoMo hoặc VNPay",
);
assert.doesNotThrow(() =>
  assertPaymentMethodAllowed(
    PaymentTypeEnum.REMAINING,
    PaymentMethodEnum.CASH,
  ),
);

console.log("Rental policy rules verified successfully.");
