import api from "./api";

export type UserRole = "CUSTOMER" | "BUSINESS" | "PRIVATE_OWNER" | "ADMIN";

export type AdminUser = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  isBlocked?: boolean;
  createdAt?: string;
};

export type AdminBusiness = {
  _id: string;
  businessName: string;
  businessType?: string;
  phone?: string;
  address?: string;
  description?: string;
  isApproved?: boolean;
  isRejected?: boolean;
  userId?: AdminUser;
  carCount?: number;
  totalCars?: number;
  createdAt?: string;
};

export type PrivateOwnerRequest = {
  _id: string;
  userId?: AdminUser;
  fullName: string;
  phone: string;
  identityNumber: string;
  frontImage?: string;
  backImage?: string;
  address?: string;
  reason?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote?: string;
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
  brandId?: AdminBrand;
  businessId?: AdminBusiness;
  pricePerDay?: number;
  pricePerHour?: number;
  rentalUnit?: "DAY" | "HOUR" | string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
  description?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED" | string;
  rejectReason?: string;
  createdAt?: string;
};

export type DashboardStats = {
  totalUsers: number;
  totalBusinesses: number;
  totalPrivateOwners?: number;
  totalCars: number;
  pendingCars: number;
  pendingBookings?: number;
  totalBookings?: number;
  revenue?: number;
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
  phone: string;
  address: string;
  description?: string;
};

type UsersParams = {
  role?: string;
  keyword?: string;
};

type PrivateOwnerParams = {
  status?: string;
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
    const res = await api.get("/dashboard/admin");
    return unwrap<DashboardStats>(res);
  },

  getUsers: async (params?: UsersParams) => {
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

  getPrivateOwnerRequests: async (params?: PrivateOwnerParams) => {
    const res = await api.get("/private-owner-requests/admin/getAll", {
      params,
    });
    return unwrap<{ requests: PrivateOwnerRequest[] }>(res).requests;
  },

  approvePrivateOwner: async (id: string, adminNote?: string) => {
    const res = await api.post(`/private-owner-requests/admin/approve/${id}`, {
      adminNote,
    });
    return unwrap<{ request: PrivateOwnerRequest }>(res).request;
  },

  rejectPrivateOwner: async (id: string, adminNote: string) => {
    const res = await api.post(`/private-owner-requests/admin/reject/${id}`, {
      adminNote,
    });
    return unwrap<{ request: PrivateOwnerRequest }>(res).request;
  },

  getBrands: async () => {
    const res = await api.get("/brand/getAllBrand");
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

  getCars: async (params?: CarsParams) => {
    const res = await api.get("/cars/getAllCars", { params });
    return unwrap<{ cars: AdminCar[] }>(res).cars;
  },

  approveCar: async (id: string) => {
    const res = await api.post(`/cars/approveCar/${id}`);
    return unwrap<{ car: AdminCar }>(res).car;
  },

  rejectCar: async (id: string, rejectReason: string) => {
    const res = await api.post(`/cars/rejectCar/${id}`, { rejectReason });
    return unwrap<{ car: AdminCar }>(res).car;
  },
};
