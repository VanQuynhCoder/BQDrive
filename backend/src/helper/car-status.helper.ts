import { BookingStatusEnum, CarStatusEnum } from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { CarModel } from "../models/car/car.model";

export async function syncRentedCarStatuses() {
  const activeRentedCarIds = await BookingModel.distinct("carId", {
    status: {
      $in: [
        BookingStatusEnum.PAID, // Đã thanh toán nên xe có lịch thuê chính thức
        BookingStatusEnum.IN_PROGRESS, // Xe đang được bàn giao/đang thuê
        BookingStatusEnum.RETURN_INSPECTION,
        BookingStatusEnum.AWAITING_EXTRA_CHARGE,
        BookingStatusEnum.CONFIRMED, // Trạng thái cũ: giữ tương thích dữ liệu cũ
      ],
    },
    isDeleted: false,
  } as any);

  await CarModel.updateMany(
    {
      status: CarStatusEnum.RENTED,
      isDeleted: false,
      _id: { $nin: activeRentedCarIds },
    } as any,
    { status: CarStatusEnum.APPROVED },
  );

  return [];
}

export async function releaseCarIfNoConfirmedBooking(carId: unknown) {
  const remainingActiveBooking = await BookingModel.exists({
    carId,
    status: {
      $in: [
        BookingStatusEnum.PAID, // Còn booking đã thanh toán thì chưa trả xe về APPROVED
        BookingStatusEnum.IN_PROGRESS, // Còn booking đang thuê thì chưa trả xe về APPROVED
        BookingStatusEnum.RETURN_INSPECTION,
        BookingStatusEnum.AWAITING_EXTRA_CHARGE,
        BookingStatusEnum.CONFIRMED, // Trạng thái cũ
      ],
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
