import {
  BookingStatusEnum,
  ContractPaymentStatusEnum,
  PaymentRefundStatusEnum,
  RefundStatusEnum,
} from "../constants/model.const";

const TERMINAL_BOOKING_STATUSES = new Set<BookingStatusEnum>([
  BookingStatusEnum.COMPLETED,
  BookingStatusEnum.CANCELLED,
  BookingStatusEnum.REJECTED,
  BookingStatusEnum.NO_SHOW,
]);

const BOOKING_TRANSITIONS: Record<BookingStatusEnum, readonly BookingStatusEnum[]> = {
  [BookingStatusEnum.REQUESTED]: [
    BookingStatusEnum.OWNER_APPROVED,
    BookingStatusEnum.REJECTED,
    BookingStatusEnum.CANCELLED,
  ],
  [BookingStatusEnum.OWNER_APPROVED]: [
    BookingStatusEnum.PAYMENT_PENDING,
    BookingStatusEnum.PAID,
    BookingStatusEnum.IN_PROGRESS,
    BookingStatusEnum.CANCELLED,
    BookingStatusEnum.NO_SHOW,
  ],
  [BookingStatusEnum.PAYMENT_PENDING]: [
    BookingStatusEnum.OWNER_APPROVED,
    BookingStatusEnum.PAID,
    BookingStatusEnum.IN_PROGRESS,
    BookingStatusEnum.CANCELLED,
    BookingStatusEnum.NO_SHOW,
  ],
  [BookingStatusEnum.PAID]: [
    BookingStatusEnum.IN_PROGRESS,
    BookingStatusEnum.CANCELLED,
    BookingStatusEnum.NO_SHOW,
  ],
  [BookingStatusEnum.IN_PROGRESS]: [BookingStatusEnum.RETURN_INSPECTION],
  [BookingStatusEnum.RETURN_INSPECTION]: [
    BookingStatusEnum.AWAITING_EXTRA_CHARGE,
    BookingStatusEnum.COMPLETED,
  ],
  [BookingStatusEnum.AWAITING_EXTRA_CHARGE]: [BookingStatusEnum.COMPLETED],
  [BookingStatusEnum.COMPLETED]: [],
  [BookingStatusEnum.CANCELLED]: [],
  [BookingStatusEnum.REJECTED]: [],
  [BookingStatusEnum.NO_SHOW]: [],
};

export function isTerminalBookingStatus(status?: string) {
  return TERMINAL_BOOKING_STATUSES.has(
    (status || BookingStatusEnum.REQUESTED) as BookingStatusEnum,
  );
}

export function canTransitionBookingStatus(
  currentStatus: string | undefined,
  nextStatus: BookingStatusEnum,
) {
  const normalized = currentStatus || BookingStatusEnum.REQUESTED;
  if (normalized === nextStatus) return true;

  return (
    BOOKING_TRANSITIONS[normalized as BookingStatusEnum]?.includes(nextStatus) ??
    false
  );
}

export function transitionBookingStatus(
  booking: { status?: string },
  nextStatus: BookingStatusEnum,
) {
  if (!canTransitionBookingStatus(booking.status, nextStatus)) {
    throw new Error(
      `BOOKING_STATUS_TRANSITION_INVALID:${booking.status || "<EMPTY>"}->${nextStatus}`,
    );
  }

  booking.status = nextStatus;
}

export function derivePaymentRefundStatus(
  amount: unknown,
  refundedAmount: unknown,
) {
  const normalizedAmount = Math.max(Number(amount || 0), 0);
  const normalizedRefundedAmount = Math.max(Number(refundedAmount || 0), 0);

  if (normalizedRefundedAmount <= 0) {
    return PaymentRefundStatusEnum.NOT_REFUNDED;
  }
  if (
    normalizedAmount > 0 &&
    normalizedRefundedAmount < normalizedAmount
  ) {
    return PaymentRefundStatusEnum.PARTIALLY_REFUNDED;
  }
  return PaymentRefundStatusEnum.REFUNDED;
}

export function deriveContractPaymentStatus(input: {
  totalPrice: unknown;
  depositAmount: unknown;
  paidAmount: unknown;
  hasPendingPayment?: boolean;
}) {
  const totalPrice = Math.max(Number(input.totalPrice || 0), 0);
  const depositAmount = Math.max(Number(input.depositAmount || 0), 0);
  const paidAmount = Math.max(Number(input.paidAmount || 0), 0);

  if (totalPrice > 0 && paidAmount >= totalPrice) {
    return ContractPaymentStatusEnum.PAID_FULL;
  }
  if (paidAmount > 0 && depositAmount > 0 && paidAmount >= depositAmount) {
    return ContractPaymentStatusEnum.DEPOSIT_PAID;
  }
  if (paidAmount > 0) {
    return ContractPaymentStatusEnum.PARTIAL;
  }
  if (input.hasPendingPayment) {
    return ContractPaymentStatusEnum.PENDING;
  }
  return ContractPaymentStatusEnum.UNPAID;
}

const REFUND_TRANSITIONS: Record<RefundStatusEnum, readonly RefundStatusEnum[]> = {
  [RefundStatusEnum.WAITING_FOR_REFUND_INFO]: [
    RefundStatusEnum.MANUAL_REQUIRED,
  ],
  [RefundStatusEnum.MANUAL_REQUIRED]: [RefundStatusEnum.PROCESSING],
  [RefundStatusEnum.PROCESSING]: [RefundStatusEnum.SUCCEEDED],
  [RefundStatusEnum.SUCCEEDED]: [],
};

export function canTransitionRefundStatus(
  currentStatus: string | undefined,
  nextStatus: RefundStatusEnum,
) {
  if (currentStatus === nextStatus) return true;
  return (
    REFUND_TRANSITIONS[currentStatus as RefundStatusEnum]?.includes(
      nextStatus,
    ) ?? false
  );
}

export function transitionRefundStatus(
  refund: { status?: string },
  nextStatus: RefundStatusEnum,
) {
  if (!canTransitionRefundStatus(refund.status, nextStatus)) {
    throw new Error(
      `REFUND_STATUS_TRANSITION_INVALID:${refund.status || "<EMPTY>"}->${nextStatus}`,
    );
  }
  refund.status = nextStatus;
}
