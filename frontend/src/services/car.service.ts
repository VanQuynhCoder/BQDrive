import api from "./api";

import type { CarPricing } from "../types/pricing";

type HomeCarsParams = {
  location?: string;
  pickupProvince?: string;
  pickupDistrict?: string;
  pickupWard?: string;
  startDate?: string;
  endDate?: string;
  rentalMode?: "DAILY" | "HOURLY";
  minPrice?: number;
  maxPrice?: number;
  seats?: number;
  brandId?: string;
  categoryId?: string;
  fuelType?: string;
  type?: string;
  transmission?: string;
  sort?: string;
  deliveryOnly?: boolean;
  minRating?: number;
  userLat?: number;
  userLng?: number;
};

export type PublicBrand = {
  _id: string;
  name: string;
  logo?: string;
};

export type CarMileagePolicy = {
  includedKmPerDay?: number | null;
  includedKmPerHour?: number | null;
  overageFeePerKm?: number | null;
  graceKm?: number | null;
};

export type PublicCarPricing = CarPricing;

export type CalendarUnavailableRange = {
  startDate: string;
  endDate: string;
  type: "UNAVAILABLE";
};

export const carService = {
  getHomeCars: async (params: HomeCarsParams = {}) => {
    const res = await api.get("/cars/getHomeCars", { params });
    return res.data.data.cars;
  },

  searchCars: async (params: HomeCarsParams = {}) => {
    const res = await api.get("/cars/search", { params });
    return res.data.data.cars;
  },

  getBrands: async () => {
    const res = await api.get("/brand/getAllBrand", {
      params: { includeLogo: true },
    });
    return res.data.data.brands as PublicBrand[];
  },

  getOneCar: async (id: string, params: HomeCarsParams = {}) => {
    const res = await api.get(`/cars/getOneCar/${id}`, { params });
    return res.data.data.car;
  },

  getAvailabilityCalendar: async (id: string, params: { from: string; to: string }) => {
    const res = await api.get(`/cars/${id}/availability-calendar`, { params });
    return res.data.data.ranges as CalendarUnavailableRange[];
  },
};



