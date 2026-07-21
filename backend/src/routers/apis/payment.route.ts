import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { PaymentModel } from "../../models/payment/payment.model";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { CarModel } from "../../models/car/car.model";
import { ExtraChargeModel } from "../../models/extra-charge/extraCharge.model";
import { ReturnInspectionModel } from "../../models/return-inspection/returnInspection.model";
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
  sendCashPaymentSelectedMail,
  sendDepositRemainingPaymentMail,
  sendPaymentSuccessMail,
} from "../../helper/mail.helper";
import { syncBookingPaymentFromPaidPayments } from "../../helper/payment-sync.helper";
import { notificationCenterService } from "../../services/notification-center.service";
import {
  BookingStatusEnum,
  CarStatusEnum,
  ExtraChargeStatusEnum,
  OwnerTypeEnum,
  PaymentMethodEnum,
  PaymentOptionEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  ReturnInspectionStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const RENTER_ROLES = [UserRoleEnum.USER];
const PAYMENT_ALLOWED_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã duyệt nên khách được phép bắt đầu thanh toán
  BookingStatusEnum.PAYMENT_PENDING, // Đã có giao dịch đang chờ, cho phép tạo lại link thanh toán
  BookingStatusEnum.PAID, // Đã thanh toán trước đó, dùng để xử lý phần còn lại nếu có
  BookingStatusEnum.IN_PROGRESS, // Đang thuê, có thể thanh toán phần còn lại/phụ phí
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
  BookingStatusEnum.CONFIRMED, // Trạng thái cũ: tương đương đã được chủ xe xác nhận
  BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ: tương đương PAYMENT_PENDING
];
const RENTER_INFO_REQUIRED_FOR_PAYMENT_MESSAGE =
  "Booking thiếu thông tin người thuê, không thể thanh toán.";
const MANUAL_PAYMENT_METHODS = [
  PaymentMethodEnum.CASH,
];
const ACTIVE_PAYMENT_METHODS = [
  PaymentMethodEnum.CASH,
  PaymentMethodEnum.MOMO,
  PaymentMethodEnum.VNPAY,
];

function hydrateLegacyBookingOwner(booking: any) {
  if (!booking.ownerId && booking.businessId) {
    booking.ownerId = booking.businessId;
    booking.ownerType = OwnerTypeEnum.BUSINESS;
    booking.ownerModel = "Business";
  }
}

function hasCompleteRenterInfo(rawInfo: any) {
  const renterInfo = rawInfo || {};

  return Boolean(
    String(renterInfo.fullName || "").trim() &&
      String(renterInfo.phone || "").trim() &&
      String(renterInfo.email || "").trim() &&
      String(renterInfo.cccdNumber || "").trim() &&
      String(renterInfo.cccdFrontImage || "").trim() &&
      String(renterInfo.cccdBackImage || "").trim() &&
      String(renterInfo.driverLicenseNumber || "").trim() &&
      String(renterInfo.driverLicenseImage || "").trim(),
  );
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
      "/my-booking-history",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getMyBookingPaymentHistory),
    );

    this.router.get(
      "/my-extra-charges",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getMyExtraCharges),
    );

    this.router.get(
      "/bookings/:bookingId/extra-charges",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getMyBookingExtraCharges),
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

    this.router.get("/momo/return", this.route(this.momoReturn));

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
      return Math.max(totalPrice - paidAmount, 0) || totalPrice;
    }

    if (paymentType === PaymentTypeEnum.REMAINING) {
      return remainingAmount;
    }

    return depositAmount;
  }

  private async getPendingExtraChargeForRenter(extraChargeId: string, userId: string) {
    const extraCharge = await ExtraChargeModel.findOne({
      _id: extraChargeId,
      renterId: userId,
      status: ExtraChargeStatusEnum.PENDING,
      isDeleted: false,
    } as any);

    if (!extraCharge) {
      throw ErrorHelper.recordNotFound("Phí phát sinh");
    }

    const booking = await BookingModel.findOne({
      _id: extraCharge.bookingId,
      userId,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.permissionDeny();
    }

    hydrateLegacyBookingOwner(booking);

    return { extraCharge, booking };
  }

  private async getOrCreateExtraChargePayment(
    extraCharge: any,
    booking: any,
    method: PaymentMethodEnum,
    userId: string,
  ) {
    if (method === PaymentMethodEnum.CASH) {
      throw ErrorHelper.requestDataInvalid(
        "Phí phát sinh thanh toán tiền mặt cần được chủ xe xác nhận đã thu.",
      );
    }

    const existedPaidPayment = await PaymentModel.findOne({
      extraChargeId: extraCharge._id,
      paymentType: PaymentTypeEnum.EXTRA_CHARGE,
      status: PaymentStatusEnum.PAID,
    });

    if (existedPaidPayment) {
      throw ErrorHelper.requestDataInvalid("Phí phát sinh này đã được thanh toán");
    }

    let payment = await PaymentModel.findOne({
      extraChargeId: extraCharge._id,
      method,
      paymentType: PaymentTypeEnum.EXTRA_CHARGE,
      status: PaymentStatusEnum.PENDING,
    });

    if (!payment) {
      payment = await PaymentModel.create({
        bookingId: booking._id,
        extraChargeId: extraCharge._id,
        userId,
        amount: Math.round(Number(extraCharge.amount || 0)),
        method,
        paymentType: PaymentTypeEnum.EXTRA_CHARGE,
        status: PaymentStatusEnum.PENDING,
      });
    }

    extraCharge.paymentId = payment._id;
    await extraCharge.save();

    return payment;
  }

  private async markExtraChargePaidFromPayment(payment: any) {
    if (payment.paymentType !== PaymentTypeEnum.EXTRA_CHARGE) return;

    const extraCharge = await ExtraChargeModel.findOne({
      _id: payment.extraChargeId,
      isDeleted: false,
    } as any);

    if (!extraCharge) return;

    extraCharge.status = ExtraChargeStatusEnum.PAID;
    extraCharge.paymentId = payment._id;
    extraCharge.paymentMethod = payment.method;
    extraCharge.paidAt = payment.paidAt || new Date();
    await extraCharge.save();
    void notificationCenterService.notifyExtraChargePaid(
      extraCharge,
      payment,
      String(payment.userId || ""),
    );

    const remainingPendingCharge = await ExtraChargeModel.findOne({
      bookingId: extraCharge.bookingId,
      status: ExtraChargeStatusEnum.PENDING,
      isDeleted: false,
    } as any).select("_id");

    if (!remainingPendingCharge) {
      await ReturnInspectionModel.updateOne(
        {
          bookingId: extraCharge.bookingId,
          inspectionStatus: ReturnInspectionStatusEnum.CHARGES_PENDING,
          isDeleted: false,
        } as any,
        {
          $set: { inspectionStatus: ReturnInspectionStatusEnum.INSPECTING },
        },
      );
      await BookingModel.updateOne(
        {
          _id: extraCharge.bookingId,
          status: BookingStatusEnum.AWAITING_EXTRA_CHARGE,
          isDeleted: false,
        } as any,
        {
          $set: { status: BookingStatusEnum.RETURN_INSPECTION },
        },
      );
    }
  }

  private async applyPaidPaymentEffects(booking: any, payment: any) {
    if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
      await this.markExtraChargePaidFromPayment(payment);
      return;
    }

    await syncBookingPaymentFromPaidPayments(booking);
    await this.markCarRented(booking);
    void sendPaymentSuccessMail(booking, payment);
    void sendDepositRemainingPaymentMail(booking, payment);
    void notificationCenterService.notifyPaymentPaid(
      payment,
      booking,
      String(payment.userId || ""),
    );
  }

  private assertPaymentTypeIsValidForBooking(booking: any, paymentType: string) {
    const paidAmount = Number(booking.paidAmount || 0);
    const outstandingAmount = this.getOutstandingAmount(booking);

    if (paymentType === PaymentTypeEnum.FULL && paidAmount > 0) {
      throw ErrorHelper.requestDataInvalid(
        "Booking đã thanh toán một phần, vui lòng thanh toán phần còn lại",
      );
    }

    if (paymentType === PaymentTypeEnum.DEPOSIT && paidAmount > 0) {
      throw ErrorHelper.requestDataInvalid(
        "Booking đã thanh toán cọc, vui lòng thanh toán phần còn lại",
      );
    }

    if (paymentType === PaymentTypeEnum.REMAINING) {
      if (paidAmount <= 0) {
        throw ErrorHelper.requestDataInvalid(
          "Booking cần thanh toán cọc trước khi thanh toán phần còn lại",
        );
      }

      if (outstandingAmount <= 0) {
        throw ErrorHelper.requestDataInvalid(
          "Booking không còn số tiền cần thanh toán",
        );
      }
    }
  }

  private syncBookingPaymentPlan(booking: any, paymentType: string) {
    const paidAmount = Number(booking.paidAmount || 0);

    if (paidAmount > 0) return;

    const totalPrice = Number(booking.totalPrice || 0);

    if (paymentType === PaymentTypeEnum.FULL) {
      booking.paymentOption = PaymentOptionEnum.FULL;
      booking.depositAmount = 0;
      booking.remainingAmount = totalPrice;
      return;
    }

    if (paymentType === PaymentTypeEnum.DEPOSIT) {
      const depositAmount =
        Number(booking.depositAmount || 0) || Math.round(totalPrice * 0.3);

      booking.paymentOption = PaymentOptionEnum.DEPOSIT;
      booking.depositAmount = depositAmount;
      booking.remainingAmount = Math.max(totalPrice - depositAmount, 0);
    }
  }

  private assertBookingCanCreatePayment(booking: any) {
    if (
      !PAYMENT_ALLOWED_BOOKING_STATUSES.includes(
        booking.status as BookingStatusEnum,
      )
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking cần được chủ xe xác nhận trước khi thanh toán",
      );
    }
  }

  private async markCarRented(booking: any) {
    await CarModel.findOneAndUpdate(
      {
        _id: booking.carId,
        ...this.buildBookingCarOwnerFilter(booking),
        status: { $in: [CarStatusEnum.APPROVED, CarStatusEnum.RENTED] },
        isDeleted: false,
      } as any,
      { status: CarStatusEnum.RENTED },
    );
  }

  private buildBookingCarOwnerFilter(booking: any) {
    const ownerId = (booking as any).ownerId || booking.businessId;
    const ownerType = (booking as any).ownerType || OwnerTypeEnum.BUSINESS;
    const ownerFilters = [];

    if (ownerId && ownerType) {
      ownerFilters.push({
        ownerId,
        ownerType,
      });
    }

    if (booking.businessId) {
      ownerFilters.push({
        businessId: booking.businessId,
      });
    }

    return ownerFilters.length > 0 ? { $or: ownerFilters } : {};
  }

  private async assertNoOtherActiveBookingForHandover(booking: any) {
    const overlappedBooking = await BookingModel.findOne({
      _id: { $ne: booking._id },
      carId: booking.carId,
      status: {
        $in: [
          BookingStatusEnum.PAID,
          BookingStatusEnum.IN_PROGRESS,
          BookingStatusEnum.CONFIRMED,
        ],
      },
      isDeleted: false,
      startDate: { $lt: booking.endDate },
      endDate: { $gt: booking.startDate },
    } as any).select("_id");

    if (overlappedBooking) {
      throw ErrorHelper.requestDataInvalid("Xe đang thuộc booking khác");
    }

    if (!hasCompleteRenterInfo((booking as any).renterInfo)) {
      throw ErrorHelper.requestDataInvalid(RENTER_INFO_REQUIRED_FOR_PAYMENT_MESSAGE);
    }
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

  private getMomoPaymentId(data: Record<string, any>) {
    const extraData = String(data.extraData || "");

    if (extraData) {
      return extraData;
    }

    const orderId = String(data.orderId || "");
    const match = orderId.match(/^MOMO-([a-f\d]{24})-/i);

    return match?.[1] || "";
  }

  private getOutstandingAmount(booking: any) {
    const totalPrice = Number(booking.totalPrice || 0);
    const paidAmount = Number(booking.paidAmount || 0);
    const storedRemainingAmount = Number(booking.remainingAmount || 0);

    return Math.max(storedRemainingAmount || totalPrice - paidAmount, 0);
  }

  private async markMomoPaymentPaid(data: Record<string, any>, payment: any, booking: any) {
    if (Number(data.amount) !== Number(payment.amount)) {
      throw ErrorHelper.requestDataInvalid("Payment amount mismatch");
    }

    if (payment.status !== PaymentStatusEnum.PAID) {
      payment.status = PaymentStatusEnum.PAID;
      payment.paidAt = new Date();
      payment.transactionCode = String(data.transId || payment.transactionCode);

      await payment.save();
      await this.applyPaidPaymentEffects(booking, payment);
    } else {
      if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
        await this.markExtraChargePaidFromPayment(payment);
      } else {
        await syncBookingPaymentFromPaidPayments(booking);
      }
    }
  }

  async createMomoPayment(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { bookingId, paymentType, extraChargeId } = req.body;

    if (paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
      if (!extraChargeId) {
        throw ErrorHelper.requestDataInvalid("Thiếu extraChargeId");
      }

      const { extraCharge, booking } = await this.getPendingExtraChargeForRenter(
        String(extraChargeId),
        authUser.userId,
      );
      const payment = await this.getOrCreateExtraChargePayment(
        extraCharge,
        booking,
        PaymentMethodEnum.MOMO,
        authUser.userId,
      );

      const orderId = `MOMO-${String(payment._id)}-${Date.now()}`;
      const requestId = orderId;
      const orderInfo = `Thanh toán phí phát sinh BQDrive ${String(extraCharge._id)}`;
      const extraData = String(payment._id);

      const momoResponse = await createMomoPayment({
        amount: Number(payment.amount || 0),
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
        message: "Tạo thanh toán phí phát sinh MoMo thành công",
        data: {
          payment,
          extraCharge,
          momo: momoResponse,
          payUrl: momoResponse.payUrl,
        },
      });
    }

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

    hydrateLegacyBookingOwner(booking);
    this.assertBookingCanCreatePayment(booking);

    const selectedPaymentType =
      paymentType ||
      (booking.paymentOption === PaymentOptionEnum.FULL
        ? PaymentTypeEnum.FULL
        : PaymentTypeEnum.DEPOSIT);

    if (!Object.values(PaymentTypeEnum).includes(selectedPaymentType)) {
      throw ErrorHelper.requestDataInvalid("Loại thanh toán không hợp lệ");
    }

    this.assertPaymentTypeIsValidForBooking(booking, selectedPaymentType);
    this.syncBookingPaymentPlan(booking, selectedPaymentType);

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

    if (
      [BookingStatusEnum.OWNER_APPROVED, BookingStatusEnum.CONFIRMED].includes(
        booking.status as BookingStatusEnum,
      )
    ) {
      booking.status = BookingStatusEnum.PAYMENT_PENDING; // Khách đã mở cổng thanh toán, chờ kết quả trả về
      await booking.save();
    } else {
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

    hydrateLegacyBookingOwner(booking);
    if (payment.status === PaymentStatusEnum.PAID) {
      if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
        await this.markExtraChargePaidFromPayment(payment);
      } else {
        await syncBookingPaymentFromPaidPayments(booking);
      }

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

      await payment.save();
      await this.applyPaidPaymentEffects(booking, payment);

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

  async momoReturn(req: Request, res: Response) {
    const data = req.query as Record<string, any>;
    const paymentId = this.getMomoPaymentId(data);
    const hasSignature = typeof data.signature === "string" && data.signature;

    if (!paymentId) {
      return res.status(400).json({
        status: 400,
        code: "-3",
        message: "Mã giao dịch MoMo không hợp lệ",
        data: null,
      });
    }

    const payment = await PaymentModel.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        status: 404,
        code: "-4",
        message: "Không tìm thấy thanh toán",
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
        message: "Không tìm thấy booking",
        data: null,
      });
    }

    hydrateLegacyBookingOwner(booking);

    if (hasSignature && !verifyMomoSignature(data)) {
      return res.status(400).json({
        status: 400,
        code: "-3",
        message: "Chữ ký MoMo không hợp lệ",
        data: { payment, booking, success: false },
      });
    }

    const resultCode = Number(data.resultCode);

    if (resultCode === 0) {
      if (!hasSignature) {
        return res.status(202).json({
          status: 202,
          code: "202",
          message: "Đang chờ MoMo xác minh thanh toán",
          data: {
            payment,
            booking,
            success: false,
            pendingVerification: true,
            provider: "MOMO",
          },
        });
      }

      await this.markMomoPaymentPaid(data, payment, booking);
    } else if (
      !Number.isNaN(resultCode) &&
      payment.status === PaymentStatusEnum.PENDING
    ) {
      payment.status = PaymentStatusEnum.FAILED;
      payment.transactionCode = String(data.transId || payment.transactionCode);
      await payment.save();
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message:
        payment.status === PaymentStatusEnum.PAID
          ? "Thanh toán MoMo thành công"
          : "Thanh toán MoMo không thành công",
      data: {
        payment,
        booking,
        success: payment.status === PaymentStatusEnum.PAID,
        provider: "MOMO",
      },
    });
  }

  async createVnpayPayment(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { bookingId, paymentType, extraChargeId } = req.body;

    if (paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
      if (!extraChargeId) {
        throw ErrorHelper.requestDataInvalid("Thiếu extraChargeId");
      }

      const { extraCharge, booking } = await this.getPendingExtraChargeForRenter(
        String(extraChargeId),
        authUser.userId,
      );
      const payment = await this.getOrCreateExtraChargePayment(
        extraCharge,
        booking,
        PaymentMethodEnum.VNPAY,
        authUser.userId,
      );
      const orderId = `VNPAY-${String(payment._id)}-${Date.now()}`;
      const forwardedFor = req.headers["x-forwarded-for"];
      const forwardedIp = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor?.split(",")[0]?.trim();
      const ipAddr = forwardedIp || req.socket.remoteAddress || "127.0.0.1";

      payment.transactionCode = orderId;
      await payment.save();

      const payUrl = createVnpayPaymentUrl({
        amount: Number(payment.amount || 0),
        orderId,
        orderInfo: `Thanh toán phí phát sinh BQDrive ${String(extraCharge._id)}`,
        ipAddr,
      });

      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Tạo thanh toán phí phát sinh VNPay thành công",
        data: {
          payment,
          extraCharge,
          payUrl,
        },
      });
    }

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

    hydrateLegacyBookingOwner(booking);
    this.assertBookingCanCreatePayment(booking);

    const selectedPaymentType =
      paymentType ||
      (booking.paymentOption === PaymentOptionEnum.FULL
        ? PaymentTypeEnum.FULL
        : PaymentTypeEnum.DEPOSIT);

    if (!Object.values(PaymentTypeEnum).includes(selectedPaymentType)) {
      throw ErrorHelper.requestDataInvalid("Loại thanh toán không hợp lệ");
    }

    this.assertPaymentTypeIsValidForBooking(booking, selectedPaymentType);
    this.syncBookingPaymentPlan(booking, selectedPaymentType);

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

    if (
      [BookingStatusEnum.OWNER_APPROVED, BookingStatusEnum.CONFIRMED].includes(
        booking.status as BookingStatusEnum,
      )
    ) {
      booking.status = BookingStatusEnum.PAYMENT_PENDING; // Khách đã mở cổng thanh toán VNPay
      await booking.save();
    } else {
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

    hydrateLegacyBookingOwner(booking);
    const isSuccess =
      String(query.vnp_ResponseCode) === "00" &&
      String(query.vnp_TransactionStatus) === "00";

    if (payment.status === PaymentStatusEnum.PAID) {
      if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
        await this.markExtraChargePaidFromPayment(payment);
      } else {
        await syncBookingPaymentFromPaidPayments(booking);
      }

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

      await payment.save();
      await this.applyPaidPaymentEffects(booking, payment);

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
    const { bookingId, method, paymentType, extraChargeId } = req.body;

    if ((!bookingId && paymentType !== PaymentTypeEnum.EXTRA_CHARGE) || !method) {
      throw ErrorHelper.requestDataInvalid("Thiếu bookingId hoặc method");
    }

    if (!ACTIVE_PAYMENT_METHODS.includes(method)) {
      throw ErrorHelper.requestDataInvalid(
        "Phương thức thanh toán không hợp lệ",
      );
    }

    if (paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
      if (!extraChargeId) {
        throw ErrorHelper.requestDataInvalid("Thiếu extraChargeId");
      }

      const { extraCharge, booking } = await this.getPendingExtraChargeForRenter(
        String(extraChargeId),
        authUser.userId,
      );
      const payment = await this.getOrCreateExtraChargePayment(
        extraCharge,
        booking,
        method as PaymentMethodEnum,
        authUser.userId,
      );

      return res.status(201).json({
        status: 201,
        code: "201",
        message: "Tạo thanh toán phí phát sinh thành công",
        data: { payment, extraCharge },
      });
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

    this.assertPaymentTypeIsValidForBooking(booking, selectedPaymentType);
    this.syncBookingPaymentPlan(booking, selectedPaymentType);

    const existedPendingPayment = await PaymentModel.findOne({
      bookingId: booking._id,
      method,
      paymentType: selectedPaymentType,
      status: PaymentStatusEnum.PENDING,
    });

    if (existedPendingPayment) {
      if (
        MANUAL_PAYMENT_METHODS.includes(method as PaymentMethodEnum) &&
        [
          BookingStatusEnum.PAYMENT_PENDING,
          BookingStatusEnum.WAITING_PAYMENT,
        ].includes(booking.status as BookingStatusEnum)
      ) {
        booking.status = BookingStatusEnum.OWNER_APPROVED; // Tiền mặt chưa thu thì quay về trạng thái chủ xe đã duyệt
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
    if (MANUAL_PAYMENT_METHODS.includes(method as PaymentMethodEnum)) {
      void sendCashPaymentSelectedMail(booking, payment);
    }

    if (
      MANUAL_PAYMENT_METHODS.includes(method as PaymentMethodEnum) &&
      [
        BookingStatusEnum.PAYMENT_PENDING,
        BookingStatusEnum.WAITING_PAYMENT,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      booking.status = BookingStatusEnum.OWNER_APPROVED; // Chọn tiền mặt: chờ chủ xe thu khi bàn giao
      await booking.save();
    }

    await booking.save();

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Tạo thanh toán thành công",
      data: { payment },
    });
  }

  private getPaymentSummaryStatus(totalPrice: number, paidAmount: number, payments: any[]) {
    const hasPaidPayment = payments.some(
      (payment) => payment.status === PaymentStatusEnum.PAID,
    );
    const hasPendingPayment = payments.some(
      (payment) => payment.status === PaymentStatusEnum.PENDING,
    );
    const hasRefundedPayment = payments.some(
      (payment) => payment.status === PaymentStatusEnum.REFUNDED,
    );

    if (hasRefundedPayment && paidAmount <= 0) return "REFUNDED";
    if (totalPrice > 0 && paidAmount >= totalPrice) return "PAID_FULL";
    if (paidAmount > 0) {
      const hasDepositPayment = payments.some(
        (payment) =>
          payment.status === PaymentStatusEnum.PAID &&
          payment.paymentType === PaymentTypeEnum.DEPOSIT,
      );

      return hasDepositPayment ? "DEPOSIT_PAID" : "PARTIAL";
    }
    if (hasPendingPayment) return "PENDING";
    if (!hasPaidPayment) return "UNPAID";

    return "PARTIAL";
  }

  private buildHistoryCarPayload(car: any) {
    if (!car) {
      return {
        _id: "",
        name: "Xe đã bị xóa hoặc không còn tồn tại",
        brand: "",
        plateNumber: "",
        image: "",
      };
    }

    return {
      _id: String(car._id || ""),
      name: car.name || "Xe đã bị xóa hoặc không còn tồn tại",
      brand: car.brandId?.name || "",
      plateNumber: car.licensePlate || car.plateNumberNormalized || "",
      image: Array.isArray(car.images) ? car.images[0] || "" : "",
    };
  }

  private buildHistoryOwnerPayload(booking: any, car: any) {
    const ownerType = booking?.ownerType || car?.ownerType || OwnerTypeEnum.BUSINESS;
    const owner = booking?.ownerId || car?.ownerId;
    const business = booking?.businessId || car?.businessId;

    if (ownerType === OwnerTypeEnum.USER) {
      return {
        _id: String(owner?._id || car?.ownerId || booking?.ownerId || ""),
        type: OwnerTypeEnum.USER,
        name: owner?.name || car?.ownerId?.name || "Người dùng ký gửi",
        phone: owner?.phone || car?.ownerId?.phone || "",
      };
    }

    const businessUser = business?.userId;

    return {
      _id: String(business?._id || owner?._id || car?.businessId || ""),
      type: OwnerTypeEnum.BUSINESS,
      name:
        business?.businessName ||
        owner?.businessName ||
        businessUser?.name ||
        "Doanh nghiệp",
      phone: business?.phone || owner?.phone || businessUser?.phone || "",
    };
  }

  private buildHistoryPaymentPayload(payment: any) {
    return {
      _id: String(payment._id || ""),
      paymentCode: String(payment._id || "").slice(-8).toUpperCase(),
      amount: Number(payment.amount || 0),
      method: payment.method || "",
      paymentType: payment.paymentType || "",
      status: payment.status || "",
      paidAt: payment.paidAt || payment.createdAt,
      transactionCode: payment.transactionCode || "",
      note: payment.note || "",
      createdAt: payment.createdAt,
    };
  }

  async getMyBookingExtraCharges(req: Request, res: Response) {
    const authUser = (req as any).user;
    const booking = await BookingModel.findOne({
      _id: String(req.params.bookingId),
      userId: authUser.userId,
      isDeleted: false,
    } as any).select("_id");

    if (!booking) {
      throw ErrorHelper.permissionDeny();
    }

    const extraCharges = await ExtraChargeModel.find({
      bookingId: booking._id,
      renterId: authUser.userId,
      isDeleted: false,
    } as any).sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { extraCharges },
    });
  }

  async getMyExtraCharges(req: Request, res: Response) {
    const authUser = (req as any).user;
    const extraCharges = await ExtraChargeModel.find({
      renterId: authUser.userId,
      isDeleted: false,
    } as any)
      .populate("bookingId", "_id startDate endDate status")
      .populate("carId", "name licensePlate images")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { extraCharges },
    });
  }

  async getMyBookingPaymentHistory(req: Request, res: Response) {
    const authUser = (req as any).user;

    const payments = await PaymentModel.find({
      userId: authUser.userId,
    })
      .sort({ createdAt: -1 })
      .lean();
    const bookingIds = Array.from(
      new Set(payments.map((payment) => String(payment.bookingId)).filter(Boolean)),
    );

    const bookings = await BookingModel.find({
      _id: { $in: bookingIds },
      userId: authUser.userId,
      isDeleted: false,
    } as any)
      .populate({
        path: "carId",
        populate: [
          { path: "brandId", select: "name" },
          { path: "ownerId", select: "name email phone businessName userId" },
          {
            path: "businessId",
            select: "businessName phone userId",
            populate: { path: "userId", select: "name email phone" },
          },
        ],
      })
      .populate({
        path: "ownerId",
        select: "name email phone businessName userId",
        populate: { path: "userId", select: "name email phone" },
      })
      .populate({
        path: "businessId",
        select: "businessName phone userId",
        populate: { path: "userId", select: "name email phone" },
      })
      .lean();
    const bookingMap = new Map(
      bookings.map((booking: any) => [String(booking._id), booking]),
    );
    const paymentGroups = new Map<string, any[]>();

    payments.forEach((payment) => {
      const bookingId = String(payment.bookingId || "");
      const currentPayments = paymentGroups.get(bookingId) || [];
      currentPayments.push(payment);
      paymentGroups.set(bookingId, currentPayments);
    });

    const histories = Array.from(paymentGroups.entries())
      .map(([bookingId, bookingPayments]) => {
        const booking = bookingMap.get(bookingId);
        const sortedPayments = [...bookingPayments].sort((left, right) => {
          const leftTime = new Date(left.paidAt || left.createdAt || 0).getTime();
          const rightTime = new Date(right.paidAt || right.createdAt || 0).getTime();
          return leftTime - rightTime;
        });
        const car = booking?.carId;
        const totalPrice = Number(booking?.totalPrice || 0);
        const rentalPayments = sortedPayments.filter((payment) =>
          [
            PaymentTypeEnum.DEPOSIT,
            PaymentTypeEnum.FULL,
            PaymentTypeEnum.REMAINING,
          ].includes(payment.paymentType as PaymentTypeEnum),
        );
        const paidAmount = rentalPayments
          .filter((payment) => payment.status === PaymentStatusEnum.PAID)
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const remainingAmount = Math.max(totalPrice - paidAmount, 0);
        const latestPaymentTime = sortedPayments.reduce((latest, payment) => {
          const currentTime = new Date(payment.paidAt || payment.createdAt || 0).getTime();
          return Math.max(latest, Number.isFinite(currentTime) ? currentTime : 0);
        }, 0);

        return {
          bookingId,
          bookingCode: bookingId.slice(-8).toUpperCase(),
          bookingStatus: booking?.status || "",
          rentalMode: booking?.rentalMode || "",
          startDate: booking?.startDate || null,
          endDate: booking?.endDate || null,
          car: this.buildHistoryCarPayload(car),
          owner: this.buildHistoryOwnerPayload(booking, car),
          totalPrice,
          depositAmount: Number(booking?.depositAmount || 0),
          paidAmount,
          remainingAmount,
          paymentSummaryStatus: this.getPaymentSummaryStatus(
            totalPrice,
            paidAmount,
            rentalPayments,
          ),
          paymentCount: sortedPayments.length,
          latestPaymentAt:
            latestPaymentTime > 0 ? new Date(latestPaymentTime) : null,
          payments: sortedPayments.map((payment) =>
            this.buildHistoryPaymentPayload(payment),
          ),
        };
      })
      .sort((left, right) => {
        const leftTime = new Date(left.latestPaymentAt || 0).getTime();
        const rightTime = new Date(right.latestPaymentAt || 0).getTime();
        return rightTime - leftTime;
      });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { histories },
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
        "Booking không còn khả dụng để ghi nhận thanh toán",
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
      throw ErrorHelper.requestDataInvalid("Payment này đã được thanh toán");
    }

    payment.status = status;
    payment.transactionCode = transactionCode || payment.transactionCode;

    if (status === PaymentStatusEnum.PAID) {
      payment.paidAt = new Date();

      if (MANUAL_PAYMENT_METHODS.includes(payment.method as PaymentMethodEnum)) {
        if (
          ![
            BookingStatusEnum.OWNER_APPROVED,
            BookingStatusEnum.PAID,
            BookingStatusEnum.CONFIRMED,
            BookingStatusEnum.IN_PROGRESS,
          ].includes(booking.status as BookingStatusEnum)
        ) {
          throw ErrorHelper.requestDataInvalid(
            "Booking cần được xác nhận trước khi ghi nhận thanh toán tiền mặt",
          );
        }
      }
    }

    await payment.save();
    if (status === PaymentStatusEnum.PAID) {
      if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
        await this.markExtraChargePaidFromPayment(payment);
      } else {
        await syncBookingPaymentFromPaidPayments(booking);
        void sendPaymentSuccessMail(booking, payment);
        void sendDepositRemainingPaymentMail(booking, payment);
        void notificationCenterService.notifyPaymentPaid(
          payment,
          booking,
          String(payment.userId || ""),
        );

        if (!MANUAL_PAYMENT_METHODS.includes(payment.method as PaymentMethodEnum)) {
          await this.markCarRented(booking);
        }
      }
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Cập nhật trạng thái thanh toán thành công",
      data: { payment, booking },
    });
  }
}

export default new PaymentRoute().router;
