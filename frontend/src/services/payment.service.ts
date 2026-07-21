import api from "./api";

export type CustomerPaymentBooking = {
  _id: string;
  status?: string;
};

export type CustomerPayment = {
  _id: string;
  bookingId: CustomerPaymentBooking | string;
  userId: string;
  amount: number;
  method?: string;
  status?: string;
  paymentType?: string;
  transactionCode?: string;
  paidAt?: string;
  createdAt?: string;
};

export type PaymentHistoryItem = {
  _id: string;
  paymentCode: string;
  amount: number;
  method?: string;
  status?: string;
  paymentType?: string;
  transactionCode?: string;
  paidAt?: string;
  createdAt?: string;
  note?: string;
};

export type BookingPaymentHistory = {
  bookingId: string;
  bookingCode: string;
  bookingStatus?: string;
  rentalMode?: "DAILY" | "HOURLY" | string;
  startDate?: string | null;
  endDate?: string | null;
  car: {
    _id?: string;
    name?: string;
    brand?: string;
    plateNumber?: string;
    image?: string;
  };
  owner: {
    _id?: string;
    type?: "BUSINESS" | "USER" | string;
    name?: string;
    phone?: string;
  };
  totalPrice: number;
  depositAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentSummaryStatus:
    | "PAID_FULL"
    | "DEPOSIT_PAID"
    | "UNPAID"
    | "PARTIAL"
    | "PENDING"
    | "REFUNDED"
    | string;
  paymentCount: number;
  latestPaymentAt?: string | null;
  payments: PaymentHistoryItem[];
};

export const paymentService = {
  createPayment: async (data: {
    bookingId?: string;
    method?: string;
    paymentType?: string;
  }) => {
    const res = await api.post("/payments/createPayment", data);
    return res.data.data.payment as CustomerPayment;
  },

  updatePaymentStatus: async (
    paymentId: string,
    data: {
      status?: string;
      transactionCode?: string;
    },
  ) => {
    const res = await api.post(
      `/payments/updatePaymentStatus/${paymentId}`,
      data,
    );

    return res.data.data;
  },
  createMomoPayment: async (data: {
    bookingId?: string;
    paymentType: string;
  }) => {
    const res = await api.post("/payments/momo/create", data);
    console.log("MOMO CREATE RAW RESPONSE:", res.data);
    return res.data.data;
  },

  createVnpayPayment: async (data: {
    bookingId?: string;
    paymentType: string;
  }) => {
    const res = await api.post("/payments/vnpay/create", data);
    return res.data.data;
  },

  verifyVnpayReturn: async (queryString: string) => {
    const res = await api.get(`/payments/vnpay/return${queryString}`);
    return { ...res.data.data, message: res.data.message };
  },

  verifyMomoReturn: async (queryString: string) => {
    const res = await api.get(`/payments/momo/return${queryString}`);
    return { ...res.data.data, message: res.data.message };
  },

  getMyPayments: async () => {
    const res = await api.get("/payments/getMyPayments");
    return res.data.data.payments as CustomerPayment[];
  },

  getMyBookingPaymentHistory: async () => {
    const res = await api.get("/payments/my-booking-history");
    return res.data.data.histories as BookingPaymentHistory[];
  },
};






