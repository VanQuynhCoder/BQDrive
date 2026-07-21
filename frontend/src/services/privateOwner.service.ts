import api from "./api";
import type { DashboardPaymentStats, RatedCar } from "./admin.service";

export type PrivateOwnerStatus = "PENDING" | "APPROVED" | "REJECTED" | string;
export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW"
  | string;
export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | string;
export type RentalUnit = "DAY" | "HOUR";
export type RentalMode = "DAILY" | "HOURLY";
export type FuelType = "GASOLINE" | "DIESEL" | "ELECTRIC" | "HYBRID" | string;

export type PrivateOwnerUser = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  isBlocked: boolean;
};

export type PrivateOwnerBrand = {
  _id: string;
  name: string;
  logo?: string;
  description?: string;
};

export type PrivateOwnerProfile = {
  _id: string;
  businessName: string;
  businessType?: string;
  phone?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  description?: string;
  isApproved: boolean;
  isRejected: boolean;
  userId: PrivateOwnerUser;
};

export type PrivateOwnerCar = {
  _id: string;
  name: string;
  type?: string;
  licensePlate?: string;
  brandId: PrivateOwnerBrand;
  businessId?: PrivateOwnerProfile;
  pricePerDay?: number;
  pricePerHour?: number;
  pricing?: {
    weekdayPricePerDay?: number;
    weekendPricePerDay?: number;
    holidayPricePerDay?: number;
    pricePerHour?: number;
    weekendPricePerHour?: number;
    holidayPricePerHour?: number;
  };
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit?: RentalUnit | string;
  seats?: number;
  fuelType?: FuelType;
  transmission?: string;
  images?: string[];
  description?: string;
  pickupAddress?: string;
  pickupFormattedAddress?: string;
  pickupPlaceId?: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupProvince?: string;
  pickupDistrict?: string;
  pickupWard?: string;
  pickupNote?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
  latitude?: number;
  longitude?: number;
  deliveryEnabled?: boolean;
  deliveryBaseFee?: number;
  deliveryFeePerKm?: number;
  deliveryMaxDistanceKm?: number;
  deliveryNote?: string;
  status?: PrivateOwnerStatus;
  rejectReason?: string;
  isHidden?: boolean;
  createdAt?: string;
};

export type PrivateOwnerBooking = {
  _id: string;
  userId: PrivateOwnerUser;
  carId: PrivateOwnerCar;
  startDate: string;
  endDate: string;
  totalPrice?: number;
  paymentOption?: string;
  depositAmount?: number;
  remainingAmount?: number;
  paidAmount?: number;
  isDepositRefundable?: boolean;
  status: BookingStatus;
  note?: string;
  noShowReason?: string;
  noShowAt?: string;
  renterInfo?: {
    fullName?: string;
    phone?: string;
    email?: string;
    cccdNumber?: string;
    cccdFrontImage?: string;
    cccdBackImage?: string;
    driverLicenseNumber?: string;
    driverLicenseImage?: string;
    note?: string;
  };
  createdAt?: string;
  payment?: PrivateOwnerPayment | null;
};

export type PrivateOwnerPayment = {
  _id: string;
  bookingId: PrivateOwnerBooking;
  userId: PrivateOwnerUser;
  amount: number;
  method?: string;
  status: PaymentStatus;
  paymentType?: string;
  transactionCode?: string;
  paidAt?: string;
  createdAt?: string;
};

export type PrivateOwnerDashboard = {
  totalCars: number;
  totalConsignmentCars?: number;
  approvedCars: number;
  pendingCars: number;
  rejectedCars: number;
  rentedCars?: number;
  hiddenCars?: number;
  totalBookings?: number;
  pendingBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  inProgressBookings?: number;
  revenueToday: number;
  revenueThisMonth: number;
  totalRevenue: number;
  totalPaidRevenue?: number;
  totalReviews?: number;
  averageRating?: number;
  overview?: {
    totalCars?: number;
    totalConsignmentCars?: number;
    pendingCars?: number;
    approvedCars?: number;
    rentedCars?: number;
    rejectedCars?: number;
    hiddenCars?: number;
    totalBookings?: number;
    pendingBookings?: number;
    confirmedBookings?: number;
    inProgressBookings?: number;
    completedBookings?: number;
    totalPaidRevenue?: number;
    totalReviews?: number;
    averageRating?: number;
  };
  paymentStats?: DashboardPaymentStats;
  recentBookings?: Array<{
    bookingId: string;
    bookingCode: string;
    carName: string;
    renterName: string;
    status: string;
    totalPrice: number;
    createdAt?: string;
  }>;
  topRatedCars?: RatedCar[];
  lowRatedCars?: RatedCar[];
  mostReviewedCars?: RatedCar[];
  profile?: PrivateOwnerProfile;
};

export type CreatePrivateOwnerCarData = {
  brandId?: string;
  name: string;
  type: string;
  licensePlate?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  pricing?: {
    weekdayPricePerDay?: number;
    weekendPricePerDay?: number;
    holidayPricePerDay?: number;
    pricePerHour?: number;
    weekendPricePerHour?: number;
    holidayPricePerHour?: number;
  };
  allowDailyRental: boolean;
  allowHourlyRental: boolean;
  rentalUnit?: RentalUnit;
  seats?: number;
  fuelType: FuelType;
  transmission?: string;
  images?: string[];
  description?: string;
  pickupAddress?: string;
  pickupFormattedAddress?: string;
  pickupPlaceId?: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupProvince?: string;
  pickupDistrict?: string;
  pickupWard?: string;
  pickupNote?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
  latitude?: number;
  longitude?: number;
  deliveryEnabled?: boolean;
  deliveryBaseFee?: number;
  deliveryFeePerKm?: number;
  deliveryMaxDistanceKm?: number;
  deliveryNote?: string;
};

export type UpdatePrivateOwnerCarData = Partial<CreatePrivateOwnerCarData>;

type ApiData<T> = {
  data: T;
};

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

export const privateOwnerService = {
  getDashboard: async () => {
    const res = await api.get("/dashboard/consignment/stats");
    return unwrap<PrivateOwnerDashboard>(res);
  },
  getBrands: async () => {
    const res = await api.get("/brand/getAllBrand");
    return unwrap<{ brands: PrivateOwnerBrand[] }>(res).brands;
  },

  getMyCars: async () => {
    const res = await api.get("/cars/getMyCars");
    return unwrap<{ cars: PrivateOwnerCar[] }>(res).cars;
  },

  createCar: async (data: CreatePrivateOwnerCarData) => {
    const res = await api.post("/cars/createCar", data);
    return unwrap<{ car: PrivateOwnerCar }>(res).car;
  },

  updateCar: async (id: string, data: UpdatePrivateOwnerCarData) => {
    const res = await api.post(`/cars/updateCar/${id}`, data);
    return unwrap<{ car: PrivateOwnerCar }>(res).car;
  },

  deleteCar: async (id: string) => {
    const res = await api.delete(`/cars/deleteCar/${id}`);
    return unwrap<{ car: PrivateOwnerCar }>(res).car;
  },

  hideCar: async (id: string) => {
    const res = await api.post(`/cars/hideCar/${id}`);
    return unwrap<{ car: PrivateOwnerCar }>(res).car;
  },

  unhideCar: async (id: string) => {
    const res = await api.post(`/cars/unhideCar/${id}`);
    return unwrap<{ car: PrivateOwnerCar }>(res).car;
  },

  getMyBookings: async () => {
    const res = await api.get("/bookings/getBusinessBookings");
    return unwrap<{ bookings: PrivateOwnerBooking[] }>(res).bookings;
  },

  confirmBooking: async (id: string) => {
    const res = await api.post(`/bookings/confirmBooking/${id}`);
    return unwrap<{ booking: PrivateOwnerBooking }>(res).booking;
  },

  rejectBooking: async (id: string, rejectReason?: string) => {
    const res = await api.post(`/bookings/rejectBooking/${id}`, {
      rejectReason,
    });
    return unwrap<{ booking: PrivateOwnerBooking }>(res).booking;
  },

  completeBooking: async (id: string) => {
    const res = await api.post(`/bookings/completeBooking/${id}`);
    return unwrap<{ booking: PrivateOwnerBooking }>(res).booking;
  },

  handoverBooking: async (id: string) => {
    const res = await api.post(`/bookings/handoverBooking/${id}`);
    return unwrap<{ booking: PrivateOwnerBooking }>(res).booking;
  },

  confirmRemainingCash: async (id: string, note?: string) => {
    const res = await api.post(`/bookings/${id}/confirm-remaining-cash`, {
      note,
    });
    return unwrap<{ booking: PrivateOwnerBooking }>(res).booking;
  },

  noShowBooking: async (id: string, noShowReason?: string) => {
    const res = await api.post(`/bookings/noShowBooking/${id}`, {
      noShowReason,
    });
    return unwrap<{ booking: PrivateOwnerBooking }>(res).booking;
  },

  getMyPayments: async () => {
    const res = await api.get("/payments/getBusinessPayments");
    return unwrap<{ payments: PrivateOwnerPayment[] }>(res).payments;
  },
};







