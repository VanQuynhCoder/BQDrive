import api from "./api";

export type BookingExtensionStatus =
  | "REQUESTED"
  | "OWNER_APPROVED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export type BookingExtensionPayment = {
  _id: string;
  amount: number;
  method?: "CASH" | "MOMO" | "VNPAY" | string;
  status?: "PENDING" | "PAID" | "FAILED" | string;
  paymentType?: string;
  paidAt?: string;
};

export type BookingExtension = {
  _id: string;
  bookingId: string;
  carId: string;
  oldEndAt: string;
  requestedEndAt: string;
  additionalDurationMinutes: number;
  billableUnits: number;
  additionalAmount: number;
  status: BookingExtensionStatus;
  requestedAt: string;
  ownerRespondedAt?: string;
  rejectReason?: string;
  paymentDeadlineAt?: string;
  paymentId?: BookingExtensionPayment | string;
  activatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BookingExtensionQuote = Pick<
  BookingExtension,
  | "oldEndAt"
  | "requestedEndAt"
  | "additionalDurationMinutes"
  | "billableUnits"
  | "additionalAmount"
>;

export const bookingExtensionService = {
  listByBooking: async (bookingId: string) => {
    const response = await api.get(`/booking-extensions/bookings/${bookingId}`);
    return (response.data.data.extensions || []) as BookingExtension[];
  },

  quote: async (bookingId: string, requestedEndAt: string) => {
    const response = await api.post(
      `/booking-extensions/bookings/${bookingId}/quote`,
      { requestedEndAt },
    );
    return response.data.data.quote as BookingExtensionQuote;
  },

  request: async (bookingId: string, requestedEndAt: string) => {
    const response = await api.post(
      `/booking-extensions/bookings/${bookingId}/request`,
      { requestedEndAt },
    );
    return response.data.data.extension as BookingExtension;
  },

  cancel: async (extensionId: string) => {
    const response = await api.patch(
      `/booking-extensions/${extensionId}/cancel`,
    );
    return response.data.data.extension as BookingExtension;
  },

  approve: async (extensionId: string) => {
    const response = await api.patch(
      `/booking-extensions/${extensionId}/approve`,
    );
    return response.data.data.extension as BookingExtension;
  },

  reject: async (extensionId: string, rejectReason: string) => {
    const response = await api.patch(
      `/booking-extensions/${extensionId}/reject`,
      { rejectReason },
    );
    return response.data.data.extension as BookingExtension;
  },
};
