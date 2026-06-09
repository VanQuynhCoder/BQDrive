import api from "./api";

type HomeCarsParams = {
  startDate?: string;
  endDate?: string;
  rentalMode?: "DAILY" | "HOURLY";
};

export const carService = {
  getHomeCars: async (params?: HomeCarsParams) => {
    const res = await api.get("/cars/getHomeCars", { params });
    return res.data.data.cars;
  },

  getOneCar: async (id: string, params?: HomeCarsParams) => {
    const res = await api.get(`/cars/getOneCar/${id}`, { params });
    return res.data.data.car;
  },
};
