// Shared status source: canonical frontend values used by ADMIN, BUSINESS, and USER.
export const BOOKING_STATUSES = [
  "REQUESTED",
  "OWNER_APPROVED",
  "PAYMENT_PENDING",
  "PAID",
  "IN_PROGRESS",
  "RETURN_INSPECTION",
  "AWAITING_EXTRA_CHARGE",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
  "NO_SHOW",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_REFUND_STATUSES = [
  "NOT_REFUNDED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;
export type PaymentRefundStatus = (typeof PAYMENT_REFUND_STATUSES)[number];

export const CONTRACT_PAYMENT_STATUSES = [
  "UNPAID",
  "PENDING",
  "DEPOSIT_PAID",
  "PARTIAL",
  "PAID_FULL",
] as const;
export type ContractPaymentStatus =
  (typeof CONTRACT_PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = [
  "WAITING_FOR_REFUND_INFO",
  "MANUAL_REQUIRED",
  "PROCESSING",
  "SUCCEEDED",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const CONTRACT_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CAR_STATUSES = [
  "PENDING",
  "APPROVED",
  "RENTED",
  "REJECTED",
] as const;
export type CarStatus = (typeof CAR_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  REQUESTED: "Chờ chủ xe xử lý",
  OWNER_APPROVED: "Chủ xe đã duyệt",
  PAYMENT_PENDING: "Chờ thanh toán",
  PAID: "Đã hoàn thành khoản thanh toán bắt buộc",
  IN_PROGRESS: "Đang thuê",
  RETURN_INSPECTION: "Đang kiểm tra xe trả",
  AWAITING_EXTRA_CHARGE: "Chờ xử lý phụ phí",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  REJECTED: "Bị từ chối",
  NO_SHOW: "Khách không đến nhận xe",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Đang xử lý",
  PAID: "Đã thanh toán",
  FAILED: "Thất bại",
};

export const PAYMENT_REFUND_STATUS_LABELS: Record<
  PaymentRefundStatus,
  string
> = {
  NOT_REFUNDED: "Chưa hoàn",
  PARTIALLY_REFUNDED: "Hoàn một phần",
  REFUNDED: "Đã hoàn toàn bộ",
};

export const CONTRACT_PAYMENT_STATUS_LABELS: Record<
  ContractPaymentStatus,
  string
> = {
  UNPAID: "Chưa thanh toán",
  PENDING: "Đang chờ thanh toán",
  DEPOSIT_PAID: "Đã thanh toán cọc",
  PARTIAL: "Đã thanh toán một phần",
  PAID_FULL: "Đã thanh toán đủ",
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  WAITING_FOR_REFUND_INFO: "Chờ thông tin nhận tiền",
  MANUAL_REQUIRED: "Chờ chủ xe hoàn tiền",
  PROCESSING: "Đã gửi tiền, chờ xác nhận",
  SUCCEEDED: "Đã hoàn tiền",
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: "Đang hiệu lực",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export const CAR_STATUS_LABELS: Record<CarStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  RENTED: "Đang được thuê",
  REJECTED: "Bị từ chối",
};
