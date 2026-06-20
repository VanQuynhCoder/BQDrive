export type PrivateOwnerRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type PrivateOwnerRequest = {
  _id: string;
  fullName: string;
  phone: string;
  identityNumber: string;
  frontImage?: string;
  backImage?: string;
  address?: string;
  reason?: string;
  status: PrivateOwnerRequestStatus;
  adminNote?: string;
  createdAt?: string;
};

export type CreatePrivateOwnerRequestData = Omit<
  PrivateOwnerRequest,
  "_id" | "status" | "adminNote" | "createdAt"
>;

export const privateOwnerRequestService = {
  createRequest: async (_data: CreatePrivateOwnerRequestData) => {
    throw new Error("Luong nang cap chu xe cu da bi go");
  },
  getMyRequest: async () => [] as PrivateOwnerRequest[],
};