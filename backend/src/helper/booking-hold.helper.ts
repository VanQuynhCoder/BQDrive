import {
  BookingStatusEnum,
  ContractStatusEnum,
  PaymentStatusEnum,
} from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { ContractModel } from "../models/contract/contract.model";
import { PaymentModel } from "../models/payment/payment.model";
import {
  sendBookingPaymentTimeoutMail,
  sendBookingRequestTimeoutMail,
} from "./mail.helper";

export const BOOKING_HOLD_MINUTES = 10;
export const ABANDONED_BOOKING_CANCEL_REASON =
  "Booking hết hạn do khách chưa hoàn tất hợp đồng/thanh toán";
export const REQUESTED_BOOKING_TIMEOUT_CANCEL_REASON =
  "Yêu cầu thuê đã bị hủy tự động vì bên cho thuê không phản hồi trong thời gian quy định.";
export const APPROVED_BOOKING_PAYMENT_TIMEOUT_CANCEL_REASON =
  "Booking đã bị hủy tự động vì khách không thanh toán cọc hoặc thanh toán toàn bộ trong thời gian quy định.";

const BOOKING_EXPIRATION_JOB_INTERVAL_MS = 60 * 1000;
const REQUESTED_BOOKING_TIMEOUT_BATCH_SIZE = 25;
const APPROVED_PAYMENT_TIMEOUT_BATCH_SIZE = 25;

let bookingExpirationJobStarted = false;

export function getBookingHoldExpiresAt(createdAt?: Date) {
  const baseTime = createdAt?.getTime() || Date.now();

  return new Date(baseTime + BOOKING_HOLD_MINUTES * 60 * 1000);
}

function getBookingHoldCutoff(now = new Date()) {
  return new Date(now.getTime() - BOOKING_HOLD_MINUTES * 60 * 1000);
}

export async function getCheckoutStartedBookingIdSet(bookingIds: unknown[]) {
  if (bookingIds.length === 0) {
    return new Set<string>();
  }

  const [paymentBookingIds, contractBookingIds] = await Promise.all([
    PaymentModel.distinct("bookingId", {
      bookingId: { $in: bookingIds },
      status: { $in: [PaymentStatusEnum.PENDING, PaymentStatusEnum.PAID] },
    } as any),
    ContractModel.distinct("bookingId", {
      bookingId: { $in: bookingIds },
      isDeleted: false,
    } as any),
  ]);

  return new Set(
    [...paymentBookingIds, ...contractBookingIds].map((bookingId) =>
      String(bookingId),
    ),
  );
}

async function expireStaleRequestedBookings(cutoff: Date) {
  const staleBookings = await BookingModel.find({
    status: BookingStatusEnum.REQUESTED,
    isDeleted: false,
    createdAt: { $lte: cutoff },
  } as any)
    .select("_id")
    .sort({ createdAt: 1 })
    .limit(REQUESTED_BOOKING_TIMEOUT_BATCH_SIZE)
    .lean();

  let expiredCount = 0;

  for (const staleBooking of staleBookings) {
    const expiredBooking = await BookingModel.findOneAndUpdate(
      {
        _id: staleBooking._id,
        status: BookingStatusEnum.REQUESTED,
        isDeleted: false,
        createdAt: { $lte: cutoff },
      } as any,
      {
        status: BookingStatusEnum.CANCELLED,
        cancelReason: REQUESTED_BOOKING_TIMEOUT_CANCEL_REASON,
        cancelReasonCode: "OWNER_RESPONSE_TIMEOUT",
        cancelReasonText: REQUESTED_BOOKING_TIMEOUT_CANCEL_REASON,
        cancelledAt: new Date(),
        cancelledByRole: "SYSTEM",
      },
      { new: true },
    );

    if (!expiredBooking) continue;

    expiredCount += 1;
    void sendBookingRequestTimeoutMail(expiredBooking);
  }

  return expiredCount;
}

async function expireStaleWaitingPaymentBookings(now: Date, cutoff: Date) {
  const staleBookings = await BookingModel.find({
    status: {
      $in: [
        BookingStatusEnum.OWNER_APPROVED,
        BookingStatusEnum.PAYMENT_PENDING,
        BookingStatusEnum.WAITING_PAYMENT,
      ],
    },
    $or: [{ paidAmount: { $lte: 0 } }, { paidAmount: { $exists: false } }],
    isDeleted: false,
    $and: [
      {
        $or: [
          { paymentDeadlineAt: { $lte: now } },
          {
            paymentDeadlineAt: { $exists: false },
            ownerApprovedAt: { $lte: cutoff },
          },
          {
            paymentDeadlineAt: { $exists: false },
            ownerApprovedAt: { $exists: false },
            updatedAt: { $lte: cutoff },
          },
        ],
      },
    ],
  } as any)
    .select("_id")
    .sort({ updatedAt: 1 })
    .limit(APPROVED_PAYMENT_TIMEOUT_BATCH_SIZE)
    .lean();

  let expiredCount = 0;

  for (const staleBooking of staleBookings) {
    const expiredBooking = await BookingModel.findOneAndUpdate(
      {
        _id: staleBooking._id,
        status: {
          $in: [
            BookingStatusEnum.OWNER_APPROVED,
            BookingStatusEnum.PAYMENT_PENDING,
            BookingStatusEnum.WAITING_PAYMENT,
          ],
        },
        $or: [{ paidAmount: { $lte: 0 } }, { paidAmount: { $exists: false } }],
        isDeleted: false,
      } as any,
      {
        status: BookingStatusEnum.CANCELLED,
        cancelReason: APPROVED_BOOKING_PAYMENT_TIMEOUT_CANCEL_REASON,
        cancelReasonCode: "PAYMENT_TIMEOUT",
        cancelReasonText: APPROVED_BOOKING_PAYMENT_TIMEOUT_CANCEL_REASON,
        cancelledAt: now,
        cancelledByRole: "SYSTEM",
      },
      { new: true },
    );

    if (!expiredBooking) continue;

    await PaymentModel.updateMany(
      {
        bookingId: expiredBooking._id,
        status: PaymentStatusEnum.PENDING,
      } as any,
      {
        status: PaymentStatusEnum.FAILED,
        note: APPROVED_BOOKING_PAYMENT_TIMEOUT_CANCEL_REASON,
      },
    );

    await ContractModel.updateMany(
      {
        bookingId: expiredBooking._id,
        isDeleted: false,
        status: { $ne: ContractStatusEnum.CANCELLED },
      } as any,
      {
        status: ContractStatusEnum.CANCELLED,
      },
    );

    expiredCount += 1;
    void sendBookingPaymentTimeoutMail(expiredBooking);
  }

  return expiredCount;
}

export async function expireAbandonedPendingBookings(now = new Date()) {
  const cutoff = getBookingHoldCutoff(now);
  const [requestedExpiredCount, paymentExpiredCount] = await Promise.all([
    expireStaleRequestedBookings(cutoff),
    expireStaleWaitingPaymentBookings(now, cutoff),
  ]);

  return {
    expiredCount: requestedExpiredCount + paymentExpiredCount,
    requestedExpiredCount,
    paymentExpiredCount,
  };
}

export function startBookingExpirationJob() {
  if (bookingExpirationJobStarted) return;

  bookingExpirationJobStarted = true;

  const runJob = () => {
    expireAbandonedPendingBookings().catch((error) => {
      console.error("Booking expiration job failed", {
        message: error?.message,
        stack: error?.stack,
      });
    });
  };

  runJob();

  const interval = setInterval(runJob, BOOKING_EXPIRATION_JOB_INTERVAL_MS);
  interval.unref?.();
}
