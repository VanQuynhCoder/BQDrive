import api from "./api";

export type PrivateOwnerRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type PrivateOwnerRequest = {
  _id: string;
  fullName: string;
  phone: string;
  identityNumber: string;
  frontImage: string;
  backImage: string;
  address: string;
  reason?: string;
  status: PrivateOwnerRequestStatus;
  adminNote?: string;
  createdAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
};

export type CreatePrivateOwnerRequestData = {
  fullName: string;
  phone: string;
  identityNumber: string;
  frontImage: string;
  backImage: string;
  address: string;
  reason?: string;
};

type ApiData<T> = {
  data: T;
};

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

export const privateOwnerRequestService = {
  createRequest: async (data: CreatePrivateOwnerRequestData) => {
    const res = await api.post("/private-owner-requests/createRequest", data);
    return unwrap<{ request: PrivateOwnerRequest }>(res).request;
  },

  getMyRequest: async () => {
    const res = await api.get("/private-owner-requests/myRequest");
    return unwrap<{ requests: PrivateOwnerRequest[] }>(res).requests;
  },
};
