import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { PaymentModel } from "../../models/payment/payment.model";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { UserModel } from "../../models/user/user.model";
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
  BusinessTypeEnum,
  CarStatusEnum,
  PaymentMethodEnum,
  PaymentOptionEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.CUSTOMER, UserRoleEnum.PRIVATE_OWNER];

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
        this.roleGuard([UserRoleEnum.CUSTOMER, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.getMyPayments),
    );

    this.router.get(
      "/getBusinessPayments",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.getBusinessPayments),
    );

    this.router.post(
      "/updatePaymentStatus/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
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
    if (paymentType === PaymentTypeEnum.FULL) {
      return booking.totalPrice;
    }

    if (paymentType === PaymentTypeEnum.REMAINING) {
      return booking.remainingAmount;
    }

    return booking.depositAmount;
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
  async createMomoPayment(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { bookingId, paymentType } = req.body;

    if (!bookingId) {
      throw ErrorHelper.requestDataInvalid("Thiếu bookingId");
    }

    const booking = await BookingModel.findOne({
      _id: bookingId,
      userId: authUser.userId,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    const selectedPaymentType =
      paymentType ||
      (booking.paymentOption === PaymentOptionEnum.FULL
        ? PaymentTypeEnum.FULL
        : PaymentTypeEnum.DEPOSIT);

    if (!Object.values(PaymentTypeEnum).includes(selectedPaymentType)) {
      throw ErrorHelper.requestDataInvalid("Loại thanh toán không hợp lệ");
    }

    const existedPaidPayment = await PaymentModel.findOne({
      bookingId: booking._id,
      paymentType: selectedPaymentType,
      status: PaymentStatusEnum.PAID,
    });

    if (existedPaidPayment) {
      throw ErrorHelper.requestDataInvalid(
        "Khoản thanh toán này đã được thanh toán",
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
        "Số tiền cần thanh toán không hợp lệ",
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

    if (booking.status === BookingStatusEnum.PENDING) {
      booking.status = BookingStatusEnum.WAITING_PAYMENT;
      await booking.save();
    }

    const orderId = `MOMO-${String(payment._id)}-${Date.now()}`;
    const requestId = orderId;
    const orderInfo = `Thanh toán BQDrive ${String(booking._id)}`;
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
      message: "Tạo thanh toán MoMo thành công",
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

      booking.status = BookingStatusEnum.CONFIRMED;

      await booking.save();
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
      throw ErrorHelper.requestDataInvalid("Thiếu bookingId");
    }

    const booking = await BookingModel.findOne({
      _id: bookingId,
      userId: authUser.userId,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    const selectedPaymentType =
      paymentType ||
      (booking.paymentOption === PaymentOptionEnum.FULL
        ? PaymentTypeEnum.FULL
        : PaymentTypeEnum.DEPOSIT);

    if (!Object.values(PaymentTypeEnum).includes(selectedPaymentType)) {
      throw ErrorHelper.requestDataInvalid("Loại thanh toán không hợp lệ");
    }

    const existedPaidPayment = await PaymentModel.findOne({
      bookingId: booking._id,
      paymentType: selectedPaymentType,
      status: PaymentStatusEnum.PAID,
    });

    if (existedPaidPayment) {
      throw ErrorHelper.requestDataInvalid(
        "Khoản thanh toán này đã được thanh toán",
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
        "Số tiền cần thanh toán không hợp lệ",
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

    if (booking.status === BookingStatusEnum.PENDING) {
      booking.status = BookingStatusEnum.WAITING_PAYMENT;
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
      orderInfo: `Thanh toán BQDrive ${String(booking._id)}`,
      ipAddr,
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Tạo thanh toán VNPay thành công",
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

      booking.status = BookingStatusEnum.CONFIRMED;

      await booking.save();
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
      throw ErrorHelper.requestDataInvalid("Thiếu bookingId hoặc method");
    }

    if (!Object.values(PaymentMethodEnum).includes(method)) {
      throw ErrorHelper.requestDataInvalid(
        "Phương thức thanh toán không hợp lệ",
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

    if (
      [
        BookingStatusEnum.CANCELLED,
        BookingStatusEnum.COMPLETED,
        BookingStatusEnum.NO_SHOW,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking không còn khả dụng để thanh toán",
      );
    }

    const selectedPaymentType =
      paymentType ||
      (booking.paymentOption === PaymentOptionEnum.FULL
        ? PaymentTypeEnum.FULL
        : PaymentTypeEnum.DEPOSIT);

    if (!Object.values(PaymentTypeEnum).includes(selectedPaymentType)) {
      throw ErrorHelper.requestDataInvalid("Loại thanh toán không hợp lệ");
    }

    if (
      booking.paymentOption === PaymentOptionEnum.FULL &&
      selectedPaymentType !== PaymentTypeEnum.FULL
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chọn thanh toán toàn bộ, chỉ được tạo payment FULL",
      );
    }

    if (
      booking.paymentOption === PaymentOptionEnum.DEPOSIT &&
      selectedPaymentType === PaymentTypeEnum.FULL
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chọn thanh toán cọc, không được tạo payment FULL",
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
        booking.status === BookingStatusEnum.WAITING_PAYMENT
      ) {
        booking.status = BookingStatusEnum.PENDING;
        await booking.save();
      }

      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Payment chờ thanh toán đã tồn tại",
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
        "Khoản thanh toán này đã được thanh toán",
      );
    }

    const amount = this.getPaymentAmount(booking, selectedPaymentType);

    if (amount <= 0) {
      throw ErrorHelper.requestDataInvalid(
        "Số tiền cần thanh toán không hợp lệ",
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
      booking.status === BookingStatusEnum.WAITING_PAYMENT
    ) {
      booking.status = BookingStatusEnum.PENDING;
      await booking.save();
    }

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Tạo thanh toán thành công",
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

    const business = await this.getOwnerBusiness(authUser);

    const bookings = await BookingModel.find({
      businessId: business._id,
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
      throw ErrorHelper.requestDataInvalid("Thiếu status");
    }

    if (!Object.values(PaymentStatusEnum).includes(status)) {
      throw ErrorHelper.requestDataInvalid(
        "Trạng thái thanh toán không hợp lệ",
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

    if (
      status === PaymentStatusEnum.PAID &&
      [
        BookingStatusEnum.CANCELLED,
        BookingStatusEnum.COMPLETED,
        BookingStatusEnum.NO_SHOW,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking không còn khả dụng để ghi nhận thanh toán",
      );
    }

    const business = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (!business) {
      throw ErrorHelper.permissionDeny();
    }

    if (String(booking.businessId) !== String(business._id)) {
      throw ErrorHelper.permissionDeny();
    }

    if (payment.status === PaymentStatusEnum.PAID) {
      throw ErrorHelper.requestDataInvalid("Payment này đã được thanh toán");
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
        if (booking.status !== BookingStatusEnum.CONFIRMED) {
          throw ErrorHelper.requestDataInvalid(
            "Booking can duoc xac nhan truoc khi ghi nhan thanh toan tien mat",
          );
        }

        const car = await CarModel.findOneAndUpdate(
          {
            _id: booking.carId,
            businessId: booking.businessId,
            status: CarStatusEnum.APPROVED,
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

        booking.status = BookingStatusEnum.IN_PROGRESS;
      } else {
        booking.status = BookingStatusEnum.CONFIRMED;
      }

      await booking.save();
    }

    await payment.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Cập nhật trạng thái thanh toán thành công",
      data: { payment, booking },
    });
  }
}

export default new PaymentRoute().router;
