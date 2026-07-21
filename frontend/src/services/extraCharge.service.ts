import api from "./api";

export type ExtraChargeType =
  | "CLEANING"
  | "DAMAGE"
  | "LATE_RETURN"
  | "FUEL"
  | "OTHER";

export type ExtraChargeStatus = "PENDING" | "PAID" | "CANCELLED" | string;

export type ExtraCharge = {
  _id: string;
  bookingId: string;
  type: ExtraChargeType;
  amount: number;
  description: string;
  evidenceImages?: string[];
  status: ExtraChargeStatus;
  paymentMethod?: string;
  paidAt?: string;
  cancelReason?: string;
  createdAt?: string;
};

export const extraChargeService = {
  getByBooking: async (bookingId: string) => {
    const res = await api.get(`/owner/bookings/${bookingId}/extra-charges`);
    return res.data.data.extraCharges as ExtraCharge[];
  },

  create: async (
    bookingId: string,
    data: {
      type: ExtraChargeType;
      amount: number;
      description: string;
      evidenceImages?: string[];
    },
  ) => {
    const res = await api.post(`/owner/bookings/${bookingId}/extra-charges`, data);
    return res.data.data.extraCharge as ExtraCharge;
  },

  confirmCash: async (id: string) => {
    const res = await api.patch(`/owner/extra-charges/${id}/confirm-cash`);
    return res.data.data.extraCharge as ExtraCharge;
  },

  cancel: async (id: string, cancelReason?: string) => {
    const res = await api.patch(`/owner/extra-charges/${id}/cancel`, {
      cancelReason,
    });
    return res.data.data.extraCharge as ExtraCharge;
  },
};
