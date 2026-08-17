import assert from "node:assert/strict";
import mongoose from "mongoose";
import { RentalModeEnum, RentalUnitEnum } from "../constants/model.const";
import {
  buildBookingMileagePolicySnapshot,
  buildBookingRatePlanSnapshot,
} from "../helper/booking-rate-plan-snapshot.helper";
import { BookingModel } from "../models/booking/booking.model";

function buildCar(overrides: Record<string, unknown> = {}) {
  return {
    allowHourlyRental: true,
    allowDailyRental: true,
    rentalUnit: RentalUnitEnum.DAY,
    pricing: {
      basePricePerHour: 100_000,
      weekendSurchargePerHour: 10_000,
      holidaySurchargePerHour: 20_000,
      basePricePerDay: 900_000,
      weekendSurchargePerDay: 100_000,
      holidaySurchargePerDay: 200_000,
    },
    mileagePolicy: {
      includedKmPerHour: 12,
      includedKmPerDay: 250,
      overageFeePerKm: 5_000,
      graceKm: 5,
    },
    ...overrides,
  };
}

const dualPlanCar = buildCar();
const dualPlanSnapshot = buildBookingRatePlanSnapshot(dualPlanCar);

assert.ok(dualPlanSnapshot.hourly, "Case 1/2: thiếu snapshot HOURLY");
assert.ok(dualPlanSnapshot.daily, "Case 1/2: thiếu snapshot DAILY");

const hourlyMileage = buildBookingMileagePolicySnapshot(
  dualPlanSnapshot,
  RentalModeEnum.HOURLY,
  4,
);
assert.equal(hourlyMileage?.rentalMode, RentalModeEnum.HOURLY);
assert.equal(hourlyMileage?.totalIncludedKm, 48);

const dailyMileage = buildBookingMileagePolicySnapshot(
  dualPlanSnapshot,
  RentalModeEnum.DAILY,
  2,
);
assert.equal(dailyMileage?.rentalMode, RentalModeEnum.DAILY);
assert.equal(dailyMileage?.totalIncludedKm, 500);

const hourlyOnlySnapshot = buildBookingRatePlanSnapshot(
  buildCar({ allowDailyRental: false }),
);
assert.ok(hourlyOnlySnapshot.hourly, "Case 3: thiếu snapshot HOURLY");
assert.equal(hourlyOnlySnapshot.daily, undefined, "Case 3: DAILY phải vắng mặt");

const dailyOnlySnapshot = buildBookingRatePlanSnapshot(
  buildCar({ allowHourlyRental: false }),
);
assert.ok(dailyOnlySnapshot.daily, "Case 4: thiếu snapshot DAILY");
assert.equal(
  dailyOnlySnapshot.hourly,
  undefined,
  "Case 4: HOURLY phải vắng mặt",
);

dualPlanCar.pricing.basePricePerDay = 1_200_000;
dualPlanCar.mileagePolicy.includedKmPerDay = 300;
assert.equal(
  dualPlanSnapshot.daily?.basePricePerDay,
  900_000,
  "Case 5: thay đổi Car không được làm đổi pricing snapshot",
);
assert.equal(
  dualPlanSnapshot.daily?.includedKmPerDay,
  250,
  "Case 5: thay đổi Car không được làm đổi mileage snapshot",
);

const legacyBooking = BookingModel.hydrate({
  _id: new mongoose.Types.ObjectId(),
  userId: new mongoose.Types.ObjectId(),
  ownerId: new mongoose.Types.ObjectId(),
  carId: new mongoose.Types.ObjectId(),
  startDate: new Date("2026-01-01T08:00:00.000Z"),
  endDate: new Date("2026-01-01T12:00:00.000Z"),
  rentalMode: RentalModeEnum.HOURLY,
  totalPrice: 400_000,
});
assert.equal(legacyBooking.ratePlanSnapshot, undefined);
assert.equal(
  legacyBooking.toObject().ratePlanSnapshot,
  undefined,
  "Case 6: phải đọc được booking cũ không có ratePlanSnapshot",
);

console.log("PASS: 6 booking rate-plan snapshot scenarios");
