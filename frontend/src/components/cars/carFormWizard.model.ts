// Shared owner model: car wizard data and validation for BUSINESS and USER consignment.
import {
  isValidPlateNumber,
  normalizePlateNumber,
} from "../../utils/validators";
import type { CarFormStep } from "./CarFormWizard";

export type CarWizardForm = {
  brandId: string;
  name: string;
  type: string;
  licensePlate: string;
  city: string;
  district?: string;
  ward?: string;
  pickupAddress: string;
  pickupFormattedAddress: string;
  pickupPlaceId: string;
  pickupLat: string;
  pickupLng: string;
  locationNote: string;
  seats: string;
  currentOdometerKm: string;
  includedKmPerDay: string;
  includedKmPerHour: string;
  overageFeePerKm: string;
  graceKm: string;
  fuelType: string;
  transmission?: string;
  allowDailyRental: boolean;
  allowHourlyRental: boolean;
  basePricePerDay: number | null;
  weekendSurchargePerDay: number | null;
  holidaySurchargePerDay: number | null;
  basePricePerHour: number | null;
  weekendSurchargePerHour: number | null;
  holidaySurchargePerHour: number | null;
  deliveryEnabled: boolean;
  deliveryBaseFee: string;
  deliveryFeePerKm: string;
  deliveryMaxDistanceKm: string;
  deliveryNote: string;
  mainImage: string;
  galleryImages: string[];
  registrationCardImages: string[];
  description: string;
};

export type CarWizardBrand = {
  _id: string;
  name: string;
};

export type CarWizardCar = {
  brandId: { _id?: string };
  name?: string;
  type?: string;
  licensePlate?: string;
  city?: string;
  province?: string;
  district?: string;
  ward?: string;
  pickupAddress?: string;
  pickupFormattedAddress?: string;
  pickupPlaceId?: string;
  address?: string;
  pickupLat?: number;
  pickupLng?: number;
  latitude?: number;
  longitude?: number;
  locationNote?: string;
  seats?: number;
  currentOdometerKm?: number | null;
  mileagePolicy?: {
    includedKmPerDay?: number | null;
    includedKmPerHour?: number | null;
    overageFeePerKm?: number | null;
    graceKm?: number | null;
  };
  fuelType?: string;
  transmission?: string;
  rentalUnit?: string;
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  pricing?: {
    basePricePerDay?: number | null;
    weekendSurchargePerDay?: number | null;
    holidaySurchargePerDay?: number | null;
    basePricePerHour?: number | null;
    weekendSurchargePerHour?: number | null;
    holidaySurchargePerHour?: number | null;
  };
  deliveryEnabled?: boolean;
  deliveryBaseFee?: number;
  deliveryFeePerKm?: number;
  deliveryMaxDistanceKm?: number;
  deliveryNote?: string;
  images?: string[];
  registrationCardImages?: string[];
  description?: string;
};

export type CarWizardPayload = {
  brandId?: string;
  name: string;
  type: string;
  licensePlate: string;
  seats: number;
  fuelType: string;
  transmission?: string;
  allowDailyRental: boolean;
  allowHourlyRental: boolean;
  rentalUnit: "DAY" | "HOUR";
  currentOdometerKm?: number;
  mileagePolicy: {
    includedKmPerDay?: number;
    includedKmPerHour?: number;
    overageFeePerKm: number;
    graceKm: number;
  };
  pricing: {
    basePricePerDay?: number;
    weekendSurchargePerDay?: number;
    holidaySurchargePerDay?: number;
    basePricePerHour?: number;
    weekendSurchargePerHour?: number;
    holidaySurchargePerHour?: number;
  };
  images: string[];
  registrationCardImages: string[];
  description: string;
  pickupAddress: string;
  pickupFormattedAddress: string;
  pickupPlaceId: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupProvince: string;
  pickupDistrict: string;
  pickupWard: string;
  pickupNote: string;
  city: string;
  province: string;
  district: string;
  ward: string;
  locationNote: string;
  deliveryEnabled: boolean;
  deliveryBaseFee: number;
  deliveryFeePerKm: number;
  deliveryMaxDistanceKm?: number;
  deliveryNote: string;
};

export const EMPTY_CAR_WIZARD_FORM: CarWizardForm = {
  brandId: "",
  name: "",
  type: "SEDAN",
  licensePlate: "",
  city: "",
  district: "",
  ward: "",
  pickupAddress: "",
  pickupFormattedAddress: "",
  pickupPlaceId: "",
  pickupLat: "",
  pickupLng: "",
  locationNote: "",
  seats: "4",
  currentOdometerKm: "",
  includedKmPerDay: "",
  includedKmPerHour: "",
  overageFeePerKm: "0",
  graceKm: "0",
  fuelType: "GASOLINE",
  transmission: "AUTOMATIC",
  allowDailyRental: true,
  allowHourlyRental: false,
  basePricePerDay: null,
  weekendSurchargePerDay: 0,
  holidaySurchargePerDay: 0,
  basePricePerHour: null,
  weekendSurchargePerHour: 0,
  holidaySurchargePerHour: 0,
  deliveryEnabled: false,
  deliveryBaseFee: "",
  deliveryFeePerKm: "",
  deliveryMaxDistanceKm: "",
  deliveryNote: "",
  mainImage: "",
  galleryImages: [],
  registrationCardImages: [],
  description: "",
};

export function carToWizardForm(car: CarWizardCar): CarWizardForm {
  const allowDailyRental =
    typeof car.allowDailyRental === "boolean"
      ? car.allowDailyRental
      : car.rentalUnit !== "HOUR";
  const allowHourlyRental =
    typeof car.allowHourlyRental === "boolean"
      ? car.allowHourlyRental
      : car.rentalUnit === "HOUR";
  const images = car.images || [];

  return {
    brandId: car.brandId._id || "",
    name: car.name || "",
    type: car.type || "SEDAN",
    licensePlate: car.licensePlate || "",
    city: car.city || car.province || "",
    district: car.district || "",
    ward: car.ward || "",
    pickupAddress: car.pickupAddress || car.address || "",
    pickupFormattedAddress:
      car.pickupFormattedAddress || car.pickupAddress || car.address || "",
    pickupPlaceId: car.pickupPlaceId || "",
    pickupLat: String(car.pickupLat ?? car.latitude ?? ""),
    pickupLng: String(car.pickupLng ?? car.longitude ?? ""),
    locationNote: car.locationNote || "",
    seats: String(car.seats || 4),
    currentOdometerKm: String(car.currentOdometerKm ?? ""),
    includedKmPerDay: String(car.mileagePolicy?.includedKmPerDay ?? ""),
    includedKmPerHour: String(car.mileagePolicy?.includedKmPerHour ?? ""),
    overageFeePerKm: String(car.mileagePolicy?.overageFeePerKm ?? 0),
    graceKm: String(car.mileagePolicy?.graceKm ?? 0),
    fuelType: car.fuelType || "GASOLINE",
    transmission: car.transmission || "AUTOMATIC",
    allowDailyRental,
    allowHourlyRental,
    basePricePerDay: car.pricing?.basePricePerDay ?? null,
    weekendSurchargePerDay: car.pricing?.weekendSurchargePerDay ?? 0,
    holidaySurchargePerDay: car.pricing?.holidaySurchargePerDay ?? 0,
    basePricePerHour: car.pricing?.basePricePerHour ?? null,
    weekendSurchargePerHour: car.pricing?.weekendSurchargePerHour ?? 0,
    holidaySurchargePerHour: car.pricing?.holidaySurchargePerHour ?? 0,
    deliveryEnabled: Boolean(car.deliveryEnabled),
    deliveryBaseFee: String(car.deliveryBaseFee || ""),
    deliveryFeePerKm: String(car.deliveryFeePerKm || ""),
    deliveryMaxDistanceKm: String(car.deliveryMaxDistanceKm || ""),
    deliveryNote: car.deliveryNote || "",
    mainImage: images[0] || "",
    galleryImages: images.slice(1),
    registrationCardImages: car.registrationCardImages || [],
    description: car.description || "",
  };
}

export function validateCarWizardStep(
  form: CarWizardForm,
  step: CarFormStep,
  editingOdometer?: number | null,
  requireRegistrationCardImages = false,
) {
  const errors: Record<string, string> = {};
  const addError = (field: string, message: string) => {
    if (!errors[field]) errors[field] = message;
  };

  if (step === 1) {
    if (!form.name.trim()) addError("name", "Vui lòng nhập tên xe.");
    if (!form.brandId) addError("brandId", "Vui lòng chọn hãng xe.");
    if (!form.type) addError("type", "Vui lòng chọn dòng xe.");
    if (!form.fuelType) addError("fuelType", "Vui lòng chọn nhiên liệu.");
    const seats = Number(form.seats);
    if (!Number.isFinite(seats) || seats <= 0) {
      addError("seats", "Số ghế phải lớn hơn 0.");
    }
    if (
      form.licensePlate &&
      !isValidPlateNumber(normalizePlateNumber(form.licensePlate))
    ) {
      addError("licensePlate", "Biển số không hợp lệ. Ví dụ: 30A-123.45.");
    }
  }

  if (step === 2) {
    if (!form.allowDailyRental && !form.allowHourlyRental) {
      addError("rentalMode", "Vui lòng chọn ít nhất một hình thức thuê.");
    }
    if (
      form.allowDailyRental &&
      (form.basePricePerDay === null ||
        !Number.isFinite(form.basePricePerDay) ||
        form.basePricePerDay <= 0)
    ) {
      addError("basePricePerDay", "Giá thuê theo ngày phải lớn hơn 0.");
    }
    if (
      form.allowHourlyRental &&
      (form.basePricePerHour === null ||
        !Number.isFinite(form.basePricePerHour) ||
        form.basePricePerHour <= 0)
    ) {
      addError("basePricePerHour", "Giá thuê theo giờ phải lớn hơn 0.");
    }
    if (
      (form.weekendSurchargePerDay ?? 0) < 0 ||
      (form.holidaySurchargePerDay ?? 0) < 0 ||
      (form.weekendSurchargePerHour ?? 0) < 0 ||
      (form.holidaySurchargePerHour ?? 0) < 0
    ) {
      addError("surcharge", "Phụ thu không được là số âm.");
    }
  }

  if (step === 3) {
    const odometer =
      form.currentOdometerKm.trim() === ""
        ? undefined
        : Number(form.currentOdometerKm);
    if (editingOdometer === undefined && odometer === undefined) {
      addError("currentOdometerKm", "Vui lòng nhập ODO hiện tại.");
    } else if (
      odometer !== undefined &&
      (!Number.isInteger(odometer) || odometer < 0)
    ) {
      addError(
        "currentOdometerKm",
        "ODO phải là số nguyên và không nhỏ hơn 0.",
      );
    } else if (
      odometer !== undefined &&
      editingOdometer !== undefined &&
      editingOdometer !== null &&
      odometer < editingOdometer
    ) {
      addError(
        "currentOdometerKm",
        "ODO mới không được nhỏ hơn ODO hiện tại.",
      );
    }
    if (
      form.allowDailyRental &&
      (!form.includedKmPerDay ||
        !Number.isFinite(Number(form.includedKmPerDay)) ||
        Number(form.includedKmPerDay) <= 0)
    ) {
      addError(
        "includedKmPerDay",
        "Giới hạn kilomet mỗi ngày phải lớn hơn 0.",
      );
    }
    if (
      form.allowHourlyRental &&
      (!form.includedKmPerHour ||
        !Number.isFinite(Number(form.includedKmPerHour)) ||
        Number(form.includedKmPerHour) <= 0)
    ) {
      addError(
        "includedKmPerHour",
        "Giới hạn kilomet mỗi giờ phải lớn hơn 0.",
      );
    }
    if (
      !Number.isFinite(Number(form.overageFeePerKm || 0)) ||
      Number(form.overageFeePerKm || 0) < 0
    ) {
      addError("overageFeePerKm", "Phí vượt kilomet không được âm.");
    }
    if (
      !Number.isFinite(Number(form.graceKm || 0)) ||
      Number(form.graceKm || 0) < 0
    ) {
      addError("graceKm", "Mức miễn kilomet không được âm.");
    }
  }

  if (step === 4) {
    if (!form.city.trim()) addError("city", "Vui lòng nhập tỉnh/thành phố.");
    if (!form.district?.trim()) {
      addError("district", "Vui lòng nhập quận/huyện.");
    }
    if (!form.pickupAddress.trim()) {
      addError("pickupAddress", "Vui lòng nhập địa chỉ nhận xe.");
    }
    if (
      (form.pickupLat && !Number.isFinite(Number(form.pickupLat))) ||
      (form.pickupLng && !Number.isFinite(Number(form.pickupLng)))
    ) {
      addError("pickupLocation", "Tọa độ nhận xe không hợp lệ.");
    }
    if (
      form.deliveryEnabled &&
      (!form.deliveryMaxDistanceKm ||
        !Number.isFinite(Number(form.deliveryMaxDistanceKm)) ||
        Number(form.deliveryMaxDistanceKm) <= 0)
    ) {
      addError(
        "deliveryMaxDistanceKm",
        "Khoảng cách giao xe tối đa phải lớn hơn 0.",
      );
    }
  }

  if (step === 5 && !form.mainImage) {
    addError("mainImage", "Vui lòng chọn ảnh chính của xe.");
  }

  if (
    step === 5 &&
    requireRegistrationCardImages &&
    form.registrationCardImages.length === 0
  ) {
    addError(
      "registrationCardImages",
      "Vui lòng bổ sung ít nhất một ảnh cà vẹt xe.",
    );
  }

  return errors;
}

export function buildCarWizardPayload(
  form: CarWizardForm,
): CarWizardPayload {
  const city = form.city.trim();
  const district = (form.district || "").trim();
  const pickupAddress = form.pickupAddress.trim();
  const pickupFormattedAddress =
    form.pickupFormattedAddress.trim() || pickupAddress;
  const currentOdometerKm =
    form.currentOdometerKm.trim() === ""
      ? undefined
      : Number(form.currentOdometerKm);
  const includedKmPerDay =
    form.includedKmPerDay.trim() === ""
      ? undefined
      : Number(form.includedKmPerDay);
  const includedKmPerHour =
    form.includedKmPerHour.trim() === ""
      ? undefined
      : Number(form.includedKmPerHour);
  const pickupLat = form.pickupLat ? Number(form.pickupLat) : undefined;
  const pickupLng = form.pickupLng ? Number(form.pickupLng) : undefined;
  const deliveryMaxDistanceKm = form.deliveryMaxDistanceKm
    ? Number(form.deliveryMaxDistanceKm)
    : undefined;

  return {
    brandId: form.brandId,
    name: form.name.trim(),
    type: form.type,
    licensePlate: normalizePlateNumber(form.licensePlate),
    seats: Number(form.seats),
    fuelType: form.fuelType,
    transmission: form.transmission,
    allowDailyRental: form.allowDailyRental,
    allowHourlyRental: form.allowHourlyRental,
    rentalUnit:
      form.allowHourlyRental && !form.allowDailyRental ? "HOUR" : "DAY",
    currentOdometerKm,
    mileagePolicy: {
      includedKmPerDay: form.allowDailyRental
        ? includedKmPerDay
        : undefined,
      includedKmPerHour: form.allowHourlyRental
        ? includedKmPerHour
        : undefined,
      overageFeePerKm: Number(form.overageFeePerKm || 0),
      graceKm: Number(form.graceKm || 0),
    },
    pricing: {
      ...(form.allowDailyRental
        ? {
            basePricePerDay: Number(form.basePricePerDay),
            weekendSurchargePerDay: form.weekendSurchargePerDay ?? 0,
            holidaySurchargePerDay: form.holidaySurchargePerDay ?? 0,
          }
        : {}),
      ...(form.allowHourlyRental
        ? {
            basePricePerHour: Number(form.basePricePerHour),
            weekendSurchargePerHour: form.weekendSurchargePerHour ?? 0,
            holidaySurchargePerHour: form.holidaySurchargePerHour ?? 0,
          }
        : {}),
    },
    images: [form.mainImage, ...form.galleryImages].filter(Boolean),
    registrationCardImages: form.registrationCardImages,
    description: form.description.trim(),
    pickupAddress,
    pickupFormattedAddress,
    pickupPlaceId: form.pickupPlaceId.trim(),
    pickupLat,
    pickupLng,
    pickupProvince: city,
    pickupDistrict: district,
    pickupWard: (form.ward || "").trim(),
    pickupNote: form.locationNote.trim(),
    city,
    province: city,
    district,
    ward: (form.ward || "").trim(),
    locationNote: form.locationNote.trim(),
    deliveryEnabled: form.deliveryEnabled,
    deliveryBaseFee: form.deliveryEnabled
      ? Number(form.deliveryBaseFee || 0)
      : 0,
    deliveryFeePerKm: form.deliveryEnabled
      ? Number(form.deliveryFeePerKm || 0)
      : 0,
    deliveryMaxDistanceKm: form.deliveryEnabled
      ? deliveryMaxDistanceKm
      : undefined,
    deliveryNote: form.deliveryEnabled ? form.deliveryNote.trim() : "",
  };
}
