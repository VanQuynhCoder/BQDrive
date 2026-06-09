import api from "./api";

export const cartService = {
  addToCart: async (data: {
    carId: string;
    startDate: string;
    endDate: string;
    rentalMode: "DAILY" | "HOURLY";
  }) => {
    const res = await api.post("/cart/addToCart", data);
    return res.data.data.cart;
  },

  getMyCart: async () => {
    const res = await api.get("/cart/getMyCart");
    return res.data.data.carts;
  },

  removeFromCart: async (id: string) => {
    const res = await api.delete(`/cart/removeFromCart/${id}`);
    return res.data.data.cart;
  },

  bookingFromCart: async (cartId: string) => {
    const res = await api.post(`/bookings/bookingFromCart/${cartId}`);
    return res.data.data.booking;
  },
};
