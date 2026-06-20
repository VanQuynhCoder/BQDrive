import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { PaymentModel } from "../../models/payment/payment.model";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { CarModel } from "../../models/car/car.model";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import {
  createMomoPayment,
  verifyMomoSignature,
} from "../../helper/momo.helper";
import {
  createVnpayPaymentUrl,
  verifyVnpayReturn,
} from "../../helper/vnpay.helper";
import {
  BookingStatusEnum,
  CarStatusEnum,
  OwnerTypeEnum,
  PaymentMethodEnum,
  PaymentOptionEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.USER];
const PAYMENT_ALLOWED_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED, // Chá»§ xe Ä‘Ã£ duyá»‡t nÃªn khÃ¡ch Ä‘Æ°á»£c phÃ©p báº¯t Ä‘áº§u thanh toÃ¡n
  BookingStatusEnum.PAYMENT_PENDING, // ÄÃ£ cÃ³ giao dá»‹ch Ä‘ang chá», cho phÃ©p táº¡o láº¡i link thanh toÃ¡n
  BookingStatusEnum.PAID, // ÄÃ£ thanh toÃ¡n trÆ°á»›c Ä‘Ã³, dÃ¹ng Ä‘á»ƒ xá»­ lÃ½ pháº§n cÃ²n láº¡i náº¿u cÃ³
  BookingStatusEnum.IN_PROGRESS, // Äang thuÃª, cÃ³ thá»ƒ thanh toÃ¡n pháº§n cÃ²n láº¡i/phá»¥ phÃ­
  BookingStatusEnum.CONFIRMED, // Tráº¡ng thÃ¡i cÅ©: tÆ°Æ¡ng Ä‘Æ°Æ¡ng Ä‘Ã£ Ä‘Æ°á»£c chá»§ xe xÃ¡c nháº­n
  BookingStatusEnum.WAITING_PAYMENT, // Tráº¡ng thÃ¡i cÅ©: tÆ°Æ¡ng Ä‘Æ°Æ¡ng PAYMENT_PENDING
];

function hydrateLegacyBookingOwner(booking: any) {
  if (!booking.ownerId && booking.businessId) {
    booking.ownerId = booking.businessId;
    booking.ownerType = OwnerTypeEnum.BUSINESS;
    booking.ownerModel = "Business";
  }
}

class PaymentRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post(
      "/createPayment",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.createPayment),
    );

    this.router.get(
      "/getMyPayments",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getMyPayments),
    );

    this.router.get(
      "/getBusinessPayments",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.getBusinessPayments),
    );

    this.router.post(
      "/updatePaymentStatus/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.updatePaymentStatus),
    );
    this.router.post(
      "/momo/create",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.createMomoPayment),
    );

    this.router.post("/momo/ipn", this.route(this.momoIpn));

    this.router.post(
      "/vnpay/create",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.createVnpayPayment),
    );

    this.router.get("/vnpay/return", this.route(this.vnpayReturn));
  }

  private getPaymentAmount(booking: any, paymentType: string) {
    const totalPrice = Number(booking.totalPrice || 0);
    const paidAmount = Number(booking.paidAmount || 0);
    const fallbackDepositAmount = Math.round(totalPrice * 0.3);
    const depositAmount = Number(booking.depositAmount || fallbackDepositAmount);
    const remainingAmount = Number(
      booking.remainingAmount || Math.max(totalPrice - paidAmount, 0),
    );

    if (paymentType === PaymentTypeEnum.FULL) {
      return totalPrice;
    }

    if (paymentType === PaymentTypeEnum.REMAINING) {
      return remainingAmount;
    }

    return depositAmount;
  }

  private assertBookingCanCreatePayment(booking: any) {
    if (
      !PAYMENT_ALLOWED_BOOKING_STATUSES.includes(
        booking.status as BookingStatusEnum,
      )
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking cáº§n Ä‘Æ°á»£c chá»§ xe xÃ¡c nháº­n trÆ°á»›c khi thanh toÃ¡n",
      );
    }
  }

  private async markCarRented(booking: any) {
    await CarModel.findOneAndUpdate(
      {
        _id: booking.carId,
        ownerId: (booking as any).ownerId || booking.businessId,
        ownerType: (booking as any).ownerType || OwnerTypeEnum.BUSINESS,
        status: { $in: [CarStatusEnum.APPROVED, CarStatusEnum.RENTED] },
        isDeleted: false,
      } as any,
      { status: CarStatusEnum.RENTED },
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
  async createMomoPayment(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { bookingId, paymentType } = req.body;

    if (!bookingId) {
      throw ErrorHelper.requestDataInvalid("Thiáº¿u bookingId");
    }

    const booking = await BookingModel.findOne({
      _id: bookingId,
      userId: authUser.userId,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    hydrateLegacyBookingOwner(booking);
    this.assertBookingCanCreatePayment(booking);

    const selectedPaymentType =
      paymentType ||
      (booking.paymentOption === PaymentOptionEnum.FULL
        ? PaymentTypeEnum.FULL
        : PaymentTypeEnum.DEPOSIT);

    if (!Object.values(PaymentTypeEnum).includes(selectedPaymentType)) {
      throw ErrorHelper.requestDataInvalid("Loáº¡i thanh toÃ¡n khÃ´ng há»£p lá»‡");
    }

    const existedPaidPayment = await PaymentModel.findOne({
      bookingId: booking._id,
      paymentType: selectedPaymentType,
      status: PaymentStatusEnum.PAID,
    });

    if (existedPaidPayment) {
      throw ErrorHelper.requestDataInvalid(
        "Khoáº£n thanh toÃ¡n nÃ y Ä‘Ã£ Ä‘Æ°á»£c thanh toÃ¡n",
      );
    }

    let payment = await PaymentModel.findOne({
      bookingId: booking._id,
      paymentType: selectedPaymentType,
      method: PaymentMethodEnum.MOMO,
      status: PaymentStatusEnum.PENDING,
    });

    const amount = this.getPaymentAmount(booking, selectedPaymentType);

    if (amount <= 0) {
      throw ErrorHelper.requestDataInvalid(
        "Sá»‘ tiá»n cáº§n thanh toÃ¡n khÃ´ng há»£p lá»‡",
      );
    }

    if (!payment) {
      payment = await PaymentModel.create({
        bookingId: booking._id,
        userId: authUser.userId,
        amount,
        method: PaymentMethodEnum.MOMO,
        paymentType: selectedPaymentType,
        status: PaymentStatusEnum.PENDING,
      });
    }

    if (
      [BookingStatusEnum.OWNER_APPROVED, BookingStatusEnum.CONFIRMED].includes(
        booking.status as BookingStatusEnum,
      )
    ) {
      booking.status = BookingStatusEnum.PAYMENT_PENDING; // KhÃ¡ch Ä‘Ã£ má»Ÿ cá»•ng thanh toÃ¡n, chá» káº¿t quáº£ tráº£ vá»
      await booking.save();
    }

    const orderId = `MOMO-${String(payment._id)}-${Date.now()}`;
    const requestId = orderId;
    const orderInfo = `Thanh toÃ¡n BQDrive ${String(booking._id)}`;
    const extraData = String(payment._id);

    const momoResponse = await createMomoPayment({
      amount,
      orderId,
      requestId,
      orderInfo,
      extraData,
    });

    payment.transactionCode = orderId;
    await payment.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Táº¡o thanh toÃ¡n MoMo thÃ nh cÃ´ng",
      data: {
        payment,
        momo: momoResponse,
        payUrl: momoResponse.payUrl,
      },
    });
  }

  async momoIpn(req: Request, res: Response) {
    const data = req.body;

    const isValidSignature = verifyMomoSignature(data);

    if (!isValidSignature) {
      return res.status(400).json({
        status: 400,
        message: "Invalid signature",
      });
    }

    const paymentId = data.extraData;

    const payment = await PaymentModel.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        status: 404,
        message: "Payment not found",
      });
    }

    const booking = await BookingModel.findOne({
      _id: payment.bookingId,
      isDeleted: false,
    } as any);

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found",
      });
    }

    hydrateLegacyBookingOwner(booking);
    if (payment.status === PaymentStatusEnum.PAID) {
      return res.status(200).json({
        status: 200,
        message: "Payment already paid",
      });
    }

    if (Number(data.resultCode) === 0) {
      if (Number(data.amount) !== Number(payment.amount)) {
        return res.status(400).json({
          status: 400,
          message: "Payment amount mismatch",
        });
      }

      payment.status = PaymentStatusEnum.PAID;
      payment.paidAt = new Date();
      payment.transactionCode = String(data.transId || payment.transactionCode);

      booking.paidAmount = booking.paidAmount + payment.amount;

      if (payment.paymentType === PaymentTypeEnum.FULL) {
        booking.remainingAmount = 0;
      }

      if (payment.paymentType === PaymentTypeEnum.DEPOSIT) {
        booking.remainingAmount = booking.totalPrice - booking.paidAmount;
      }

      if (payment.paymentType === PaymentTypeEnum.REMAINING) {
        booking.remainingAmount = 0;
      }

      if (booking.remainingAmount < 0) {
        booking.remainingAmount = 0;
      }

      booking.status = BookingStatusEnum.PAID; // Thanh toÃ¡n online thÃ nh cÃ´ng, lá»‹ch thuÃª Ä‘Æ°á»£c giá»¯ chÃ­nh thá»©c

      await booking.save();
      await this.markCarRented(booking);
      await payment.save();

      return res.status(200).json({
        resultCode: 0,
        message: "Confirm Success",
      });
    }

    payment.status = PaymentStatusEnum.FAILED;
    payment.transactionCode = String(data.transId || payment.transactionCode);
    await payment.save();

    return res.status(200).json({
      resultCode: data.resultCode,
      message: "Payment failed",
    });
  }

  async createVnpayPayment(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { bookingId, paymentType } = req.body;

    if (!bookingId) {
      throw ErrorHelper.requestDataInvalid("Thiáº¿u bookingId");
    }

    const booking = await BookingModel.findOne({
      _id: bookingId,
      userId: authUser.userId,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    hydrateLegacyBookingOwner(booking);
    this.assertBookingCanCreatePayment(booking);

    const selectedPaymentType =
      paymentType ||
      (booking.paymentOption === PaymentOptionEnum.FULL
        ? PaymentTypeEnum.FULL
        : PaymentTypeEnum.DEPOSIT);

    if (!Object.values(PaymentTypeEnum).includes(selectedPaymentType)) {
      throw ErrorHelper.requestDataInvalid("Loáº¡i thanh toÃ¡n khÃ´ng há»£p lá»‡");
    }

    const existedPaidPayment = await PaymentModel.findOne({
      bookingId: booking._id,
      paymentType: selectedPaymentType,
      status: PaymentStatusEnum.PAID,
    });

    if (existedPaidPayment) {
      throw ErrorHelper.requestDataInvalid(
        "Khoáº£n thanh toÃ¡n nÃ y Ä‘Ã£ Ä‘Æ°á»£c thanh toÃ¡n",
      );
    }

    let payment = await PaymentModel.findOne({
      bookingId: booking._id,
      paymentType: selectedPaymentType,
      method: PaymentMethodEnum.VNPAY,
      status: PaymentStatusEnum.PENDING,
    });

    const amount = this.getPaymentAmount(booking, selectedPaymentType);

    if (amount <= 0) {
      throw ErrorHelper.requestDataInvalid(
        "Sá»‘ tiá»n cáº§n thanh toÃ¡n khÃ´ng há»£p lá»‡",
      );
    }

    if (!payment) {
      payment = await PaymentModel.create({
        bookingId: booking._id,
        userId: authUser.userId,
        amount,
        method: PaymentMethodEnum.VNPAY,
        paymentType: selectedPaymentType,
        status: PaymentStatusEnum.PENDING,
      });
    }

    if (
      [BookingStatusEnum.OWNER_APPROVED, BookingStatusEnum.CONFIRMED].includes(
        booking.status as BookingStatusEnum,
      )
    ) {
      booking.status = BookingStatusEnum.PAYMENT_PENDING; // KhÃ¡ch Ä‘Ã£ má»Ÿ cá»•ng thanh toÃ¡n VNPay
      await booking.save();
    }

    const orderId = `VNPAY-${String(payment._id)}-${Date.now()}`;
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(",")[0]?.trim();
    const ipAddr = forwardedIp || req.socket.remoteAddress || "127.0.0.1";

    payment.transactionCode = orderId;
    await payment.save();

    const payUrl = createVnpayPaymentUrl({
      amount,
      orderId,
      orderInfo: `Thanh toÃ¡n BQDrive ${String(booking._id)}`,
      ipAddr,
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Táº¡o thanh toÃ¡n VNPay thÃ nh cÃ´ng",
      data: {
        payment,
        payUrl,
      },
    });
  }

  async vnpayReturn(req: Request, res: Response) {
    const query = req.query as Record<string, any>;
    const isValidSignature = verifyVnpayReturn(query);

    if (!isValidSignature) {
      return res.status(400).json({
        status: 400,
        code: "-3",
        message: "Invalid VNPay signature",
        data: null,
      });
    }

    const txnRef = String(query.vnp_TxnRef || "");
    const paymentId = txnRef.startsWith("VNPAY-")
      ? txnRef.replace("VNPAY-", "").split("-")[0]
      : "";

    if (!paymentId) {
      return res.status(400).json({
        status: 400,
        code: "-3",
        message: "Invalid VNPay order id",
        data: null,
      });
    }

    const payment = await PaymentModel.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        status: 404,
        code: "-4",
        message: "Payment not found",
        data: null,
      });
    }

    const booking = await BookingModel.findOne({
      _id: payment.bookingId,
      isDeleted: false,
    } as any);

    if (!booking) {
      return res.status(404).json({
        status: 404,
        code: "-4",
        message: "Booking not found",
        data: null,
      });
    }

    hydrateLegacyBookingOwner(booking);
    const isSuccess =
      String(query.vnp_ResponseCode) === "00" &&
      String(query.vnp_TransactionStatus) === "00";

    if (payment.status === PaymentStatusEnum.PAID) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Payment already paid",
        data: { payment, booking, success: true },
      });
    }

    if (isSuccess) {
      if (Number(query.vnp_Amount) / 100 !== Number(payment.amount)) {
        return res.status(400).json({
          status: 400,
          code: "-3",
          message: "Payment amount mismatch",
          data: { payment, booking, success: false },
        });
      }

      payment.status = PaymentStatusEnum.PAID;
      payment.paidAt = new Date();
      payment.transactionCode = String(query.vnp_TransactionNo || txnRef);

      booking.paidAmount = booking.paidAmount + payment.amount;

      if (payment.paymentType === PaymentTypeEnum.FULL) {
        booking.remainingAmount = 0;
      }

      if (payment.paymentType === PaymentTypeEnum.DEPOSIT) {
        booking.remainingAmount = booking.totalPrice - booking.paidAmount;
      }

      if (payment.paymentType === PaymentTypeEnum.REMAINING) {
        booking.remainingAmount = 0;
      }

      if (booking.remainingAmount < 0) {
        booking.remainingAmount = 0;
      }

      booking.status = BookingStatusEnum.PAID; // VNPay tráº£ thÃ nh cÃ´ng, booking chuyá»ƒn sang Ä‘Ã£ thanh toÃ¡n

      await booking.save();
      await this.markCarRented(booking);
      await payment.save();

      return res.status(200).json({
        status: 200,
        code: "200",
        message: "VNPay payment success",
        data: { payment, booking, success: true },
      });
    }

    payment.status = PaymentStatusEnum.FAILED;
    payment.transactionCode = String(query.vnp_TransactionNo || txnRef);
    await payment.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "VNPay payment failed",
      data: { payment, booking, success: false },
    });
  }

  async createPayment(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { bookingId, method, paymentType } = req.body;

    if (!bookingId || !method) {
      throw ErrorHelper.requestDataInvalid("Thiáº¿u bookingId hoáº·c method");
    }

    if (!Object.values(PaymentMethodEnum).includes(method)) {
      throw ErrorHelper.requestDataInvalid(
        "PhÆ°Æ¡ng thá»©c thanh toÃ¡n khÃ´ng há»£p lá»‡",
      );
    }

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: bookingId,
      userId: authUser.userId,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    hydrateLegacyBookingOwner(booking);
    this.assertBookingCanCreatePayment(booking);

    if (
      [
        BookingStatusEnum.CANCELLED,
        BookingStatusEnum.COMPLETED,
        BookingStatusEnum.NO_SHOW,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking khÃ´ng cÃ²n kháº£ dá»¥ng Ä‘á»ƒ thanh toÃ¡n",
      );
    }

    const selectedPaymentType =
      paymentType ||
      (booking.paymentOption === PaymentOptionEnum.FULL
        ? PaymentTypeEnum.FULL
        : PaymentTypeEnum.DEPOSIT);

    if (!Object.values(PaymentTypeEnum).includes(selectedPaymentType)) {
      throw ErrorHelper.requestDataInvalid("Loáº¡i thanh toÃ¡n khÃ´ng há»£p lá»‡");
    }

    if (
      booking.paymentOption === PaymentOptionEnum.FULL &&
      selectedPaymentType !== PaymentTypeEnum.FULL
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chá»n thanh toÃ¡n toÃ n bá»™, chá»‰ Ä‘Æ°á»£c táº¡o payment FULL",
      );
    }

    if (
      booking.paymentOption === PaymentOptionEnum.DEPOSIT &&
      selectedPaymentType === PaymentTypeEnum.FULL
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chá»n thanh toÃ¡n cá»c, khÃ´ng Ä‘Æ°á»£c táº¡o payment FULL",
      );
    }

    const existedPendingPayment = await PaymentModel.findOne({
      bookingId: booking._id,
      method,
      paymentType: selectedPaymentType,
      status: PaymentStatusEnum.PENDING,
    });

    if (existedPendingPayment) {
      if (
        method === PaymentMethodEnum.CASH &&
        [
          BookingStatusEnum.PAYMENT_PENDING,
          BookingStatusEnum.WAITING_PAYMENT,
        ].includes(booking.status as BookingStatusEnum)
      ) {
        booking.status = BookingStatusEnum.OWNER_APPROVED; // Tiá»n máº·t chÆ°a thu thÃ¬ quay vá» tráº¡ng thÃ¡i chá»§ xe Ä‘Ã£ duyá»‡t
        await booking.save();
      }

      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Payment chá» thanh toÃ¡n Ä‘Ã£ tá»“n táº¡i",
        data: { payment: existedPendingPayment },
      });
    }

    const existedPaidPayment = await PaymentModel.findOne({
      bookingId: booking._id,
      paymentType: selectedPaymentType,
      status: PaymentStatusEnum.PAID,
    });

    if (existedPaidPayment) {
      throw ErrorHelper.requestDataInvalid(
        "Khoáº£n thanh toÃ¡n nÃ y Ä‘Ã£ Ä‘Æ°á»£c thanh toÃ¡n",
      );
    }

    const amount = this.getPaymentAmount(booking, selectedPaymentType);

    if (amount <= 0) {
      throw ErrorHelper.requestDataInvalid(
        "Sá»‘ tiá»n cáº§n thanh toÃ¡n khÃ´ng há»£p lá»‡",
      );
    }

    const payment = await PaymentModel.create({
      bookingId: booking._id,
      userId: authUser.userId,
      amount,
      method,
      paymentType: selectedPaymentType,
      status: PaymentStatusEnum.PENDING,
    });

    if (
      method === PaymentMethodEnum.CASH &&
      [
        BookingStatusEnum.PAYMENT_PENDING,
        BookingStatusEnum.WAITING_PAYMENT,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      booking.status = BookingStatusEnum.OWNER_APPROVED; // Chá»n tiá»n máº·t: chá» chá»§ xe thu khi bÃ n giao
      await booking.save();
    }

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Táº¡o thanh toÃ¡n thÃ nh cÃ´ng",
      data: { payment },
    });
  }

  async getMyPayments(req: Request, res: Response) {
    const authUser = (req as any).user;

    const payments = await PaymentModel.find({
      userId: authUser.userId,
    })
      .populate("bookingId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { payments },
    });
  }

  async getBusinessPayments(req: Request, res: Response) {
    const authUser = (req as any).user;

    const owner = await this.getOwnerContext(authUser);

    const bookings = await BookingModel.find({
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    }).select("_id");

    const bookingIds = bookings.map((item) => item._id);

    const payments = await PaymentModel.find({
      bookingId: { $in: bookingIds },
    })
      .populate("bookingId")
      .populate("userId", "-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { payments },
    });
  }

  async updatePaymentStatus(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { status, transactionCode } = req.body;

    if (!status) {
      throw ErrorHelper.requestDataInvalid("Thiáº¿u status");
    }

    if (!Object.values(PaymentStatusEnum).includes(status)) {
      throw ErrorHelper.requestDataInvalid(
        "Tráº¡ng thÃ¡i thanh toÃ¡n khÃ´ng há»£p lá»‡",
      );
    }

    await expireAbandonedPendingBookings();

    const payment = await PaymentModel.findById(id);

    if (!payment) {
      throw ErrorHelper.recordNotFound("Payment");
    }

    const booking = await BookingModel.findOne({
      _id: payment.bookingId,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    hydrateLegacyBookingOwner(booking);
    if (
      status === PaymentStatusEnum.PAID &&
      [
        BookingStatusEnum.CANCELLED,
        BookingStatusEnum.COMPLETED,
        BookingStatusEnum.NO_SHOW,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking khÃ´ng cÃ²n kháº£ dá»¥ng Ä‘á»ƒ ghi nháº­n thanh toÃ¡n",
      );
    }

    const owner = await this.getOwnerContext(authUser);
    const ownerMatches =
      String((booking as any).ownerId || booking.businessId) ===
        String(owner.ownerId) &&
      String((booking as any).ownerType || OwnerTypeEnum.BUSINESS) ===
        String(owner.ownerType);

    if (!ownerMatches) {
      throw ErrorHelper.permissionDeny();
    }

    if (payment.status === PaymentStatusEnum.PAID) {
      throw ErrorHelper.requestDataInvalid("Payment nÃ y Ä‘Ã£ Ä‘Æ°á»£c thanh toÃ¡n");
    }

    payment.status = status;
    payment.transactionCode = transactionCode || payment.transactionCode;

    if (status === PaymentStatusEnum.PAID) {
      payment.paidAt = new Date();
      booking.paidAmount = booking.paidAmount + payment.amount;

      if (payment.paymentType === PaymentTypeEnum.FULL) {
        booking.remainingAmount = 0;
      }

      if (payment.paymentType === PaymentTypeEnum.DEPOSIT) {
        booking.remainingAmount = booking.totalPrice - booking.paidAmount;
      }

      if (payment.paymentType === PaymentTypeEnum.REMAINING) {
        booking.remainingAmount = 0;
      }

      if (booking.remainingAmount < 0) {
        booking.remainingAmount = 0;
      }

      if (payment.method === PaymentMethodEnum.CASH) {
        if (
          ![
            BookingStatusEnum.OWNER_APPROVED,
            BookingStatusEnum.PAID,
            BookingStatusEnum.CONFIRMED,
          ].includes(booking.status as BookingStatusEnum)
        ) {
          throw ErrorHelper.requestDataInvalid(
            "Booking can duoc xac nhan truoc khi ghi nhan thanh toan tien mat",
          );
        }

        const car = await CarModel.findOneAndUpdate(
          {
            _id: booking.carId,
            ownerId: (booking as any).ownerId || booking.businessId,
            ownerType: (booking as any).ownerType || OwnerTypeEnum.BUSINESS,
            status: { $in: [CarStatusEnum.APPROVED, CarStatusEnum.RENTED] },
            isDeleted: false,
          } as any,
          { status: CarStatusEnum.RENTED },
          { new: true },
        );

        if (!car) {
          throw ErrorHelper.requestDataInvalid(
            "Xe hien khong kha dung de ban giao",
          );
        }

        booking.status = BookingStatusEnum.IN_PROGRESS; // Thu tiá»n máº·t vÃ  bÃ n giao xe xong, chuyáº¿n thuÃª báº¯t Ä‘áº§u
      } else {
        booking.status = BookingStatusEnum.PAID; // Chá»§ xe ghi nháº­n thanh toÃ¡n khÃ´ng tiá»n máº·t thÃ nh cÃ´ng
        await this.markCarRented(booking);
      }

      await booking.save();
    }

    await payment.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Cáº­p nháº­t tráº¡ng thÃ¡i thanh toÃ¡n thÃ nh cÃ´ng",
      data: { payment, booking },
    });
  }
}

export default new PaymentRoute().router;
