import api from "./api";

type HomeCarsParams = {
  startDate?: string;
  endDate?: string;
};

export const carService = {
  getHomeCars: async (params?: HomeCarsParams) => {
    const res = await api.get("/cars/getHomeCars", { params });
    return res.data.data.cars;
  },

  getOneCar: async (id: string) => {
    const res = await api.get(`/cars/getOneCar/${id}`);
    return res.data.data.car;
  },
};
