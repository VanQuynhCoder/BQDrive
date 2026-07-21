import api from "./api";

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
    const res = await api.get("/brand/getAllBrand");
    return res.data.data.brands as PublicBrand[];
  },

  getOneCar: async (id: string, params: HomeCarsParams = {}) => {
    const res = await api.get(`/cars/getOneCar/${id}`, { params });
    return res.data.data.car;
  },
};



