import api from "./api";

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
export type FuelType = "GASOLINE" | "DIESEL" | "ELECTRIC" | "HYBRID" | string;

export type BusinessUser = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  isBlocked?: boolean;
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
  description?: string;
  isApproved?: boolean;
  isRejected?: boolean;
  userId?: BusinessUser;
};

export type BusinessCar = {
  _id: string;
  name: string;
  type?: string;
  licensePlate?: string;
  brandId?: BusinessBrand;
  businessId?: BusinessProfile;
  pricePerDay?: number;
  pricePerHour?: number;
  rentalUnit?: RentalUnit | string;
  seats?: number;
  fuelType?: FuelType;
  transmission?: string;
  images?: string[];
  description?: string;
  status?: BusinessStatus;
  rejectReason?: string;
  createdAt?: string;
};

export type BusinessBooking = {
  _id: string;
  userId?: BusinessUser;
  carId?: BusinessCar;
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
  createdAt?: string;
};

export type BusinessPayment = {
  _id: string;
  bookingId?: BusinessBooking;
  userId?: BusinessUser;
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
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  revenueToday: number;
  revenueThisMonth: number;
  totalRevenue: number;
  profile?: BusinessProfile;
};

export type CreateCarData = {
  brandId: string;
  name: string;
  type: string;
  licensePlate?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  rentalUnit: RentalUnit;
  seats: number;
  fuelType: FuelType;
  transmission?: string;
  images?: string[];
  description?: string;
};

export type UpdateCarData = Partial<CreateCarData>;

export type UpdateBusinessProfileData = {
  businessName: string;
  phone?: string;
  address?: string;
  description?: string;
};

type ApiData<T> = {
  data: T;
};

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

export const businessService = {
  getDashboard: async () => {
    const res = await api.get("/business/dashboard");
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

  getMyBookings: async () => {
    const res = await api.get("/bookings/getBusinessBookings");
    return unwrap<{ bookings: BusinessBooking[] }>(res).bookings;
  },

  confirmBooking: async (id: string) => {
    const res = await api.post(`/bookings/confirmBooking/${id}`);
    return unwrap<{ booking: BusinessBooking }>(res).booking;
  },

  completeBooking: async (id: string) => {
    const res = await api.post(`/bookings/completeBooking/${id}`);
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
    const res = await api.post("/business/profile", data);
    return unwrap<{ business: BusinessProfile }>(res).business;
  },
};
