import { BaseRoute, Request, Response } from "../../base/baseRoute";
import mongoose from "mongoose";
import { getBookingDisplayCode } from "../../helper/booking-code.helper";

import { ErrorHelper } from "../../base/error";
import { PaymentModel } from "../../models/payment/payment.model";
import { BookingModel } from "../../models/booking/booking.model";
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
  sendExtraChargePaidMail,
  sendPaymentSuccessMail,
} from "../../helper/mail.helper";
import { syncBookingPaymentFromPaidPayments } from "../../helper/payment-sync.helper";
import { ensureContractForPayment } from "../../helper/contract.helper";
import {
  activatePaidBookingExtension,
  markBookingExtensionPaymentPaid,
  prepareBookingExtensionPayment,
} from "../../helper/booking-extension.helper";
import {
  deriveContractPaymentStatus,
  transitionBookingStatus,
} from "../../helper/status.helper";
import { notificationCenterService } from "../../services/notification-center.service";
import { toCloudinaryCardThumbnailUrl } from "../../services/cloudinary.service";
import { cancellationRefundService } from "../../services/cancellation-refund.service";
import {
  BookingStatusEnum,
  CarStatusEnum,
  ExtraChargeStatusEnum,
  PaymentMethodEnum,
  PaymentOptionEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  ReturnInspectionStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { getBookingUpfrontPaymentAmount } from "../../helper/payment-sync.helper";
import { assertPaymentMethodAllowed } from "../../helper/payment-method-policy.helper";

const RENTER_ROLES = [UserRoleEnum.USER];
const PAYMENT_ALLOWED_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã duyệt nên khách được phép bắt đầu thanh toán
  BookingStatusEnum.PAYMENT_PENDING, // Đã có giao dịch đang chờ, cho phép tạo lại link thanh toán
  BookingStatusEnum.PAID, // Đã thanh toán trước đó, dùng để xử lý phần còn lại nếu có
  BookingStatusEnum.IN_PROGRESS, // Đang thuê, có thể thanh toán phần còn lại/phụ phí
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];
const RENTER_INFO_REQUIRED_FOR_PAYMENT_MESSAGE =
  "Vui lòng cập nhật đầy đủ CCCD và giấy phép lái xe trong hồ sơ cá nhân trước khi thanh toán.";
const MANUAL_PAYMENT_METHODS = [PaymentMethodEnum.CASH];
const CASH_REMAINING_BOOKING_STATUSES = [
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];
const ACTIVE_PAYMENT_METHODS = [
  PaymentMethodEnum.CASH,
  PaymentMethodEnum.MOMO,
  PaymentMethodEnum.VNPAY,
];
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
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getMyPayments),
    );

    this.router.get(
      "/my-booking-history",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getMyBookingPaymentHistory),
    );

    this.router.get(
      "/my-extra-charges",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getMyExtraCharges),
    );

    this.router.get(
      "/bookings/:bookingId/extra-charges",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getMyBookingExtraCharges),
    );
    this.router.get(
      "/getOwnerPayments",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getOwnerPayments),
    );

    this.router.get(
      "/getBusinessPayments",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.getOwnerPayments),
    );

    this.router.post(
      "/updatePaymentStatus/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
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
    const fallbackUpfrontPaymentAmount = getBookingUpfrontPaymentAmount(booking);
    const upfrontPaymentAmount = Number(
      booking.upfrontPaymentAmount || fallbackUpfrontPaymentAmount,
    );
    const remainingAmount = Number(
      booking.remainingAmount || Math.max(totalPrice - paidAmount, 0),
    );

    if (paymentType === PaymentTypeEnum.FULL) {
      return Math.max(totalPrice - paidAmount, 0) || totalPrice;
    }

    if (paymentType === PaymentTypeEnum.REMAINING) {
      return remainingAmount;
    }

    return upfrontPaymentAmount;
  }

  private async getPendingExtraChargeForRenter(
    extraChargeId: string,
    userId: string,
  ) {
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
      throw ErrorHelper.requestDataInvalid(
        "Phí phát sinh này đã được thanh toán",
      );
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

    const paidAt = payment.paidAt || new Date();
    const extraCharge = await ExtraChargeModel.findOneAndUpdate(
      {
        _id: payment.extraChargeId,
        status: ExtraChargeStatusEnum.PENDING,
        isDeleted: false,
      } as any,
      {
        $set: {
          status: ExtraChargeStatusEnum.PAID,
          paymentId: payment._id,
          paymentMethod: payment.method,
          paidAt,
        },
      },
      { new: true },
    );

    if (!extraCharge) return;

    void notificationCenterService.notifyExtraChargePaid(
      extraCharge,
      payment,
      String(payment.userId || ""),
    );
    void sendExtraChargePaidMail(extraCharge, payment);

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
          $set: {
            // Đã xử lý hết phụ phí, quay lại bước kiểm tra xe.
            inspectionStatus: ReturnInspectionStatusEnum.INSPECTING,
          },
        },
      );

      await BookingModel.updateOne(
        {
          _id: extraCharge.bookingId,
          status: BookingStatusEnum.AWAITING_EXTRA_CHARGE,
          isDeleted: false,
        } as any,
        {
          $set: {
            status: BookingStatusEnum.RETURN_INSPECTION,
          },
        },
      );
    }
  }

  private async applyPaidPaymentEffects(
    booking: any,
    payment: any,
    ipAddr = "127.0.0.1",
  ) {
    if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
      await this.markExtraChargePaidFromPayment(payment);
      return;
    }

    if (payment.paymentType === PaymentTypeEnum.EXTENSION) {
      await activatePaidBookingExtension(String(payment._id));
      return;
    }

    if (booking.status === BookingStatusEnum.CANCELLED) {
      const refund =
        await cancellationRefundService.createManualRefundForCancelledPaidPayment(
          booking,
          payment,
        );

      if (refund) {
        void notificationCenterService.notifyRefundCreated(refund, booking);

        /*
         * Nếu tiền VNPay về sau khi booking đã bị hủy,
         * hệ thống phải hoàn lại toàn bộ khoản thanh toán đó.
         *
         * Không để lỗi auto-refund làm callback thanh toán
         * thành thất bại vì Payment đã thực sự được VNPay xác nhận.
         */
        if (payment.method === PaymentMethodEnum.VNPAY) {
          try {
            await cancellationRefundService.processAutomaticVnpayRefund(
              String(refund._id),
              ipAddr,
            );
          } catch (error) {
            console.error(
              "[BQDrive][VNPay Refund] Auto-refund payment đến sau khi booking đã hủy thất bại:",
              error,
            );
          }
        }
      }

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

  private assertPaymentTypeIsValidForBooking(
    booking: any,
    paymentType: string,
  ) {
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
    const upfrontPaymentAmount = getBookingUpfrontPaymentAmount(booking);
    booking.upfrontPaymentAmount = upfrontPaymentAmount;

    if (paymentType === PaymentTypeEnum.FULL) {
      booking.paymentOption = PaymentOptionEnum.FULL;
      booking.remainingAmount = totalPrice;
      return;
    }

    if (paymentType === PaymentTypeEnum.DEPOSIT) {
      booking.paymentOption = PaymentOptionEnum.DEPOSIT;
      booking.remainingAmount = Math.max(
        totalPrice - upfrontPaymentAmount,
        0,
      );
    }
  }

  private async prepareRentalPayment(input: {
    bookingId: string;
    userId: string;
    paymentType: string;
    method: PaymentMethodEnum;
  }) {
    if (!input.paymentType) {
      throw ErrorHelper.requestDataInvalid("Thiếu loại thanh toán");
    }

    if (
      ![
        PaymentTypeEnum.DEPOSIT,
        PaymentTypeEnum.FULL,
        PaymentTypeEnum.REMAINING,
      ].includes(input.paymentType as PaymentTypeEnum)
    ) {
      throw ErrorHelper.requestDataInvalid("Loại thanh toán không hợp lệ");
    }
    assertPaymentMethodAllowed(input.paymentType, input.method);

    await expireAbandonedPendingBookings();

    const session = await mongoose.startSession();
    let prepared:
      | {
          booking: any;
          payment: any;
          amount: number;
          reusedPayment: boolean;
        }
      | undefined;

    try {
      await session.withTransaction(async () => {
        const booking = await BookingModel.findOne({
          _id: input.bookingId,
          userId: input.userId,
          isDeleted: false,
        } as any).session(session);

        if (!booking) {
          throw ErrorHelper.recordNotFound("Booking");
        }

        if (
          input.method === PaymentMethodEnum.CASH &&
          !CASH_REMAINING_BOOKING_STATUSES.includes(
            booking.status as BookingStatusEnum,
          )
        ) {
          throw ErrorHelper.requestDataInvalid(
            "Chỉ được chọn thanh toán tiền mặt sau khi chủ xe tiếp nhận xe trả",
          );
        }

        this.assertBookingCanCreatePayment(booking);
        this.assertPaymentTypeIsValidForBooking(booking, input.paymentType);
        this.syncBookingPaymentPlan(booking, input.paymentType);

        const existedPaidPayment = await PaymentModel.findOne({
          bookingId: booking._id,
          paymentType: input.paymentType,
          status: PaymentStatusEnum.PAID,
        }).session(session);

        if (existedPaidPayment) {
          throw ErrorHelper.requestDataInvalid(
            "Khoản thanh toán này đã được thanh toán",
          );
        }

        const amount = this.getPaymentAmount(booking, input.paymentType);

        if (amount <= 0) {
          throw ErrorHelper.requestDataInvalid(
            "Số tiền cần thanh toán không hợp lệ",
          );
        }

        if (MANUAL_PAYMENT_METHODS.includes(input.method)) {
          if (booking.status === BookingStatusEnum.PAYMENT_PENDING) {
            transitionBookingStatus(booking, BookingStatusEnum.OWNER_APPROVED);
          }
        } else if (booking.status === BookingStatusEnum.OWNER_APPROVED) {
          transitionBookingStatus(booking, BookingStatusEnum.PAYMENT_PENDING);
        }

        await booking.save({ session });
        const contract = await ensureContractForPayment(booking, { session });

        // A retry may change FULL/DEPOSIT or the gateway before any payment is
        // successful. Old links are invalidated so only the latest plan can pay.
        await PaymentModel.updateMany(
          {
            bookingId: booking._id,
            status: PaymentStatusEnum.PENDING,
            paymentType: {
              $in: [
                PaymentTypeEnum.DEPOSIT,
                PaymentTypeEnum.FULL,
                PaymentTypeEnum.REMAINING,
              ],
            },
            $or: [
              { paymentType: { $ne: input.paymentType } },
              { method: { $ne: input.method } },
            ],
          },
          { $set: { status: PaymentStatusEnum.FAILED } },
          { session },
        );

        let payment = await PaymentModel.findOne({
          bookingId: booking._id,
          paymentType: input.paymentType,
          method: input.method,
          status: PaymentStatusEnum.PENDING,
        }).session(session);
        const reusedPayment = Boolean(payment);

        if (!payment) {
          const createdPayments = await PaymentModel.create(
            [
              {
                bookingId: booking._id,
                userId: input.userId,
                amount,
                method: input.method,
                paymentType: input.paymentType,
                status: PaymentStatusEnum.PENDING,
              },
            ],
            { session },
          );
          payment = createdPayments[0] || null;
        } else if (Number(payment.amount || 0) !== amount) {
          payment.amount = amount;
          await payment.save({ session });
        }

        if (!payment) {
          throw ErrorHelper.requestDataInvalid("Không thể tạo thanh toán");
        }

        contract.paymentStatus = deriveContractPaymentStatus({
          totalPrice: booking.totalPrice,
          upfrontPaymentAmount: booking.upfrontPaymentAmount,
          paidAmount: booking.paidAmount,
          paymentOption: booking.paymentOption,
          hasPendingPayment: true,
        });
        await contract.save({ session });

        prepared = { booking, payment, amount, reusedPayment };
      });
    } finally {
      await session.endSession();
    }

    if (!prepared) {
      throw ErrorHelper.requestDataInvalid("Không thể chuẩn bị thanh toán");
    }

    prepared.booking.$session?.(null);
    prepared.payment.$session?.(null);

    return prepared;
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
    const ownerId = (booking as any).ownerId?._id || (booking as any).ownerId;

    if (!ownerId) {
      return {};
    }

    return {
      ownerId,
    };
  }

  private async assertNoOtherActiveBookingForHandover(booking: any) {
    const overlappedBooking = await BookingModel.findOne({
      _id: { $ne: booking._id },
      carId: booking.carId,
      status: {
        $in: [BookingStatusEnum.PAID, BookingStatusEnum.IN_PROGRESS],
      },
      isDeleted: false,
      startDate: { $lt: booking.endDate },
      endDate: { $gt: booking.startDate },
    } as any).select("_id");

    if (overlappedBooking) {
      throw ErrorHelper.requestDataInvalid("Xe đang thuộc booking khác");
    }

    if (
      booking.renterEligibilitySnapshot?.identityProfileCompleted !== true ||
      booking.renterEligibilitySnapshot?.licenseEligible !== true
    ) {
      throw ErrorHelper.requestDataInvalid(
        RENTER_INFO_REQUIRED_FOR_PAYMENT_MESSAGE,
      );
    }
  }

  private buildOwnerFilter(owner: any) {
    return {
      ownerId: owner.ownerId,
    };
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

  private async markGatewayPaymentPaid(
    payment: any,
    paidFields: {
      paidAt: Date;
      transactionCode?: string | undefined;
      gatewayOrderId?: string | undefined;
      gatewayTransactionId?: string | undefined;
      gatewayPayDate?: string | undefined;
    },
  ) {
    if (payment.paymentType === PaymentTypeEnum.EXTENSION) {
      return markBookingExtensionPaymentPaid({
        paymentId: String(payment._id),
        ...paidFields,
      });
    }

    payment.status = PaymentStatusEnum.PAID;
    for (const [key, value] of Object.entries(paidFields)) {
      if (value) payment.set(key, value);
    }
    await payment.save();
    return payment;
  }

private async markMomoPaymentPaid(
  data: Record<string, any>,
  payment: any,
  booking: any,
  ipAddr = "127.0.0.1",
) {
    if (Number(data.amount) !== Number(payment.amount)) {
      throw ErrorHelper.requestDataInvalid("Payment amount mismatch");
    }

    if (payment.status !== PaymentStatusEnum.PAID) {
      const paidPayment = await this.markGatewayPaymentPaid(payment, {
        paidAt: new Date(),
        transactionCode: String(data.transId || payment.transactionCode),
      });

      await this.applyPaidPaymentEffects(
        booking,
        paidPayment,
        ipAddr,
      );
    } else {
      if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
        await this.markExtraChargePaidFromPayment(payment);
      } else if (payment.paymentType === PaymentTypeEnum.EXTENSION) {
        await activatePaidBookingExtension(String(payment._id));
      } else if (booking.status === BookingStatusEnum.CANCELLED) {
        const refund =
          await cancellationRefundService.createManualRefundForCancelledPaidPayment(
            booking,
            payment,
          );
        if (refund) {
          void notificationCenterService.notifyRefundCreated(refund, booking);
        }
      } else {
        await syncBookingPaymentFromPaidPayments(booking);
      }
    }
  }

  async createMomoPayment(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { bookingId, paymentType, extraChargeId, extensionId } = req.body;
    assertPaymentMethodAllowed(paymentType, PaymentMethodEnum.MOMO);

    if (paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
      if (!extraChargeId) {
        throw ErrorHelper.requestDataInvalid("Thiếu extraChargeId");
      }

      const { extraCharge, booking } =
        await this.getPendingExtraChargeForRenter(
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

    if (paymentType === PaymentTypeEnum.EXTENSION) {
      if (!extensionId) {
        throw ErrorHelper.requestDataInvalid("Thiếu extensionId");
      }

      const { booking, extension, payment } =
        await prepareBookingExtensionPayment({
          extensionId: String(extensionId),
          userId: String(authUser.userId),
          method: PaymentMethodEnum.MOMO,
        });
      const orderId = `MOMO-${String(payment._id)}-${Date.now()}`;
      const momoResponse = await createMomoPayment({
        amount: Number(payment.amount || 0),
        orderId,
        requestId: orderId,
        orderInfo: `Thanh toán gia hạn BQDrive ${String(extension._id)}`,
        extraData: String(payment._id),
      });
      payment.transactionCode = orderId;
      await payment.save();

      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Tạo thanh toán gia hạn MoMo thành công",
        data: { payment, extension, booking, payUrl: momoResponse.payUrl },
      });
    }

    if (!bookingId) {
      throw ErrorHelper.requestDataInvalid("Thiếu bookingId");
    }

    const { booking, payment, amount } = await this.prepareRentalPayment({
      bookingId: String(bookingId),
      userId: String(authUser.userId),
      paymentType: String(paymentType || ""),
      method: PaymentMethodEnum.MOMO,
    });

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
      if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
        await this.markExtraChargePaidFromPayment(payment);
      } else if (payment.paymentType === PaymentTypeEnum.EXTENSION) {
        await activatePaidBookingExtension(String(payment._id));
      } else if (booking.status === BookingStatusEnum.CANCELLED) {
        const refund =
          await cancellationRefundService.createManualRefundForCancelledPaidPayment(
            booking,
            payment,
          );
        if (refund) {
          void notificationCenterService.notifyRefundCreated(refund, booking);
        }
      } else {
        await syncBookingPaymentFromPaidPayments(booking);
      }

      return res.status(200).json({
        status: 200,
        message: "Payment already paid",
      });
    }

    if (payment.status === PaymentStatusEnum.FAILED) {
      return res.status(200).json({
        resultCode: 0,
        message: "Payment attempt is no longer active",
      });
    }

    if (Number(data.resultCode) === 0) {
      if (Number(data.amount) !== Number(payment.amount)) {
        return res.status(400).json({
          status: 400,
          message: "Payment amount mismatch",
        });
      }

      const paidPayment = await this.markGatewayPaymentPaid(payment, {
        paidAt: new Date(),
        transactionCode: String(data.transId || payment.transactionCode),
      });
      await this.applyPaidPaymentEffects(booking, paidPayment);

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

    if (hasSignature && !verifyMomoSignature(data)) {
      return res.status(400).json({
        status: 400,
        code: "-3",
        message: "Chữ ký MoMo không hợp lệ",
        data: { payment, booking, success: false },
      });
    }

    if (payment.status === PaymentStatusEnum.FAILED) {
      return res.status(409).json({
        status: 409,
        code: "409",
        message:
          "Giao dịch này đã hết hiệu lực do phương án thanh toán đã thay đổi",
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
    const { bookingId, paymentType, extraChargeId, extensionId } = req.body;
    assertPaymentMethodAllowed(paymentType, PaymentMethodEnum.VNPAY);

    if (paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
      if (!extraChargeId) {
        throw ErrorHelper.requestDataInvalid("Thiếu extraChargeId");
      }

      const { extraCharge, booking } =
        await this.getPendingExtraChargeForRenter(
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

      const { payUrl, transactionDate } = createVnpayPaymentUrl({
        amount: Number(payment.amount || 0),
        orderId,
        orderInfo: `Thanh toán phí phát sinh BQDrive ${String(extraCharge._id)}`,
        ipAddr,
      });

      payment.transactionCode = orderId;
      payment.gatewayOrderId = orderId;
      payment.gatewayTransactionDate = transactionDate;

      await payment.save();
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

    if (paymentType === PaymentTypeEnum.EXTENSION) {
      if (!extensionId) {
        throw ErrorHelper.requestDataInvalid("Thiếu extensionId");
      }

      const { booking, extension, payment } =
        await prepareBookingExtensionPayment({
          extensionId: String(extensionId),
          userId: String(authUser.userId),
          method: PaymentMethodEnum.VNPAY,
        });
      const orderId = `VNPAY-${String(payment._id)}-${Date.now()}`;
      const forwardedFor = req.headers["x-forwarded-for"];
      const forwardedIp = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor?.split(",")[0]?.trim();
      const ipAddr = forwardedIp || req.socket.remoteAddress || "127.0.0.1";
      const { payUrl, transactionDate } = createVnpayPaymentUrl({
        amount: Number(payment.amount || 0),
        orderId,
        orderInfo: `Thanh toán gia hạn BQDrive ${String(extension._id)}`,
        ipAddr,
      });

      payment.transactionCode = orderId;
      payment.gatewayOrderId = orderId;
      payment.gatewayTransactionDate = transactionDate;

      await payment.save();
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Tạo thanh toán gia hạn VNPay thành công",
        data: { payment, extension, booking, payUrl },
      });
    }

    if (!bookingId) {
      throw ErrorHelper.requestDataInvalid("Thiếu bookingId");
    }

    const { booking, payment, amount } = await this.prepareRentalPayment({
      bookingId: String(bookingId),
      userId: String(authUser.userId),
      paymentType: String(paymentType || ""),
      method: PaymentMethodEnum.VNPAY,
    });

    const orderId = `VNPAY-${String(payment._id)}-${Date.now()}`;
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(",")[0]?.trim();
    const ipAddr = forwardedIp || req.socket.remoteAddress || "127.0.0.1";

    const { payUrl, transactionDate } = createVnpayPaymentUrl({
      amount,
      orderId,
      orderInfo: `Thanh toán BQDrive ${String(booking._id)}`,
      ipAddr,
    });

    payment.transactionCode = orderId;
    payment.gatewayOrderId = orderId;
    payment.gatewayTransactionDate = transactionDate;

    await payment.save();

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
    const gatewayTransactionId = String(query.vnp_TransactionNo || "").trim();

    const gatewayPayDate = String(query.vnp_PayDate || "").trim();

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
      if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
        await this.markExtraChargePaidFromPayment(payment);
      } else if (payment.paymentType === PaymentTypeEnum.EXTENSION) {
        await activatePaidBookingExtension(String(payment._id));
      } else if (booking.status === BookingStatusEnum.CANCELLED) {
  await this.applyPaidPaymentEffects(
    booking,
    payment,
    String(req.ip || "127.0.0.1"),
  );

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

    if (payment.status === PaymentStatusEnum.FAILED) {
      return res.status(409).json({
        status: 409,
        code: "409",
        message:
          "Giao dịch này đã hết hiệu lực do phương án thanh toán đã thay đổi",
        data: { payment, booking, success: false },
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
      const paidPayment = await this.markGatewayPaymentPaid(payment, {
        paidAt: new Date(),
        transactionCode: gatewayTransactionId || txnRef,
        gatewayOrderId: payment.gatewayOrderId || txnRef,
        gatewayTransactionId: gatewayTransactionId || undefined,
        gatewayPayDate: gatewayPayDate || undefined,
      });
      await this.applyPaidPaymentEffects(booking, paidPayment);

      return res.status(200).json({
        status: 200,
        code: "200",
        message: "VNPay payment success",
        data: { payment: paidPayment, booking, success: true },
      });
    }
    payment.status = PaymentStatusEnum.FAILED;

    payment.transactionCode = gatewayTransactionId || txnRef;

    payment.gatewayOrderId = payment.gatewayOrderId || txnRef;

    if (gatewayTransactionId) {
      payment.gatewayTransactionId = gatewayTransactionId;
    }

    if (gatewayPayDate) {
      payment.gatewayPayDate = gatewayPayDate;
    }

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
    const { bookingId, method, paymentType, extraChargeId, extensionId } =
      req.body;

    if (
      (!bookingId &&
        ![PaymentTypeEnum.EXTRA_CHARGE, PaymentTypeEnum.EXTENSION].includes(
          paymentType,
        )) ||
      !method
    ) {
      throw ErrorHelper.requestDataInvalid("Thiếu bookingId hoặc method");
    }

    if (!ACTIVE_PAYMENT_METHODS.includes(method)) {
      throw ErrorHelper.requestDataInvalid(
        "Phương thức thanh toán không hợp lệ",
      );
    }

    assertPaymentMethodAllowed(paymentType, method);

    if (paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
      if (!extraChargeId) {
        throw ErrorHelper.requestDataInvalid("Thiếu extraChargeId");
      }

      const { extraCharge, booking } =
        await this.getPendingExtraChargeForRenter(
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

    if (paymentType === PaymentTypeEnum.EXTENSION) {
      if (!extensionId) {
        throw ErrorHelper.requestDataInvalid("Thiếu extensionId");
      }

      const { payment, extension, reusedPayment } =
        await prepareBookingExtensionPayment({
          extensionId: String(extensionId),
          userId: String(authUser.userId),
          method: method as PaymentMethodEnum,
        });
      const responseStatus = reusedPayment ? 200 : 201;
      return res.status(responseStatus).json({
        status: responseStatus,
        code: String(responseStatus),
        message: reusedPayment
          ? "Thanh toán gia hạn đang chờ đã tồn tại"
          : "Đã tạo thanh toán gia hạn",
        data: { payment, extension },
      });
    }

    const prepared = await this.prepareRentalPayment({
      bookingId: String(bookingId),
      userId: String(authUser.userId),
      paymentType: String(paymentType || ""),
      method: method as PaymentMethodEnum,
    });
    const { booking, payment, reusedPayment } = prepared;

    if (
      !reusedPayment &&
      MANUAL_PAYMENT_METHODS.includes(method as PaymentMethodEnum)
    ) {
      void sendCashPaymentSelectedMail(booking, payment);
    }

    const responseStatus = reusedPayment ? 200 : 201;
    return res.status(responseStatus).json({
      status: responseStatus,
      code: String(responseStatus),
      message: reusedPayment
        ? "Payment chờ thanh toán đã tồn tại"
        : "Tạo thanh toán thành công",
      data: { payment },
    });
  }

  private getPaymentSummaryStatus(
    totalPrice: number,
    upfrontPaymentAmount: number,
    paidAmount: number,
    paymentOption: string,
    payments: any[],
  ) {
    const hasPendingPayment = payments.some(
      (payment) => payment.status === PaymentStatusEnum.PENDING,
    );
    return deriveContractPaymentStatus({
      totalPrice,
      upfrontPaymentAmount,
      paidAmount,
      paymentOption,
      hasPendingPayment,
    });
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
      image: toCloudinaryCardThumbnailUrl(
        Array.isArray(car.images) ? car.images[0] || "" : "",
      ),
    };
  }

  private buildHistoryOwnerPayload(booking: any, car: any) {
    const owner = booking?.ownerId || car?.ownerId;

    return {
      _id: String(owner?._id || owner || ""),
      type: UserRoleEnum.USER,
      name: owner?.name || "Chủ xe ký gửi",
      phone: owner?.phone || "",
    };
  }
  private buildHistoryPaymentPayload(payment: any) {
    return {
      _id: String(payment._id || ""),
      paymentCode: String(payment._id || "")
        .slice(-8)
        .toUpperCase(),
      amount: Number(payment.amount || 0),
      method: payment.method || "",
      paymentType: payment.paymentType || "",
      status: payment.status || "",
      refundStatus: payment.refundStatus || "",
      refundedAmount: Number(payment.refundedAmount || 0),
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
      .populate("bookingId", "_id bookingCode startDate endDate status")
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
      new Set(
        payments.map((payment) => String(payment.bookingId)).filter(Boolean),
      ),
    );

    const bookings = await BookingModel.find({
      _id: { $in: bookingIds },
      userId: authUser.userId,
      isDeleted: false,
    } as any)
      .populate({
        path: "carId",
        populate: [
          {
            path: "brandId",
            select: "name",
          },
          {
            path: "ownerId",
            select: "name email phone",
          },
        ],
      })
      .populate({
        path: "ownerId",
        select: "name email phone",
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
          const leftTime = new Date(
            left.paidAt || left.createdAt || 0,
          ).getTime();
          const rightTime = new Date(
            right.paidAt || right.createdAt || 0,
          ).getTime();
          return leftTime - rightTime;
        });
        const car = booking?.carId;
        const totalPrice = Number(booking?.totalPrice || 0);
        const rentalPayments = sortedPayments.filter((payment) =>
          [
            PaymentTypeEnum.DEPOSIT,
            PaymentTypeEnum.FULL,
            PaymentTypeEnum.REMAINING,
            PaymentTypeEnum.EXTENSION,
          ].includes(payment.paymentType as PaymentTypeEnum),
        );
        const paidAmount = rentalPayments
          .filter((payment) => payment.status === PaymentStatusEnum.PAID)
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const remainingAmount = Math.max(totalPrice - paidAmount, 0);
        const latestPaymentTime = sortedPayments.reduce((latest, payment) => {
          const currentTime = new Date(
            payment.paidAt || payment.createdAt || 0,
          ).getTime();
          return Math.max(
            latest,
            Number.isFinite(currentTime) ? currentTime : 0,
          );
        }, 0);

        return {
          bookingId,
          bookingCode: getBookingDisplayCode(booking || bookingId),
          bookingStatus: booking?.status || "",
          rentalMode: booking?.rentalMode || "",
          startDate: booking?.startDate || null,
          endDate: booking?.endDate || null,
          car: this.buildHistoryCarPayload(car),
          owner: this.buildHistoryOwnerPayload(booking, car),
          totalPrice,
          upfrontPaymentAmount: Number(
            booking?.upfrontPaymentAmount || 0,
          ),
          paidAmount,
          remainingAmount,
          paymentSummaryStatus: this.getPaymentSummaryStatus(
            totalPrice,
            Number(booking?.upfrontPaymentAmount || 0),
            paidAmount,
            String(booking?.paymentOption || ""),
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
      .populate(
        "bookingId",
        "_id bookingCode startDate endDate status totalPrice paymentOption upfrontPaymentAmount paidAmount remainingAmount renterInfo.fullName renterInfo.phone renterInfo.email renterInfo.note renterEligibilitySnapshot",
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { payments },
    });
  }

  private async getOwnerContext(authUser: any) {
    return {
      ownerId: authUser.userId,
    };
  }
  async getOwnerPayments(req: Request, res: Response) {
    const authUser = (req as any).user;

    const owner = await this.getOwnerContext(authUser);

    // Tìm các booking của những xe thuộc USER đang đăng nhập
    const bookings = await BookingModel.find({
      ownerId: owner.ownerId,
      isDeleted: false,
    } as any)
      .select("_id")
      .lean();

    const bookingIds = bookings.map((booking) => booking._id);

    if (bookingIds.length === 0) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "success",
        data: {
          payments: [],
        },
      });
    }

    // Lấy toàn bộ payment phát sinh từ các booking của chủ xe
    const payments = await PaymentModel.find({
      bookingId: {
        $in: bookingIds,
      },
    })
      .populate({
        path: "bookingId",
        select:
          "_id bookingCode userId carId startDate endDate status totalPrice paymentOption upfrontPaymentAmount paidAmount remainingAmount renterInfo.fullName renterInfo.phone renterInfo.email renterInfo.note renterEligibilitySnapshot",
        populate: [
          {
            path: "userId",
            select: "name email phone",
          },
          {
            path: "carId",
            select: "name licensePlate images",
          },
        ],
      })
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        payments,
      },
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

    const owner = await this.getOwnerContext(authUser);
    const ownerMatches =
      String(
        (booking as any).ownerId?._id || (booking as any).ownerId || "",
      ) === String(owner.ownerId);

    if (!ownerMatches) {
      throw ErrorHelper.permissionDeny();
    }

    if (payment.status === PaymentStatusEnum.PAID) {
      throw ErrorHelper.requestDataInvalid("Payment này đã được thanh toán");
    }

    if (
      status === PaymentStatusEnum.PAID &&
      payment.paymentType === PaymentTypeEnum.EXTENSION
    ) {
      assertPaymentMethodAllowed(PaymentTypeEnum.EXTENSION, payment.method);
      const paidPayment = await markBookingExtensionPaymentPaid({
        paymentId: String(payment._id),
        paidAt: new Date(),
        transactionCode: transactionCode || payment.transactionCode,
      });
      await activatePaidBookingExtension(String(paidPayment._id));
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "Cập nhật trạng thái thanh toán thành công",
        data: { payment: paidPayment, booking },
      });
    }

    payment.status = status;
    payment.transactionCode = transactionCode || payment.transactionCode;

    if (status === PaymentStatusEnum.PAID) {
      payment.paidAt = new Date();

      if (
        MANUAL_PAYMENT_METHODS.includes(payment.method as PaymentMethodEnum)
      ) {
        if (payment.paymentType !== PaymentTypeEnum.REMAINING) {
          throw ErrorHelper.requestDataInvalid(
            "Không thể xác nhận tiền mặt cho khoản giữ chỗ hoặc thanh toán toàn bộ",
          );
        }

        if (
          !CASH_REMAINING_BOOKING_STATUSES.includes(
            booking.status as BookingStatusEnum,
          )
        ) {
          throw ErrorHelper.requestDataInvalid(
            "Chỉ được xác nhận tiền mặt sau khi đã tiếp nhận xe trả",
          );
        }

        const summary = await syncBookingPaymentFromPaidPayments(booking);
        if (summary.remainingAmount <= 0) {
          throw ErrorHelper.requestDataInvalid(
            "Booking không còn số tiền cần thanh toán",
          );
        }
        payment.amount = summary.remainingAmount;
        payment.confirmedBy = authUser.userId;
        payment.confirmedByRole = authUser.role;
        payment.note =
          payment.note ||
          "Chủ xe xác nhận đã thu phần còn lại trực tiếp từ khách khi trả xe.";
      }
    }

    await payment.save();
    if (status === PaymentStatusEnum.PAID) {
      if (payment.paymentType === PaymentTypeEnum.EXTRA_CHARGE) {
        await this.markExtraChargePaidFromPayment(payment);
      } else if (payment.paymentType === PaymentTypeEnum.EXTENSION) {
        await activatePaidBookingExtension(String(payment._id));
      } else {
        await syncBookingPaymentFromPaidPayments(booking);
        void sendPaymentSuccessMail(booking, payment);
        void sendDepositRemainingPaymentMail(booking, payment);
        void notificationCenterService.notifyPaymentPaid(
          payment,
          booking,
          String(payment.userId || ""),
        );

        if (
          !MANUAL_PAYMENT_METHODS.includes(payment.method as PaymentMethodEnum)
        ) {
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
