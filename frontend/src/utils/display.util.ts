export function getRoleLabel(role?: string) {
  const map: Record<string, string> = {
    ADMIN: "Quản trị viên",
    BUSINESS: "Doanh nghiệp",
    CUSTOMER: "Khách hàng",
    PRIVATE_OWNER: "Chủ xe tư nhân",
  };

  return map[role || ""] || role || "--";
}

export function getBookingStatusLabel(status?: string) {
  const map: Record<string, string> = {
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
    BANKING: "Chuyển khoản",
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
    PRIVATE_OWNER: "Chủ xe tư nhân",
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
