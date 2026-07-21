import api from "./api";

export type PublicHoliday = {
  _id: string;
  name: string;
  date?: string;
  startDate: string;
  endDate: string;
  country: string;
  type: string;
  isActive: boolean;
  note?: string;
};

export const holidayService = {
  getPublicHolidays: async (params: {
    startDate: string;
    endDate: string;
  }) => {
    const res = await api.get("/holidays/public", { params });
    return res.data.data.holidays as PublicHoliday[];
  },
};
