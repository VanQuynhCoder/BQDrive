import api from "./api";

export const bookingService = {
  createBooking: async (data: {
    carId: string;
    startDate: string;
    endDate: string;
    rentalMode: "DAILY" | "HOURLY";
    note?: string;
    paymentOption?: "DEPOSIT" | "FULL";
  }) => {
    const res = await api.post("/bookings/createBooking", data);
    return res.data.data.booking;
  },

  getMyBookings: async () => {
    const res = await api.get("/bookings/getMyBookings");
    return res.data.data.bookings;
  },

  getMyBooking: async (id: string) => {
    const res = await api.get(`/bookings/getMyBooking/${id}`);
    return res.data.data.booking;
  },

  cancelBooking: async (id: string, cancelReason?: string) => {
    const res = await api.post(`/bookings/cancelBooking/${id}`, {
      cancelReason,
    });
    return res.data.data.booking;
  },
};
