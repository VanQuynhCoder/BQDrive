import {
  BookingStatusEnum,
  PaymentStatusEnum,
} from "../constants/model.const";
import { BookingModel } from "../models/booking/booking.model";
import { ContractModel } from "../models/contract/contract.model";
import { PaymentModel } from "../models/payment/payment.model";

export const BOOKING_HOLD_MINUTES = 10;
export const ABANDONED_BOOKING_CANCEL_REASON =
  "Booking hết hạn do khách chưa hoàn tất hợp đồng/thanh toán";

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

export async function expireAbandonedPendingBookings(now = new Date()) {
  const cutoff = getBookingHoldCutoff(now);
  const staleWaitingPaymentBookings = await BookingModel.find({
    status: {
      $in: [
        BookingStatusEnum.PAYMENT_PENDING, // Trạng thái mới: khách đã bắt đầu thanh toán nhưng chưa hoàn tất
        BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ: giữ tương thích dữ liệu cũ
      ],
    },
    $or: [{ paidAmount: { $lte: 0 } }, { paidAmount: { $exists: false } }],
    isDeleted: false,
    createdAt: { $lte: cutoff },
  } as any)
    .select("_id")
    .lean();

  const staleBookingIds = staleWaitingPaymentBookings.map(
    (booking) => booking._id,
  );

  if (staleBookingIds.length === 0) {
    return { expiredCount: 0 };
  }

  const result = await BookingModel.updateMany(
    {
      _id: { $in: staleBookingIds },
      status: {
        $in: [
          BookingStatusEnum.PAYMENT_PENDING, // Chỉ auto hủy bước chờ thanh toán, không hủy yêu cầu chờ chủ xe duyệt
          BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ
        ],
      },
      $or: [{ paidAmount: { $lte: 0 } }, { paidAmount: { $exists: false } }],
      isDeleted: false,
    } as any,
    {
      status: BookingStatusEnum.CANCELLED,
      cancelReason: ABANDONED_BOOKING_CANCEL_REASON,
    },
  );

  return { expiredCount: result.modifiedCount || 0 };
}
