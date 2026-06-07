import { BookingStatusEnum, CarStatusEnum } from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { CarModel } from "../models/car/car.model";

export async function syncRentedCarStatuses() {
  await CarModel.updateMany(
    {
      status: CarStatusEnum.RENTED,
      isDeleted: false,
    } as any,
    { status: CarStatusEnum.APPROVED },
  );

  return [];
}

export async function releaseCarIfNoConfirmedBooking(carId: unknown) {
  const remainingConfirmedBooking = await BookingModel.exists({
    carId,
    status: BookingStatusEnum.CONFIRMED,
    isDeleted: false,
  } as any);

  if (!remainingConfirmedBooking) {
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
