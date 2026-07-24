import api from "./api";
import type { DashboardPaymentStats, RatedCar } from "./admin.service";

export type BusinessStatus = "PENDING" | "APPROVED" | "REJECTED" | string;
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

export type BusinessUser = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  isBlocked: boolean;
};

export type BusinessBrand = {
  _id: string;
  name: string;
  logo?: string;
  description?: string;
};

export type BusinessProfile = {
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
  logo?: string;
  isApproved: boolean;
  isRejected: boolean;
  userId: BusinessUser;
};

export type PublicBusinessPartner = {
  _id: string;
  businessName: string;
  logo?: string | null;
  description?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  address?: string | null;
  website?: string | null;
  createdAt?: string | null;
};

export type PublicPartnerStats = {
  partnerCount: number;
  activeCarCount: number;
  servedAreaCount: number;
};

export type BusinessCar = {
  _id: string;
  name: string;
  type?: string;
  licensePlate?: string;
  brandId: BusinessBrand;
  businessId?: BusinessProfile;
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
  status?: BusinessStatus;
  rejectReason?: string;
  isHidden?: boolean;
  createdAt?: string;
};

export type BusinessBooking = {
  _id: string;
  userId: BusinessUser;
  carId: BusinessCar;
  startDate: string;
  endDate: string;
  totalPrice?: number;
  pickupAddressSnapshot?: string;
  returnAddressSnapshot?: string;
  paymentOption?: string;
  depositAmount?: number;
  remainingAmount?: number;
  paidAmount?: number;
  pricingSnapshot?: {
    rentalSubtotal?: number;
    deliveryFee?: number;
    delivery?: {
      deliveryType?: "PICKUP_AT_CAR_LOCATION" | "DELIVERY_TO_CUSTOMER" | string;
      deliveryAddress?: string;
      deliveryAddressText?: string;
      deliveryFormattedAddress?: string;
      deliveryLat?: number;
      deliveryLng?: number;
      deliveryDistanceKm?: number;
      deliveryDurationText?: string;
      deliveryBaseFee?: number;
      deliveryFeePerKm?: number;
      deliveryMaxDistanceKm?: number;
      deliveryFee?: number;
      deliveryNote?: string;
    };
  };
  isDepositRefundable?: boolean;
  status: BookingStatus;
  note?: string;
  noShowReason?: string;
  noShowAt?: string;
  returnInspection?: {
    inspectionStatus?: string;
  } | null;
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
  payment?: BusinessPayment | null;
};

export type ReturnInspection = {
  _id: string;
  bookingId: string;
  actualReturnAt: string;
  receivedAt?: string;
  returnOdometer?: number;
  returnFuelLevel?: number;
  returnPhotos?: string[];
  conditionNotes?: string;
  isLate?: boolean;
  lateMinutes?: number;
  hasDamage?: boolean;
  hasCleaningIssue?: boolean;
  hasFuelShortage?: boolean;
  inspectionStatus: "RECEIVED" | "INSPECTING" | "CHARGES_PENDING" | "CLEARED" | string;
  inspectedAt?: string;
};

export type ReturnCompletionState = {
  canComplete: boolean;
  blockers: string[];
};

export type ReceiveReturnPayload = {
  actualReturnAt: string;
  returnOdometer?: number;
  returnFuelLevel?: number;
  returnPhotos?: string[];
  conditionNotes?: string;
  hasDamage?: boolean;
  hasCleaningIssue?: boolean;
  hasFuelShortage?: boolean;
};

export type BusinessPayment = {
  _id: string;
  bookingId: BusinessBooking;
  userId: BusinessUser;
  amount: number;
  method?: string;
  status: PaymentStatus;
  paymentType?: string;
  transactionCode?: string;
  paidAt?: string;
  createdAt?: string;
};

export type BusinessDashboard = {
  totalCars: number;
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
  profile?: BusinessProfile;
};

export type CreateCarData = {
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

export type UpdateCarData = Partial<CreateCarData>;

export type UpdateBusinessProfileData = {
  businessName: string;
  phone?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  description?: string;
  logo?: string;
};

type ApiData<T> = {
  data: T;
};

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

export const businessService = {
  getPublicPartners: async () => {
    const res = await api.get("/business/public-partners");
    return unwrap<{
      partners: PublicBusinessPartner[];
      stats: PublicPartnerStats;
    }>(res);
  },

  getDashboard: async () => {
    const res = await api.get("/dashboard/business/stats");
    return unwrap<BusinessDashboard>(res);
  },

  getBrands: async () => {
    const res = await api.get("/brand/getAllBrand");
    return unwrap<{ brands: BusinessBrand[] }>(res).brands;
  },

  getMyCars: async () => {
    const res = await api.get("/cars/getMyCars");
    return unwrap<{ cars: BusinessCar[] }>(res).cars;
  },

  createCar: async (data: CreateCarData) => {
    const res = await api.post("/cars/createCar", data);
    return unwrap<{ car: BusinessCar }>(res).car;
  },

  updateCar: async (id: string, data: UpdateCarData) => {
    const res = await api.post(`/cars/updateCar/${id}`, data);
    return unwrap<{ car: BusinessCar }>(res).car;
  },

  deleteCar: async (id: string) => {
    const res = await api.delete(`/cars/deleteCar/${id}`);
    return unwrap<{ car: BusinessCar }>(res).car;
  },

  hideCar: async (id: string) => {
    const res = await api.post(`/cars/hideCar/${id}`);
    return unwrap<{ car: BusinessCar }>(res).car;
  },

  unhideCar: async (id: string) => {
    const res = await api.post(`/cars/unhideCar/${id}`);
    return unwrap<{ car: BusinessCar }>(res).car;
  },

  getMyBookings: async () => {
    const res = await api.get("/bookings/getBusinessBookings");
    return unwrap<{ bookings: BusinessBooking[] }>(res).bookings;
  },

  confirmBooking: async (id: string) => {
    const res = await api.post(`/bookings/confirmBooking/${id}`);
    return unwrap<{ booking: BusinessBooking }>(res).booking;
  },

  rejectBooking: async (id: string, rejectReason?: string) => {
    const res = await api.post(`/bookings/rejectBooking/${id}`, {
      rejectReason,
    });
    return unwrap<{ booking: BusinessBooking }>(res).booking;
  },

  completeBooking: async (id: string) => {
    const res = await api.post(`/bookings/completeBooking/${id}`);
    return unwrap<{ booking: BusinessBooking }>(res).booking;
  },

  handoverBooking: async (id: string) => {
    const res = await api.post(`/bookings/handoverBooking/${id}`);
    return unwrap<{ booking: BusinessBooking }>(res).booking;
  },

  receiveReturn: async (id: string, data: ReceiveReturnPayload) => {
    const res = await api.post(`/bookings/${id}/receive-return`, data);
    return unwrap<{
      booking: BusinessBooking;
      inspection: ReturnInspection;
      completionState: ReturnCompletionState;
    }>(res);
  },

  getReturnInspection: async (id: string) => {
    const res = await api.get(`/bookings/${id}/return-inspection`);
    return unwrap<{
      booking: BusinessBooking;
      inspection: ReturnInspection | null;
      completionState: ReturnCompletionState;
    }>(res);
  },

  clearReturnInspection: async (id: string, conditionNotes?: string) => {
    const res = await api.post(`/bookings/${id}/inspection/clear`, {
      conditionNotes,
    });
    return unwrap<{
      booking: BusinessBooking;
      inspection: ReturnInspection;
      completionState: ReturnCompletionState;
    }>(res);
  },

  confirmRemainingCash: async (id: string, note?: string) => {
    const res = await api.post(`/bookings/${id}/confirm-remaining-cash`, {
      note,
    });
    return unwrap<{ booking: BusinessBooking }>(res).booking;
  },

  noShowBooking: async (id: string, noShowReason?: string) => {
    const res = await api.post(`/bookings/noShowBooking/${id}`, {
      noShowReason,
    });
    return unwrap<{ booking: BusinessBooking }>(res).booking;
  },

  getPayments: async () => {
    const res = await api.get("/payments/getBusinessPayments");
    return unwrap<{ payments: BusinessPayment[] }>(res).payments;
  },

  getProfile: async () => {
    const res = await api.get("/business/profile");
    return unwrap<{ business: BusinessProfile }>(res).business;
  },

  updateProfile: async (data: UpdateBusinessProfileData) => {
    const res = await api.patch("/business/profile", data);
    return unwrap<{ business: BusinessProfile }>(res).business;
  },
};






