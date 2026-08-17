// API dùng chung cho chủ xe, phục vụ trang lịch sử booking của người dùng ký gửi xe.
import api from "./api";

export type OwnerBookingHistoryPayment = {
  id: string;
  paymentCode: string;
  amount: number;
  method?: string;
  status?: string;
  paymentType?: string;
  transactionCode?: string;
  paidAt?: string | null;
  createdAt?: string | null;
};

export type OwnerBookingHistoryItem = {
  bookingId: string;
  bookingCode: string;
  status?: string;
  paymentStatus?: string;
  rentalMode?: string;
  startDate?: string;
  endDate?: string;
  actualReturnAt?: string | null;
  pickupAddressSnapshot?: string;
  returnAddressSnapshot?: string;
  note?: string;
  car: {
    id?: string;
    name?: string;
    brand?: string;
    model?: string;
    plateNumber?: string;
    image?: string;
  };
  renter: {
    id?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    identityProfileCompleted?: boolean;
    driverLicenseClass?: "B" | "B1" | "B2" | null;
    licenseEligible?: boolean;
  };
  owner: {
    id?: string;
    name?: string;
  };
  pricing: {
    totalPrice: number;
    upfrontPaymentAmount: number;
    paidAmount: number;
    remainingAmount: number;
  };
  paymentSummary: {
    totalPrice: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
  };
  payments: OwnerBookingHistoryPayment[];
  contract: {
    id: string;
    contractCode?: string;
    status?: string;
  } | null;
  createdAt?: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  noShowAt?: string | null;
};

export type OwnerBookingHistoryParams = {
  status?: string;
  paymentStatus?: string;
  keyword?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
};

export type OwnerBookingHistoryResponse = {
  bookings: OwnerBookingHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ApiData<T> = {
  data: T;
};

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

export const ownerBookingHistoryService = {
  getHistory: async (params: OwnerBookingHistoryParams) => {
    const res = await api.get("/bookings/owner/history", { params });
    return unwrap<OwnerBookingHistoryResponse>(res);
  },
};
