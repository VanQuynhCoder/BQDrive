import api from "./api";

import type {
  ContractPaymentStatus,
  ContractStatus,
} from "../constants/status.constants";

export type { ContractStatus };

import type { CarPricing } from "../types/pricing";

export type ContractCar = {
  _id: string;
  carCode?: string | null;
  name?: string;
  licensePlate?: string;
  images?: string[];
  seats?: number;
  fuelType?: string;
  transmission?: string;
  rentalUnit?: string;
  pricing?: CarPricing;
  pickupAddress?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
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
  bookingCode?: string;
  status?: string;
  cancelledAt?: string;
  cancelledByRole?: string;
  cancelReason?: string;
  cancelReasonCode?: string;
  cancelReasonText?: string;
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
  upfrontPaymentAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: ContractPaymentStatus;
};

export type ContractChecklist = Record<string, boolean | undefined>;

export type ContractAppendix = {
  originalSchedule?: {
    startDate?: string;
    endDate?: string;
  };
  extensions: Array<{
    _id: string;
    requestType?: string;
    sourceRentalMode?: string;
    targetRentalMode?: string;
    oldEndAt?: string;
    requestedEndAt?: string;
    additionalDurationMinutes?: number;
    billableUnits?: number;
    additionalAmount?: number;
    status?: string;
    requestedAt?: string;
    ownerRespondedAt?: string;
    paymentDeadlineAt?: string;
    activatedAt?: string;
    rejectReason?: string;
    paymentId?: string;
  }>;
  payments: Array<{
    _id: string;
    paymentType?: string;
    amount?: number;
    method?: string;
    status?: string;
    paidAt?: string;
    createdAt?: string;
    transactionCode?: string;
    gatewayOrderId?: string;
    refundedAmount?: number;
    refundStatus?: string;
  }>;
  handover?: {
    recordedAt?: string;
    odometerKm?: number;
    energyLevelPercent?: number;
    dashboardImage?: string;
    photos?: string[];
    conditionNotes?: string;
    vehicleCondition?: ContractChecklist;
    accessoriesSnapshot?: ContractChecklist;
    vehicleDocumentsSnapshot?: ContractChecklist;
    ownerConfirmedAt?: string;
    renterConfirmedAt?: string;
  } | null;
  returnInspection?: {
    actualReturnAt?: string;
    receivedAt?: string;
    returnOdometerKm?: number;
    returnEnergyLevelPercent?: number;
    dashboardImage?: string;
    photos?: string[];
    distanceTravelledKm?: number;
    totalIncludedKm?: number;
    overageKm?: number;
    chargeableOverageKm?: number;
    mileageStatus?: string;
    isLate?: boolean;
    lateMinutes?: number;
    hasDamage?: boolean;
    hasCleaningIssue?: boolean;
    hasFuelShortage?: boolean;
    conditionNotes?: string;
    vehicleCondition?: ContractChecklist;
    accessoriesSnapshot?: ContractChecklist;
    vehicleDocumentsSnapshot?: ContractChecklist;
    inspectionStatus?: string;
    ownerConfirmedAt?: string;
    renterConfirmedAt?: string;
  } | null;
  extraCharges: Array<{
    _id: string;
    type?: string;
    amount?: number;
    description?: string;
    status?: string;
    createdAt?: string;
    paidAt?: string;
    paymentMethod?: string;
    evidenceImages?: string[];
  }>;
  refunds: Array<{
    _id: string;
    refundAmount?: number;
    method?: string;
    status?: string;
    requestedAt?: string;
    processingAt?: string;
    succeededAt?: string;
    reference?: string;
  }>;
};

export type RentalContract = {
  _id: string;
  bookingId: ContractBooking | string | null;
  userId: ContractOwnerUser | string;
  carId: ContractCar | string;
  ownerId: ContractOwnerUser | string;
  renterName: string;
  renterPhone: string;
  renterAddress: string;
  note?: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  upfrontPaymentAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus?: ContractPaymentSummary["paymentStatus"];
  paymentSummary?: ContractPaymentSummary;
  appendix?: ContractAppendix;
  paymentOption?: string;
  pickupAddressSnapshot: string;
  returnAddressSnapshot: string;
  ownerAddressSnapshot: string;
  status: ContractStatus;
  hasReview?: boolean;
  canReview?: boolean;
  contractCode: string;
  signedAt: string;
  createdAt?: string;
};

export type CreateContractData = {
  bookingId?: string;
  renterName?: string;
  renterPhone?: string;
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







