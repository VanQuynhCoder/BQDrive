// Shared contracts plus ADMIN API; selected DTO types are reused by owner services.
import api from "./api";

import type { CarMileagePolicy } from "./car.service";
import type { OwnerMapCar } from "./ownerCarLocation.service";
import type { CarPricing } from "../types/pricing";

export type UserRole = "USER" | "ADMIN";

export type AdminUserReference = {
  _id: string;
  name?: string;
  email?: string;
  role?: UserRole;
};

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
  avatar?: string;
  bio?: string;
  cccdNumber?: string;
  cccdFrontImage?: string;
  cccdBackImage?: string;
  driverLicenseNumber?: string;
  driverLicenseImage?: string;
  driverLicenseClass?: "B" | "B1" | "B2";
  identityProfileCompleted?: boolean;
  identityVerificationStatus?: "INCOMPLETE" | "PENDING" | "VERIFIED" | "REJECTED";
  identityVerificationReason?: string;
  identitySubmittedAt?: string;
  identityReviewedAt?: string;
  identityReviewedBy?: AdminUserReference | string;
  role: UserRole;
  isBlocked: boolean;
  blockedReason?: string;
  blockedAt?: string;
  blockedBy?: AdminUserReference | string;
  isVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  carCode?: string | null;
  name: string;
  type?: string;
  licensePlate?: string;
  brandId: AdminBrand;
  ownerId: AdminUser | string;
  pricing?: CarPricing;
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit?: "DAY" | "HOUR" | string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  currentOdometerKm?: number | null;
  mileagePolicy?: CarMileagePolicy | null;
  images?: string[];
  registrationCardImages?: string[];
  approvalSubmission?: {
    submissionType: "CREATE" | "UPDATE" | "RESUBMIT";
    submittedAt?: string;
    submittedByRole?: string;
    changes?: Array<{
      field: string;
      label: string;
      previousValue?: unknown;
      currentValue?: unknown;
    }>;
  };
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
  updatedAt?: string;
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

export type AdminReview = {
  id: string;
  bookingId?: string;
  bookingCode?: string;
  carName: string;
  licensePlate?: string;
  renterName: string;
  renterEmail?: string;
  renterAvatar?: string;
  rating: number;
  criteria?: Record<string, number>;
  comment?: string;
  images?: string[];
  helpfulCount: number;
  ownerReply?: { content?: string } | null;
  status: "VISIBLE" | "REPORTED" | "HIDDEN" | string;
  report?: { reason?: string; reportedAt?: string } | null;
  hiddenReason?: string;
  hiddenAt?: string;
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

  totalPrivateOwners: number;
  totalConsignmentOwners: number;
  totalCars: number;
  pendingCars: number;
  pendingConsignmentCars: number;

  pendingBookings: number;
  totalBookings?: number;
  revenue?: number;
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


type UsersParams = {
  role?: string;
  keyword?: string;
};

type CarsParams = {
  status?: string;
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

  getUserDetail: async (id: string) => {
    const res = await api.get(`/admin/users/${id}`);
    return unwrap<{ user: AdminUser }>(res).user;
  },

  approveUserIdentity: async (id: string) => {
    const res = await api.post(`/admin/users/${id}/identity/approve`);
    return unwrap<{ user: AdminUser }>(res).user;
  },

  rejectUserIdentity: async (id: string, reason: string) => {
    const res = await api.post(`/admin/users/${id}/identity/reject`, { reason });
    return unwrap<{ user: AdminUser }>(res).user;
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

  getAdminReviews: async (status?: string) => {
    const res = await api.get("/admin/reviews", {
      params: status ? { status } : undefined,
    });
    return unwrap<{ reviews: AdminReview[] }>(res).reviews;
  },

  hideReview: async (id: string, reason: string) => {
    const res = await api.patch(`/admin/reviews/${id}/hide`, { reason });
    return unwrap<{ review: AdminReview }>(res).review;
  },

  showReview: async (id: string) => {
    const res = await api.patch(`/admin/reviews/${id}/show`);
    return unwrap<{ review: AdminReview }>(res).review;
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




