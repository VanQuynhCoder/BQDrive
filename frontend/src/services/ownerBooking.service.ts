// API xử lý booking dành cho người dùng có xe ký gửi.
import api from "./api";
import type { CancellationPreview } from "./booking.service";
import type {
  OwnerBookingDetail,
  OwnerHandoverPayload,
  OwnerBookingListParams,
  OwnerBookingListResponse,
  OwnerReturnInspectionResponse,
  OwnerReturnPayload,
} from "../types/ownerBooking";

type ApiData<T> = { data: T };

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

export const ownerBookingService = {
  getBookings: async (params: OwnerBookingListParams) => {
    const response = await api.get("/owner/bookings", { params });
    return unwrap<OwnerBookingListResponse>(response);
  },

  getBookingDetail: async (bookingId: string) => {
    const response = await api.get(`/owner/bookings/${bookingId}`);
    return unwrap<{ booking: OwnerBookingDetail }>(response).booking;
  },

  approveBooking: async (bookingId: string) => {
    const response = await api.post(`/bookings/confirmBooking/${bookingId}`);
    return unwrap<{ booking: unknown }>(response).booking;
  },

  rejectBooking: async (bookingId: string, rejectReason: string) => {
    const response = await api.post(`/bookings/rejectBooking/${bookingId}`, {
      rejectReason,
    });
    return unwrap<{ booking: unknown }>(response).booking;
  },

  markNoShow: async (bookingId: string, noShowReason?: string) => {
    const response = await api.post(`/bookings/${bookingId}/no-show`, {
      noShowReason,
    });
    return unwrap<{ booking: unknown }>(response).booking;
  },

  previewCancellation: async (
    bookingId: string,
    payload: { reasonCode: string; reasonText: string },
  ) => {
    const response = await api.post(
      `/bookings/cancellation-preview/${bookingId}`,
      payload,
    );
    return unwrap<{ preview: CancellationPreview }>(response).preview;
  },

  cancelBooking: async (
    bookingId: string,
    payload: {
      reasonCode: string;
      reasonText: string;
      confirmed: true;
    },
  ) => {
    const response = await api.post(`/bookings/cancelBooking/${bookingId}`, payload);
    return {
      ...unwrap<{ booking: unknown; refund?: unknown }>(response),
      message: response.data.message,
    };
  },

  handoverBooking: async (
    bookingId: string,
    payload: OwnerHandoverPayload,
  ) => {
    const response = await api.post(
      `/bookings/handoverBooking/${bookingId}`,
      payload,
    );
    return unwrap<{ booking: unknown }>(response).booking;
  },

  receiveReturn: async (bookingId: string, payload: OwnerReturnPayload) => {
    const response = await api.post(
      `/bookings/${bookingId}/receive-return`,
      payload,
    );
    return unwrap<OwnerReturnInspectionResponse & { booking: unknown }>(response);
  },

  getReturnInspection: async (bookingId: string) => {
    const response = await api.get(`/bookings/${bookingId}/return-inspection`);
    return unwrap<OwnerReturnInspectionResponse>(response);
  },

  clearReturnInspection: async (
    bookingId: string,
    conditionNotes?: string,
  ) => {
    const response = await api.post(`/bookings/${bookingId}/inspection/clear`, {
      conditionNotes,
    });
    return unwrap<OwnerReturnInspectionResponse>(response);
  },

  confirmRemainingCash: async (bookingId: string, note?: string) => {
    const response = await api.post(
      `/bookings/${bookingId}/confirm-remaining-cash`,
      { note },
    );
    return unwrap<{
      booking: unknown;
      payment: unknown;
      paymentSummary: unknown;
    }>(response);
  },

  completeBooking: async (bookingId: string) => {
    const response = await api.post(`/bookings/completeBooking/${bookingId}`);
    return unwrap<{ booking: unknown }>(response).booking;
  },
};
