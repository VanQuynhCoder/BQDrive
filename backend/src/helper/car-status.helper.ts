import { BookingStatusEnum, CarStatusEnum } from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { CarModel } from "../models/car/car.model";

export async function syncRentedCarStatuses() {
  const inProgressCarIds = await BookingModel.distinct("carId", {
    status: BookingStatusEnum.IN_PROGRESS,
    isDeleted: false,
  } as any);

  await CarModel.updateMany(
    {
      status: CarStatusEnum.RENTED,
      isDeleted: false,
      _id: { $nin: inProgressCarIds },
    } as any,
    { status: CarStatusEnum.APPROVED },
  );

  return [];
}

export async function releaseCarIfNoConfirmedBooking(carId: unknown) {
  const remainingActiveBooking = await BookingModel.exists({
    carId,
    status: {
      $in: [BookingStatusEnum.CONFIRMED, BookingStatusEnum.IN_PROGRESS],
    },
    isDeleted: false,
  } as any);

  if (!remainingActiveBooking) {
    await CarModel.findOneAndUpdate(
      {
        _id: carId,
        status: CarStatusEnum.RENTED,
        isDeleted: false,
      } as any,
      { status: CarStatusEnum.APPROVED },
    );
  }
}
