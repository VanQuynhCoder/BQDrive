export function getRoleLabel(role?: string) {
  const map: Record<string, string> = {
    ADMIN: "Quản trị viên",
    BUSINESS: "Doanh nghiệp",
    USER: "Người dùng",
  };

  return map[role || ""] || role || "--";
}

export function getBookingStatusLabel(status?: string) {
  const map: Record<string, string> = {
    REQUESTED: "Đã gửi yêu cầu thuê",
    OWNER_APPROVED: "Chủ xe đã duyệt",
    PAYMENT_PENDING: "Chờ thanh toán",
    PAID: "Đã thanh toán",
    PENDING: "Chờ xác nhận",
    WAITING_PAYMENT: "Chờ thanh toán",
    CONFIRMED: "Đã xác nhận",
    IN_PROGRESS: "Đang thuê",
    COMPLETED: "Hoàn tất",
    CANCELLED: "Đã hủy",
    REJECTED: "Từ chối",
    NO_SHOW: "Không nhận xe",
  };

  return map[status || ""] || status || "--";
}

export function getPaymentStatusLabel(status?: string) {
  const map: Record<string, string> = {
    PENDING: "Chờ thanh toán",
    PAID: "Đã thanh toán",
    FAILED: "Thanh toán thất bại",
    REFUNDED: "Đã hoàn tiền",
  };

  return map[status || ""] || status || "--";
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
  const map: Record<string, string> = {
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
    RENTED: "Đang được thuê",
    HIDDEN: "Đã ẩn",
  };

  return map[status || ""] || status || "--";
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
    HIDDEN: {
      label: "Đã ẩn",
      tone: "gray",
      className: "bg-slate-100 text-slate-700 ring-slate-200",
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
  const map: Record<string, string> = {
    DRAFT: "Bản nháp",
    ACTIVE: "Đang hiệu lực",
    COMPLETED: "Hoàn tất",
    CANCELLED: "Đã hủy",
  };

  return map[status || ""] || status || "--";
}




