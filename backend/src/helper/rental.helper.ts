import { ErrorHelper } from "../base/error";
import { RentalModeEnum, RentalUnitEnum } from "../constants/model.const";

const HOUR_MS = 1000 * 60 * 60;

export function normalizeRentalMode(mode?: string) {
  if (mode === RentalModeEnum.HOURLY || mode === RentalUnitEnum.HOUR) {
    return RentalModeEnum.HOURLY;
  }

  if (mode === RentalModeEnum.DAILY || mode === RentalUnitEnum.DAY) {
    return RentalModeEnum.DAILY;
  }

  return undefined;
}

export function getCarRentalSupport(car: any) {
  const allowDailyRental =
    typeof car.allowDailyRental === "boolean"
      ? car.allowDailyRental
      : car.rentalUnit !== RentalUnitEnum.HOUR;
  const allowHourlyRental =
    typeof car.allowHourlyRental === "boolean"
      ? car.allowHourlyRental
      : car.rentalUnit === RentalUnitEnum.HOUR;

  return { allowDailyRental, allowHourlyRental };
}

export function calculateRentalPrice(
  car: any,
  start: Date,
  end: Date,
  rentalMode?: string,
) {
  const diffMs = end.getTime() - start.getTime();

  if (diffMs <= 0) {
    throw ErrorHelper.requestDataInvalid("Thoi gian thue khong hop le");
  }

  const diffHours = diffMs / HOUR_MS;
  const selectedRentalMode =
    normalizeRentalMode(rentalMode) ||
    normalizeRentalMode(car.rentalMode) ||
    normalizeRentalMode(car.rentalUnit) ||
    RentalModeEnum.DAILY;
  const { allowDailyRental, allowHourlyRental } = getCarRentalSupport(car);

  if (selectedRentalMode === RentalModeEnum.HOURLY) {
    if (!allowHourlyRental) {
      throw ErrorHelper.requestDataInvalid("Xe khong ho tro thue theo gio");
    }

    if (!car.pricePerHour || car.pricePerHour <= 0) {
      throw ErrorHelper.requestDataInvalid("Xe can co gia thue theo gio");
    }

    const totalHours = Math.max(1, Math.ceil(diffHours));

    if (totalHours < 2 || totalHours > 24) {
      throw ErrorHelper.requestDataInvalid(
        "Thue theo gio chi ho tro tu 2 den 24 gio",
      );
    }

    return {
      totalTime: totalHours,
      rentalMode: RentalModeEnum.HOURLY,
      rentalUnit: RentalUnitEnum.HOUR,
      totalPrice: totalHours * car.pricePerHour,
    };
  }

  if (!allowDailyRental) {
    throw ErrorHelper.requestDataInvalid("Xe khong ho tro thue theo ngay");
  }

  if (!car.pricePerDay || car.pricePerDay <= 0) {
    throw ErrorHelper.requestDataInvalid("Xe can co gia thue theo ngay");
  }

  const rentalDays = Math.max(1, Math.ceil(diffHours / 24));

  return {
    totalTime: rentalDays,
    rentalMode: RentalModeEnum.DAILY,
    rentalUnit: RentalUnitEnum.DAY,
    totalPrice: rentalDays * car.pricePerDay,
  };
}
