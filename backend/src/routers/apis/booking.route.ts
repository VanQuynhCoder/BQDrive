import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { CarModel } from "../../models/car/car.model";
import { CartModel } from "../../models/cart/cart.model";
import { BusinessModel } from "../../models/business/business.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { calculateRentalPrice } from "../../helper/rental.helper";
import { releaseCarIfNoConfirmedBooking } from "../../helper/car-status.helper";
import { expireOldCarts } from "../../helper/cart.helper";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import {
  BookingStatusEnum,
  CarStatusEnum,
  CartStatusEnum,
  OwnerTypeEnum,
  PaymentOptionEnum,
  RentalModeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.USER];
const OWNER_REVIEW_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // Trạng thái mới: khách vừa gửi yêu cầu, chủ xe cần duyệt
  BookingStatusEnum.PENDING, // Trạng thái cũ: giữ tương thích booking đã tạo trước khi đổi flow
];
const BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // Chặn lịch ngay khi khách gửi yêu cầu để tránh hai người đặt cùng slot
  BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã đồng ý, khách đang chuẩn bị thanh toán
  BookingStatusEnum.PAYMENT_PENDING, // Khách đã bắt đầu thanh toán, chưa có kết quả cuối
  BookingStatusEnum.PAID, // Đã thanh toán, lịch thuê được giữ chính thức
  BookingStatusEnum.IN_PROGRESS, // Xe đang được bàn giao/đang thuê thực tế
  BookingStatusEnum.PENDING, // Trạng thái cũ: tương đương REQUESTED
  BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ: tương đương PAYMENT_PENDING
  BookingStatusEnum.CONFIRMED, // Trạng thái cũ: tương đương đã được xác nhận
];
const BOOKABLE_CAR_STATUSES = [CarStatusEnum.APPROVED, CarStatusEnum.RENTED];

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

function hydrateLegacyBookingOwner(booking: any) {
  if (!booking.ownerId && booking.businessId) {
    booking.ownerId = booking.businessId;
    booking.ownerType = OwnerTypeEnum.BUSINESS;
    booking.ownerModel = "Business";
  }
}

async function ensureNoOverlappedActiveBooking(booking: any) {
  const start = new Date(booking.startDate);
  const end = new Date(booking.endDate);

  const overlappedBooking = await BookingModel.findOne({
    _id: { $ne: booking._id },
    carId: booking.carId,
    status: { $in: BLOCKING_BOOKING_STATUSES },
    isDeleted: false,
    startDate: { $lt: end },
    endDate: { $gt: start },
  } as any);

  if (overlappedBooking) {
    throw ErrorHelper.requestDataInvalid(
      "Xe đã có booking trong khoảng thời gian này",
    );
  }
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
      "/getMyBooking/:id",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyBooking),
    );

    this.router.get(
      "/getBusinessBookings",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
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
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.confirmBooking),
    );

    this.router.post(
      "/rejectBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.rejectBooking),
    );

    this.router.post(
      "/completeBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.completeBooking),
    );

    this.router.post(
      "/noShowBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.noShowBooking),
    );
  }

  private async getOwnerContext(authUser: any) {
    if (authUser.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: authUser.userId,
        isDeleted: false,
      });

      if (!business) {
        throw ErrorHelper.recordNotFound("Business");
      }

      return {
        ownerId: business._id,
        ownerType: OwnerTypeEnum.BUSINESS,
        ownerModel: "Business",
        business,
      };
    }

    return {
      ownerId: authUser.userId,
      ownerType: OwnerTypeEnum.USER,
      ownerModel: "User",
      business: null,
    };
  }

  private buildOwnerFilter(owner: any) {
    const ownerFilter = {
      ownerId: owner.ownerId,
      ownerType: owner.ownerType,
    };

    if (owner.ownerType === OwnerTypeEnum.BUSINESS && owner.business?._id) {
      return {
        $or: [
          ownerFilter,
          { businessId: owner.business._id, ownerId: { $exists: false } },
        ],
      };
    }

    return ownerFilter;
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
      status: { $in: BOOKABLE_CAR_STATUSES },
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
      ...(car.businessId ? { businessId: car.businessId } : {}),
      ownerId: (car as any).ownerId || car.businessId,
      ownerType: (car as any).ownerType || OwnerTypeEnum.BUSINESS,
      ownerModel:
        ((car as any).ownerType || OwnerTypeEnum.BUSINESS) ===
        OwnerTypeEnum.USER
          ? "User"
          : "Business",
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
      status: BookingStatusEnum.REQUESTED, // Booking mới: chờ chủ xe duyệt, chưa cho thanh toán
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đã gửi yêu cầu đặt xe, vui lòng chờ chủ xe xác nhận",
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
      status: { $in: BOOKABLE_CAR_STATUSES },
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
      ...(car.businessId ? { businessId: car.businessId } : {}),
      ownerId: (car as any).ownerId || car.businessId,
      ownerType: (car as any).ownerType || OwnerTypeEnum.BUSINESS,
      ownerModel:
        ((car as any).ownerType || OwnerTypeEnum.BUSINESS) ===
        OwnerTypeEnum.USER
          ? "User"
          : "Business",
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
      status: BookingStatusEnum.REQUESTED, // Booking từ giỏ hàng cũng phải chờ chủ xe duyệt trước
    });

    cart.status = CartStatusEnum.BOOKED;
    await cart.save();

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đã gửi yêu cầu đặt xe từ giỏ hàng, vui lòng chờ chủ xe xác nhận",
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

  async getMyBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      userId: authUser.userId,
      isDeleted: false,
    } as any)
      .populate("carId")
      .populate("businessId");

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { booking },
    });
  }

  async getBusinessBookings(req: Request, res: Response) {
    const authUser = (req as any).user;

    const owner = await this.getOwnerContext(authUser);
    await expireAbandonedPendingBookings();

    const bookings = await BookingModel.find({
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    })
      .populate("userId", "-password")
      .populate("carId")
      .sort({ createdAt: -1 });
    const visibleBookingIds = bookings.map((booking) => booking._id);
    const payments = await PaymentModel.find({
      bookingId: { $in: visibleBookingIds },
    })
      .sort({ createdAt: -1 })
      .lean();
    const paymentByBookingId = new Map<string, any>();

    for (const payment of payments) {
      const bookingId = String(payment.bookingId);
      const currentPayment = paymentByBookingId.get(bookingId);

      if (
        !currentPayment ||
        (payment.method === "CASH" && payment.status === "PENDING")
      ) {
        paymentByBookingId.set(bookingId, payment);
      }
    }

    const bookingsWithPayment = bookings.map((booking) => ({
      ...booking.toObject(),
      payment: paymentByBookingId.get(String(booking._id)) || null,
    }));

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { bookings: bookingsWithPayment },
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
      status: {
        $in: [
          BookingStatusEnum.REQUESTED, // Khách được hủy khi chủ xe chưa duyệt
          BookingStatusEnum.OWNER_APPROVED, // Khách được hủy khi đã duyệt nhưng chưa thanh toán
          BookingStatusEnum.PAYMENT_PENDING, // Khách được hủy nếu đang chờ thanh toán và chưa trả tiền
          BookingStatusEnum.PENDING, // Trạng thái cũ
          BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ
          BookingStatusEnum.CONFIRMED, // Trạng thái cũ trước khi tách OWNER_APPROVED/PAID
        ],
      },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    hydrateLegacyBookingOwner(booking);
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

    const owner = await this.getOwnerContext(authUser);
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: { $in: OWNER_REVIEW_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    hydrateLegacyBookingOwner(booking);
    await ensureNoOverlappedActiveBooking(booking);

    const car = await CarModel.findOne({
      _id: booking.carId,
      ...this.buildOwnerFilter(owner),
      status: { $in: BOOKABLE_CAR_STATUSES },
      isDeleted: false,
    } as any);

    if (!car) {
      throw ErrorHelper.requestDataInvalid("Xe hiện không khả dụng để xác nhận");
    }
    booking.status = BookingStatusEnum.OWNER_APPROVED; // Chủ xe đồng ý: khách bắt đầu được tạo hợp đồng/thanh toán
    await booking.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xác nhận booking thành công",
      data: { booking },
    });
  }

  async rejectBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { rejectReason } = req.body;

    const owner = await this.getOwnerContext(authUser);
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: { $in: OWNER_REVIEW_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    hydrateLegacyBookingOwner(booking);
    booking.status = BookingStatusEnum.REJECTED;
    booking.cancelReason = rejectReason || "Business rejected booking";
    await booking.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Reject booking success",
      data: { booking },
    });
  }

  async completeBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    const owner = await this.getOwnerContext(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: BookingStatusEnum.IN_PROGRESS,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking IN_PROGRESS");
    }

    hydrateLegacyBookingOwner(booking);
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

    const owner = await this.getOwnerContext(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: {
        $in: [
          BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã duyệt nhưng khách không đến
          BookingStatusEnum.PAID, // Khách đã thanh toán nhưng không đến nhận xe
          BookingStatusEnum.CONFIRMED, // Trạng thái cũ
        ],
      },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking CONFIRMED");
    }

    hydrateLegacyBookingOwner(booking);
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
