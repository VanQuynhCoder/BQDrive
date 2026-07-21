import api from "./api";

export type ContractStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type OwnerType = "BUSINESS" | "USER";

export type ContractCar = {
  _id: string;
  name?: string;
  licensePlate?: string;
  images?: string[];
  seats?: number;
  fuelType?: string;
  transmission?: string;
  rentalUnit?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  pickupAddress?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
};

export type ContractBusiness = {
  _id: string;
  businessName?: string;
  userId: ContractOwnerUser;
  phone?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
};

export type ContractOwnerUser = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
};

export type ContractBooking = {
  _id: string;
  status?: string;
  pricingSnapshot?: {
    rentalSubtotal?: number;
    deliveryFee?: number;
    delivery?: {
      deliveryType?: string;
      deliveryAddress?: string;
      deliveryAddressText?: string;
      deliveryFormattedAddress?: string;
      deliveryDistanceKm?: number;
      deliveryDurationText?: string;
    };
  };
  pickupAddressSnapshot: string;
  returnAddressSnapshot: string;
};

export type ContractPaymentSummary = {
  totalPrice: number;
  depositAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "UNPAID" | "PENDING" | "DEPOSIT_PAID" | "PARTIAL" | "PAID_FULL";
};

export type RentalContract = {
  _id: string;
  bookingId: ContractBooking | string;
  userId: string;
  carId: ContractCar | string;
  businessId: ContractBusiness | string;
  ownerId: ContractBusiness | ContractOwnerUser | string;
  ownerType: OwnerType;
  ownerModel?: "Business" | "User" | string;
  renterName: string;
  renterPhone: string;
  renterIdentityNumber: string;
  renterAddress: string;
  note?: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  depositAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus?: ContractPaymentSummary["paymentStatus"];
  paymentSummary?: ContractPaymentSummary;
  paymentOption?: string;
  pickupAddressSnapshot: string;
  returnAddressSnapshot: string;
  ownerAddressSnapshot: string;
  status: ContractStatus;
  contractCode: string;
  signedAt: string;
  createdAt?: string;
};

export type CreateContractData = {
  bookingId?: string;
  renterName?: string;
  renterPhone?: string;
  renterIdentityNumber?: string;
  renterAddress?: string;
  note?: string;
};

type ApiData<T> = {
  data: T;
};

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

export const contractService = {
  createContract: async (data: CreateContractData) => {
    const res = await api.post("/contracts/create", data);
    return unwrap<{ contract: RentalContract }>(res).contract;
  },

  getMyContracts: async () => {
    const res = await api.get("/contracts/my-contracts");
    return unwrap<{ contracts: RentalContract[] }>(res).contracts;
  },

  getContractDetail: async (id: string) => {
    const res = await api.get(`/contracts/${id}`);
    return unwrap<{ contract: RentalContract }>(res).contract;
  },

  getOwnerContracts: async () => {
    const res = await api.get("/contracts/owner/my-contracts");
    return unwrap<{ contracts: RentalContract[] }>(res).contracts;
  },
};







