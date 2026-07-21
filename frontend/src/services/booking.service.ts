import api from "./api";

export type RenterInfo = {
  fullName: string;
  phone: string;
  email: string;
  cccdNumber: string;
  cccdFrontImage: string;
  cccdBackImage: string;
  driverLicenseNumber: string;
  driverLicenseImage: string;
  note?: string;
};

export type BookingPriceQuote = {
  rentalMode: "DAILY" | "HOURLY";
  appliedPriceType: "WEEKDAY" | "WEEKEND" | "HOLIDAY" | "MIXED" | string;
  appliedLabel: string;
  unitPrice?: number;
  totalTime: number;
  totalPrice: number;
  rentalSubtotal?: number;
  deliveryFee?: number;
  delivery?: BookingDeliveryPayload & {
    deliveryDistanceKm?: number;
    deliveryBaseFee?: number;
    deliveryFeePerKm?: number;
    deliveryMaxDistanceKm?: number;
  };
  breakdown: Array<{
    date: string;
    type: "WEEKDAY" | "WEEKEND" | "HOLIDAY" | string;
    label: string;
    holidayName?: string;
    unitCount: number;
    unitPrice: number;
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

export type BookingDeliveryPayload = {
  deliveryType: "PICKUP_AT_CAR_LOCATION" | "DELIVERY_TO_CUSTOMER";
  deliveryAddress?: string;
  deliveryAddressText?: string;
  deliveryFormattedAddress?: string;
  deliveryAddressSource?: "MANUAL_TEXT" | "GEOCODE" | "CURRENT_LOCATION" | "MAP_PIN";
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryDistanceKm?: number;
  deliveryDurationText?: string;
  deliveryFee?: number;
  deliveryNote?: string;
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

  getMyBooking: async (id: string) => {
    const res = await api.get(`/bookings/getMyBooking/${id}`);
    return res.data.data.booking;
  },

  getMyPaymentTodos: async () => {
    const res = await api.get("/bookings/my-payment-todos");
    return (res.data.data.todos || []) as PaymentTodo[];
  },

  cancelBooking: async (id: string, cancelReason?: string) => {
    const res = await api.post(`/bookings/cancelBooking/${id}`, {
      cancelReason,
    });
    return res.data.data.booking;
  },
};
