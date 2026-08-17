//  Kiểu dữ liệu booking theo từng xe của chủ xe ký gửi.
export type OwnerCarBookingGroup =
  | "ALL"
  | "ACTIVE"
  | "UPCOMING"
  | "HISTORY"
  | "CANCELLED";

export type OwnerCarBookingItem = {
  _id: string;
  bookingCode: string;
  carId: string;
  startDate: string;
  endDate: string;
  actualPickupAt?: string | null;
  actualReturnAt?: string | null;
  status: string;
  rentalMode: string;
  totalPrice: number;
  paidAmount: number;
  remainingAmount: number;
  delivery: {
    deliveryType: string;
    address?: string;
    distanceKm?: number;
    fee?: number;
  };
  pickupAddressSnapshot?: string;
  renter: {
    name: string;
    email?: string;
    phone?: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type OwnerCarBookingsResponse = {
  car: {
    _id: string;
    carCode?: string | null;
    name: string;
    licensePlate: string;
    image?: string | null;
  };
  summary: {
    all: number;
    active: number;
    upcoming: number;
    completed: number;
    cancelled: number;
    activeBooking?: OwnerCarBookingItem | null;
    nextBooking?: OwnerCarBookingItem | null;
  };
  bookings: OwnerCarBookingItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export type GetOwnerCarBookingsParams = {
  group?: OwnerCarBookingGroup;
  page?: number;
  limit?: number;
};
