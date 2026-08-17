import api from "./api";

export type BookingExtensionStatus =
  | "REQUESTED"
  | "OWNER_APPROVED"
  | "PAYMENT_PENDING"
  | "APPLIED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export type BookingExtensionRequestType = "EXTENSION" | "PLAN_CONVERSION";
export type BookingExtensionRentalMode = "HOURLY" | "DAILY";

export type BookingExtensionPayment = {
  _id: string;
  amount: number;
  method?: "MOMO" | "VNPAY" | string;
  status?: "PENDING" | "PAID" | "FAILED" | string;
  paymentType?: string;
  paidAt?: string;
};

export type BookingExtension = {
  _id: string;
  bookingId: string;
  carId: string;
  requestType?: BookingExtensionRequestType;
  sourceRentalMode?: BookingExtensionRentalMode;
  targetRentalMode?: BookingExtensionRentalMode;
  targetIncludedKmPerUnit?: number;
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
  | "sourceRentalMode"
  | "targetRentalMode"
> & {
  requestType?: BookingExtensionRequestType;
  currentContractedTotal?: number;
  calculatedConvertedTotal?: number;
  appliedConvertedTotal?: number;
  dailyUnits?: number;
};

export const bookingExtensionService = {
  listByBooking: async (bookingId: string) => {
    const response = await api.get(`/booking-extensions/bookings/${bookingId}`);
    return (response.data.data.extensions || []) as BookingExtension[];
  },

  quote: async (
    bookingId: string,
    requestedEndAt: string,
    requestType: BookingExtensionRequestType = "EXTENSION",
  ) => {
    const response = await api.post(
      `/booking-extensions/bookings/${bookingId}/quote`,
      { requestedEndAt, requestType },
    );
    return response.data.data.quote as BookingExtensionQuote;
  },

  request: async (
    bookingId: string,
    requestedEndAt: string,
    requestType: BookingExtensionRequestType = "EXTENSION",
  ) => {
    const response = await api.post(
      `/booking-extensions/bookings/${bookingId}/request`,
      { requestedEndAt, requestType },
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
