//Kiểu dữ liệu booking dành cho các chức năng quản lý xe ký gửi.
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
  | "extra-charge"
  | "confirm-remaining";

export type VehicleConditionChecklist = {
  bodyOk: boolean;
  glassAndMirrorsOk: boolean;
  lightsOk: boolean;
  tiresOk: boolean;
  interiorClean: boolean;
  seatsAndSeatbeltsOk: boolean;
  airConditioningOk: boolean;
  dashboardWarningFree: boolean;
};

export type VehicleAccessoriesSnapshot = {
  vehicleKeysPresent: boolean;
  tireSupportKitPresent: boolean;
  basicToolkitPresent: boolean;
  warningTrianglePresent: boolean;
  chargingCableApplicable: boolean;
  chargingCablePresent: boolean;
};

export type VehicleDocumentsSnapshot = {
  registrationPresent: boolean;
  inspectionCertificatePresent: boolean;
  insuranceCertificatePresent: boolean;
};

export type VehicleRecordChecklists = {
  vehicleCondition: VehicleConditionChecklist;
  accessoriesSnapshot: VehicleAccessoriesSnapshot;
  vehicleDocumentsSnapshot: VehicleDocumentsSnapshot;
};

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
  vehicleCondition?: VehicleConditionChecklist;
  accessoriesSnapshot?: VehicleAccessoriesSnapshot;
  vehicleDocumentsSnapshot?: VehicleDocumentsSnapshot;
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
    type?: string;
    seats?: number;
    fuelType?: string;
    transmission?: string;
  };
  customer: {
    _id: string;
    name: string;
    avatar?: string | null;
  };
  startDate: string;
  endDate: string;
  actualReturnAt?: string | null;
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
  identityStatus?: {
    identityProfileCompleted?: boolean;
    identityVerificationStatus?: "INCOMPLETE" | "PENDING" | "VERIFIED" | "REJECTED" | null;
    driverLicenseClass?: "B" | "B1" | "B2" | null;
    licenseEligible?: boolean;
  };
  actualPickupAt?: string | null;
  actualReturnAt?: string | null;
  currentOdometerKm?: number | null;
  handoverSnapshot?: {
    preparation?: {
      odometerKm: number;
      energyLevelPercent: number;
      images?: string[];
      dashboardImage?: string;
      note?: string;
      recordedAt?: string;
    };
    handoverOdometerKm: number;
    handoverEnergyLevelPercent: number;
    handoverPhotos?: string[];
    handoverDashboardImage?: string;
    handoverConditionNotes?: string;
    vehicleCondition?: VehicleConditionChecklist;
    accessoriesSnapshot?: VehicleAccessoriesSnapshot;
    vehicleDocumentsSnapshot?: VehicleDocumentsSnapshot;
    handoverRecordedAt?: string;
    ownerConfirmedAt?: string;
    renterConfirmedAt?: string;
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

export type OwnerHandoverPayload = VehicleRecordChecklists & {
  preparation?: {
    odometerKm: number;
    energyLevelPercent: number;
    images?: string[];
    dashboardImage?: string;
    note?: string;
  };
  handoverOdometerKm: number;
  handoverEnergyLevelPercent: number;
  handoverPhotos?: string[];
  handoverDashboardImage?: string;
  handoverConditionNotes?: string;
};

export type OwnerReturnPayload = VehicleRecordChecklists & {
  returnOdometerKm: number;
  returnEnergyLevelPercent: number;
  returnDashboardImage?: string;
  returnPhotos?: string[];
  conditionNotes?: string;
  hasDamage?: boolean;
  hasCleaningIssue?: boolean;
  hasFuelShortage?: boolean;
};
