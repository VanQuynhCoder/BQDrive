import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { CarModel } from "../../models/car/car.model";
import { CartModel } from "../../models/cart/cart.model";
import { BusinessModel } from "../../models/business/business.model";
import { UserModel } from "../../models/user/user.model";
import { calculateRentalPrice } from "../../helper/rental.helper";
import { releaseCarIfNoConfirmedBooking } from "../../helper/car-status.helper";
import { expireOldCarts } from "../../helper/cart.helper";
import {
  expireAbandonedPendingBookings,
  getCheckoutStartedBookingIdSet,
} from "../../helper/booking-hold.helper";
import {
  BookingStatusEnum,
  BusinessTypeEnum,
  CarStatusEnum,
  CartStatusEnum,
  PaymentOptionEnum,
  RentalModeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.CUSTOMER, UserRoleEnum.PRIVATE_OWNER];
const BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.PENDING,
  BookingStatusEnum.WAITING_PAYMENT,
  BookingStatusEnum.CONFIRMED,
  BookingStatusEnum.IN_PROGRESS,
];

function calculatePaymentAmounts(totalPrice: number, paymentOption: string) {
  if (paymentOption === PaymentOptionEnum.FULL) {
    return {
      depositAmount: 0,
      remainingAmount: 0,
      paidAmount: 0,
    };
  }

  const depositAmount = Math.round(totalPrice * 0.3);
  const remainingAmount = totalPrice - depositAmount;

  return {
    depositAmount,
    remainingAmount,
    paidAmount: 0,
  };
}

class BookingRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post(
      "/createBooking",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.createBooking),
    );

    this.router.post(
      "/bookingFromCart/:cartId",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.bookingFromCart),
    );

    this.router.get(
      "/getMyBookings",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyBookings),
    );

    this.router.get(
      "/getBusinessBookings",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.getBusinessBookings),
    );

    this.router.post(
      "/cancelBooking/:id",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.cancelBooking),
    );

    this.router.post(
      "/confirmBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.confirmBooking),
    );

    this.router.post(
      "/completeBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.completeBooking),
    );

    this.router.post(
      "/noShowBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.noShowBooking),
    );
  }

  private async getOwnerBusiness(authUser: any) {
    let business = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (!business && authUser.role === UserRoleEnum.PRIVATE_OWNER) {
      const user = await UserModel.findOne({
        _id: authUser.userId,
        isDeleted: false,
      });

      if (!user) {
        throw ErrorHelper.userNotExist();
      }

      business = await BusinessModel.create({
        userId: authUser.userId,
        businessName: user.name || "Chủ xe tư nhân",
        businessType: BusinessTypeEnum.INDIVIDUAL,
        isApproved: true,
        ...(user.phone ? { phone: user.phone } : {}),
      });
    }

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
    }

    if (authUser.role === UserRoleEnum.PRIVATE_OWNER) {
      let shouldSave = false;

      if (!business.isApproved) {
        business.isApproved = true;
        shouldSave = true;
      }

      if (business.businessType !== BusinessTypeEnum.INDIVIDUAL) {
        business.businessType = BusinessTypeEnum.INDIVIDUAL;
        shouldSave = true;
      }

      if (shouldSave) {
        await business.save();
      }
    }

    return business;
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
    ignoredCartId?: string,
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

    const cartFilter: any = {
      carId,
      userId: { $ne: userId },
      status: CartStatusEnum.ACTIVE,
      expiredAt: { $gt: now },
      startDate: { $lt: end },
      endDate: { $gt: start },
    };

    if (ignoredCartId) {
      cartFilter._id = { $ne: ignoredCartId };
    }

    const existedHold = await CartModel.findOne(cartFilter);

    if (existedHold) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đang được người khác giữ trong khoảng thời gian này",
      );
    }
  }

  async createBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { carId, startDate, endDate, rentalMode, note, paymentOption } =
      req.body;
    await expireOldCarts();

    if (!carId || !startDate || !endDate || !rentalMode) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu carId, startDate hoặc endDate",
      );
    }

    const car = await CarModel.findOne({
      _id: carId,
      status: CarStatusEnum.APPROVED,
      isDeleted: false,
    } as any);

    if (!car || (car as any).isHidden || car.status === CarStatusEnum.HIDDEN) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    if (!Object.values(RentalModeEnum).includes(rentalMode)) {
      throw ErrorHelper.requestDataInvalid("Hinh thuc thue khong hop le");
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

    const selectedPaymentOption = paymentOption || PaymentOptionEnum.DEPOSIT;

    if (!Object.values(PaymentOptionEnum).includes(selectedPaymentOption)) {
      throw ErrorHelper.requestDataInvalid("Phương án thanh toán không hợp lệ");
    }

    const paymentAmounts = calculatePaymentAmounts(
      totalPrice,
      selectedPaymentOption,
    );

    const booking = await BookingModel.create({
      userId: authUser.userId,
      businessId: car.businessId,
      carId: car._id,
      startDate: start,
      endDate: end,
      rentalMode: rentalResult.rentalMode,
      totalPrice,
      paymentOption: selectedPaymentOption,
      depositAmount: paymentAmounts.depositAmount,
      remainingAmount: paymentAmounts.remainingAmount,
      paidAmount: paymentAmounts.paidAmount,
      isDepositRefundable: true,
      note,
      status: BookingStatusEnum.WAITING_PAYMENT,
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đặt xe thành công, vui lòng thanh toán để tiếp tục",
      data: { booking },
    });
  }

  async bookingFromCart(req: Request, res: Response) {
    const authUser = (req as any).user;
    const cartId = String(req.params.cartId);
    const { paymentOption } = req.body;
    const now = new Date();

    await expireOldCarts(now);

    const cart = await CartModel.findOne({
      _id: cartId,
      userId: authUser.userId,
      status: CartStatusEnum.ACTIVE,
      expiredAt: { $gt: now },
    } as any);

    if (!cart) {
      throw ErrorHelper.recordNotFound("Giỏ hàng");
    }

    if (cart.expiredAt <= new Date()) {
      cart.status = CartStatusEnum.EXPIRED;
      await cart.save();

      throw ErrorHelper.requestDataInvalid("Giỏ hàng đã hết hạn");
    }

    const car = await CarModel.findOne({
      _id: cart.carId,
      status: CarStatusEnum.APPROVED,
      isDeleted: false,
    } as any);
    const start = new Date(cart.startDate);
    const end = new Date(cart.endDate);

    if (!car || (car as any).isHidden || car.status === CarStatusEnum.HIDDEN) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    this.validateRentalDateRange(start, end);
    await this.validateCarAvailability(
      String(car._id),
      start,
      end,
      authUser.userId,
      String(cart._id),
    );

    const selectedPaymentOption = paymentOption || PaymentOptionEnum.DEPOSIT;

    if (!Object.values(PaymentOptionEnum).includes(selectedPaymentOption)) {
      throw ErrorHelper.requestDataInvalid("Phương án thanh toán không hợp lệ");
    }

    const paymentAmounts = calculatePaymentAmounts(
      cart.totalPrice,
      selectedPaymentOption,
    );

    const booking = await BookingModel.create({
      userId: authUser.userId,
      businessId: car.businessId,
      carId: car._id,
      cartId: cart._id,
      startDate: cart.startDate,
      endDate: cart.endDate,
      rentalMode: cart.rentalMode,
      totalPrice: cart.totalPrice,
      paymentOption: selectedPaymentOption,
      depositAmount: paymentAmounts.depositAmount,
      remainingAmount: paymentAmounts.remainingAmount,
      paidAmount: paymentAmounts.paidAmount,
      isDepositRefundable: true,
      status: BookingStatusEnum.WAITING_PAYMENT,
    });

    cart.status = CartStatusEnum.BOOKED;
    await cart.save();

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đặt xe từ giỏ hàng thành công, vui lòng thanh toán để tiếp tục",
      data: { booking },
    });
  }

  async getMyBookings(req: Request, res: Response) {
    const authUser = (req as any).user;

    await expireAbandonedPendingBookings();

    const bookings = await BookingModel.find({
      userId: authUser.userId,
      isDeleted: false,
    })
      .populate("carId")
      .populate("businessId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { bookings },
    });
  }

  async getBusinessBookings(req: Request, res: Response) {
    const authUser = (req as any).user;

    const business = await this.getOwnerBusiness(authUser);
    await expireAbandonedPendingBookings();

    const bookings = await BookingModel.find({
      businessId: business._id,
      isDeleted: false,
    })
      .populate("userId", "-password")
      .populate("carId")
      .sort({ createdAt: -1 });
    const pendingBookingIds = bookings
      .filter((booking) => booking.status === BookingStatusEnum.PENDING)
      .map((booking) => booking._id);
    const checkoutStartedBookingIds = await getCheckoutStartedBookingIdSet(
      pendingBookingIds,
    );
    const visibleBookings = bookings.filter((booking) => {
      if (booking.status !== BookingStatusEnum.PENDING) {
        return true;
      }

      if ((booking.paidAmount || 0) > 0) {
        return true;
      }

      return checkoutStartedBookingIds.has(String(booking._id));
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { bookings: visibleBookings },
    });
  }

  async cancelBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { cancelReason } = req.body;

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      userId: authUser.userId,
      status: { $in: [BookingStatusEnum.PENDING, BookingStatusEnum.WAITING_PAYMENT] },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    booking.status = BookingStatusEnum.CANCELLED;
    booking.cancelReason = cancelReason || "Customer hủy booking";
    await booking.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Hủy booking thành công",
      data: { booking },
    });
  }

  async confirmBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    const business = await this.getOwnerBusiness(authUser);
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      businessId: business._id,
      status: { $in: [BookingStatusEnum.PENDING, BookingStatusEnum.WAITING_PAYMENT] },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    const checkoutStartedBookingIds = await getCheckoutStartedBookingIdSet([
      booking._id,
    ]);

    if (
      (booking.paidAmount || 0) <= 0 &&
      !checkoutStartedBookingIds.has(String(booking._id))
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chưa hoàn tất hợp đồng/thanh toán",
      );
    }
    const start = new Date(booking.startDate);
    const end = new Date(booking.endDate);
    const overlappedConfirmedBooking = await BookingModel.findOne({
      _id: { $ne: booking._id },
      carId: booking.carId,
      status: { $in: BLOCKING_BOOKING_STATUSES },
      isDeleted: false,
      startDate: { $lt: end },
      endDate: { $gt: start },
    } as any);

    if (overlappedConfirmedBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đã có booking xác nhận trong khoảng thời gian này",
      );
    }

    const car = await CarModel.findOne({
      _id: booking.carId,
      businessId: business._id,
      status: CarStatusEnum.APPROVED,
      isDeleted: false,
    } as any);

    if (!car) {
      throw ErrorHelper.requestDataInvalid("Xe hiện không khả dụng để xác nhận");
    }
    booking.status = BookingStatusEnum.CONFIRMED;
    await booking.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xác nhận booking thành công",
      data: { booking },
    });
  }

  async completeBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    const business = await this.getOwnerBusiness(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      businessId: business._id,
      status: BookingStatusEnum.CONFIRMED,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking CONFIRMED");
    }

    booking.status = BookingStatusEnum.COMPLETED;
    await booking.save();
    await releaseCarIfNoConfirmedBooking(booking.carId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Hoàn tất booking thành công",
      data: { booking },
    });
  }

  async noShowBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { noShowReason } = req.body;

    const business = await this.getOwnerBusiness(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      businessId: business._id,
      status: BookingStatusEnum.CONFIRMED,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking CONFIRMED");
    }

    booking.status = BookingStatusEnum.NO_SHOW;
    booking.isDepositRefundable = false;
    booking.noShowReason =
      noShowReason || "Khách hàng không có mặt để nhận xe đúng thời gian";

    await booking.save();
    await releaseCarIfNoConfirmedBooking(booking.carId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã đánh dấu khách không nhận xe, tiền cọc không hoàn lại",
      data: { booking },
    });
  }
}

export default new BookingRoute().router;
