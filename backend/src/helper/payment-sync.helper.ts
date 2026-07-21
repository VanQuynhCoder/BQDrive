import { BookingStatusEnum, ContractStatusEnum, PaymentStatusEnum } from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { ContractModel } from "../models/contract/contract.model";
import { PaymentModel } from "../models/payment/payment.model";

export type BookingPaymentSummary = {
  totalPrice: number;
  depositAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "UNPAID" | "PENDING" | "DEPOSIT_PAID" | "PARTIAL" | "PAID_FULL";
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

export async function buildPaymentSummaryForBooking(booking: any): Promise<BookingPaymentSummary> {
  const totalPrice = Number(booking?.totalPrice || 0);
  const depositAmount = Number(booking?.depositAmount || 0);

  const paidPayments = await PaymentModel.find({
    bookingId: booking._id,
    status: PaymentStatusEnum.PAID,
  }).select("amount paymentType method status paidAt transactionCode createdAt");

  const paidAmount = Math.min(
    paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    totalPrice,
  );
  const remainingAmount = Math.max(totalPrice - paidAmount, 0);

  let paymentStatus: BookingPaymentSummary["paymentStatus"] = "UNPAID";
  if (totalPrice > 0 && paidAmount >= totalPrice) {
    paymentStatus = "PAID_FULL";
  } else if (paidAmount > 0) {
    paymentStatus = paidAmount >= depositAmount && depositAmount > 0 ? "DEPOSIT_PAID" : "PARTIAL";
  } else {
    const hasPendingPayment = await PaymentModel.exists({
      bookingId: booking._id,
      status: PaymentStatusEnum.PENDING,
    });
    paymentStatus = hasPendingPayment ? "PENDING" : "UNPAID";
  }

  return {
    totalPrice,
    depositAmount,
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
    ![BookingStatusEnum.IN_PROGRESS, BookingStatusEnum.COMPLETED].includes(
      booking.status as BookingStatusEnum,
    )
  ) {
    booking.status = BookingStatusEnum.PAID;
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
