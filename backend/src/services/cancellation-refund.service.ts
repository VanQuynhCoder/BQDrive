import mongoose from "mongoose";
import {
  createVnpayRefund,
  queryVnpayTransaction,
} from "../helper/vnpay.helper";
import { BaseError, ErrorHelper } from "../base/error";
import {
  BookingStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  RefundMethodEnum,
  RefundStatusEnum,
  UserRoleEnum,
} from "../constants/model.const";
import {
  syncContractFromBooking,
  syncPaymentRefundStatus,
} from "../helper/payment-sync.helper";
import { transitionRefundStatus } from "../helper/status.helper";
import { BookingModel } from "../models/booking/booking.model";
import { PaymentModel } from "../models/payment/payment.model";
import {
  RefundModel,
  type RefundRecipientInfo,
  type RefundRecipientMethod,
} from "../models/refund/refund.model";

export const DEFAULT_CANCELLATION_POLICY = {
  freeCancellationMinutes: 60,
  lateCancellationRule: "KEEP_RENTAL_DEPOSIT_AND_PLATFORM_FEE",
  ownerCancellationRefundRate: 1,
};
const CANCELLABLE_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED,
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
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

  gatewayOrderId?: string;
  gatewayTransactionId?: string;
  gatewayTransactionDate?: string;
  gatewayPayDate?: string;

  paidAt?: Date;
  createdAt?: Date;
};
type RefundPaymentAllocation = {
  payment: PaidPayment;
  paymentAmount: number;
  alreadyRefunded: number;
  refundableAmount: number;
  refundAmount: number;
  isFullRefund: boolean;
};
type VnpayRefundOperationPlan = {
  paymentId: mongoose.Types.ObjectId;
  provider: "VNPAY";

  refundAmount: number;
  refundedAmountBefore: number;
  transactionType: "02" | "03";

  originalOrderId: string;
  originalTransactionId?: string;
  originalTransactionDate: string;

  requestId: string;

  status: "PENDING";
  retryCount: number;
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
  return String(value || "")
    .trim()
    .slice(0, 500);
}

function normalizeReasonCode(value: unknown) {
  const reasonCode = String(value || "CUSTOMER_REQUEST")
    .trim()
    .toUpperCase();
  return /^[A-Z0-9_]{2,80}$/.test(reasonCode) ? reasonCode : "CUSTOMER_REQUEST";
}

function throwConflict(code: string, message: string) {
  throw new BaseError(409, code, message, code);
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
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
  const method = String(data.method || "")
    .trim()
    .toUpperCase() as RefundRecipientMethod;
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

    if (
      forbiddenPattern.test(`${bankName} ${accountNumber} ${accountHolderName}`)
    ) {
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

    if (
      forbiddenPattern.test(
        `${walletProvider} ${walletAccount} ${walletHolderName}`,
      )
    ) {
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
    | Partial<typeof DEFAULT_CANCELLATION_POLICY>
    | undefined;

  // Chỉ coi là policy V2 khi booking đã có mốc hủy miễn phí theo phút.
  if (snapshot && Number.isFinite(snapshot.freeCancellationMinutes)) {
    return {
      policy: {
        freeCancellationMinutes: Math.max(
          Number(snapshot.freeCancellationMinutes),
          0,
        ),
        lateCancellationRule:
          String(snapshot.lateCancellationRule || "").trim() ||
          DEFAULT_CANCELLATION_POLICY.lateCancellationRule,
        ownerCancellationRefundRate: Math.min(
          Math.max(
            Number(
              snapshot.ownerCancellationRefundRate ??
                DEFAULT_CANCELLATION_POLICY.ownerCancellationRefundRate,
            ),
            0,
          ),
          1,
        ),
      },
      policySource: "BOOKING_SNAPSHOT",
    };
  }

  // Booking cũ có snapshot 48h/24h sẽ dùng policy V2 hiện hành.
  return {
    policy: { ...DEFAULT_CANCELLATION_POLICY },
    policySource: "DEFAULT_FALLBACK",
  };
}
function getHoursBeforeStart(booking: any) {
  const startDate = new Date(String(booking.startDate || ""));
  if (Number.isNaN(startDate.getTime())) return 0;

  return (startDate.getTime() - Date.now()) / 36e5;
}
function getFirstSuccessfulPaymentAt(payments: PaidPayment[]) {
  // Ưu tiên paidAt vì đây là thời điểm giao dịch thực sự thanh toán thành công.
  const paidAtDates = payments
    .map((payment) => payment.paidAt)
    .filter(Boolean)
    .map((value) => new Date(value as Date))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (paidAtDates.length > 0) {
    return paidAtDates[0];
  }

  // Fallback cho dữ liệu cũ chưa có paidAt.
  const createdAtDates = payments
    .map((payment) => payment.createdAt)
    .filter(Boolean)
    .map((value) => new Date(value as Date))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return createdAtDates[0] || null;
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
  return Number(payment.refundedAmount || 0);
}
function getPaymentSortTime(payment: PaidPayment) {
  const value = payment.paidAt || payment.createdAt;

  if (!value) return 0;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function buildRefundAllocation(payments: PaidPayment[], refundAmount: number) {
  let remainingRefund = Math.max(Number(refundAmount || 0), 0);

  const allocations: RefundPaymentAllocation[] = [];

  // Giữ cùng nguyên tắc hiện tại:
  // ưu tiên hoàn từ giao dịch thanh toán gần nhất trước.
  const sortedPayments = [...payments].sort(
    (a, b) => getPaymentSortTime(b) - getPaymentSortTime(a),
  );

  for (const payment of sortedPayments) {
    if (remainingRefund <= 0) break;

    const paymentAmount = Math.max(Number(payment.amount || 0), 0);

    const alreadyRefunded = Math.min(
      Math.max(getPaymentRefundedAmount(payment), 0),
      paymentAmount,
    );

    const refundableAmount = Math.max(paymentAmount - alreadyRefunded, 0);

    const appliedRefund = Math.min(refundableAmount, remainingRefund);

    if (appliedRefund <= 0) continue;

    allocations.push({
      payment,
      paymentAmount,
      alreadyRefunded,
      refundableAmount,
      refundAmount: appliedRefund,
      // VNPay chỉ coi là hoàn toàn phần khi đây là lần hoàn đầu tiên
      // và số tiền hoàn bằng toàn bộ giá trị giao dịch gốc.
      isFullRefund: alreadyRefunded === 0 && appliedRefund === paymentAmount,
    });

    remainingRefund -= appliedRefund;
  }

  return {
    allocations,
    allocatedAmount: Math.max(Number(refundAmount || 0), 0) - remainingRefund,
    remainingRefund,
  };
}
function buildVnpayRefundRequestId(
  refundId: mongoose.Types.ObjectId | string,
  operationIndex: number,
) {
  const normalizedRefundId = String(refundId)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-28);

  const indexPart = operationIndex.toString(36).toUpperCase();

  return `R${normalizedRefundId}${indexPart}`;
}
function buildVnpayRefundOperations(
  refundId: mongoose.Types.ObjectId | string,
  allocations: RefundPaymentAllocation[],
) {
  if (allocations.length === 0) {
    return {
      eligible: false as const,
      reason: "NO_REFUND_ALLOCATION",
      operations: [] as VnpayRefundOperationPlan[],
    };
  }

  const operations: VnpayRefundOperationPlan[] = [];

  for (const [index, allocation] of allocations.entries()) {
    const payment = allocation.payment;

    // Không auto-refund một phần rồi bắt phần còn lại xử lý thủ công.
    // Nếu Refund chứa phương thức khác VNPay thì fallback toàn bộ.
    if (payment.method !== PaymentMethodEnum.VNPAY) {
      return {
        eligible: false as const,
        reason: "REFUND_HAS_NON_VNPAY_PAYMENT",
        operations: [] as VnpayRefundOperationPlan[],
      };
    }

    const originalOrderId = String(payment.gatewayOrderId || "").trim();

    const originalTransactionId = String(
      payment.gatewayTransactionId || "",
    ).trim();

    const originalTransactionDate = String(
      payment.gatewayTransactionDate || "",
    ).trim();

    // Booking/giao dịch VNPay cũ có thể chưa lưu metadata mới.
    // Trường hợp đó không được đoán dữ liệu để gọi hoàn tiền.
    if (!originalOrderId || !originalTransactionDate) {
      return {
        eligible: false as const,
        reason: "VNPAY_ORIGINAL_TRANSACTION_METADATA_MISSING",
        operations: [] as VnpayRefundOperationPlan[],
      };
    }

    const operation: VnpayRefundOperationPlan = {
      paymentId: payment._id,
      provider: "VNPAY",

      refundAmount: allocation.refundAmount,
      refundedAmountBefore: allocation.alreadyRefunded,

      transactionType: allocation.isFullRefund ? "02" : "03",

      originalOrderId,
      originalTransactionDate,

      requestId: buildVnpayRefundRequestId(refundId, index),

      status: "PENDING",
      retryCount: 0,
    };

    // vnp_TransactionNo là tùy chọn.
    // Chỉ lưu khi giao dịch gốc thực sự có giá trị.
    if (originalTransactionId) {
      operation.originalTransactionId = originalTransactionId;
    }

    operations.push(operation);
  }

  return {
    eligible: true as const,
    reason: null,
    operations,
  };
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
    return String(booking.ownerId || "");
  }

  private async resolveCancellationActor(
    booking: any,
    actor: ActorContext,
  ): Promise<CancellationActor> {
    const userId = String(actor.userId);

    if (
      actor.role === UserRoleEnum.USER &&
      String(booking.userId || "") === userId
    ) {
      return {
        actorType: "RENTER",
        actorUserId: userId,
        actorRole: UserRoleEnum.USER,
      };
    }

    if (
      actor.role === UserRoleEnum.USER &&
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
  private async getSuccessfulRentalPayments(
    bookingId: mongoose.Types.ObjectId,
  ) {
    return PaymentModel.find({
      bookingId,
      paymentType: { $in: RENTAL_PAYMENT_TYPES },
      status: PaymentStatusEnum.PAID,
    })
      .select(
        "amount method status refundedAmount gatewayOrderId gatewayTransactionId gatewayTransactionDate gatewayPayDate paidAt createdAt",
      )
      .sort({ paidAt: 1, createdAt: 1 })
      .lean<PaidPayment[]>();
  }

  private calculateCancellationFee(
    booking: any,
    cancellationActor: CancellationActor,
    paidAmountAtCancellation: number,
    payments: PaidPayment[],
  ) {
    const { policy, policySource } = resolvePolicy(booking);
    const hoursBeforeStart = getHoursBeforeStart(booking);

    const pricingSnapshot = booking.pricingSnapshot || {};

    // Cọc thuê thật chỉ là 50% tiền thuê, không phải toàn bộ khoản giữ chỗ.
    const rentalSubtotal = Math.max(
      Number(pricingSnapshot.rentalSubtotal ?? pricingSnapshot.subtotal ?? 0),
      0,
    );
    const rentalDepositRate = Math.max(
      Number(pricingSnapshot.rentalDepositRate ?? 0.5),
      0,
    );
    const rentalDepositAmount = Math.max(
      Number(
        pricingSnapshot.rentalDepositAmount ??
          Math.round(rentalSubtotal * rentalDepositRate),
      ),
      0,
    );

    const platformFee = Math.max(Number(pricingSnapshot.platformFee || 0), 0);

    const firstPaidAt = getFirstSuccessfulPaymentAt(payments);

    const minutesSinceFirstPayment = firstPaidAt
      ? Math.max((Date.now() - firstPaidAt.getTime()) / (60 * 1000), 0)
      : null;

    const baseResult = {
      policy,
      policySource,
      hoursBeforeStart,
      firstPaidAt,
      minutesSinceFirstPayment,
      freeCancellationMinutes: policy.freeCancellationMinutes,
      rentalDepositAmount,
      platformFee,
    };

    // Chưa có tiền thanh toán thì khách có thể hủy tự do.
    if (paidAmountAtCancellation <= 0) {
      return {
        ...baseResult,
        cancellationFee: 0,
        refundAmount: 0,
        policyRuleApplied: "NO_PAID_AMOUNT",
      };
    }

    // Chủ xe hủy thì khách luôn được hoàn toàn bộ số tiền thực tế đã thanh toán.
    if (cancellationActor.actorType === "OWNER") {
      return {
        ...baseResult,
        cancellationFee: 0,
        refundAmount: paidAmountAtCancellation,
        policyRuleApplied: "OWNER_CANCEL_FULL_REFUND",
      };
    }

    // Khách được quyền đổi ý trong vòng 60 phút kể từ lần thanh toán
    // thành công đầu tiên và được hoàn toàn bộ số tiền đã trả.
    if (
      minutesSinceFirstPayment !== null &&
      minutesSinceFirstPayment <= policy.freeCancellationMinutes
    ) {
      return {
        ...baseResult,
        cancellationFee: 0,
        refundAmount: paidAmountAtCancellation,
        policyRuleApplied: "RENTER_CANCEL_WITHIN_60_MINUTES",
      };
    }

    // Sau thời gian miễn phí:
    // - giữ cọc thuê thật;
    // - giữ phí dịch vụ BQDrive;
    // - phần còn lại được hoàn.
    const retainedAmount = rentalDepositAmount + platformFee;

    const cancellationFee = Math.min(paidAmountAtCancellation, retainedAmount);

    return {
      ...baseResult,
      cancellationFee,
      refundAmount: Math.max(paidAmountAtCancellation - cancellationFee, 0),
      policyRuleApplied:
        "RENTER_CANCEL_AFTER_60_MINUTES_KEEP_DEPOSIT_AND_PLATFORM_FEE",
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

    const cancellationActor = await this.resolveCancellationActor(
      booking,
      actor,
    );
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
      payments,
    );
    const refundAmount = Math.min(
      Math.max(calculation.refundAmount, 0),
      paidAmountAtCancellation,
    );
    const cancellationFee = Math.min(
      Math.max(calculation.cancellationFee, 0),
      paidAmountAtCancellation,
    );
    const refundMethod =
      refundAmount > 0 ? getRefundMethod(payments) : RefundMethodEnum.NONE;

    return {
      bookingId: String(booking._id),
      bookingStatus: String(booking.status || ""),
      cancelledByRole: cancellationActor.actorRole,
      cancelledByType: cancellationActor.actorType,
      canCancel: true,
      startAt: booking.startDate,
      hoursBeforeStart: Math.max(0, Math.floor(calculation.hoursBeforeStart)),
      totalPrice: Number(booking.totalPrice || 0),
      upfrontPaymentAmount: Number(booking.upfrontPaymentAmount || 0),
      paidAmount: paidAmountAtCancellation,
      paidAmountAtCancellation,
      firstPaidAt: calculation.firstPaidAt,
      minutesSinceFirstPayment:
        calculation.minutesSinceFirstPayment === null
          ? null
          : Math.max(0, Math.floor(calculation.minutesSinceFirstPayment)),
      freeCancellationMinutes: calculation.freeCancellationMinutes,

      rentalDepositAmount: calculation.rentalDepositAmount,

      platformFee: calculation.platformFee,
      policyRuleApplied: calculation.policyRuleApplied,
      policySnapshot: calculation.policy,
      policySource: calculation.policySource,
      cancellationFee,
      refundAmount,
      refundRequired: refundAmount > 0,
      refundMethod,
      expectedRefundStatus:
        refundAmount > 0 ? RefundStatusEnum.WAITING_FOR_REFUND_INFO : "NONE",
      reasonCode: normalizeReasonCode(reasonCode),
      reasonText: normalizeReasonText(reasonText),
      paymentIds: payments.map((payment) => payment._id),
    message:
  refundAmount > 0
    ? refundMethod === RefundMethodEnum.VNPAY
     ? `Booking có thể hủy. Số tiền dự kiến hoàn là ${refundAmount.toLocaleString("vi-VN")}đ. Hệ thống sẽ ưu tiên hoàn tiền tự động qua VNPay sau khi xác nhận hủy; nếu giao dịch không đủ thông tin để hoàn tự động, hệ thống sẽ chuyển sang quy trình hoàn tiền thủ công.`
      : `Booking có thể hủy. Số tiền dự kiến hoàn là ${refundAmount.toLocaleString("vi-VN")}đ và sẽ được xử lý theo phương thức hoàn tiền tương ứng.`
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

  async ensureNoShowRefund(
    booking: any,
    ownerUserId: string,
    options?: {
      retainDeliveryFee?: boolean;
    },
  ) {
    if (String(booking.status || "") !== BookingStatusEnum.NO_SHOW) {
      throw ErrorHelper.requestDataInvalid("BOOKING_NOT_NO_SHOW");
    }

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

    // Chỉ xử lý phần tiền thực tế khách đã thanh toán
    // nhưng chưa được hoàn trước đó.
    const paidAmountAtNoShow = Math.max(totalPaid - totalRefunded, 0);

    const pricingSnapshot = booking.pricingSnapshot || {};

    // Cọc thuê thật được lấy từ snapshot hoặc tính lại từ tiền thuê snapshot.
    const rentalSubtotal = Math.max(
      Number(pricingSnapshot.rentalSubtotal ?? pricingSnapshot.subtotal ?? 0),
      0,
    );
    const rentalDepositRate = Math.max(
      Number(pricingSnapshot.rentalDepositRate ?? 0.5),
      0,
    );
    const rentalDepositAmount = Math.max(
      Number(
        pricingSnapshot.rentalDepositAmount ??
          Math.round(rentalSubtotal * rentalDepositRate),
      ),
      0,
    );

    const platformFee = Math.max(Number(pricingSnapshot.platformFee || 0), 0);

    const deliveryFee = Math.max(Number(pricingSnapshot.deliveryFee || 0), 0);

    // Phí giao xe chỉ được giữ nếu việc giao xe thực tế
    // đã phát sinh trước khi xác nhận khách không đến.
    const retainedDeliveryFee =
      options?.retainDeliveryFee === true ? deliveryFee : 0;

    const retainedAmount =
      rentalDepositAmount + platformFee + retainedDeliveryFee;

    const cancellationFee = Math.min(paidAmountAtNoShow, retainedAmount);

    const refundAmount = Math.max(paidAmountAtNoShow - cancellationFee, 0);

    const resolvedPolicy = resolvePolicy(booking);

    const idempotencyKey = `refund:${String(booking._id)}:no-show`;

    let refund = null;

    if (refundAmount > 0) {
      const refundMethod = getRefundMethod(payments);

      const refundPayload: any = {
        bookingId: booking._id,

        // Tiền hoàn thuộc về khách thuê.
        requestedBy: booking.userId,
        requestedByRole: UserRoleEnum.USER,

        // NO_SHOW được chủ xe xác nhận.
        cancelledBy: toObjectId(ownerUserId),
        cancelledByRole: UserRoleEnum.USER,

        reasonCode: "RENTER_NO_SHOW",
        reasonText: "Khách không đến nhận xe sau thời gian chờ.",

        paidAmountAtCancellation: paidAmountAtNoShow,

        cancellationFee,
        refundAmount,

        policySnapshot: resolvedPolicy.policy,
        policyRuleApplied: "NO_SHOW_KEEP_DEPOSIT_AND_PLATFORM_FEE",
        policySource: resolvedPolicy.policySource,

        method: refundMethod,
        status: RefundStatusEnum.WAITING_FOR_REFUND_INFO,

        paymentIds: payments.map((payment) => payment._id),

        idempotencyKey,
        requestedAt: new Date(),
      };

      if (
        refundMethod === RefundMethodEnum.VNPAY ||
        refundMethod === RefundMethodEnum.MOMO
      ) {
        refundPayload.provider = refundMethod;
      }

      // Chống tạo trùng Refund khi request bị gửi lại.
      refund =
        (await RefundModel.findOne({
          idempotencyKey,
          isDeleted: false,
        })) || (await RefundModel.create(refundPayload));
    }

    const cancellationSummary = {
      paidAmountAtCancellation: paidAmountAtNoShow,
      cancellationFee,
      refundAmount,
      policyRuleApplied: "NO_SHOW_KEEP_DEPOSIT_AND_PLATFORM_FEE",
      refundRequired: refundAmount > 0,
      ...(refund ? { refundId: refund._id } : {}),
    };

    await BookingModel.updateOne(
      {
        _id: booking._id,
        status: BookingStatusEnum.NO_SHOW,
      },
      {
        $set: {
          cancellationSummary,
        },
      },
    );

    return {
      refund,
      paidAmountAtNoShow,
      cancellationFee,
      refundAmount,

      rentalDepositAmount,
      platformFee,
      deliveryFee,
      retainedDeliveryFee,

      policyRuleApplied: "NO_SHOW_KEEP_DEPOSIT_AND_PLATFORM_FEE",
    };
  }
  async createManualRefundForCancelledPaidPayment(booking: any, payment: any) {
    if (String(booking.status || "") !== BookingStatusEnum.CANCELLED)
      return null;
    if (!RENTAL_PAYMENT_TYPES.includes(payment.paymentType as PaymentTypeEnum))
      return null;
    if (String(payment.status || "") !== PaymentStatusEnum.PAID) return null;

    const paymentAmount = Number(payment.amount || 0);
    const refundedAmount = Number(payment.refundedAmount || 0);
    const refundAmount = Math.max(paymentAmount - refundedAmount, 0);

    if (refundAmount <= 0) return null;

    const idempotencyKey = `refund:${String(booking._id)}:late-payment:${String(payment._id)}`;
    const existedRefund = await RefundModel.findOne({
      idempotencyKey,
      isDeleted: false,
    });
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
      policySnapshot: resolvePolicy(booking).policy,
      policyRuleApplied: "PAYMENT_AFTER_CANCEL_FULL_REFUND",
      policySource: resolvePolicy(booking).policySource,
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
      [RefundStatusEnum.PROCESSING, RefundStatusEnum.SUCCEEDED].includes(
        refund.status,
      )
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
    transitionRefundStatus(refund, RefundStatusEnum.MANUAL_REQUIRED);
    await refund.save();

    return refund;
  }

  async markManualRefundSent(
    refundId: string,
    actor: ActorContext,
    payload: any,
  ) {
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

    const cancellationActor = await this.resolveCancellationActor(
      booking,
      actor,
    );
    if (cancellationActor.actorType !== "OWNER") {
      throw ErrorHelper.permissionDeny();
    }

    if (Number(refund.refundAmount || 0) <= 0) {
      throw ErrorHelper.requestDataInvalid("REFUND_AMOUNT_INVALID");
    }

    if (!hasRecipientInfo(refund.recipientInfo)) {
      throw ErrorHelper.requestDataInvalid("REFUND_RECIPIENT_INFO_REQUIRED");
    }

    transitionRefundStatus(refund, RefundStatusEnum.PROCESSING);
    refund.processingAt = new Date();
    refund.manualRefundMethod = normalizeReasonText(payload.manualRefundMethod);
    refund.manualRefundReference = normalizeReasonText(
      payload.manualRefundReference,
    );
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

    if (
      String(booking.userId || "") !== String(actor.userId) ||
      actor.role !== UserRoleEnum.USER
    ) {
      throw ErrorHelper.permissionDeny();
    }

    await this.applySucceededRefundToPayments(refund);

    // Sau khi cập nhật refundedAmount của Payment,
    // đồng bộ lại Booking và Contract.
    await this.syncBookingAfterRefund(refund.bookingId);

    transitionRefundStatus(refund, RefundStatusEnum.SUCCEEDED);

    refund.renterConfirmedAt = new Date();
    refund.succeededAt = new Date();

    await refund.save();

    return refund;
  }
async processAutomaticVnpayRefund(
  refundId: string,
  ipAddr: string,
  options?: {
    queryOnly?: boolean;
  },
) {
    const refund = await RefundModel.findOne({
      _id: refundId,
      isDeleted: false,
    });

    if (!refund) {
      throw ErrorHelper.recordNotFound("Refund");
    }

    // Không có tiền cần hoàn thì không cần gọi gateway.
    if (Number(refund.refundAmount || 0) <= 0) {
      return {
        eligible: false as const,
        reason: "REFUND_AMOUNT_NOT_POSITIVE",
        refund,
      };
    }

    // Checkpoint này chỉ xử lý VNPay.
    if (refund.method !== RefundMethodEnum.VNPAY) {
      return {
        eligible: false as const,
        reason: "REFUND_METHOD_NOT_VNPAY",
        refund,
      };
    }

    // Refund đã hoàn tất thì coi như idempotent success.
    if (refund.status === RefundStatusEnum.SUCCEEDED) {
      return {
        eligible: true as const,
        completed: true,
        refund,
      };
    }

    const hasProviderOperations =
      Array.isArray(refund.providerOperations) &&
      refund.providerOperations.length > 0;

    /*
     * PROCESSING nhưng không có providerOperations thường là
     * workflow hoàn tiền thủ công đã được bắt đầu.
     *
     * Không được tự động gọi VNPay trong trường hợp này,
     * tránh hoàn tiền hai lần.
     */
    if (
      refund.status === RefundStatusEnum.PROCESSING &&
      !hasProviderOperations
    ) {
      return {
        eligible: false as const,
        reason: "REFUND_ALREADY_PROCESSING_MANUALLY",
        refund,
      };
    }

    /*
     * Auto-refund chỉ được bắt đầu từ WAITING_FOR_REFUND_INFO,
     * hoặc tiếp tục một phiên VNPay đã có providerOperations.
     */
    if (
      refund.status !== RefundStatusEnum.WAITING_FOR_REFUND_INFO &&
      !(refund.status === RefundStatusEnum.PROCESSING && hasProviderOperations)
    ) {
      return {
        eligible: false as const,
        reason: "REFUND_STATUS_NOT_AUTO_PROCESSABLE",
        refund,
      };
    }

    return this.processVnpayRefund(
  refund,
  ipAddr || "127.0.0.1",
  Boolean(options?.queryOnly),
);
  }
  private async prepareVnpayRefundOperations(refund: any) {
    // Nếu kế hoạch đã được tạo trước đó thì tái sử dụng.
    // Không sinh requestId mới khi request bị retry hoặc server restart.
    if (
      Array.isArray(refund.providerOperations) &&
      refund.providerOperations.length > 0
    ) {
      return {
        eligible: true as const,
        reason: null,
        operations: refund.providerOperations,
      };
    }

    if (refund.method !== RefundMethodEnum.VNPAY) {
      return {
        eligible: false as const,
        reason: "REFUND_METHOD_NOT_VNPAY",
        operations: [],
      };
    }

    const payments = await PaymentModel.find({
      _id: { $in: refund.paymentIds || [] },
      paymentType: { $in: RENTAL_PAYMENT_TYPES },
      status: PaymentStatusEnum.PAID,
    })
      .select(
        "amount method status refundedAmount gatewayOrderId gatewayTransactionId gatewayTransactionDate gatewayPayDate paidAt createdAt",
      )
      .sort({ paidAt: -1, createdAt: -1 })
      .lean<PaidPayment[]>();

    const allocationResult = buildRefundAllocation(
      payments,
      Number(refund.refundAmount || 0),
    );

    // Refund phải được phân bổ đầy đủ.
    // Không auto-refund một phần rồi để phần còn lại bị thất lạc.
    if (allocationResult.remainingRefund > 0) {
      return {
        eligible: false as const,
        reason: "REFUND_AMOUNT_CANNOT_BE_FULLY_ALLOCATED",
        operations: [],
      };
    }

    const vnpayPlan = buildVnpayRefundOperations(
      refund._id,
      allocationResult.allocations,
    );

    if (!vnpayPlan.eligible) {
      return vnpayPlan;
    }

    // Lưu kế hoạch xuống DB trước khi gửi bất kỳ request nào sang VNPay.
    refund.set("providerOperations", vnpayPlan.operations);

    await refund.save();

    return {
      eligible: true as const,
      reason: null,
      operations: refund.providerOperations,
    };
  }
  private async processSingleVnpayRefundOperation(
    refund: any,
    operationIndex: number,
    ipAddr: string,
  ) {
    const operations = refund.providerOperations || [];
    const operation = operations[operationIndex];

    if (!operation) {
      throw ErrorHelper.requestDataInvalid("VNPAY_REFUND_OPERATION_NOT_FOUND");
    }

    if (operation.provider !== "VNPAY") {
      throw ErrorHelper.requestDataInvalid("REFUND_PROVIDER_NOT_VNPAY");
    }

    if (operation.status === "SUCCEEDED") {
      return operation;
    }

    // Không tự động gửi lại operation đã được gửi,
    // đang chờ kết quả, chưa chắc chắn hoặc đã thất bại.
    // FAILED chỉ được retry bằng một luồng chủ động sau này.
    if (
      operation.status === "PROCESSING" ||
      operation.status === "UNKNOWN" ||
      operation.status === "FAILED"
    ) {
      return operation;
    }
    operation.status = "PROCESSING";
    operation.requestedAt = new Date();
    operation.retryCount = Number(operation.retryCount || 0) + 1;

    await refund.save();

    try {
      const response = await createVnpayRefund({
        requestId: String(operation.requestId),

        amount: Number(operation.refundAmount),

        orderId: String(operation.originalOrderId),

        transactionDate: String(operation.originalTransactionDate),

        transactionType:
          String(operation.transactionType) === "02" ? "02" : "03",

        createBy: "BQDrive",

        ipAddr: ipAddr || "127.0.0.1",

        orderInfo: `BQDrive refund ${String(refund._id)}`,

        ...(operation.originalTransactionId
          ? {
              transactionNo: String(operation.originalTransactionId),
            }
          : {}),
      });

      const responseCode = String(response.vnp_ResponseCode || "").trim();

      const transactionStatus = String(
        response.vnp_TransactionStatus || "",
      ).trim();

      operation.responseId = String(response.vnp_ResponseId || "").trim();

      operation.refundTransactionId = String(
        response.vnp_TransactionNo || "",
      ).trim();

      operation.responseCode = responseCode;

      operation.responseMessage = String(response.vnp_Message || "").trim();

      operation.transactionStatus = transactionStatus;

      const payDate = String(response.vnp_PayDate || "").trim();

      if (payDate) {
        operation.payDate = payDate;
      }

      if (responseCode === "00" && transactionStatus === "00") {
        // VNPay xác nhận giao dịch hoàn đã hoàn tất.
        operation.status = "SUCCEEDED";
        operation.completedAt = new Date();
      } else if (
        responseCode === "00" &&
        ["05", "06"].includes(transactionStatus)
      ) {
        // VNPay đã tiếp nhận nhưng quá trình hoàn tiền vẫn đang diễn ra.
        operation.status = "PROCESSING";
      } else if (responseCode === "94") {
        // Request đã tồn tại hoặc đang được VNPay xử lý.
        // Không gửi lại ngay để tránh tạo thao tác hoàn trùng.
        operation.status = "PROCESSING";
      } else if (responseCode === "00" && transactionStatus === "09") {
        operation.status = "FAILED";
        operation.completedAt = new Date();
        operation.failureReason =
          operation.responseMessage || "VNPAY_REFUND_REJECTED";
      } else if (["02", "03", "91", "95", "97"].includes(responseCode)) {
        // Các lỗi xác định rõ request refund không thể thực hiện.
        operation.status = "FAILED";
        operation.completedAt = new Date();
        operation.failureReason =
          operation.responseMessage || `VNPAY_REFUND_FAILED_${responseCode}`;
      } else {
        // Với mã không chắc chắn như 99, không được kết luận thất bại
        // vì request có thể đã tới VNPay.
        operation.status = "UNKNOWN";
        operation.failureReason =
          operation.responseMessage || `VNPAY_REFUND_UNKNOWN_${responseCode}`;
      }

      await refund.save();

      return operation;
    } catch (error) {
      // Timeout, mất mạng hoặc phản hồi sai chữ ký đều là trạng thái không chắc chắn.
      // Không được tự động gửi lại cùng giao dịch ngay lập tức.
      operation.status = "UNKNOWN";

      operation.failureReason =
        error instanceof Error
          ? error.message
          : "VNPAY_REFUND_REQUEST_UNKNOWN_ERROR";

      await refund.save();

      return operation;
    }
  }
  private async querySingleVnpayRefundOperation(
    refund: any,
    operationIndex: number,
    ipAddr: string,
  ) {
    const operations = refund.providerOperations || [];
    const operation = operations[operationIndex];

    if (!operation) {
      throw ErrorHelper.requestDataInvalid("VNPAY_REFUND_OPERATION_NOT_FOUND");
    }

    if (operation.provider !== "VNPAY") {
      throw ErrorHelper.requestDataInvalid("REFUND_PROVIDER_NOT_VNPAY");
    }

    if (operation.status === "SUCCEEDED") {
      return operation;
    }

    /*
     * Chỉ QueryDr các operation đã được gửi sang VNPay
     * nhưng chưa có kết quả cuối cùng.
     */
    if (operation.status !== "PROCESSING" && operation.status !== "UNKNOWN") {
      return operation;
    }

    /*
     * QueryDr phải bám vào giao dịch PAY gốc: TxnRef và TransactionDate.
     * vnp_TransactionNo là optional ở request, vì vậy không được chặn chỉ
     * vì VNPay chưa trả refundTransactionId cho thao tác hoàn trước đó.
     */
    const originalOrderId = String(operation.originalOrderId || "").trim();
    const originalTransactionDate = String(
      operation.originalTransactionDate || "",
    ).trim();
    const originalTransactionId = String(
      operation.originalTransactionId || "",
    ).trim();

    if (!originalOrderId || !originalTransactionDate) {
      operation.status = "UNKNOWN";
      operation.failureReason =
        "VNPAY_ORIGINAL_TRANSACTION_METADATA_MISSING";

      await refund.save();

      return operation;
    }

    const queryRequestId =
      `Q${new mongoose.Types.ObjectId().toHexString()}`.slice(0, 32);

    try {
      const response = await queryVnpayTransaction({
        requestId: queryRequestId,

        orderId: originalOrderId,

        ...(originalTransactionId
          ? { transactionNo: originalTransactionId }
          : {}),

        transactionDate: originalTransactionDate,

        ipAddr: ipAddr || "127.0.0.1",

        orderInfo: `BQDrive query refund ${String(refund._id)}`,
      });

      const responseCode = String(response.vnp_ResponseCode || "").trim();

      const transactionStatus = String(
        response.vnp_TransactionStatus || "",
      ).trim();

      const transactionType = String(response.vnp_TransactionType || "").trim();

      const queriedOrderId = String(response.vnp_TxnRef || "").trim();

      operation.responseId = String(response.vnp_ResponseId || "").trim();

      operation.responseCode = responseCode;

      operation.responseMessage = String(response.vnp_Message || "").trim();

      operation.transactionStatus = transactionStatus;

      const payDate = String(response.vnp_PayDate || "").trim();

      if (payDate) {
        operation.payDate = payDate;
      }

      /*
       * QueryDr có thể trả thông tin nhiều loại giao dịch.
       * Chỉ tin kết quả khi đúng giao dịch refund mà ta đang theo dõi.
       */
      if (responseCode === "00") {
        const expectedTransactionType = String(
          operation.transactionType || "",
        ).trim();

        const isRefundTransactionType = ["02", "03"].includes(
          transactionType,
        );
        const transactionTypeMatches =
          transactionType === expectedTransactionType;

        if (
          queriedOrderId !== originalOrderId ||
          !isRefundTransactionType ||
          !transactionTypeMatches
        ) {
          operation.status = "UNKNOWN";
          operation.failureReason =
            queriedOrderId !== originalOrderId
              ? "VNPAY_QUERY_TXN_REF_MISMATCH"
              : transactionType === "01"
              ? "VNPAY_QUERY_RETURNED_ORIGINAL_PAYMENT"
              : "VNPAY_QUERY_TRANSACTION_TYPE_MISMATCH";

          console.warn(
            "[BQDrive][VNPay Refund] QueryDr trả sai loại giao dịch:",
            {
              refundId: String(refund._id),
              originalOrderId,
              queriedOrderId,
              expectedTransactionType,
              transactionType,
            },
          );

          await refund.save();

          return operation;
        }

        if (transactionStatus === "00") {
          operation.status = "SUCCEEDED";
          operation.completedAt = new Date();
          operation.failureReason = undefined;
        } else if (["05", "06"].includes(transactionStatus)) {
          operation.status = "PROCESSING";
          operation.failureReason = undefined;
        } else if (transactionStatus === "09") {
          operation.status = "FAILED";
          operation.completedAt = new Date();
          operation.failureReason = "VNPAY_REFUND_REJECTED";
          if (refund.status === RefundStatusEnum.PROCESSING) {
            transitionRefundStatus(refund, RefundStatusEnum.MANUAL_REQUIRED);
          }
          refund.failureReason = operation.failureReason;
        } else {
          operation.status = "UNKNOWN";
          operation.failureReason = `VNPAY_QUERY_TRANSACTION_STATUS_${transactionStatus || "EMPTY"}`;
        }
      } else {
        /*
         * Mã 94 của QueryDr nghĩa là yêu cầu truy vấn bị lặp
         * trong thời gian giới hạn của VNPay.
         * Refund trước đó vẫn đang được xử lý, không xem đây là lỗi refund.
         */
        if (responseCode === "94") {
          operation.status = "PROCESSING";
          operation.failureReason = undefined;
        } else {
          /*
           * QueryDr lỗi không đồng nghĩa refund đã thất bại.
           * Không được tự ý kết luận tiền chưa/đã hoàn.
           */
          if (operation.status !== "PROCESSING") {
            operation.status = "UNKNOWN";
          }

          operation.failureReason = `VNPAY_QUERY_RESPONSE_${responseCode || "EMPTY"}`;
        }
      }
    } catch (error: any) {
      /*
       * Lỗi mạng/checksum khi truy vấn không được phép
       * biến một refund đang xử lý thành FAILED.
       */
      if (operation.status !== "PROCESSING") {
        operation.status = "UNKNOWN";
      }

      operation.failureReason = String(
        error?.message || "VNPAY_QUERY_FAILED",
      ).slice(0, 500);
    }

    await refund.save();

    return operation;
  }
  private async applySucceededVnpayOperationToPayment(operation: any) {
    if (operation.status !== "SUCCEEDED") {
      return null;
    }

    const payment = await PaymentModel.findOne({
      _id: operation.paymentId,
      paymentType: { $in: RENTAL_PAYMENT_TYPES },
      status: PaymentStatusEnum.PAID,
    });

    if (!payment) {
      throw ErrorHelper.requestDataInvalid("VNPAY_REFUND_PAYMENT_NOT_FOUND");
    }

    const paymentAmount = Math.max(Number(payment.amount || 0), 0);

    const refundedAmountBefore = Math.max(
      Number(operation.refundedAmountBefore || 0),
      0,
    );

    const operationRefundAmount = Math.max(
      Number(operation.refundAmount || 0),
      0,
    );

    // Đây là mốc tổng tiền mà Payment phải đạt tới
    // sau khi operation VNPay này hoàn thành.
    const targetRefundedAmount = refundedAmountBefore + operationRefundAmount;

    if (targetRefundedAmount > paymentAmount) {
      throw ErrorHelper.requestDataInvalid(
        "VNPAY_REFUND_AMOUNT_EXCEEDS_PAYMENT",
      );
    }

    const currentRefundedAmount = Math.max(
      Number(payment.refundedAmount || 0),
      0,
    );

    // Dùng max thay vì cộng trực tiếp để bảo đảm idempotent.
    // Nếu hàm chạy lại sau restart thì không cộng refund lần hai.
    payment.refundedAmount = Math.min(
      Math.max(currentRefundedAmount, targetRefundedAmount),
      paymentAmount,
    );

    await syncPaymentRefundStatus(payment);

    return payment;
  }
 private async processVnpayRefund(
  refund: any,
  ipAddr: string,
  queryOnly = false,
) {
    const preparation = await this.prepareVnpayRefundOperations(refund);

    // Không đủ điều kiện auto-refund.
    // Chưa chuyển manual ở đây, checkpoint sau sẽ xử lý fallback riêng.
    if (!preparation.eligible) {
      return {
        eligible: false as const,
        reason: preparation.reason,
        refund,
      };
    }

    if (refund.status === RefundStatusEnum.WAITING_FOR_REFUND_INFO) {
      transitionRefundStatus(refund, RefundStatusEnum.PROCESSING);

      refund.processingAt = refund.processingAt || new Date();

      await refund.save();
    }

    const operations = refund.providerOperations || [];

    for (let index = 0; index < operations.length; index += 1) {
      const currentOperation = operations[index];
      /*
 * Route kiểm tra trạng thái chỉ được phép QueryDr.
 *
 * Nếu operation vẫn còn PENDING thì nó chưa được gửi
 * sang VNPay. Tuyệt đối không dùng request kiểm tra
 * trạng thái để khởi tạo operation hoàn tiền mới.
 */
if (
  queryOnly &&
  currentOperation?.status === "PENDING"
) {
  return {
    eligible: true as const,
    completed: false,
    stoppedAtOperation: index,
    operationStatus: "PENDING",
    reason: "VNPAY_REFUND_OPERATION_PENDING_NOT_SENT",
    refund,
  };
}

      const operation =
        currentOperation?.status === "PROCESSING" ||
        currentOperation?.status === "UNKNOWN"
          ? await this.querySingleVnpayRefundOperation(refund, index, ipAddr)
          : await this.processSingleVnpayRefundOperation(refund, index, ipAddr);

      // Chỉ khi VNPay xác nhận operation thành công
      // mới cập nhật refundedAmount của Payment tương ứng.
      if (operation.status === "SUCCEEDED") {
        await this.applySucceededVnpayOperationToPayment(operation);

        // Đồng bộ lại số tiền của Booking và Contract
        // ngay sau khi một khoản hoàn đã thành công.
        await this.syncBookingAfterRefund(refund.bookingId);

        continue;
      }

      // Nếu operation chưa có kết quả chắc chắn hoặc thất bại,
      // dừng lại tại đây. Không xử lý operation phía sau.
      /*
       * PROCESSING là trạng thái bình thường khi VNPay
       * vẫn đang xử lý giao dịch hoàn tiền.
       * Không ghi response thành failureReason.
       */
      if (operation.status === "PROCESSING") {
        refund.failureReason = undefined;
      } else {
        refund.failureReason =
          operation.failureReason ||
          operation.responseMessage ||
          `VNPAY_REFUND_OPERATION_${operation.status}`;
      }

      await refund.save();

      return {
        eligible: true as const,
        completed: false,
        stoppedAtOperation: index,
        operationStatus: String(operation.status),
        refund,
      };
    }

    // Chỉ tới đây khi tất cả operation đều SUCCEEDED.
    const allSucceeded =
      operations.length > 0 &&
      operations.every((operation: any) => operation.status === "SUCCEEDED");

    if (!allSucceeded) {
      return {
        eligible: true as const,
        completed: false,
        reason: "VNPAY_REFUND_NOT_COMPLETED",
        refund,
      };
    }

    if (refund.status === RefundStatusEnum.PROCESSING) {
      transitionRefundStatus(refund, RefundStatusEnum.SUCCEEDED);
    }

    refund.succeededAt = refund.succeededAt || new Date();

    refund.failureReason = undefined;

    await refund.save();

    return {
      eligible: true as const,
      completed: true,
      refund,
    };
  }
  private async syncBookingAfterRefund(
    bookingId: mongoose.Types.ObjectId | string,
  ) {
    const booking = await BookingModel.findById(bookingId);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    await syncContractFromBooking(booking);

    return booking;
  }
  private async applySucceededRefundToPayments(refund: {
    paymentIds: mongoose.Types.ObjectId[];
    refundAmount: number;
  }) {
    const payments = await PaymentModel.find({
      _id: { $in: refund.paymentIds || [] },
      paymentType: { $in: RENTAL_PAYMENT_TYPES },
      status: PaymentStatusEnum.PAID,
    }).sort({ paidAt: -1, createdAt: -1 });

    const allocationResult = buildRefundAllocation(
      payments as unknown as PaidPayment[],
      Number(refund.refundAmount || 0),
    );

    if (allocationResult.remainingRefund > 0) {
      throw ErrorHelper.requestDataInvalid("REFUND_AMOUNT_INVALID");
    }

    const paymentById = new Map(
      payments.map((payment) => [String(payment._id), payment]),
    );

    for (const allocation of allocationResult.allocations) {
      const payment = paymentById.get(String(allocation.payment._id));

      if (!payment) {
        throw ErrorHelper.requestDataInvalid("REFUND_PAYMENT_NOT_FOUND");
      }

      payment.refundedAmount =
        allocation.alreadyRefunded + allocation.refundAmount;

      await syncPaymentRefundStatus(payment);
    }
  }
  async userCanSeeRefund(refund: any, actor: ActorContext) {
    const bookingRef = refund?.bookingId;

    const isPopulatedBooking =
      bookingRef && typeof bookingRef === "object" && bookingRef.userId;

    const booking = isPopulatedBooking
      ? bookingRef
      : await BookingModel.findById(bookingRef).lean<any>();
    if (!booking) return false;

    if (
      String(booking.userId || "") === String(actor.userId) &&
      actor.role === UserRoleEnum.USER
    ) {
      return true;
    }

    try {
      const cancellationActor = await this.resolveCancellationActor(
        booking,
        actor,
      );
      return cancellationActor.actorType === "OWNER";
    } catch {
      return false;
    }
  }

  async userCanProcessManualRefund(refund: any, actor: ActorContext) {
    const bookingRef = refund?.bookingId;

    const isPopulatedBooking =
      bookingRef && typeof bookingRef === "object" && bookingRef.userId;

    const booking = isPopulatedBooking
      ? bookingRef
      : await BookingModel.findById(bookingRef).lean<any>();
    if (!booking) return false;

    try {
      const cancellationActor = await this.resolveCancellationActor(
        booking,
        actor,
      );
      return cancellationActor.actorType === "OWNER";
    } catch {
      return false;
    }
  }
}

export const cancellationRefundService = new CancellationRefundService();
