import mongoose from "mongoose";

import { BaseError, ErrorHelper } from "../base/error";
import {
  BookingStatusEnum,
  OwnerTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  RefundMethodEnum,
  RefundStatusEnum,
  UserRoleEnum,
} from "../constants/model.const";
import { syncContractFromBooking } from "../helper/payment-sync.helper";
import { BookingModel } from "../models/booking/booking.model";
import { BusinessModel } from "../models/business/business.model";
import { PaymentModel } from "../models/payment/payment.model";
import {
  RefundModel,
  type RefundRecipientInfo,
  type RefundRecipientMethod,
} from "../models/refund/refund.model";

export const DEFAULT_CANCELLATION_POLICY = {
  fullRefundBeforeHours: 48,
  partialRefundBeforeHours: 24,
  partialRefundRate: 0.8,
  lateCancellationRule: "KEEP_DEPOSIT",
  ownerCancellationRefundRate: 1,
};

const CANCELLABLE_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED,
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.PENDING,
  BookingStatusEnum.WAITING_PAYMENT,
  BookingStatusEnum.CONFIRMED,
];

const RENTAL_PAYMENT_TYPES = [
  PaymentTypeEnum.DEPOSIT,
  PaymentTypeEnum.FULL,
  PaymentTypeEnum.REMAINING,
];

type ActorContext = {
  userId: string;
  role: UserRoleEnum;
};

type CancellationActor = {
  actorType: "RENTER" | "OWNER";
  actorUserId: string;
  actorRole: UserRoleEnum;
};

type PaidPayment = {
  _id: mongoose.Types.ObjectId;
  amount: number;
  method: PaymentMethodEnum;
  status: PaymentStatusEnum;
  refundedAmount?: number;
  paidAt?: Date;
  createdAt?: Date;
};

type RefundRecipientInfoPayload =
  | {
      method: "BANK_TRANSFER";
      bankName: string;
      accountNumber: string;
      accountHolderName: string;
    }
  | {
      method: "E_WALLET";
      walletProvider: string;
      walletAccount: string;
      walletHolderName: string;
    }
  | {
      method: "CASH";
      cashNote: string;
    };

function toObjectId(value: string) {
  return new mongoose.Types.ObjectId(value);
}

function normalizeReasonText(value: unknown) {
  return String(value || "").trim().slice(0, 500);
}

function normalizeReasonCode(value: unknown) {
  const reasonCode = String(value || "CUSTOMER_REQUEST").trim().toUpperCase();
  return /^[A-Z0-9_]{2,80}$/.test(reasonCode)
    ? reasonCode
    : "CUSTOMER_REQUEST";
}

function throwConflict(code: string, message: string) {
  throw new BaseError(409, code, message, code);
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function validateLength(value: string, min: number, max: number, code: string) {
  if (value.length < min || value.length > max) {
    throw ErrorHelper.requestDataInvalid(code);
  }
}

function maskSensitiveAccount(value: string) {
  const normalized = value.trim();
  const visible = normalized.slice(-4);
  const hiddenLength = Math.max(normalized.length - visible.length, 0);

  return `${"*".repeat(Math.min(hiddenLength, 8))}${visible}`;
}

function hasRecipientInfo(value: unknown): value is RefundRecipientInfo {
  const info = value as RefundRecipientInfo | undefined;
  return Boolean(info?.method && info.submittedAt);
}

function normalizeRecipientInfoPayload(
  payload: unknown,
  userId: string,
): RefundRecipientInfo {
  const data = (payload || {}) as Partial<RefundRecipientInfoPayload>;
  const method = String(data.method || "").trim().toUpperCase() as RefundRecipientMethod;
  const forbiddenPattern = /(otp|pin|cvv|password|mat\s*khau|mật\s*khẩu)/i;

  if (!["BANK_TRANSFER", "E_WALLET", "CASH"].includes(method)) {
    throw ErrorHelper.requestDataInvalid("REFUND_RECIPIENT_INFO_INVALID");
  }

  const now = new Date();
  const base = {
    method,
    submittedBy: toObjectId(userId),
    submittedAt: now,
    updatedAt: now,
  };

  if (method === "BANK_TRANSFER") {
    const bankName = normalizeText(
      (data as Extract<RefundRecipientInfoPayload, { method: "BANK_TRANSFER" }>)
        .bankName,
      100,
    );
    const accountNumber = normalizeText(
      (data as Extract<RefundRecipientInfoPayload, { method: "BANK_TRANSFER" }>)
        .accountNumber,
      30,
    );
    const accountHolderName = normalizeText(
      (data as Extract<RefundRecipientInfoPayload, { method: "BANK_TRANSFER" }>)
        .accountHolderName,
      100,
    );

    validateLength(bankName, 2, 100, "REFUND_RECIPIENT_INFO_INVALID");
    validateLength(accountNumber, 6, 30, "REFUND_RECIPIENT_INFO_INVALID");
    validateLength(accountHolderName, 2, 100, "REFUND_RECIPIENT_INFO_INVALID");

    if (!/^[A-Za-z0-9._ -]+$/.test(accountNumber)) {
      throw ErrorHelper.requestDataInvalid("REFUND_RECIPIENT_INFO_INVALID");
    }

    if (forbiddenPattern.test(`${bankName} ${accountNumber} ${accountHolderName}`)) {
      throw ErrorHelper.requestDataInvalid("REFUND_RECIPIENT_INFO_INVALID");
    }

    return {
      ...base,
      bankName,
      accountNumber,
      accountNumberMasked: maskSensitiveAccount(accountNumber),
      accountHolderName,
    };
  }

  if (method === "E_WALLET") {
    const walletProvider = normalizeText(
      (data as Extract<RefundRecipientInfoPayload, { method: "E_WALLET" }>)
        .walletProvider,
      100,
    );
    const walletAccount = normalizeText(
      (data as Extract<RefundRecipientInfoPayload, { method: "E_WALLET" }>)
        .walletAccount,
      100,
    );
    const walletHolderName = normalizeText(
      (data as Extract<RefundRecipientInfoPayload, { method: "E_WALLET" }>)
        .walletHolderName,
      100,
    );

    validateLength(walletProvider, 2, 100, "REFUND_RECIPIENT_INFO_INVALID");
    validateLength(walletAccount, 6, 100, "REFUND_RECIPIENT_INFO_INVALID");
    validateLength(walletHolderName, 2, 100, "REFUND_RECIPIENT_INFO_INVALID");

    if (forbiddenPattern.test(`${walletProvider} ${walletAccount} ${walletHolderName}`)) {
      throw ErrorHelper.requestDataInvalid("REFUND_RECIPIENT_INFO_INVALID");
    }

    return {
      ...base,
      walletProvider,
      walletAccount,
      walletAccountMasked: maskSensitiveAccount(walletAccount),
      walletHolderName,
    };
  }

  const cashNote = normalizeText(
    (data as Extract<RefundRecipientInfoPayload, { method: "CASH" }>).cashNote,
    500,
  );
  validateLength(cashNote, 10, 500, "REFUND_RECIPIENT_INFO_INVALID");

  if (forbiddenPattern.test(cashNote)) {
    throw ErrorHelper.requestDataInvalid("REFUND_RECIPIENT_INFO_INVALID");
  }

  return {
    ...base,
    cashNote,
  };
}

function resolvePolicy(booking: any) {
  const snapshot = booking.cancellationPolicySnapshot as
    | typeof DEFAULT_CANCELLATION_POLICY
    | undefined;

  if (
    snapshot &&
    Number.isFinite(snapshot.fullRefundBeforeHours) &&
    Number.isFinite(snapshot.partialRefundBeforeHours) &&
    Number.isFinite(snapshot.partialRefundRate)
  ) {
    return {
      policy: {
        fullRefundBeforeHours: Number(snapshot.fullRefundBeforeHours),
        partialRefundBeforeHours: Number(snapshot.partialRefundBeforeHours),
        partialRefundRate: Number(snapshot.partialRefundRate),
        lateCancellationRule:
          String(snapshot.lateCancellationRule || "").trim() ||
          DEFAULT_CANCELLATION_POLICY.lateCancellationRule,
        ownerCancellationRefundRate: Number(
          snapshot.ownerCancellationRefundRate ?? 1,
        ),
      },
      policySource: "BOOKING_SNAPSHOT",
    };
  }

  return {
    policy: DEFAULT_CANCELLATION_POLICY,
    policySource: "DEFAULT_FALLBACK",
  };
}

function getHoursBeforeStart(booking: any) {
  const startDate = new Date(String(booking.startDate || ""));
  if (Number.isNaN(startDate.getTime())) return 0;

  return (startDate.getTime() - Date.now()) / 36e5;
}

function getRefundMethod(payments: PaidPayment[]) {
  const methods = Array.from(
    new Set(payments.map((payment) => payment.method).filter(Boolean)),
  );

  if (methods.includes(PaymentMethodEnum.VNPAY)) return RefundMethodEnum.VNPAY;
  if (methods.includes(PaymentMethodEnum.MOMO)) return RefundMethodEnum.MOMO;
  if (methods.includes(PaymentMethodEnum.CASH)) return RefundMethodEnum.CASH;
  return RefundMethodEnum.MANUAL;
}

function getPaymentRefundedAmount(payment: PaidPayment) {
  if (payment.status === PaymentStatusEnum.REFUNDED) {
    return Number(payment.refundedAmount ?? payment.amount ?? 0);
  }

  return Number(payment.refundedAmount || 0);
}

function assertCanCancelByStatus(status: string) {
  if (status === BookingStatusEnum.CANCELLED) {
    throw ErrorHelper.requestDataInvalid("BOOKING_ALREADY_CANCELLED");
  }

  if (!CANCELLABLE_BOOKING_STATUSES.includes(status as BookingStatusEnum)) {
    throw ErrorHelper.requestDataInvalid(
      "Booking đã được bàn giao/đang xử lý sau thuê nên không thể hủy bằng luồng thông thường.",
    );
  }
}

class CancellationRefundService {
  getPolicySnapshot() {
    return { ...DEFAULT_CANCELLATION_POLICY };
  }

  private async getOwnerUserIdFromBooking(booking: any) {
    if (booking.ownerType === OwnerTypeEnum.USER) {
      return String(booking.ownerId || "");
    }

    const businessId = String(booking.businessId || booking.ownerId || "");
    if (!businessId) return "";

    const business = await BusinessModel.findById(businessId)
      .select("userId")
      .lean();

    return String(business?.userId || "");
  }

  private async resolveCancellationActor(
    booking: any,
    actor: ActorContext,
  ): Promise<CancellationActor> {
    const userId = String(actor.userId);

    if (String(booking.userId) === userId && actor.role === UserRoleEnum.USER) {
      return {
        actorType: "RENTER",
        actorUserId: userId,
        actorRole: UserRoleEnum.USER,
      };
    }

    if (actor.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId,
        isDeleted: false,
      }).select("_id");

      const ownerMatches =
        business &&
        String(booking.ownerType || OwnerTypeEnum.BUSINESS) ===
          OwnerTypeEnum.BUSINESS &&
        [String(booking.ownerId || ""), String(booking.businessId || "")].includes(
          String(business._id),
        );

      if (ownerMatches) {
        return {
          actorType: "OWNER",
          actorUserId: userId,
          actorRole: UserRoleEnum.BUSINESS,
        };
      }
    }

    if (
      actor.role === UserRoleEnum.USER &&
      booking.ownerType === OwnerTypeEnum.USER &&
      String(booking.ownerId || "") === userId
    ) {
      return {
        actorType: "OWNER",
        actorUserId: userId,
        actorRole: UserRoleEnum.USER,
      };
    }

    throw ErrorHelper.permissionDeny();
  }

  private async getSuccessfulRentalPayments(bookingId: mongoose.Types.ObjectId) {
    return PaymentModel.find({
      bookingId,
      paymentType: { $in: RENTAL_PAYMENT_TYPES },
      status: { $in: [PaymentStatusEnum.PAID, PaymentStatusEnum.REFUNDED] },
    })
      .select("amount method status refundedAmount paidAt createdAt")
      .sort({ paidAt: 1, createdAt: 1 })
      .lean<PaidPayment[]>();
  }

  private calculateCancellationFee(
    booking: any,
    cancellationActor: CancellationActor,
    paidAmountAtCancellation: number,
  ) {
    const { policy, policySource } = resolvePolicy(booking);
    const hoursBeforeStart = getHoursBeforeStart(booking);
    const depositAmount = Math.max(Number(booking.depositAmount || 0), 0);
    const status = String(booking.status || "");

    if (paidAmountAtCancellation <= 0) {
      return {
        cancellationFee: 0,
        refundAmount: 0,
        policy,
        policySource,
        hoursBeforeStart,
        policyRuleApplied: "NO_PAID_AMOUNT",
      };
    }

    if (cancellationActor.actorType === "OWNER") {
      const refundAmount = Math.round(
        paidAmountAtCancellation * policy.ownerCancellationRefundRate,
      );

      return {
        cancellationFee: Math.max(paidAmountAtCancellation - refundAmount, 0),
        refundAmount,
        policy,
        policySource,
        hoursBeforeStart,
        policyRuleApplied: "OWNER_CANCEL_FULL_REFUND",
      };
    }

    if ([BookingStatusEnum.REQUESTED, BookingStatusEnum.PENDING].includes(status as BookingStatusEnum)) {
      return {
        cancellationFee: 0,
        refundAmount: paidAmountAtCancellation,
        policy,
        policySource,
        hoursBeforeStart,
        policyRuleApplied: "RENTER_CANCEL_BEFORE_OWNER_APPROVAL",
      };
    }

    if (hoursBeforeStart >= policy.fullRefundBeforeHours) {
      return {
        cancellationFee: 0,
        refundAmount: paidAmountAtCancellation,
        policy,
        policySource,
        hoursBeforeStart,
        policyRuleApplied: "FULL_REFUND_BEFORE_48_HOURS",
      };
    }

    if (hoursBeforeStart >= policy.partialRefundBeforeHours) {
      const refundAmount = Math.round(
        paidAmountAtCancellation * policy.partialRefundRate,
      );

      return {
        cancellationFee: Math.max(paidAmountAtCancellation - refundAmount, 0),
        refundAmount,
        policy,
        policySource,
        hoursBeforeStart,
        policyRuleApplied: "PARTIAL_REFUND_24_TO_48_HOURS",
      };
    }

    const cancellationFee = Math.min(
      paidAmountAtCancellation,
      depositAmount > 0 ? depositAmount : paidAmountAtCancellation,
    );

    return {
      cancellationFee,
      refundAmount: Math.max(paidAmountAtCancellation - cancellationFee, 0),
      policy,
      policySource,
      hoursBeforeStart,
      policyRuleApplied: "LATE_CANCEL_KEEP_DEPOSIT",
    };
  }

  async buildPreview(
    bookingId: string,
    actor: ActorContext,
    reasonCode?: string,
    reasonText?: string,
  ) {
    const booking = await BookingModel.findOne({
      _id: bookingId,
      isDeleted: false,
    } as any).lean<any>();

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    assertCanCancelByStatus(String(booking.status || ""));

    const cancellationActor = await this.resolveCancellationActor(booking, actor);
    const payments = await this.getSuccessfulRentalPayments(
      booking._id as mongoose.Types.ObjectId,
    );
    const totalPaid = payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );
    const totalRefunded = payments.reduce(
      (sum, payment) => sum + getPaymentRefundedAmount(payment),
      0,
    );
    const paidAmountAtCancellation = Math.max(totalPaid - totalRefunded, 0);
    const calculation = this.calculateCancellationFee(
      booking,
      cancellationActor,
      paidAmountAtCancellation,
    );
    const refundAmount = Math.min(
      Math.max(calculation.refundAmount, 0),
      paidAmountAtCancellation,
    );
    const cancellationFee = Math.min(
      Math.max(calculation.cancellationFee, 0),
      paidAmountAtCancellation,
    );
    const refundMethod = refundAmount > 0 ? getRefundMethod(payments) : RefundMethodEnum.NONE;

    return {
      bookingId: String(booking._id),
      bookingStatus: String(booking.status || ""),
      cancelledByRole: cancellationActor.actorRole,
      cancelledByType: cancellationActor.actorType,
      canCancel: true,
      startAt: booking.startDate,
      hoursBeforeStart: Math.max(0, Math.floor(calculation.hoursBeforeStart)),
      totalPrice: Number(booking.totalPrice || 0),
      depositAmount: Number(booking.depositAmount || 0),
      paidAmount: paidAmountAtCancellation,
      paidAmountAtCancellation,
      policyRuleApplied: calculation.policyRuleApplied,
      policySnapshot: calculation.policy,
      policySource: calculation.policySource,
      cancellationFee,
      refundAmount,
      refundRequired: refundAmount > 0,
      refundMethod,
      expectedRefundStatus:
        refundAmount > 0
          ? RefundStatusEnum.WAITING_FOR_REFUND_INFO
          : RefundStatusEnum.CANCELLED,
      reasonCode: normalizeReasonCode(reasonCode),
      reasonText: normalizeReasonText(reasonText),
      paymentIds: payments.map((payment) => payment._id),
      message:
        refundAmount > 0
          ? `Booking có thể hủy. Số tiền dự kiến hoàn là ${refundAmount.toLocaleString("vi-VN")}đ và cần xử lý hoàn tiền thủ công.`
          : "Booking có thể hủy và không phát sinh hoàn tiền.",
    };
  }

  async cancelBooking(
    bookingId: string,
    actor: ActorContext,
    reasonCode?: string,
    reasonText?: string,
  ) {
    const preview = await this.buildPreview(
      bookingId,
      actor,
      reasonCode,
      reasonText,
    );
    const now = new Date();
    const idempotencyKey = `refund:${bookingId}:cancel`;

    const booking = await BookingModel.findOneAndUpdate(
      {
        _id: bookingId,
        status: preview.bookingStatus,
        isDeleted: false,
      } as any,
      {
        $set: {
          status: BookingStatusEnum.CANCELLED,
          cancelReason:
            preview.reasonText ||
            (preview.cancelledByType === "OWNER"
              ? "Chủ xe hủy booking"
              : "Khách hàng hủy booking"),
          cancelledAt: now,
          cancelledBy: toObjectId(actor.userId),
          cancelledByRole: actor.role,
          cancelReasonCode: preview.reasonCode,
          cancelReasonText: preview.reasonText,
          cancellationSummary: {
            paidAmountAtCancellation: preview.paidAmountAtCancellation,
            cancellationFee: preview.cancellationFee,
            refundAmount: preview.refundAmount,
            policyRuleApplied: preview.policyRuleApplied,
            refundRequired: preview.refundRequired,
          },
        },
      },
      { new: true },
    );

    if (!booking) {
      throw ErrorHelper.requestDataInvalid("BOOKING_CANNOT_BE_CANCELLED");
    }

    let refund = null;

    if (preview.refundAmount > 0) {
      const refundPayload: any = {
        bookingId: booking._id,
        requestedBy: toObjectId(actor.userId),
        requestedByRole: actor.role,
        cancelledBy: toObjectId(actor.userId),
        cancelledByRole: actor.role,
        reasonCode: preview.reasonCode,
        reasonText: preview.reasonText,
        paidAmountAtCancellation: preview.paidAmountAtCancellation,
        cancellationFee: preview.cancellationFee,
        refundAmount: preview.refundAmount,
        policySnapshot: preview.policySnapshot,
        policyRuleApplied: preview.policyRuleApplied,
        policySource: preview.policySource,
        method: preview.refundMethod,
        status: RefundStatusEnum.WAITING_FOR_REFUND_INFO,
        paymentIds: preview.paymentIds,
        idempotencyKey,
        requestedAt: now,
      };

      if (
        preview.refundMethod === RefundMethodEnum.VNPAY ||
        preview.refundMethod === RefundMethodEnum.MOMO
      ) {
        refundPayload.provider = preview.refundMethod;
      }

      refund =
        (await RefundModel.findOne({ idempotencyKey, isDeleted: false })) ||
        (await RefundModel.create(refundPayload));

      booking.cancellationSummary = {
        paidAmountAtCancellation: preview.paidAmountAtCancellation,
        cancellationFee: preview.cancellationFee,
        refundAmount: preview.refundAmount,
        policyRuleApplied: preview.policyRuleApplied,
        refundRequired: preview.refundRequired,
        refundId: refund._id,
      };
      await booking.save();
    }

    await syncContractFromBooking(booking);

    return { booking, refund, preview };
  }

  async createManualRefundForCancelledPaidPayment(booking: any, payment: any) {
    if (String(booking.status || "") !== BookingStatusEnum.CANCELLED) return null;
    if (!RENTAL_PAYMENT_TYPES.includes(payment.paymentType as PaymentTypeEnum)) return null;
    if (String(payment.status || "") !== PaymentStatusEnum.PAID) return null;

    const paymentAmount = Number(payment.amount || 0);
    const refundedAmount = Number(payment.refundedAmount || 0);
    const refundAmount = Math.max(paymentAmount - refundedAmount, 0);

    if (refundAmount <= 0) return null;

    const idempotencyKey = `refund:${String(booking._id)}:late-payment:${String(payment._id)}`;
    const existedRefund = await RefundModel.findOne({ idempotencyKey, isDeleted: false });
    if (existedRefund) return existedRefund;

    const ownerUserId = await this.getOwnerUserIdFromBooking(booking);
    const method =
      payment.method === PaymentMethodEnum.VNPAY
        ? RefundMethodEnum.VNPAY
        : payment.method === PaymentMethodEnum.MOMO
          ? RefundMethodEnum.MOMO
          : payment.method === PaymentMethodEnum.CASH
            ? RefundMethodEnum.CASH
            : RefundMethodEnum.MANUAL;

    const lateRefundPayload: any = {
      bookingId: booking._id,
      requestedBy: booking.userId,
      requestedByRole: UserRoleEnum.USER,
      cancelledBy: booking.cancelledBy || booking.userId,
      cancelledByRole: booking.cancelledByRole || UserRoleEnum.USER,
      reasonCode: "PAYMENT_AFTER_BOOKING_CANCELLED",
      reasonText: "Thanh toán thành công sau khi booking đã bị hủy.",
      paidAmountAtCancellation: refundAmount,
      cancellationFee: 0,
      refundAmount,
      policySnapshot: booking.cancellationPolicySnapshot || DEFAULT_CANCELLATION_POLICY,
      policyRuleApplied: "PAYMENT_AFTER_CANCEL_FULL_REFUND",
      policySource: booking.cancellationPolicySnapshot
        ? "BOOKING_SNAPSHOT"
        : "DEFAULT_FALLBACK",
      method,
      status: RefundStatusEnum.WAITING_FOR_REFUND_INFO,
      paymentIds: [payment._id],
      idempotencyKey,
      requestedAt: new Date(),
    };
    if (method === RefundMethodEnum.VNPAY || method === RefundMethodEnum.MOMO) {
      lateRefundPayload.provider = method;
    }
    if (ownerUserId) {
      lateRefundPayload.manualRefundNote =
        "Chủ xe cần xử lý hoàn khoản tiền phát sinh sau khi booking đã hủy.";
    }
    const refund = await RefundModel.create(lateRefundPayload);
    /*
        ? "Chủ xe cần xử lý hoàn khoản tiền phát sinh sau khi booking đã hủy."
        : undefined,
    });
    */

    await BookingModel.updateOne(
      { _id: booking._id },
      {
        $set: {
          "cancellationSummary.refundRequired": true,
          "cancellationSummary.refundId": refund._id,
        },
      },
    );

    return refund;
  }

  async submitRecipientInfo(
    refundId: string,
    actor: ActorContext,
    payload: unknown,
  ) {
    const refund = await RefundModel.findOne({
      _id: refundId,
      isDeleted: false,
    });

    if (!refund) {
      throw ErrorHelper.recordNotFound("Refund");
    }

    if (Number(refund.refundAmount || 0) <= 0) {
      throw ErrorHelper.requestDataInvalid("REFUND_RECIPIENT_INFO_INVALID");
    }

    const booking = await BookingModel.findById(refund.bookingId).lean();
    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    if (
      String((booking as { userId?: unknown }).userId || "") !==
        String(actor.userId) ||
      actor.role !== UserRoleEnum.USER
    ) {
      throw ErrorHelper.forbidden("REFUND_RECIPIENT_INFO_FORBIDDEN");
    }

    if (
      [
        RefundStatusEnum.PROCESSING,
        RefundStatusEnum.SUCCEEDED,
        RefundStatusEnum.CANCELLED,
        RefundStatusEnum.FAILED,
      ].includes(refund.status)
    ) {
      throwConflict(
        "REFUND_NOT_WAITING_FOR_RECIPIENT_INFO",
        "Hồ sơ hoàn tiền không còn chờ thông tin nhận tiền.",
      );
    }

    if (
      refund.status === RefundStatusEnum.MANUAL_REQUIRED &&
      hasRecipientInfo(refund.recipientInfo)
    ) {
      throwConflict(
        "REFUND_RECIPIENT_INFO_ALREADY_SUBMITTED",
        "Bạn đã cung cấp thông tin nhận tiền hoàn.",
      );
    }

    if (
      ![
        RefundStatusEnum.WAITING_FOR_REFUND_INFO,
        RefundStatusEnum.MANUAL_REQUIRED,
      ].includes(refund.status)
    ) {
      throwConflict(
        "REFUND_NOT_WAITING_FOR_RECIPIENT_INFO",
        "Hồ sơ hoàn tiền không còn chờ thông tin nhận tiền.",
      );
    }

    refund.recipientInfo = normalizeRecipientInfoPayload(payload, actor.userId);
    refund.status = RefundStatusEnum.MANUAL_REQUIRED;
    await refund.save();

    return refund;
  }

  async markManualRefundSent(refundId: string, actor: ActorContext, payload: any) {
    const refund = await RefundModel.findOne({
      _id: refundId,
      status: RefundStatusEnum.MANUAL_REQUIRED,
      isDeleted: false,
    });

    if (!refund) {
      throw ErrorHelper.recordNotFound("Refund");
    }

    const booking = await BookingModel.findById(refund.bookingId).lean<any>();
    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    const cancellationActor = await this.resolveCancellationActor(booking, actor);
    if (cancellationActor.actorType !== "OWNER") {
      throw ErrorHelper.permissionDeny();
    }

    if (Number(refund.refundAmount || 0) <= 0) {
      throw ErrorHelper.requestDataInvalid("REFUND_AMOUNT_INVALID");
    }

    if (!hasRecipientInfo(refund.recipientInfo)) {
      throw ErrorHelper.requestDataInvalid("REFUND_RECIPIENT_INFO_REQUIRED");
    }

    refund.status = RefundStatusEnum.PROCESSING;
    refund.processingAt = new Date();
    refund.manualRefundMethod = normalizeReasonText(payload.manualRefundMethod);
    refund.manualRefundReference = normalizeReasonText(payload.manualRefundReference);
    refund.manualRefundNote = normalizeReasonText(payload.manualRefundNote);
    refund.manualRefundEvidence = Array.isArray(payload.manualRefundEvidence)
      ? payload.manualRefundEvidence
          .filter((item: unknown) => typeof item === "string" && item.trim())
          .map((item: string) => item.trim())
          .slice(0, 5)
      : [];
    refund.manualRefundSentAt = new Date();
    await refund.save();

    return refund;
  }

  async confirmRefundReceived(refundId: string, actor: ActorContext) {
    const refund = await RefundModel.findOne({
      _id: refundId,
      status: RefundStatusEnum.PROCESSING,
      isDeleted: false,
    });

    if (!refund) {
      throw ErrorHelper.recordNotFound("Refund");
    }

    const booking = await BookingModel.findById(refund.bookingId).lean<any>();
    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    if (String(booking.userId || "") !== String(actor.userId) || actor.role !== UserRoleEnum.USER) {
      throw ErrorHelper.permissionDeny();
    }

    await this.applySucceededRefundToPayments(refund);

    refund.status = RefundStatusEnum.SUCCEEDED;
    refund.renterConfirmedAt = new Date();
    refund.succeededAt = new Date();
    await refund.save();

    return refund;
  }

  private async applySucceededRefundToPayments(refund: { paymentIds: mongoose.Types.ObjectId[]; refundAmount: number }) {
    let remainingRefund = Number(refund.refundAmount || 0);

    const payments = await PaymentModel.find({
      _id: { $in: refund.paymentIds || [] },
      paymentType: { $in: RENTAL_PAYMENT_TYPES },
      status: { $in: [PaymentStatusEnum.PAID, PaymentStatusEnum.REFUNDED] },
    }).sort({ paidAt: -1, createdAt: -1 });

    for (const payment of payments) {
      if (remainingRefund <= 0) break;

      const amount = Number(payment.amount || 0);
      const alreadyRefunded = getPaymentRefundedAmount(payment as unknown as PaidPayment);
      const refundable = Math.max(amount - alreadyRefunded, 0);
      const applied = Math.min(refundable, remainingRefund);

      if (applied <= 0) continue;

      payment.refundedAmount = alreadyRefunded + applied;
      payment.refundStatus =
        payment.refundedAmount >= amount ? "REFUNDED" : "PARTIALLY_REFUNDED";

      if (payment.refundedAmount >= amount) {
        payment.status = PaymentStatusEnum.REFUNDED;
      }

      await payment.save();
      remainingRefund -= applied;
    }

    if (remainingRefund > 0) {
      throw ErrorHelper.requestDataInvalid("REFUND_AMOUNT_INVALID");
    }
  }

  async userCanSeeRefund(refund: any, actor: ActorContext) {
    const booking =
      typeof refund.bookingId === "object" && refund.bookingId
        ? refund.bookingId
        : await BookingModel.findById(refund.bookingId).lean<any>();
    if (!booking) return false;

    if (String(booking.userId || "") === String(actor.userId) && actor.role === UserRoleEnum.USER) {
      return true;
    }

    try {
      const cancellationActor = await this.resolveCancellationActor(booking, actor);
      return cancellationActor.actorType === "OWNER";
    } catch {
      return false;
    }
  }

  async userCanProcessManualRefund(refund: any, actor: ActorContext) {
    const booking =
      typeof refund.bookingId === "object" && refund.bookingId
        ? refund.bookingId
        : await BookingModel.findById(refund.bookingId).lean<any>();
    if (!booking) return false;

    try {
      const cancellationActor = await this.resolveCancellationActor(booking, actor);
      return cancellationActor.actorType === "OWNER";
    } catch {
      return false;
    }
  }
}

export const cancellationRefundService = new CancellationRefundService();
