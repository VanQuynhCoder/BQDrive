import api from "./api";

export const bookingService = {
  createBooking: async (data: {
    carId: string;
    startDate: string;
    endDate: string;
    note?: string;
  }) => {
    const res = await api.post("/bookings/createBooking", data);
    return res.data.data.booking;
  },

  getMyBookings: async () => {
    const res = await api.get("/bookings/getMyBookings");
    return res.data.data.bookings;
  },

  cancelBooking: async (id: string, cancelReason?: string) => {
    const res = await api.post(`/bookings/cancelBooking/${id}`, {
      cancelReason,
    });
    return res.data.data.booking;
  },
};