import api from "./api";

export type CustomerPaymentBooking = {
  _id: string;
  status?: string;
};

export type CustomerPayment = {
  _id: string;
  bookingId?: CustomerPaymentBooking | string;
  userId?: string;
  amount: number;
  method?: string;
  status: string;
  paymentType?: string;
  transactionCode?: string;
  paidAt?: string;
  createdAt?: string;
};

export const paymentService = {
  createPayment: async (data: {
    bookingId: string;
    method: string;
    paymentType?: string;
  }) => {
    const res = await api.post("/payments/createPayment", data);
    return res.data.data.payment as CustomerPayment;
  },

  updatePaymentStatus: async (
    paymentId: string,
    data: {
      status: string;
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
    bookingId: string;
    paymentType: string;
  }) => {
    const res = await api.post("/payments/momo/create", data);
    console.log("MOMO CREATE RAW RESPONSE:", res.data);
    return res.data.data;
  },

  createVnpayPayment: async (data: {
    bookingId: string;
    paymentType: string;
  }) => {
    const res = await api.post("/payments/vnpay/create", data);
    return res.data.data;
  },

  verifyVnpayReturn: async (queryString: string) => {
    const res = await api.get(`/payments/vnpay/return${queryString}`);
    return res.data.data;
  },

  getMyPayments: async () => {
    const res = await api.get("/payments/getMyPayments");
    return res.data.data.payments as CustomerPayment[];
  },
};
