import type { BookingStatus } from "../constants/status.constants";

export type OwnerBookingGroup =
  | "ALL"
  | "ACTION_REQUIRED"
  | "UPCOMING"
  | "ACTIVE"
  | "COMPLETED"
  | "CLOSED";

export type OwnerBookingSort =
  | "newest"
  | "oldest"
  | "pickup_asc"
  | "pickup_desc";

export type OwnerBookingMutationAction =
  | "approve"
  | "reject"
  | "no-show"
  | "handover"
  | "return";

export type OwnerBookingAction =
  | OwnerBookingMutationAction
  | "cancel"
  | "inspection"
  | "extra-charge";

export type OwnerReturnInspection = {
  _id: string;
  actualReturnAt: string;
  receivedAt?: string;
  returnOdometerKm?: number;
  returnEnergyLevelPercent?: number;
  returnDashboardImage?: string;
  distanceTravelledKm?: number;
  totalIncludedKm?: number;
  overageKm?: number;
  chargeableOverageKm?: number;
  suggestedOverageAmount?: number;
  mileageStatus?: string;
  returnOdometer?: number;
  returnFuelLevel?: number;
  returnPhotos?: string[];
  conditionNotes?: string;
  isLate?: boolean;
  lateMinutes?: number;
  lateReturnCalculation?: {
    scheduledReturnAt: string;
    actualReturnAt: string;
    lateMinutes: number;
    graceMinutes: number;
    chargeableMinutes: number;
    blockMinutes: number;
    chargedBlocks: number;
    feePerBlock: number;
    calculatedAmount: number;
  };
  hasDamage?: boolean;
  hasCleaningIssue?: boolean;
  hasFuelShortage?: boolean;
  inspectionStatus?: string;
};

export type OwnerReturnCompletionState = {
  canComplete: boolean;
  blockers: string[];
};

export type OwnerReturnInspectionResponse = {
  inspection: OwnerReturnInspection | null;
  completionState: OwnerReturnCompletionState;
};

export type OwnerBookingListItem = {
  _id: string;
  bookingCode: string;
  car: {
    _id: string;
    carCode?: string | null;
    name: string;
    licensePlate: string;
    image?: string | null;
  };
  customer: {
    _id: string;
    name: string;
    avatar?: string | null;
  };
  startDate: string;
  endDate: string;
  pickupLocation?: string;
  deliveryType?: string;
  status: BookingStatus;
  availableActions: OwnerBookingAction[];
  pricing: {
    totalPrice: number;
    paidAmount: number;
    remainingAmount: number;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type OwnerBookingDetail = OwnerBookingListItem & {
  customer: OwnerBookingListItem["customer"] & {
    email?: string;
    phone?: string;
  };
  identityDocuments?: {
    cccdNumber?: string;
    cccdFrontImage?: string;
    cccdBackImage?: string;
    driverLicenseNumber?: string;
    driverLicenseImage?: string;
  };
  actualPickupAt?: string | null;
  actualReturnAt?: string | null;
  currentOdometerKm?: number | null;
  handoverSnapshot?: {
    handoverOdometerKm: number;
    handoverEnergyLevelPercent: number;
    handoverDashboardImage?: string;
    handoverRecordedAt?: string;
  } | null;
  mileagePolicySnapshot?: {
    rentalMode: string;
    includedKmPerDay?: number;
    includedKmPerHour?: number;
    overageFeePerKm: number;
    graceKm: number;
    billableUnits: number;
    totalIncludedKm: number;
  } | null;
  rentalMode?: string;
  returnLocation?: string;
  delivery?: {
    deliveryType: string;
    address?: string;
    distanceKm?: number;
    fee?: number;
  };
  paymentOption?: string;
  paymentStatus?: "UNPAID" | "PARTIAL" | "PAID_FULL" | string;
  note?: string;
};

export type OwnerBookingListParams = {
  search?: string;
  status?: BookingStatus | "";
  group?: OwnerBookingGroup;
  sort?: OwnerBookingSort;
  page?: number;
  limit?: number;
};

export type OwnerBookingListResponse = {
  bookings: OwnerBookingListItem[];
  groupCounts: Record<OwnerBookingGroup, number>;
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export type OwnerHandoverPayload = {
  handoverOdometerKm: number;
  handoverEnergyLevelPercent: number;
  handoverDashboardImage?: string;
};

export type OwnerReturnPayload = {
  returnOdometerKm: number;
  returnEnergyLevelPercent: number;
  returnDashboardImage?: string;
  returnPhotos?: string[];
  conditionNotes?: string;
  hasDamage?: boolean;
  hasCleaningIssue?: boolean;
  hasFuelShortage?: boolean;
};
