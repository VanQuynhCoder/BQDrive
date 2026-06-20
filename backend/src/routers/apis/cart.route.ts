import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { CartModel } from "../../models/cart/cart.model";
import { CarModel } from "../../models/car/car.model";
import { BookingModel } from "../../models/booking/booking.model";
import { calculateRentalPrice } from "../../helper/rental.helper";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import { expireOldCarts } from "../../helper/cart.helper";
import {
  BookingStatusEnum,
  CarStatusEnum,
  CartStatusEnum,
  RentalModeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.USER];
const BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // Khách đã gửi yêu cầu, giữ slot chờ chủ xe duyệt
  BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã duyệt, giữ slot chờ khách thanh toán
  BookingStatusEnum.PAYMENT_PENDING, // Khách đang thanh toán
  BookingStatusEnum.PAID, // Đã thanh toán, lịch thuê chính thức
  BookingStatusEnum.IN_PROGRESS, // Xe đang được thuê
  BookingStatusEnum.PENDING, // Trạng thái cũ: REQUESTED
  BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ: PAYMENT_PENDING
  BookingStatusEnum.CONFIRMED, // Trạng thái cũ
];
const BOOKABLE_CAR_STATUSES = [CarStatusEnum.APPROVED, CarStatusEnum.RENTED];

class CartRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post(
      "/addToCart",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.addToCart),
    );

    this.router.get(
      "/getMyCart",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyCart),
    );

    this.router.delete(
      "/removeFromCart/:id",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.removeFromCart),
    );
  }

  private validateRentalDateRange(start: Date, end: Date) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw ErrorHelper.requestDataInvalid("Thời gian thuê xe không hợp lệ");
    }

    if (start <= new Date()) {
      throw ErrorHelper.requestDataInvalid(
        "Thời gian nhận xe phải lớn hơn thời gian hiện tại",
      );
    }

    if (end <= start) {
      throw ErrorHelper.requestDataInvalid("Ngày thuê không hợp lệ");
    }

  }

  private async validateCarAvailability(
    carId: string,
    start: Date,
    end: Date,
    userId: string,
  ) {
    const now = new Date();

    await expireAbandonedPendingBookings(now);
    await expireOldCarts(now);
    const existedBooking = await BookingModel.findOne({
      carId,
      status: {
        $in: BLOCKING_BOOKING_STATUSES,
      },
      isDeleted: false,
      startDate: { $lt: end },
      endDate: { $gt: start },
    } as any);

    if (existedBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đã có booking trong khoảng thời gian này",
      );
    }

    const existedHold = await CartModel.findOne({
      carId,
      userId: { $ne: userId },
      status: CartStatusEnum.ACTIVE,
      expiredAt: { $gt: now },
      startDate: { $lt: end },
      endDate: { $gt: start },
    } as any);

    if (existedHold) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đang được người khác giữ trong khoảng thời gian này",
      );
    }
  }

  async addToCart(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { carId, startDate, endDate, rentalMode } = req.body;
    await expireOldCarts();

    if (!carId || !startDate || !endDate || !rentalMode) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu carId, startDate hoặc endDate",
      );
    }

    if (!Object.values(RentalModeEnum).includes(rentalMode)) {
      throw ErrorHelper.requestDataInvalid("Hinh thuc thue khong hop le");
    }

    const car = await CarModel.findOne({
      _id: carId,
      status: { $in: BOOKABLE_CAR_STATUSES },
      isDeleted: false,
    } as any);

    if (!car || (car as any).isHidden || car.status === CarStatusEnum.HIDDEN) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    this.validateRentalDateRange(start, end);
    await this.validateCarAvailability(carId, start, end, authUser.userId);

    if (start >= end) {
      throw ErrorHelper.requestDataInvalid("Ngày thuê không hợp lệ");
    }

    const rentalResult = calculateRentalPrice(car, start, end, rentalMode);
    const totalPrice = rentalResult.totalPrice;

    const expiredAt = new Date(Date.now() + 10 * 60 * 1000);

    const cart = await CartModel.create({
      userId: authUser.userId,
      carId,
      startDate: start,
      endDate: end,
      rentalMode: rentalResult.rentalMode,
      totalPrice,
      expiredAt,
      status: CartStatusEnum.ACTIVE,
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Thêm xe vào giỏ thành công, giữ xe trong 10 phút",
      data: { cart },
    });
  }

  async getMyCart(req: Request, res: Response) {
    const authUser = (req as any).user;
    const now = new Date();

    await expireOldCarts(now);

    const carts = await CartModel.find({
      userId: authUser.userId,
      status: CartStatusEnum.ACTIVE,
      expiredAt: { $gt: now },
    })
      .populate("carId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { carts },
    });
  }

  async removeFromCart(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    const cart = await CartModel.findOneAndUpdate(
      {
        _id: id,
        userId: authUser.userId,
        status: CartStatusEnum.ACTIVE,
      } as any,
      {
        status: CartStatusEnum.CANCELLED,
      },
      { new: true },
    );

    if (!cart) {
      throw ErrorHelper.recordNotFound("Giỏ hàng");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xóa xe khỏi giỏ hàng thành công",
      data: { cart },
    });
  }
}

export default new CartRoute().router;
