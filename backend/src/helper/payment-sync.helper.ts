import {
  BookingExtensionStatusEnum,
  BookingStatusEnum,
  ContractPaymentStatusEnum,
  ContractStatusEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
} from "../constants/model.const";
import { BookingExtensionModel } from "../models/booking-extension/bookingExtension.model";
import { BookingModel } from "../models/booking/booking.model";
import { ContractModel } from "../models/contract/contract.model";
import { PaymentModel } from "../models/payment/payment.model";
import {
  deriveContractPaymentStatus,
  derivePaymentRefundStatus,
  isTerminalBookingStatus,
  transitionBookingStatus,
} from "./status.helper";

export type BookingPaymentSummary = {
  totalPrice: number;
  upfrontPaymentAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: ContractPaymentStatusEnum;
};

export function getContractStatusForBookingStatus(status?: string) {
  if (status === BookingStatusEnum.COMPLETED) return ContractStatusEnum.COMPLETED;

  if (
    [
      BookingStatusEnum.CANCELLED,
      BookingStatusEnum.REJECTED,
      BookingStatusEnum.NO_SHOW,
    ].includes(status as BookingStatusEnum)
  ) {
    return ContractStatusEnum.CANCELLED;
  }

  return ContractStatusEnum.ACTIVE;
}

export function calculateEligiblePaidAmount(input: {
  paidPayments: any[];
  appliedExtensionPaymentIds: Iterable<string>;
  totalPrice: number;
}) {
  const appliedExtensionPaymentIds = new Set(input.appliedExtensionPaymentIds);
  return Math.min(
    input.paidPayments.reduce((sum, payment) => {
      if (
        payment.paymentType === PaymentTypeEnum.EXTENSION &&
        !appliedExtensionPaymentIds.has(String(payment._id || ""))
      ) {
        return sum;
      }
      const amount = Number(payment.amount || 0);
      const refundedAmount = Number(payment.refundedAmount || 0);
      return sum + Math.max(amount - refundedAmount, 0);
    }, 0),
    input.totalPrice,
  );
}

export async function buildPaymentSummaryForBooking(booking: any): Promise<BookingPaymentSummary> {
  const totalPrice = Number(booking?.totalPrice || 0);
  const upfrontPaymentAmount = Number(booking?.upfrontPaymentAmount || 0);

  const paidPayments = await PaymentModel.find({
    bookingId: booking._id,
    status: PaymentStatusEnum.PAID,
    paymentType: {
      $in: [
        PaymentTypeEnum.DEPOSIT,
        PaymentTypeEnum.FULL,
        PaymentTypeEnum.REMAINING,
        PaymentTypeEnum.EXTENSION,
      ],
    },
  }).select(
    "amount paymentType extensionId method status paidAt transactionCode refundedAmount createdAt",
  );
  const extensionIds = paidPayments
    .filter((payment) => payment.paymentType === PaymentTypeEnum.EXTENSION)
    .map((payment) => String(payment.extensionId || ""))
    .filter(Boolean);
  const appliedExtensions = extensionIds.length
    ? await BookingExtensionModel.find({
        _id: { $in: extensionIds },
        bookingId: booking._id,
        status: BookingExtensionStatusEnum.APPLIED,
        isDeleted: false,
      })
        .select("_id paymentId")
        .lean()
    : [];
  const paidAmount = calculateEligiblePaidAmount({
    paidPayments,
    appliedExtensionPaymentIds: appliedExtensions.map((extension) =>
      String(extension.paymentId || ""),
    ),
    totalPrice,
  });
  const remainingAmount = Math.max(totalPrice - paidAmount, 0);

  const hasPendingPayment =
    paidAmount <= 0
      ? await PaymentModel.exists({
      bookingId: booking._id,
      status: PaymentStatusEnum.PENDING,
      paymentType: {
        $in: [
          PaymentTypeEnum.DEPOSIT,
          PaymentTypeEnum.FULL,
          PaymentTypeEnum.REMAINING,
          PaymentTypeEnum.EXTENSION,
        ],
      },
        })
      : false;
  const paymentStatus = deriveContractPaymentStatus({
    totalPrice,
    upfrontPaymentAmount,
    paidAmount,
    paymentOption: booking?.paymentOption,
    hasPendingPayment: Boolean(hasPendingPayment),
  });

  return {
    totalPrice,
    upfrontPaymentAmount,
    paidAmount,
    remainingAmount,
    paymentStatus,
  };
}

export async function syncBookingPaymentFromPaidPayments(booking: any) {
  const summary = await buildPaymentSummaryForBooking(booking);

  booking.paidAmount = summary.paidAmount;
  booking.remainingAmount = summary.remainingAmount;

  if (
    summary.paidAmount > 0 &&
    !isTerminalBookingStatus(booking.status) &&
    ![
      BookingStatusEnum.IN_PROGRESS,
      BookingStatusEnum.RETURN_INSPECTION,
      BookingStatusEnum.AWAITING_EXTRA_CHARGE,
    ].includes(booking.status as BookingStatusEnum)
  ) {
    transitionBookingStatus(booking, BookingStatusEnum.PAID);
  }

  await booking.save();
  await ContractModel.updateOne(
    { bookingId: booking._id, isDeleted: false },
    {
      $set: {
        remainingAmount: summary.remainingAmount,
        paidAmount: summary.paidAmount,
        paymentStatus: summary.paymentStatus,
        status: getContractStatusForBookingStatus(booking.status),
      },
    },
  );

  return summary;
}

export async function syncPaymentRefundStatus(payment: any) {
  const refundStatus = derivePaymentRefundStatus(
    payment?.amount,
    payment?.refundedAmount,
  );

  payment.refundStatus = refundStatus;

  // Luôn lưu vì refundedAmount có thể thay đổi
  // dù refundStatus vẫn giữ nguyên.
  await payment.save();

  return refundStatus;
}

export async function syncContractFromBooking(booking: any) {
  const summary = await buildPaymentSummaryForBooking(booking);

  await BookingModel.updateOne(
    { _id: booking._id },
    {
      $set: {
        paidAmount: summary.paidAmount,
        remainingAmount: summary.remainingAmount,
      },
    },
  );

  await ContractModel.updateOne(
    { bookingId: booking._id, isDeleted: false },
    {
      $set: {
        remainingAmount: summary.remainingAmount,
        paidAmount: summary.paidAmount,
        paymentStatus: summary.paymentStatus,
        status: getContractStatusForBookingStatus(booking.status),
      },
    },
  );

  return summary;
}
export function getBookingUpfrontPaymentAmount(booking: any) {
  const pricingSnapshot = booking?.pricingSnapshot || {};

  // Ưu tiên khoản giữ chỗ canonical đã được lưu khi tạo booking.
  const storedUpfrontPaymentAmount = Math.max(
    Number(booking?.upfrontPaymentAmount || 0),
    0,
  );

  if (storedUpfrontPaymentAmount > 0) {
    return storedUpfrontPaymentAmount;
  }

  // Nếu booking đã có snapshot mới thì dùng đúng snapshot.
  const upfrontPaymentAmount = Math.max(
    Number(pricingSnapshot.upfrontPaymentAmount || 0),
    0,
  );

  if (upfrontPaymentAmount > 0) {
    return upfrontPaymentAmount;
  }

  const rentalSubtotal = Math.max(
    Number(
      pricingSnapshot.rentalSubtotal ??
        pricingSnapshot.subtotal ??
        0,
    ),
    0,
  );

  const platformFee = Math.max(
    Number(pricingSnapshot.platformFee || 0),
    0,
  );

  const insuranceFee = Math.max(
    Number(pricingSnapshot.insuranceFee || 0),
    0,
  );

  return (
    Math.round(rentalSubtotal * 0.5) +
    platformFee +
    insuranceFee
  );
}
