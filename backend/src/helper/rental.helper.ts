import { ErrorHelper } from "../base/error";
import { RentalUnitEnum } from "../constants/model.const";

const HOUR_MS = 1000 * 60 * 60;

export function calculateRentalPrice(car: any, start: Date, end: Date) {
  const diffMs = end.getTime() - start.getTime();

  if (diffMs <= 0) {
    throw ErrorHelper.requestDataInvalid("Thời gian thuê không hợp lệ");
  }

  const diffHours = diffMs / HOUR_MS;

  if (car.rentalUnit === RentalUnitEnum.HOUR) {
    if (!car.pricePerHour || car.pricePerHour <= 0) {
      throw ErrorHelper.requestDataInvalid(
        "Xe cần có giá thuê theo giờ",
      );
    }

    const totalHours = Math.max(1, Math.ceil(diffHours));

    return {
      totalTime: totalHours,
      rentalUnit: RentalUnitEnum.HOUR,
      totalPrice: totalHours * car.pricePerHour,
    };
  }

  if (!car.pricePerDay || car.pricePerDay <= 0) {
    throw ErrorHelper.requestDataInvalid("Xe cần có giá thuê theo ngày");
  }

  const rentalDays = Math.max(1, Math.ceil(diffHours / 24));

  return {
    totalTime: rentalDays,
    rentalUnit: RentalUnitEnum.DAY,
    totalPrice: rentalDays * car.pricePerDay,
  };
}
