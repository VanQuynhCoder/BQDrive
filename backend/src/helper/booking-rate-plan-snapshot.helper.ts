import { RentalModeEnum } from "../constants/model.const";
import type {
  IBookingMileagePolicySnapshot,
  IBookingRatePlanSnapshot,
} from "../models/booking/booking.model";
import { getCarRentalSupport, normalizeRentalMode } from "./rental.helper";

function toNonNegativeNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0
    ? normalized
    : undefined;
}

function toPositiveNumber(value: unknown) {
  const normalized = toNonNegativeNumber(value);
  return normalized !== undefined && normalized > 0 ? normalized : undefined;
}

export function buildBookingRatePlanSnapshot(
  car: any,
): IBookingRatePlanSnapshot {
  const pricing = car?.pricing || {};
  const mileagePolicy = car?.mileagePolicy || {};
  const { allowDailyRental, allowHourlyRental } = getCarRentalSupport(car);
  const basePricePerHour = toPositiveNumber(pricing.basePricePerHour);
  const basePricePerDay = toPositiveNumber(pricing.basePricePerDay);
  const includedKmPerHour = toPositiveNumber(
    mileagePolicy.includedKmPerHour,
  );
  const includedKmPerDay = toPositiveNumber(mileagePolicy.includedKmPerDay);
  const overageFeePerKm = toNonNegativeNumber(mileagePolicy.overageFeePerKm);
  const graceKm = toNonNegativeNumber(mileagePolicy.graceKm);

  return {
    ...(allowHourlyRental && basePricePerHour !== undefined
      ? {
          hourly: {
            basePricePerHour,
            weekendSurchargePerHour:
              toNonNegativeNumber(pricing.weekendSurchargePerHour) ?? 0,
            holidaySurchargePerHour:
              toNonNegativeNumber(pricing.holidaySurchargePerHour) ?? 0,
            ...(includedKmPerHour !== undefined
              ? { includedKmPerHour }
              : {}),
          },
        }
      : {}),
    ...(allowDailyRental && basePricePerDay !== undefined
      ? {
          daily: {
            basePricePerDay,
            weekendSurchargePerDay:
              toNonNegativeNumber(pricing.weekendSurchargePerDay) ?? 0,
            holidaySurchargePerDay:
              toNonNegativeNumber(pricing.holidaySurchargePerDay) ?? 0,
            ...(includedKmPerDay !== undefined ? { includedKmPerDay } : {}),
          },
        }
      : {}),
    ...(overageFeePerKm !== undefined ? { overageFeePerKm } : {}),
    ...(graceKm !== undefined ? { graceKm } : {}),
  };
}

export function getRentalBillableUnits(rentalResult: any) {
  const directUnits = Number(rentalResult?.totalTime);
  if (Number.isFinite(directUnits) && directUnits > 0) {
    return directUnits;
  }

  const breakdown = rentalResult?.pricingSnapshot?.breakdown;
  if (!Array.isArray(breakdown)) return undefined;

  const breakdownUnits = breakdown.reduce(
    (total: number, item: any) => total + Number(item?.unitCount || 0),
    0,
  );

  return Number.isFinite(breakdownUnits) && breakdownUnits > 0
    ? breakdownUnits
    : undefined;
}

export function buildBookingMileagePolicySnapshot(
  ratePlanSnapshot: IBookingRatePlanSnapshot,
  rentalMode: string,
  billableUnits?: number,
): IBookingMileagePolicySnapshot | undefined {
  const normalizedMode = normalizeRentalMode(rentalMode);
  const units = Number(billableUnits);

  if (!Number.isFinite(units) || units <= 0) return undefined;

  if (normalizedMode === RentalModeEnum.HOURLY) {
    const includedKmPerHour = ratePlanSnapshot.hourly?.includedKmPerHour;
    if (includedKmPerHour === undefined) return undefined;

    return {
      rentalMode: RentalModeEnum.HOURLY,
      includedKmPerHour,
      overageFeePerKm: ratePlanSnapshot.overageFeePerKm ?? 0,
      graceKm: ratePlanSnapshot.graceKm ?? 0,
      billableUnits: units,
      totalIncludedKm: includedKmPerHour * units,
    };
  }

  if (normalizedMode === RentalModeEnum.DAILY) {
    const includedKmPerDay = ratePlanSnapshot.daily?.includedKmPerDay;
    if (includedKmPerDay === undefined) return undefined;

    return {
      rentalMode: RentalModeEnum.DAILY,
      includedKmPerDay,
      overageFeePerKm: ratePlanSnapshot.overageFeePerKm ?? 0,
      graceKm: ratePlanSnapshot.graceKm ?? 0,
      billableUnits: units,
      totalIncludedKm: includedKmPerDay * units,
    };
  }

  return undefined;
}
