import api from "./api";

import type { OwnerMapCar } from "./ownerCarLocation.service";

export type UserRole = "USER" | "BUSINESS" | "ADMIN";

export type AdminUser = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  role: UserRole;
  isBlocked: boolean;
  createdAt?: string;
};

export type AdminBusiness = {
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
  userId?: AdminUser | null;
  carCount: number;
  totalCars: number;
  createdAt?: string;
};

export type AdminBrand = {
  _id: string;
  name: string;
  logo?: string;
  description?: string;
  createdAt?: string;
};

export type AdminCar = {
  _id: string;
  name: string;
  type?: string;
  licensePlate?: string;
  brandId: AdminBrand;
  ownerId: AdminUser | AdminBusiness | string;
  ownerType?: "USER" | "BUSINESS" | string;
  ownerModel?: "User" | "Business" | string;
  businessId?: AdminBusiness;
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
  rentalUnit?: "DAY" | "HOUR" | string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
  description?: string;
  pickupAddress?: string;
  pickupFormattedAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupNote?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  rejectReason?: string;
  createdAt?: string;
};

export type AdminHoliday = {
  _id: string;
  name: string;
  date?: string;
  startDate: string;
  endDate: string;
  type: "HOLIDAY" | string;
  isActive: boolean;
  note?: string;
  createdAt?: string;
};

export type HolidayPayload = {
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
  note?: string;
};

export type DashboardStats = {
  totalUsers: number;
  totalBusinesses: number;
  totalPrivateOwners: number;
  totalConsignmentOwners: number;
  totalCars: number;
  pendingCars: number;
  pendingConsignmentCars: number;
  pendingBusinessCars: number;
  pendingBookings: number;
  totalBookings?: number;
  revenue?: number;
  businessRevenue?: number;
  userConsignmentRevenue?: number;
  approvedCars?: number;
  rentedCars?: number;
  rejectedCars?: number;
  hiddenCars?: number;
  completedBookings?: number;
  cancelledBookings?: number;
  noShowBookings?: number;
  totalPaidRevenue?: number;
  totalReviews?: number;
  averageRating?: number;
  overview?: DashboardOverview;
  bookingStatusStats?: Array<{ status: string; count: number }>;
  carStatusStats?: Array<{ status: string; count: number }>;
  paymentStats?: DashboardPaymentStats;
  topRatedCars?: RatedCar[];
  lowRatedCars?: RatedCar[];
  mostReviewedCars?: RatedCar[];
};

export type DashboardOverview = {
  totalUsers?: number;
  totalBusinesses?: number;
  totalCars?: number;
  pendingCars?: number;
  approvedCars?: number;
  rentedCars?: number;
  rejectedCars?: number;
  hiddenCars?: number;
  totalBookings?: number;
  pendingBookings?: number;
  completedBookings?: number;
  cancelledBookings?: number;
  noShowBookings?: number;
  totalPaidRevenue?: number;
  totalReviews?: number;
  averageRating?: number;
  totalConsignmentOwners?: number;
  pendingConsignmentCars?: number;
  pendingBusinessCars?: number;
};

export type DashboardPaymentStats = {
  paidAmount: number;
  pendingAmount: number;
  failedCount: number;
  refundedAmount: number;
};

export type RatedCar = {
  carId: string;
  carName: string;
  licensePlate?: string;
  image?: string;
  ownerName?: string;
  averageRating: number;
  reviewCount: number;
  latestReviewAt?: string;
};

export type SendBusinessOtpData = {
  email: string;
};

export type VerifyBusinessOtpData = {
  email: string;
  otp: string;
};

export type CreateBusinessData = {
  businessName: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  description?: string;
};

type UsersParams = {
  role?: string;
  keyword?: string;
};

type CarsParams = {
  status?: string;
  ownerType?: string;
  brandId?: string;
  type?: string;
  keyword?: string;
};

type ApiData<T> = {
  data: T;
};

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

export const adminService = {
  getDashboardStats: async () => {
    const res = await api.get("/dashboard/admin/stats");
    return unwrap<DashboardStats>(res);
  },

  getUsers: async (params: UsersParams = {}) => {
    const res = await api.get("/admin/users", { params });
    return unwrap<{ users: AdminUser[] }>(res).users;
  },

  blockUser: async (id: string, reason: string) => {
    const res = await api.post(`/admin/users/block/${id}`, { reason });
    return unwrap<{ user: AdminUser }>(res).user;
  },

  unblockUser: async (id: string) => {
    const res = await api.post(`/admin/users/unblock/${id}`);
    return unwrap<{ user: AdminUser }>(res).user;
  },

  deleteUser: async (id: string, reason: string) => {
    const res = await api.delete(`/admin/users/delete/${id}`, {
      data: { reason },
    });
    return unwrap<{ user: AdminUser }>(res).user;
  },

  getBusinesses: async () => {
    try {
      const res = await api.get("/admin/businesses");
      return unwrap<{ businesses: AdminBusiness[] }>(res).businesses;
    } catch {
      const res = await api.get("/business/getAllBusiness");
      return unwrap<{ businesses: AdminBusiness[] }>(res).businesses;
    }
  },

  sendBusinessOtp: async (data: SendBusinessOtpData) => {
    const res = await api.post("/admin/business/send-otp", data);
    return res.data;
  },

  verifyBusinessOtp: async (data: VerifyBusinessOtpData) => {
    const res = await api.post("/admin/business/verify-otp", data);
    return res.data;
  },

  createBusiness: async (data: CreateBusinessData) => {
    const res = await api.post("/admin/business/create", data);
    return unwrap<{ user: AdminUser; business: AdminBusiness }>(res);
  },

  blockBusiness: async (id: string, reason: string) => {
    const res = await api.post(`/admin/business/block/${id}`, { reason });
    return unwrap<{ business: AdminBusiness }>(res).business;
  },

  unblockBusiness: async (id: string) => {
    const res = await api.post(`/admin/business/unblock/${id}`);
    return unwrap<{ business: AdminBusiness }>(res).business;
  },

  deleteBusiness: async (id: string, reason: string) => {
    const res = await api.delete(`/admin/business/delete/${id}`, {
      data: { reason },
    });
    return unwrap<{ business: AdminBusiness }>(res).business;
  },

  getBrands: async () => {
    const res = await api.get("/brand/getAllBrand", {
      params: { includeDescription: true },
    });
    return unwrap<{ brands: AdminBrand[] }>(res).brands;
  },

  createBrand: async (data: Omit<AdminBrand, "_id" | "createdAt">) => {
    const res = await api.post("/brand/createBrand", data);
    return unwrap<{ brand: AdminBrand }>(res).brand;
  },

  updateBrand: async (
    id: string,
    data: Omit<AdminBrand, "_id" | "createdAt">,
  ) => {
    const res = await api.post(`/brand/updateBrand/${id}`, data);
    return unwrap<{ brand: AdminBrand }>(res).brand;
  },

  deleteBrand: async (id: string) => {
    const res = await api.delete(`/brand/deleteBrand/${id}`);
    return unwrap<{ brand: AdminBrand }>(res).brand;
  },

  getPendingCars: async () => {
    const res = await api.get("/cars/getPendingCars");
    return unwrap<{ cars: AdminCar[] }>(res).cars;
  },

  getCars: async (params: CarsParams = {}) => {
    const res = await api.get("/cars/getAllCars", { params });
    return unwrap<{ cars: AdminCar[] }>(res).cars;
  },

  getCarsMap: async () => {
    const res = await api.get("/admin/cars/map");
    return unwrap<{ cars: OwnerMapCar[] }>(res).cars;
  },

  approveCar: async (id: string) => {
    const res = await api.post(`/cars/approveCar/${id}`);
    return unwrap<{ car: AdminCar }>(res).car;
  },

  rejectCar: async (id: string, rejectReason: string) => {
    const res = await api.post(`/cars/rejectCar/${id}`, { rejectReason });
    return unwrap<{ car: AdminCar }>(res).car;
  },

  getHolidays: async () => {
    const res = await api.get("/admin/holidays");
    return unwrap<{ holidays: AdminHoliday[] }>(res).holidays;
  },

  createHoliday: async (data: HolidayPayload) => {
    const res = await api.post("/admin/holidays", data);
    return unwrap<{ holiday: AdminHoliday }>(res).holiday;
  },

  updateHoliday: async (id: string, data: HolidayPayload) => {
    const res = await api.put(`/admin/holidays/${id}`, data);
    return unwrap<{ holiday: AdminHoliday }>(res).holiday;
  },

  toggleHoliday: async (id: string) => {
    const res = await api.patch(`/admin/holidays/${id}/toggle`);
    return unwrap<{ holiday: AdminHoliday }>(res).holiday;
  },

  deleteHoliday: async (id: string) => {
    const res = await api.delete(`/admin/holidays/${id}`);
    return unwrap<{ holiday: AdminHoliday }>(res).holiday;
  },
};






