// Shared booking API: renter flows plus booking data reused by owner modules.
import api from "./api";

export type RenterInfo = {
  fullName: string;
  phone: string;
  email: string;
  note?: string;
};

export type BookingPriceQuote = {
  rentalMode: "DAILY" | "HOURLY";
  appliedPriceType: "WEEKDAY" | "WEEKEND" | "HOLIDAY" | "MIXED" | string;
  appliedLabel: string;
  basePricePerUnit: number;
  weekendSurchargePerUnit: number;
  holidaySurchargePerUnit: number;
  finalPrice?: number;
  totalTime: number;
  totalPrice: number;
  rentalSubtotal?: number;
  deliveryFee?: number;
  rentalDepositRate?: number;
  rentalDepositAmount?: number;

  platformFeeRate?: number;
  platformFee?: number;

  insuranceFeePerDay?: number;
  insuranceDays?: number;
  insuranceFee?: number;

  upfrontPaymentAmount?: number;
  delivery?: BookingDeliveryPayload & {
    deliveryDistanceKm?: number;
    deliveryBaseFee?: number;
    deliveryFeePerKm?: number;
    deliveryMaxDistanceKm?: number;
  };
  breakdown: Array<{
    dateOrTime: string;
    priceType: "WEEKDAY" | "WEEKEND" | "HOLIDAY";
    label: string;
    basePrice: number;
    surchargeAmount: number;
    finalPrice: number;
    unitCount: number;
    price: number;
  }>;
};

export const PAYMENT_TODOS_REFRESH_EVENT = "bqdrive:payment-todos-refresh";

export type PaymentTodo = {
  bookingId: string;
  bookingCode: string;
  carId: string;
  carName: string;
  carImage?: string;
  licensePlate?: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string;
  bookingStatus: string;
  ownerName?: string;
};

export type BookingHoldSummary = {
  _id: string;
  bookingCode?: string;
  carId: string;
  status: string;
  paidAmount: number;
  createdAt: string;
};

export type BookingChatMessage = {
  _id: string;
  bookingId: string;
  sender: {
    _id: string;
    name: string;
    avatar?: string | null;
  };
  content: string;
  createdAt: string;
};

export type CancellationPreview = {
  bookingId: string;
  bookingStatus: string;
  canCancel: boolean;
  hoursBeforeStart: number;
  totalPrice: number;
  upfrontPaymentAmount: number;
  paidAmount: number;
  paidAmountAtCancellation: number;
  policyRuleApplied: string;
  policySource: string;
  cancellationFee: number;
  refundAmount: number;
  refundRequired: boolean;
  refundMethod: string;
  expectedRefundStatus: string;
  message: string;
};

export type BookingDeliveryPayload = {
  deliveryType: "PICKUP_AT_CAR_LOCATION" | "DELIVERY_TO_CUSTOMER";
  deliveryAddress?: string;
  deliveryAddressText?: string;
  deliveryFormattedAddress?: string;
  deliveryAddressSource?:
    | "MANUAL_TEXT"
    | "GEOCODE"
    | "CURRENT_LOCATION"
    | "MAP_PIN";
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryDistanceKm?: number;
  deliveryDurationText?: string;
  deliveryFee?: number;
  deliveryNote?: string;
};

export type RejectedBookingRecommendation = {
  bookingId: string;
  startDate: string;
  endDate: string;
  rentalMode: "DAILY" | "HOURLY";
  originalRentalSubtotal: number;
  candidateRentalSubtotal: number;
  estimatedTotal: number;
  priceDifference: number;
  car: {
    _id: string;
    name: string;
    images: string[];
    brand?: { _id: string; name: string } | null;
    seats: number;
    transmission?: string;
    fuelType?: string;
    pricing: {
      basePricePerUnit: number;
      weekendSurchargePerUnit: number;
      holidaySurchargePerUnit: number;
    };
    pickupLocation?: string;
    pickupLat?: number;
    pickupLng?: number;
    deliveryEnabled?: boolean;
  };
  reviewSummary: {
    averageRating: number;
    reviewCount: number;
  };
};

export function notifyPaymentTodosChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PAYMENT_TODOS_REFRESH_EVENT));
  }
}

export const bookingService = {
  quoteBooking: async (data: {
    carId: string;
    startDate: string;
    endDate: string;
    rentalMode: "DAILY" | "HOURLY";
    delivery?: BookingDeliveryPayload;
  }) => {
    const res = await api.post("/bookings/quote", data);
    return res.data.data.quote as BookingPriceQuote;
  },

  createBooking: async (data: {
    carId: string;
    startDate: string;
    endDate: string;
    rentalMode: "DAILY" | "HOURLY";
    note?: string;
    paymentOption: "DEPOSIT" | "FULL";
    renterInfo: RenterInfo;
    delivery?: BookingDeliveryPayload;
  }) => {
    const res = await api.post("/bookings/createBooking", data);
    return res.data.data.booking;
  },

  getMyBookings: async () => {
    const res = await api.get("/bookings/getMyBookings");
    return res.data.data.bookings;
  },

  getMyActiveHolds: async () => {
    const res = await api.get("/bookings/my-active-holds");
    return (res.data.data.bookings || []) as BookingHoldSummary[];
  },

  getMyBooking: async (id: string) => {
    const res = await api.get(`/bookings/getMyBooking/${id}`);
    return res.data.data.booking;
  },

  getRecommendedCar: async (id: string) => {
    const res = await api.get(`/bookings/${id}/recommended-car`);
    return (res.data.data.recommendation || null) as RejectedBookingRecommendation | null;
  },

  getBookingChatMessages: async (id: string, limit = 100) => {
    const res = await api.get(`/chat/bookings/${id}/messages`, {
      params: { limit },
    });
    return (res.data.data.messages || []) as BookingChatMessage[];
  },

  confirmHandoverReceived: async (id: string) => {
    const res = await api.post(`/bookings/${id}/confirm-handover-received`);
    return res.data.data;
  },

  getReturnInspection: async (id: string) => {
    const res = await api.get(`/bookings/${id}/return-inspection`);
    return res.data.data;
  },

  confirmReturn: async (id: string) => {
    const res = await api.post(`/bookings/${id}/confirm-return`);
    return res.data.data;
  },

  getMyPaymentTodos: async () => {
    const res = await api.get("/bookings/my-payment-todos");
    return (res.data.data.todos || []) as PaymentTodo[];
  },

  previewCancellation: async (
    id: string,
    payload?: {
      reasonCode?: string;
      reasonText?: string;
      cancelReason?: string;
    },
  ) => {
    const res = await api.post(
      `/bookings/cancellation-preview/${id}`,
      payload || {},
    );
    return res.data.data.preview as CancellationPreview;
  },

  cancelBooking: async (
    id: string,
    payload?:
      | string
      | {
          reasonCode?: string;
          reasonText?: string;
          cancelReason?: string;
          confirmed?: boolean;
        },
  ) => {
    const body =
      typeof payload === "string"
        ? { cancelReason: payload, confirmed: true }
        : { ...(payload || {}), confirmed: payload?.confirmed ?? true };
    const res = await api.post(`/bookings/cancelBooking/${id}`, {
      ...body,
    });
    return res.data.data;
  },
};
