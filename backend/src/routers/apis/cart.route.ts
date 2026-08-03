import mongoose, { ClientSession } from "mongoose";
import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { CartModel } from "../../models/cart/cart.model";
import { CarModel } from "../../models/car/car.model";
import { BookingModel } from "../../models/booking/booking.model";
import { UserModel } from "../../models/user/user.model";
import { calculateRentalPrice } from "../../helper/rental.helper";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import { expireOldCarts } from "../../helper/cart.helper";
import { assertCarAvailability } from "../../helper/car-availability.helper";
import {
  BookingStatusEnum,
  CarStatusEnum,
  CartStatusEnum,
  OwnerTypeEnum,
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
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];
const BOOKABLE_CAR_STATUSES = [CarStatusEnum.APPROVED, CarStatusEnum.RENTED];

function assertUserIsNotCarOwner(car: any, userId: string) {
  if (
    car?.ownerType === OwnerTypeEnum.USER &&
    String(car.ownerId || "") === String(userId)
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Không thể thuê xe do chính bạn sở hữu",
    );
  }
}

async function assertActiveRenter(userId: string, session?: ClientSession) {
  const query = UserModel.findOne({
    _id: userId,
    isDeleted: false,
    isBlocked: { $ne: true },
    isVerified: true,
  } as any).select("_id");
  if (session) query.session(session);

  if (!(await query)) {
    throw ErrorHelper.forbidden(
      "Tài khoản người thuê không còn hoạt động hoặc chưa được xác thực",
    );
  }
}

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
    session?: ClientSession,
  ) {
    const now = new Date();

    if (!session) {
      await expireAbandonedPendingBookings(now);
      await expireOldCarts(now);
    }

    await assertCarAvailability({
      carId,
      start,
      end,
      now,
      ...(session ? { session } : {}),
    });
  }

  private async lockBookableCar(carId: string, session: ClientSession) {
    const car = await CarModel.findOneAndUpdate(
      {
        _id: carId,
        status: { $in: BOOKABLE_CAR_STATUSES },
        isHidden: { $ne: true },
        isDeleted: false,
      } as any,
      { $inc: { bookingRevision: 1 } },
      { new: true, session },
    );

    if (!car) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    return car;
  }

  async addToCart(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { carId, startDate, endDate, rentalMode } = req.body;
    await Promise.all([
      expireOldCarts(),
      expireAbandonedPendingBookings(),
    ]);

    if (!carId || !startDate || !endDate || !rentalMode) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu carId, startDate hoặc endDate",
      );
    }

    if (!Object.values(RentalModeEnum).includes(rentalMode)) {
      throw ErrorHelper.requestDataInvalid("Hình thức thuê không hợp lệ");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    this.validateRentalDateRange(start, end);
    const session = await mongoose.startSession();
    let cart: any;

    try {
      await session.withTransaction(async () => {
        await assertActiveRenter(authUser.userId, session);
        const car = await this.lockBookableCar(carId, session);

        assertUserIsNotCarOwner(car, authUser.userId);
        await this.validateCarAvailability(carId, start, end, session);

        const rentalResult = await calculateRentalPrice(
          car,
          start,
          end,
          rentalMode,
        );
        const expiredAt = new Date(Date.now() + 10 * 60 * 1000);

        [cart] = await CartModel.create(
          [{
            userId: authUser.userId,
            carId,
            startDate: start,
            endDate: end,
            rentalMode: rentalResult.rentalMode,
            totalPrice: rentalResult.totalPrice,
            pricingSnapshot: rentalResult.pricingSnapshot,
            expiredAt,
            status: CartStatusEnum.ACTIVE,
          }],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    if (!cart) {
      throw ErrorHelper.somethingWentWrong("Không thể thêm xe vào giỏ hàng");
    }

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
      .populate({
        path: "carId",
        select: {
          _id: 1,
          name: 1,
          licensePlate: 1,
          pricing: 1,
          rentalUnit: 1,
          seats: 1,
          fuelType: 1,
          transmission: 1,
          images: { $slice: 1 },
        },
      })
      .sort({ createdAt: -1 })
      .lean();

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

