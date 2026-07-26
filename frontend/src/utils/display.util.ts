export function getRoleLabel(role?: string) {
  const map: Record<string, string> = {
    ADMIN: "Quản trị viên",
    BUSINESS: "Doanh nghiệp",
    USER: "Người dùng",
  };

  return map[role || ""] || role || "--";
}

export function getBookingStatusLabel(status?: string) {
  return BOOKING_STATUS_LABELS[
    status as keyof typeof BOOKING_STATUS_LABELS
  ] || status || "--";
}

export function getPaymentStatusLabel(status?: string) {
  return PAYMENT_STATUS_LABELS[
    status as keyof typeof PAYMENT_STATUS_LABELS
  ] || status || "--";
}

export function getPaymentRefundStatusLabel(status?: string) {
  return PAYMENT_REFUND_STATUS_LABELS[
    status as keyof typeof PAYMENT_REFUND_STATUS_LABELS
  ] || status || "--";
}

export function getContractPaymentStatusLabel(status?: string) {
  return CONTRACT_PAYMENT_STATUS_LABELS[
    status as keyof typeof CONTRACT_PAYMENT_STATUS_LABELS
  ] || status || "--";
}

export function getRefundStatusLabel(status?: string) {
  return REFUND_STATUS_LABELS[
    status as keyof typeof REFUND_STATUS_LABELS
  ] || status || "--";
}

export function getPaymentMethodLabel(method?: string) {
  const map: Record<string, string> = {
    CASH: "Tiền mặt",
    MOMO: "Ví MoMo",
    VNPAY: "VNPay",
  };

  return map[method || ""] || method || "--";
}

export function getPaymentTypeLabel(paymentType?: string) {
  const map: Record<string, string> = {
    DEPOSIT: "Thanh toán cọc",
    FULL: "Thanh toán toàn bộ",
    REMAINING: "Thanh toán phần còn lại",
    EXTRA_CHARGE: "Phí phát sinh",
    REFUND: "Hoàn tiền",
  };

  return map[paymentType || ""] || paymentType || "--";
}

export function getRequestStatusLabel(status?: string) {
  const map: Record<string, string> = {
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
  };

  return map[status || ""] || status || "--";
}

export function getCarStatusLabel(status?: string) {
  return CAR_STATUS_LABELS[status as keyof typeof CAR_STATUS_LABELS] ||
    status ||
    "--";
}

export type CarStatusTone = "green" | "red" | "yellow" | "blue" | "gray";

export function getCarStatusMeta(status?: string): {
  label: string;
  tone: CarStatusTone;
  className: string;
} {
  const map: Record<
    string,
    { label: string; tone: CarStatusTone; className: string }
  > = {
    PENDING: {
      label: "Chờ duyệt",
      tone: "yellow",
      className: "bg-yellow-50 text-amber-700 ring-yellow-200",
    },
    APPROVED: {
      label: "Đã duyệt",
      tone: "green",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    },
    RENTED: {
      label: "Đang được thuê",
      tone: "blue",
      className: "bg-primary text-secondary ring-primary",
    },
    REJECTED: {
      label: "Từ chối",
      tone: "red",
      className: "bg-red-50 text-red-700 ring-red-200",
    },
  };

  return (
    map[status || ""] || {
      label: status || "--",
      tone: "gray",
      className: "bg-slate-100 text-slate-700 ring-slate-200",
    }
  );
}

export function getBusinessTypeLabel(type?: string) {
  const map: Record<string, string> = {
    COMPANY: "Công ty",
    INDIVIDUAL: "Cá nhân",
  };

  return map[type || ""] || type || "--";
}

export function getOwnerTypeLabel(type?: string) {
  const map: Record<string, string> = {
    BUSINESS: "Doanh nghiệp",
    USER: "Người dùng ký gửi",
  };

  return map[type || ""] || type || "--";
}

export function getContractStatusLabel(status?: string) {
  return CONTRACT_STATUS_LABELS[
    status as keyof typeof CONTRACT_STATUS_LABELS
  ] || status || "--";
}




import {
  BOOKING_STATUS_LABELS,
  CAR_STATUS_LABELS,
  CONTRACT_PAYMENT_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  PAYMENT_REFUND_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
} from "../constants/status.constants";
