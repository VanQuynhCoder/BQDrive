import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { CarModel } from "../../models/car/car.model";
import { BusinessModel } from "../../models/business/business.model";
import { BookingModel } from "../../models/booking/booking.model";
import { ContractModel } from "../../models/contract/contract.model";
import { CartModel } from "../../models/cart/cart.model";
import { ReviewModel, ReviewStatusEnum } from "../../models/review/review.model";
import { syncRentedCarStatuses } from "../../helper/car-status.helper";
import { expireOldCarts } from "../../helper/cart.helper";
import {
  getCarRentalSupport,
  normalizeRentalMode,
} from "../../helper/rental.helper";
import { TokenHelper } from "../../helper/token.helper";
import {
  expireAbandonedPendingBookings,
  getCheckoutStartedBookingIdSet,
} from "../../helper/booking-hold.helper";
import {
  getCityOrProvince,
  normalizeCarAddressFields,
} from "../../helper/address.helper";
import {
  sendCarApprovedMail,
  sendCarRejectedMail,
  sendCarSubmittedToAdminMail,
} from "../../helper/mail.helper";
import { notificationCenterService } from "../../services/notification-center.service";
import { toCloudinaryCardThumbnailUrl } from "../../services/cloudinary.service";
import { generateCarCode } from "../../helper/car-code.helper";
import {
  getCarCleaningBufferMs,
  getCarCleaningUnavailableUntil,
} from "../../helper/booking-availability.helper";

import {
  BookingStatusEnum,
  CarStatusEnum,
  CartStatusEnum,
  ContractStatusEnum,
  OwnerTypeEnum,
  UserRoleEnum,
  RentalModeEnum,
  RentalUnitEnum,
} from "../../constants/model.const";
import {
  getPlateNumberKey,
  PLATE_DUPLICATED_MESSAGE,
  validatePlateNumber,
} from "../../utils/validators";

enum RentalAvailabilityEnum {
  AVAILABLE = "AVAILABLE",
  HELD_IN_CART = "HELD_IN_CART",
  PENDING_CONFIRMATION = "PENDING_CONFIRMATION",
  CLEANING = "CLEANING",
}

const BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // Khách đã gửi yêu cầu, tạm giữ slot để chủ xe duyệt
  BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã duyệt, chờ khách thanh toán
  BookingStatusEnum.PAYMENT_PENDING, // Khách đang thanh toán
  BookingStatusEnum.PAID, // Đã thanh toán, lịch thuê chính thức
  BookingStatusEnum.IN_PROGRESS, // Xe đang được thuê
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];
const PUBLIC_CAR_STATUSES = [CarStatusEnum.APPROVED, CarStatusEnum.RENTED];
const DELETE_BLOCKING_CONTRACT_STATUSES = [
  ContractStatusEnum.ACTIVE,
];
const UPDATE_CAR_BLOCKED_MESSAGE =
  "Không thể cập nhật xe đang có booking hoặc hợp đồng thuê còn hiệu lực";
const DETAILED_PICKUP_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
  BookingStatusEnum.COMPLETED,
];
const RENTED_CAR_DETAIL_BOOKING_STATUSES = [
  BookingStatusEnum.PAID,
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
];
function cleanSearchText(value?: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCarImagesInput(images: unknown) {
  if (!Array.isArray(images)) return [];

  return images
    .map((image) => (typeof image === "string" ? image.trim() : ""))
    .filter(Boolean);
}

const MAX_REGISTRATION_CARD_IMAGES = 2;

function validateRegistrationCardImages(
  images: string[],
  options: { required?: boolean; existingImages?: string[] } = {},
) {
  if (options.required && images.length === 0) {
    throw ErrorHelper.requestDataInvalid(
      "Vui lòng bổ sung ít nhất một ảnh cà vẹt xe",
    );
  }

  if (images.length > MAX_REGISTRATION_CARD_IMAGES) {
    throw ErrorHelper.requestDataInvalid(
      `Chỉ được lưu tối đa ${MAX_REGISTRATION_CARD_IMAGES} ảnh cà vẹt xe`,
    );
  }

  assertNoNewBase64CarImages(
    images,
    options.existingImages || [],
    "Ảnh cà vẹt xe",
  );
}

function isBase64CarImage(image?: string) {
  return String(image || "").trim().startsWith("data:image/");
}

function assertNoNewBase64CarImages(
  nextImages: string[],
  existingImages: string[] = [],
  imageLabel = "Ảnh xe",
) {
  const existingBase64Images = new Set(
    existingImages.filter((image) => isBase64CarImage(image)),
  );
  const newBase64Image = nextImages.find(
    (image) => isBase64CarImage(image) && !existingBase64Images.has(image),
  );

  if (newBase64Image) {
    throw ErrorHelper.requestDataInvalid(
      `${imageLabel} mới cần được upload lên Cloudinary trước khi lưu`,
    );
  }
}

function toOptionalPrice(value: unknown, fieldLabel: string) {
  if (value === undefined || value === null || value === "") return undefined;

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw ErrorHelper.requestDataInvalid(`${fieldLabel} không hợp lệ`);
  }

  return value;
}

function normalizeCarPricingPayload(body: any, dailyEnabled: boolean, hourlyEnabled: boolean) {
  const pricingInput =
    body.pricing && typeof body.pricing === "object" ? body.pricing : {};
  const basePricePerDay = toOptionalPrice(
    pricingInput.basePricePerDay,
    "Giá thuê cơ bản theo ngày",
  );
  const weekendSurchargePerDay =
    toOptionalPrice(
      pricingInput.weekendSurchargePerDay,
      "Phụ thu cuối tuần theo ngày",
    ) ?? 0;
  const holidaySurchargePerDay =
    toOptionalPrice(
      pricingInput.holidaySurchargePerDay,
      "Phụ thu ngày lễ theo ngày",
    ) ?? 0;
  const basePricePerHour = toOptionalPrice(
    pricingInput.basePricePerHour,
    "Giá thuê cơ bản theo giờ",
  );
  const weekendSurchargePerHour =
    toOptionalPrice(
      pricingInput.weekendSurchargePerHour,
      "Phụ thu cuối tuần theo giờ",
    ) ?? 0;
  const holidaySurchargePerHour =
    toOptionalPrice(
      pricingInput.holidaySurchargePerHour,
      "Phụ thu ngày lễ theo giờ",
    ) ?? 0;

  if (dailyEnabled && (!basePricePerDay || basePricePerDay <= 0)) {
    throw ErrorHelper.requestDataInvalid(
      "Xe thuê theo ngày cần giá thuê cơ bản theo ngày",
    );
  }

  if (hourlyEnabled && (!basePricePerHour || basePricePerHour <= 0)) {
    throw ErrorHelper.requestDataInvalid(
      "Xe thuê theo giờ cần giá thuê cơ bản theo giờ",
    );
  }

  return {
    pricing: {
      ...(dailyEnabled
        ? {
            basePricePerDay,
            weekendSurchargePerDay,
            holidaySurchargePerDay,
          }
        : {}),
      ...(hourlyEnabled
        ? {
            basePricePerHour,
            weekendSurchargePerHour,
            holidaySurchargePerHour,
          }
        : {}),
    },
  };
}

function toOptionalNonNegativeNumber(value: unknown, fieldLabel: string) {
  if (value === undefined || value === null || value === "") return undefined;

  const nextValue = Number(value);

  if (!Number.isFinite(nextValue) || nextValue < 0) {
    throw ErrorHelper.requestDataInvalid(`${fieldLabel} không hợp lệ`);
  }

  return nextValue;
}

function normalizeCarMileagePayload(body: Record<string, unknown>) {
  const result: {
    currentOdometerKm?: number;
    mileagePolicy?: {
      includedKmPerDay?: number;
      includedKmPerHour?: number;
      overageFeePerKm: number;
      graceKm: number;
    };
  } = {};

  const currentOdometerKm = toOptionalNonNegativeNumber(
    body.currentOdometerKm,
    "ODO hiện tại",
  );

  if (
    currentOdometerKm !== undefined &&
    !Number.isInteger(currentOdometerKm)
  ) {
    throw ErrorHelper.requestDataInvalid(
      "ODO hiện tại phải là số nguyên không âm",
    );
  }

  if (currentOdometerKm !== undefined) {
    result.currentOdometerKm = currentOdometerKm;
  }

  if (Object.prototype.hasOwnProperty.call(body, "mileagePolicy")) {
    const mileagePolicyInput = body.mileagePolicy;

    if (
      !mileagePolicyInput ||
      typeof mileagePolicyInput !== "object" ||
      Array.isArray(mileagePolicyInput)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Chính sách kilomet không hợp lệ",
      );
    }

    const policy = mileagePolicyInput as Record<string, unknown>;
    const includedKmPerDay = toOptionalNonNegativeNumber(
      policy.includedKmPerDay,
      "Giới hạn kilomet mỗi ngày",
    );
    const includedKmPerHour = toOptionalNonNegativeNumber(
      policy.includedKmPerHour,
      "Giới hạn kilomet mỗi giờ",
    );
    const overageFeePerKm =
      toOptionalNonNegativeNumber(
        policy.overageFeePerKm,
        "Phí vượt kilomet",
      ) ?? 0;
    const graceKm =
      toOptionalNonNegativeNumber(policy.graceKm, "Mức kilomet miễn phí") ?? 0;

    if (includedKmPerDay !== undefined && includedKmPerDay <= 0) {
      throw ErrorHelper.requestDataInvalid(
        "Giới hạn kilomet mỗi ngày phải lớn hơn 0",
      );
    }

    if (includedKmPerHour !== undefined && includedKmPerHour <= 0) {
      throw ErrorHelper.requestDataInvalid(
        "Giới hạn kilomet mỗi giờ phải lớn hơn 0",
      );
    }

    result.mileagePolicy = {
      ...(includedKmPerDay !== undefined ? { includedKmPerDay } : {}),
      ...(includedKmPerHour !== undefined ? { includedKmPerHour } : {}),
      overageFeePerKm,
      graceKm,
    };
  }

  return result;
}

function normalizeDeliveryPayload(body: any) {
  const deliveryEnabled = Boolean(body.deliveryEnabled);
  const deliveryBaseFee =
    toOptionalNonNegativeNumber(body.deliveryBaseFee, "Phí mở đầu giao xe") ?? 0;
  const deliveryFeePerKm =
    toOptionalNonNegativeNumber(body.deliveryFeePerKm, "Đơn giá giao xe mỗi km") ?? 0;
  const deliveryMaxDistanceKm = toOptionalNonNegativeNumber(
    body.deliveryMaxDistanceKm,
    "Khoảng cách giao xe tối đa",
  );
  const deliveryNote = cleanSearchText(body.deliveryNote);

  if (deliveryEnabled && (!deliveryMaxDistanceKm || deliveryMaxDistanceKm <= 0)) {
    throw ErrorHelper.requestDataInvalid(
      "Xe có hỗ trợ giao tận nơi cần nhập khoảng cách giao xe tối đa",
    );
  }

  return {
    deliveryEnabled,
    deliveryBaseFee: deliveryEnabled ? deliveryBaseFee : 0,
    deliveryFeePerKm: deliveryEnabled ? deliveryFeePerKm : 0,
    deliveryMaxDistanceKm: deliveryEnabled ? deliveryMaxDistanceKm : undefined,
    deliveryNote: deliveryEnabled ? deliveryNote : "",
  };
}

const OWNER_EDITABLE_CAR_FIELDS = [
  "brandId",
  "name",
  "type",
  "licensePlate",
  "pricing",
  "allowDailyRental",
  "allowHourlyRental",
  "rentalUnit",
  "seats",
  "currentOdometerKm",
  "mileagePolicy",
  "fuelType",
  "transmission",
  "images",
  "registrationCardImages",
  "description",
  "pickupAddress",
  "pickupFormattedAddress",
  "pickupPlaceId",
  "pickupLat",
  "pickupLng",
  "pickupProvince",
  "pickupDistrict",
  "pickupWard",
  "pickupNote",
  "address",
  "province",
  "city",
  "district",
  "ward",
  "locationNote",
  "deliveryEnabled",
  "deliveryBaseFee",
  "deliveryFeePerKm",
  "deliveryMaxDistanceKm",
  "deliveryNote",
] as const;

function pickOwnerEditableCarFields(body: unknown) {
  const source =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  const editableData: Record<string, any> = {};

  OWNER_EDITABLE_CAR_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      editableData[field] = source[field];
    }
  });

  return editableData;
}

const CAR_APPROVAL_CHANGE_FIELDS = [
  ["brandId", "Hãng xe"],
  ["name", "Tên xe"],
  ["type", "Loại xe"],
  ["licensePlate", "Biển số"],
  ["seats", "Số chỗ"],
  ["fuelType", "Nhiên liệu"],
  ["transmission", "Hộp số"],
  ["allowDailyRental", "Cho thuê theo ngày"],
  ["allowHourlyRental", "Cho thuê theo giờ"],
  ["pricing.basePricePerDay", "Giá cơ bản theo ngày"],
  ["pricing.weekendSurchargePerDay", "Phụ thu cuối tuần theo ngày"],
  ["pricing.holidaySurchargePerDay", "Phụ thu ngày lễ theo ngày"],
  ["pricing.basePricePerHour", "Giá cơ bản theo giờ"],
  ["pricing.weekendSurchargePerHour", "Phụ thu cuối tuần theo giờ"],
  ["pricing.holidaySurchargePerHour", "Phụ thu ngày lễ theo giờ"],
  ["currentOdometerKm", "ODO hiện tại"],
  ["mileagePolicy.includedKmPerDay", "Giới hạn kilomet mỗi ngày"],
  ["mileagePolicy.includedKmPerHour", "Giới hạn kilomet mỗi giờ"],
  ["mileagePolicy.overageFeePerKm", "Phí vượt kilomet"],
  ["mileagePolicy.graceKm", "Mức kilomet miễn tính phí"],
  ["pickupAddress", "Địa chỉ nhận xe"],
  ["pickupProvince", "Tỉnh/Thành phố nhận xe"],
  ["pickupDistrict", "Quận/Huyện nhận xe"],
  ["pickupWard", "Phường/Xã nhận xe"],
  ["pickupNote", "Ghi chú nhận xe"],
  ["deliveryEnabled", "Hỗ trợ giao xe tận nơi"],
  ["deliveryBaseFee", "Phí mở đầu giao xe"],
  ["deliveryFeePerKm", "Phí giao xe mỗi kilomet"],
  ["deliveryMaxDistanceKm", "Khoảng cách giao xe tối đa"],
  ["deliveryNote", "Ghi chú giao xe"],
  ["images", "Hình ảnh xe"],
  ["registrationCardImages", "Ảnh cà vẹt xe"],
  ["description", "Mô tả xe"],
] as const;

function normalizeComparableValue(value: any): unknown {
  if (value === undefined || value === null || value === "") return "";

  if (typeof value?.toHexString === "function") {
    return value.toHexString();
  }

  if (typeof value?.toObject === "function") {
    return normalizeComparableValue(
      value.toObject({
        depopulate: true,
        versionKey: false,
      }),
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparableValue(item));
  }

  if (typeof value === "object") {
    const normalizedObject: Record<string, unknown> = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        normalizedObject[key] = normalizeComparableValue(value[key]);
      });
    return normalizedObject;
  }

  return String(value);
}

function getNestedValue(source: any, path: string) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function summarizeApprovalValue(field: string, value: unknown) {
  if (field === "images" || field === "registrationCardImages") {
    return `${Array.isArray(value) ? value.length : 0} ảnh`;
  }

  return normalizeComparableValue(value);
}

function buildCarApprovalChanges(
  existingCar: any,
  nextData: Record<string, unknown>,
) {
  return CAR_APPROVAL_CHANGE_FIELDS.flatMap(([field, label]) => {
    const topLevelField = field.split(".")[0] || field;
    if (!(topLevelField in nextData)) return [];

    const previousValue = getNestedValue(existingCar, field);
    const currentValue = getNestedValue(nextData, field);
    const previousSnapshot = summarizeApprovalValue(field, previousValue);
    const currentSnapshot = summarizeApprovalValue(field, currentValue);
    if (
      JSON.stringify(normalizeComparableValue(previousSnapshot)) ===
      JSON.stringify(normalizeComparableValue(currentSnapshot))
    ) {
      return [];
    }

    return [
      {
        field,
        label,
        previousValue: previousSnapshot,
        currentValue: currentSnapshot,
      },
    ];
  });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toOptionalPositiveNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;

  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : undefined;
}

function getComparablePrice(car: any, rentalMode?: string) {
  if (rentalMode === RentalModeEnum.HOURLY) {
    return (
      Number(car.pricing?.basePricePerHour || 0) ||
      Number(car.pricing?.basePricePerDay || 0)
    );
  }

  return (
    Number(car.pricing?.basePricePerDay || 0) ||
    Number(car.pricing?.basePricePerHour || 0)
  );
}

function getDistanceKm(originLat?: number, originLng?: number, destLat?: number, destLng?: number) {
  if (
    originLat === undefined ||
    originLng === undefined ||
    destLat === undefined ||
    destLng === undefined ||
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng) ||
    !Number.isFinite(destLat) ||
    !Number.isFinite(destLng)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const toRad = (degree: number) => (degree * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(destLat - originLat);
  const dLng = toRad(destLng - originLng);
  const lat1 = toRad(originLat);
  const lat2 = toRad(destLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

const HOME_CAR_LIST_PROJECTION = {
  _id: 1,
  carCode: 1,
  businessId: 1,
  ownerId: 1,
  ownerType: 1,
  brandId: 1,
  name: 1,
  type: 1,
  licensePlate: 1,
  pricing: 1,
  allowDailyRental: 1,
  allowHourlyRental: 1,
  rentalUnit: 1,
  seats: 1,
  fuelType: 1,
  transmission: 1,
  images: { $slice: 1 },
  pickupProvince: 1,
  pickupDistrict: 1,
  pickupWard: 1,
  province: 1,
  city: 1,
  district: 1,
  ward: 1,
  pickupLat: 1,
  pickupLng: 1,
  latitude: 1,
  longitude: 1,
  deliveryEnabled: 1,
  status: 1,
  isHidden: 1,
  createdAt: 1,
};

function buildHomeCarListProjection(includeThumbnail: boolean) {
  if (includeThumbnail) return HOME_CAR_LIST_PROJECTION;

  const projection = { ...HOME_CAR_LIST_PROJECTION };
  delete (projection as Partial<typeof HOME_CAR_LIST_PROJECTION>).images;
  return projection;
}

class CarRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post(
      "/createCar",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.createCar),
    );

    this.router.get("/getHomeCars", this.route(this.getHomeCars));
    this.router.get("/search", this.route(this.getHomeCars));
    this.router.get("/getOneCar/:id", this.route(this.getOneCar));
    this.router.get("/:carId/reviews", this.route(this.getCarReviews));

    this.router.get(
      "/getMyCars",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.getMyCars),
    );

    this.router.post(
      "/updateCar/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.updateCar),
    );

    this.router.post(
      "/resubmitCar/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.resubmitCar),
    );

    this.router.delete(
      "/deleteCar/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.deleteCar),
    );

    this.router.post(
      "/hideCar/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.hideCar),
    );

    this.router.post(
      "/unhideCar/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.unhideCar),
    );

    this.router.post(
      "/approveCar/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.approveCar),
    );

    this.router.post(
      "/rejectCar/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.rejectCar),
    );

    this.router.get(
      "/getPendingCars",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getPendingCars),
    );

    this.router.get(
      "/getAllCars",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getAllCars),
    );
  }

  private async getOwnerContext(authUser: any, requireApproved = false) {
    if (authUser.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: authUser.userId,
        isDeleted: false,
      });

      if (!business) {
        throw ErrorHelper.recordNotFound("Business");
      }

      if (requireApproved && !business.isApproved) {
        throw ErrorHelper.permissionDeny();
      }

      return {
        ownerId: business._id,
        ownerType: OwnerTypeEnum.BUSINESS,
        ownerModel: "Business",
        business,
      };
    }

    return {
      ownerId: authUser.userId,
      ownerType: OwnerTypeEnum.USER,
      ownerModel: "User",
      business: null,
    };
  }

  private buildOwnerFilter(owner: any) {
    const ownerFilter = {
      ownerId: owner.ownerId,
      ownerType: owner.ownerType,
    };

    if (owner.ownerType === OwnerTypeEnum.BUSINESS && owner.business?._id) {
      return {
        $or: [
          ownerFilter,
          { businessId: owner.business._id, ownerId: { $exists: false } },
        ],
      };
    }

    return ownerFilter;
  }
  private getOptionalAuthUser(req: Request) {
    try {
      const xToken = req.headers["x-token"];
      const authorization = req.headers.authorization;
      const token =
        (Array.isArray(xToken) ? xToken[0] : xToken) ||
        (authorization?.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : undefined);

      return token ? TokenHelper.verifyToken(token) : null;
    } catch {
      return null;
    }
  }

  private getAuthUserId(authUser: any) {
    return typeof authUser?.userId === "string" ? authUser.userId : undefined;
  }

  private async canViewRentedCar(car: any, authUser: any) {
    const authUserId = this.getAuthUserId(authUser);

    if (!authUserId || car.status !== CarStatusEnum.RENTED) {
      return false;
    }

    const ownerId = String(car.ownerId?._id || car.ownerId || "");
    const businessId = String(car.businessId?._id || car.businessId || "");
    const authRole = String(authUser?.role || "").toUpperCase();
    const isUserOwner =
      authRole === UserRoleEnum.USER &&
      car.ownerType === OwnerTypeEnum.USER &&
      ownerId === authUserId;

    const [renterBooking, business] = await Promise.all([
      BookingModel.exists({
        carId: car._id,
        userId: authUserId,
        status: { $in: RENTED_CAR_DETAIL_BOOKING_STATUSES },
        isDeleted: false,
      } as any),
      authRole === UserRoleEnum.BUSINESS
        ? BusinessModel.findOne({
            userId: authUserId,
            isDeleted: false,
          })
            .select("_id")
            .lean()
        : null,
    ]);
    const relatedBusinessId = String(business?._id || "");
    const isBusinessOwner =
      authRole === UserRoleEnum.BUSINESS &&
      Boolean(relatedBusinessId) &&
      (ownerId === relatedBusinessId || businessId === relatedBusinessId);

    return Boolean(renterBooking) || isUserOwner || isBusinessOwner;
  }

  private async getRentalAvailabilityMap(carIds: unknown[]) {
    const availabilityMap = new Map<string, RentalAvailabilityEnum>();
    const now = new Date();

    carIds.forEach((carId) => {
      availabilityMap.set(String(carId), RentalAvailabilityEnum.AVAILABLE);
    });

    if (carIds.length === 0) {
      return availabilityMap;
    }

    await expireAbandonedPendingBookings(now);
    await expireOldCarts(now);

    const [heldCarIds, pendingBookings] = await Promise.all([
      CartModel.distinct("carId", {
        carId: { $in: carIds },
        status: CartStatusEnum.ACTIVE,
        expiredAt: { $gt: now },
      } as any),
      BookingModel.find({
        carId: { $in: carIds },
        status: {
          $in: [BookingStatusEnum.REQUESTED],
        },
        isDeleted: false,
        endDate: { $gt: now },
      } as any)
        .select("_id carId")
        .lean(),
    ]);
    const checkoutStartedBookingIds = await getCheckoutStartedBookingIdSet(
      pendingBookings.map((booking) => booking._id),
    );

    heldCarIds.forEach((carId) => {
      availabilityMap.set(String(carId), RentalAvailabilityEnum.HELD_IN_CART);
    });

    pendingBookings.forEach((booking) => {
      const carId = String(booking.carId);
      const hasCheckoutStarted = checkoutStartedBookingIds.has(
        String(booking._id),
      );

      if (!hasCheckoutStarted) {
        if (
          availabilityMap.get(carId) !==
          RentalAvailabilityEnum.PENDING_CONFIRMATION
        ) {
          availabilityMap.set(carId, RentalAvailabilityEnum.HELD_IN_CART);
        }

        return;
      }

      availabilityMap.set(
        carId,
        RentalAvailabilityEnum.PENDING_CONFIRMATION,
      );
    });

    return availabilityMap;
  }

  private async getScheduleBookabilityMap(
    carIds: unknown[],
    requestedStart?: Date,
    requestedEnd?: Date,
    rentalMode?: string,
    currentUserId?: string,
    ignoreCurrentUserHolds = true,
  ) {
    const bookabilityMap = new Map<
      string,
      {
        isBookable: boolean;
        unavailableReason?: string;
        cleaningUntil?: Date;
      }
    >();

    carIds.forEach((carId) => {
      bookabilityMap.set(String(carId), { isBookable: true });
    });

    if (
      carIds.length === 0 ||
      !requestedStart ||
      !requestedEnd ||
      Number.isNaN(requestedStart.getTime()) ||
      Number.isNaN(requestedEnd.getTime()) ||
      requestedEnd <= requestedStart
    ) {
      return bookabilityMap;
    }

    const now = new Date();
    await expireAbandonedPendingBookings(now);
    await expireOldCarts(now);

    const cleaningBufferMs = getCarCleaningBufferMs();
    const cleaningStartedAfter = new Date(
      requestedStart.getTime() - cleaningBufferMs,
    );
    const [overlapBookingCarIds, overlapCartCarIds, cleaningBookings] =
      await Promise.all([
      BookingModel.distinct("carId", {
        carId: { $in: carIds },
        ...(currentUserId && ignoreCurrentUserHolds
          ? { userId: { $ne: currentUserId } }
          : {}),
        status: {
          $in: BLOCKING_BOOKING_STATUSES,
        },
        isDeleted: false,
        startDate: { $lt: requestedEnd },
        endDate: { $gt: requestedStart },
      } as any),
      CartModel.distinct("carId", {
        carId: { $in: carIds },
        ...(currentUserId && ignoreCurrentUserHolds
          ? { userId: { $ne: currentUserId } }
          : {}),
        status: CartStatusEnum.ACTIVE,
        expiredAt: { $gt: now },
        startDate: { $lt: requestedEnd },
        endDate: { $gt: requestedStart },
      } as any),
      cleaningBufferMs > 0
        ? BookingModel.find({
            carId: { $in: carIds },
            status: BookingStatusEnum.COMPLETED,
            isDeleted: false,
            $or: [
              {
                completedAt: {
                  $gt: cleaningStartedAfter,
                  $lt: requestedEnd,
                },
              },
              {
                completedAt: null,
                updatedAt: {
                  $gt: cleaningStartedAfter,
                  $lt: requestedEnd,
                },
              },
            ],
          } as any)
            .select("_id carId completedAt updatedAt")
            .lean()
        : Promise.resolve([]),
    ]);

    [...overlapBookingCarIds, ...overlapCartCarIds].forEach((carId) => {
      bookabilityMap.set(String(carId), {
        isBookable: false,
        unavailableReason: "Xe không khả dụng trong thời gian đã chọn",
      });
    });

    cleaningBookings.forEach((booking) => {
      const completedAtSource = booking.completedAt ?? booking.updatedAt;
      if (!completedAtSource) return;

      const completedAt = new Date(completedAtSource);
      const cleaningUntil = getCarCleaningUnavailableUntil(completedAt);

      if (completedAt < requestedEnd && cleaningUntil > requestedStart) {
        bookabilityMap.set(String(booking.carId), {
          isBookable: false,
          cleaningUntil,
          unavailableReason: `Xe đang được vệ sinh đến ${cleaningUntil.toLocaleString(
            "vi-VN",
            { timeZone: "Asia/Ho_Chi_Minh" },
          )}. Vui lòng chọn giờ nhận xe sau thời điểm này.`,
        });
      }
    });

    const selectedRentalMode = normalizeRentalMode(rentalMode);

    if (selectedRentalMode) {
      const cars = await CarModel.find({ _id: { $in: carIds } } as any)
        .select("_id rentalUnit allowDailyRental allowHourlyRental")
        .lean();

      cars.forEach((car) => {
        const support = getCarRentalSupport(car);
        const isSupported =
          selectedRentalMode === RentalModeEnum.DAILY
            ? support.allowDailyRental
            : support.allowHourlyRental;

        if (!isSupported) {
          bookabilityMap.set(String(car._id), {
            isBookable: false,
            unavailableReason:
              selectedRentalMode === RentalModeEnum.DAILY
                ? "Xe không hỗ trợ thuê theo ngày"
                : "Xe không hỗ trợ thuê theo giờ",
          });
        }
      });
    }

    return bookabilityMap;
  }

  private async getUnavailableRangeMap(
    carIds: unknown[],
    currentUserId?: string,
  ) {
    const rangeMap = new Map<string, any[]>();

    carIds.forEach((carId) => {
      rangeMap.set(String(carId), []);
    });

    if (carIds.length === 0) {
      return rangeMap;
    }

    const now = new Date();
    const cleaningBufferMs = getCarCleaningBufferMs();
    const cleaningStartedAfter = new Date(now.getTime() - cleaningBufferMs);
    const [bookings, cleaningBookings] = await Promise.all([
      BookingModel.find({
        carId: { $in: carIds },
        ...(currentUserId ? { userId: { $ne: currentUserId } } : {}),
        status: { $in: BLOCKING_BOOKING_STATUSES },
        isDeleted: false,
        endDate: { $gt: now },
      } as any)
        .select("_id carId startDate endDate status")
        .sort({ startDate: 1 })
        .lean(),
      cleaningBufferMs > 0
        ? BookingModel.find({
            carId: { $in: carIds },
            status: BookingStatusEnum.COMPLETED,
            isDeleted: false,
            $or: [
              { completedAt: { $gt: cleaningStartedAfter } },
              { completedAt: null, updatedAt: { $gt: cleaningStartedAfter } },
            ],
          } as any)
            .select("_id carId completedAt updatedAt")
            .lean()
        : Promise.resolve([]),
    ]);

    bookings.forEach((booking) => {
      const carId = String(booking.carId);
      const ranges = rangeMap.get(carId) || [];

      ranges.push({
        bookingId: booking._id,
        startDate: booking.startDate,
        endDate: booking.endDate,
        status: booking.status,
      });
      rangeMap.set(carId, ranges);
    });

    cleaningBookings.forEach((booking) => {
      const completedAtSource = booking.completedAt ?? booking.updatedAt;
      if (!completedAtSource) return;

      const completedAt = new Date(completedAtSource);
      const cleaningUntil = getCarCleaningUnavailableUntil(completedAt);

      if (cleaningUntil <= now) return;

      const carId = String(booking.carId);
      const ranges = rangeMap.get(carId) || [];
      ranges.push({
        bookingId: booking._id,
        startDate: completedAt,
        endDate: cleaningUntil,
        status: RentalAvailabilityEnum.CLEANING,
        type: RentalAvailabilityEnum.CLEANING,
        reason: "Xe cần được vệ sinh sau chuyến thuê trước khi giao cho khách tiếp theo.",
      });
      rangeMap.set(carId, ranges);
    });

    return rangeMap;
  }

  private getAvailabilityLabel(availability: RentalAvailabilityEnum) {
    if (availability === RentalAvailabilityEnum.CLEANING) {
      return "Đang vệ sinh";
    }

    if (availability === RentalAvailabilityEnum.PENDING_CONFIRMATION) {
      return "Đang chờ xác nhận";
    }

    if (availability === RentalAvailabilityEnum.HELD_IN_CART) {
      return "Đang được giữ";
    }

    return "Sẵn sàng";
  }

  private async getReviewSummaryMap(carIds: unknown[]) {
    const summaryMap = new Map<
      string,
      { averageRating: number; reviewCount: number }
    >();

    carIds.forEach((carId) => {
      summaryMap.set(String(carId), { averageRating: 0, reviewCount: 0 });
    });

    if (carIds.length === 0) return summaryMap;

    const rows = await ReviewModel.aggregate([
      {
        $match: {
          carId: { $in: carIds },
          status: ReviewStatusEnum.VISIBLE,
        },
      },
      {
        $group: {
          _id: "$carId",
          averageRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    rows.forEach((row: any) => {
      summaryMap.set(String(row._id), {
        averageRating: Number(Number(row.averageRating || 0).toFixed(1)),
        reviewCount: Number(row.reviewCount || 0),
      });
    });

    return summaryMap;
  }

  private validatePickupAddress(addressFields: ReturnType<typeof normalizeCarAddressFields>) {
    if (
      !addressFields.pickupAddress ||
      !addressFields.district ||
      !getCityOrProvince(addressFields)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Vui lòng nhập địa chỉ nhận xe, quận/huyện và tỉnh/thành phố",
      );
    }

  }

  private validateLicensePlate(licensePlate?: unknown) {
    return validatePlateNumber(licensePlate);
  }

  private getPublicCarAddress(carData: any, showDetailedUserAddress = false) {
    const publicCarData = { ...carData };
    delete publicCarData.registrationCardImages;
    delete publicCarData.approvalSubmission;

    if (
      String(carData.ownerType || "") !== OwnerTypeEnum.USER ||
      showDetailedUserAddress
    ) {
      return publicCarData;
    }

    delete publicCarData.pickupAddress;
    delete publicCarData.address;
    delete publicCarData.ward;
    delete publicCarData.locationNote;
    delete publicCarData.latitude;
    delete publicCarData.longitude;
    delete publicCarData.pickupFormattedAddress;
    delete publicCarData.pickupPlaceId;
    delete publicCarData.pickupLat;
    delete publicCarData.pickupLng;
    delete publicCarData.pickupNote;

    return publicCarData;
  }

  private withRentalAvailability(
    car: any,
    availability: RentalAvailabilityEnum,
    bookability?: {
      isBookable: boolean;
      unavailableReason?: string;
      cleaningUntil?: Date;
    },
    unavailableRanges: any[] = [],
    showDetailedUserAddress = false,
  ) {
    const carData = typeof car.toObject === "function" ? car.toObject() : car;
    const publicCarData = this.getPublicCarAddress(
      carData,
      showDetailedUserAddress,
    );
    const isScheduleBookable = bookability?.isBookable !== false;
    const now = new Date();
    const activeCleaningRange = unavailableRanges.find(
      (range) =>
        String(range.type || range.status || "") ===
          RentalAvailabilityEnum.CLEANING && new Date(range.endDate) > now,
    );
    const effectiveAvailability =
      availability === RentalAvailabilityEnum.AVAILABLE && activeCleaningRange
        ? RentalAvailabilityEnum.CLEANING
        : availability;
    const cleaningUntil = activeCleaningRange
      ? new Date(activeCleaningRange.endDate)
      : bookability?.cleaningUntil;

    return {
      ...publicCarData,
      rentalAvailability: effectiveAvailability,
      availabilityLabel: isScheduleBookable
        ? this.getAvailabilityLabel(effectiveAvailability)
        : "Không khả dụng",
      isBookable:
        availability === RentalAvailabilityEnum.AVAILABLE && isScheduleBookable,
      unavailableReason:
        bookability?.unavailableReason ||
        (cleaningUntil
          ? `Xe đang được vệ sinh đến ${cleaningUntil.toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
            })}. Bạn có thể chọn giờ nhận xe sau thời điểm này.`
          : undefined),
      cleaningUntil: cleaningUntil?.toISOString(),
      unavailableRanges,
    };
  }

  private buildHomeCarListDto(car: any) {
    const brand = car.brandId
      ? {
          _id: car.brandId._id,
          name: car.brandId.name,
        }
      : null;
    const business = car.businessId
      ? {
          _id: car.businessId._id,
          businessName: car.businessId.businessName,
        }
      : null;
    const firstImage = Array.isArray(car.images)
      ? car.images.find((image: unknown) => typeof image === "string" && image.trim()) || ""
      : "";
    const thumbnail = toCloudinaryCardThumbnailUrl(firstImage);
    const publicCar = { ...car };

    delete publicCar.images;
    delete publicCar.ownerId;

    return {
      ...publicCar,
      thumbnail,
      brand,
      brandId: brand,
      businessId: business,
      ownerName:
        publicCar.ownerType === OwnerTypeEnum.USER
          ? "Người dùng ký gửi"
          : business?.businessName || "Đối tác BQDrive",
    };
  }

  private async assertCarHasNoActiveWork(
    carId: string,
    owner: any,
    actionLabel = "ẩn hoặc hiện",
  ) {
    await expireAbandonedPendingBookings();
    await expireOldCarts();

    const now = new Date();
    const [activeContract, activeBooking, activeCart] = await Promise.all([
      ContractModel.findOne({
        carId,
        ...this.buildOwnerFilter(owner),
        status: { $in: DELETE_BLOCKING_CONTRACT_STATUSES },
        isDeleted: false,
      } as any).select("_id"),
      BookingModel.findOne({
        carId,
        ...this.buildOwnerFilter(owner),
        status: { $in: BLOCKING_BOOKING_STATUSES },
        isDeleted: false,
      } as any).select("_id"),
      CartModel.findOne({
        carId,
        status: CartStatusEnum.ACTIVE,
        expiredAt: { $gt: now },
      } as any).select("_id"),
    ]);

    if (activeContract || activeBooking) {
      throw ErrorHelper.requestDataInvalid(
        `Không thể ${actionLabel} xe đang có booking hoặc hợp đồng thuê còn hiệu lực`,
      );
    }

    if (activeCart) {
      throw ErrorHelper.requestDataInvalid(
        `Không thể ${actionLabel} xe đang được giữ trong giỏ hàng của khách`,
      );
    }
  }

  private async updateCarVisibility(req: Request, res: Response, isHidden: boolean) {
    const authUser = (req as any).user;
    const { id } = req.params;
    const owner = await this.getOwnerContext(authUser);

    const existingCar = await CarModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    } as any);

    if (!existingCar) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    await this.assertCarHasNoActiveWork(String(existingCar._id), owner);

    (existingCar as any).hiddenByOwner = isHidden;
    existingCar.isHidden = isHidden || Boolean((existingCar as any).hiddenByAdmin);
    await existingCar.save();
    await existingCar.populate("brandId");

    return res.status(200).json({
      status: 200,
      code: "200",
      message: isHidden
        ? "Ẩn xe thành công"
        : "Hiện xe thành công",
      data: { car: existingCar },
    });
  }

  async createCar(req: Request, res: Response) {
    const authUser = (req as any).user;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "carCode")) {
      throw ErrorHelper.requestDataInvalid(
        "Mã xe do hệ thống tự động tạo và không được gửi từ client",
      );
    }

    const owner = await this.getOwnerContext(authUser, true);

    const {
      brandId,
      name,
      type,
      licensePlate,
      allowDailyRental,
      allowHourlyRental,
      rentalUnit,
      seats,
      fuelType,
      transmission,
      description,
    } = req.body;
    const images = normalizeCarImagesInput(req.body.images);
    const registrationCardImages = normalizeCarImagesInput(
      req.body.registrationCardImages,
    );
    const addressFields = normalizeCarAddressFields(req.body);

    if (!brandId || !name || !seats) {
      throw ErrorHelper.requestDataInvalid("Thiếu brandId, name hoặc seats");
    }
    assertNoNewBase64CarImages(images);
    validateRegistrationCardImages(registrationCardImages, { required: true });
    this.validatePickupAddress(addressFields);
    const normalizedLicensePlate = this.validateLicensePlate(licensePlate);
    const plateNumberNormalized = normalizedLicensePlate
      ? getPlateNumberKey(normalizedLicensePlate)
      : "";

    if (plateNumberNormalized) {
      const duplicatedCar = await CarModel.findOne({
        $or: [
          { plateNumberNormalized },
          { licensePlate: normalizedLicensePlate },
        ],
        isDeleted: false,
      } as any);

      if (duplicatedCar) {
        throw ErrorHelper.requestDataInvalid(PLATE_DUPLICATED_MESSAGE);
      }
    }

    const dailyEnabled =
      typeof allowDailyRental === "boolean"
        ? allowDailyRental
        : rentalUnit !== RentalUnitEnum.HOUR;
    const hourlyEnabled =
      typeof allowHourlyRental === "boolean"
        ? allowHourlyRental
        : rentalUnit === RentalUnitEnum.HOUR;
    const selectedRentalUnit =
      hourlyEnabled && !dailyEnabled ? RentalUnitEnum.HOUR : RentalUnitEnum.DAY;

    if (!dailyEnabled && !hourlyEnabled) {
      throw ErrorHelper.requestDataInvalid("Đơn vị thuê xe không hợp lệ");
    }
    const pricingPayload = normalizeCarPricingPayload(
      req.body,
      dailyEnabled,
      hourlyEnabled,
    );
    const mileagePayload = normalizeCarMileagePayload(req.body);
    const deliveryPayload = normalizeDeliveryPayload(req.body);
    const carCode = await generateCarCode();

    const car = await CarModel.create({
      carCode,
      ...(owner.business ? { businessId: owner.business._id } : {}),
      ownerId: owner.ownerId,
      ownerType: owner.ownerType,
      ownerModel: owner.ownerModel,
      brandId,
      name,
      type,
      ...(normalizedLicensePlate
        ? { licensePlate: normalizedLicensePlate }
        : {}),
      ...(plateNumberNormalized ? { plateNumberNormalized } : {}),
      ...pricingPayload,
      ...mileagePayload,
      ...deliveryPayload,
      allowDailyRental: dailyEnabled,
      allowHourlyRental: hourlyEnabled,
      rentalUnit: selectedRentalUnit,
      seats,
      fuelType,
      transmission,
      images,
      registrationCardImages,
      description,
      ...addressFields,
      approvalSubmission: {
        submissionType: "CREATE",
        submittedAt: new Date(),
        submittedBy: authUser.userId,
        submittedByRole: owner.ownerType,
        changes: [],
      },
      status: CarStatusEnum.PENDING,
    } as any);
    void sendCarSubmittedToAdminMail(car);

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đăng xe thành công, vui lòng chờ Admin duyệt",
      data: { car },
    });
  }

  async getHomeCars(req: Request, res: Response) {
    const authUser = this.getOptionalAuthUser(req);
    const authUserId = this.getAuthUserId(authUser);
    await expireOldCarts();

    const {
      brandId,
      seats,
      minPrice,
      maxPrice,
      keyword,
      location,
      pickupProvince,
      pickupDistrict,
      pickupWard,
      fuelType,
      type,
      categoryId,
      transmission,
      rentalUnit,
      rentalMode,
      startDate,
      endDate,
      sort,
      deliveryOnly,
      minRating,
      userLat,
      userLng,
      thumbnail,
    } =
      req.query;
    const isSearchRequest = req.path === "/search";
    const includeThumbnail = String(thumbnail || "") !== "false";

    const filter: any = {
      status: isSearchRequest
        ? CarStatusEnum.APPROVED
        : { $in: PUBLIC_CAR_STATUSES },
      isDeleted: false,
      isHidden: { $ne: true },
    };
    const andFilters: any[] = [];
    const selectedRentalMode = normalizeRentalMode(
      String(rentalMode || rentalUnit || ""),
    );

    if (brandId) filter.brandId = brandId;
    if (seats) filter.seats = Number(seats);
    if (fuelType) filter.fuelType = String(fuelType);
    if (transmission) filter.transmission = String(transmission);
    if (type || categoryId) filter.type = String(type || categoryId);
    if (String(deliveryOnly || "") === "true") {
      filter.deliveryEnabled = true;
    }
    if (selectedRentalMode === RentalModeEnum.HOURLY) {
      andFilters.push({
        $or: [{ allowHourlyRental: true }, { rentalUnit: RentalUnitEnum.HOUR }],
      });
    }

    if (selectedRentalMode === RentalModeEnum.DAILY) {
      andFilters.push({
        $or: [{ allowDailyRental: true }, { rentalUnit: RentalUnitEnum.DAY }],
      });
    }

    if (minPrice || maxPrice) {
      const priceFilter: any = {};
      if (minPrice) priceFilter.$gte = Number(minPrice);
      if (maxPrice) priceFilter.$lte = Number(maxPrice);

      if (selectedRentalMode === RentalModeEnum.HOURLY) {
        andFilters.push({ "pricing.basePricePerHour": priceFilter });
      } else if (selectedRentalMode === RentalModeEnum.DAILY) {
        andFilters.push({ "pricing.basePricePerDay": priceFilter });
      } else {
        andFilters.push({
          $or: [
            { "pricing.basePricePerDay": priceFilter },
            { "pricing.basePricePerHour": priceFilter },
          ],
        });
      }
    }

    const normalizedKeyword = cleanSearchText(keyword);
    if (normalizedKeyword) {
      const keywordRegex = {
        $regex: escapeRegex(normalizedKeyword),
        $options: "i",
      };
      filter.$or = [
        { carCode: keywordRegex },
        { name: keywordRegex },
        { licensePlate: keywordRegex },
        { plateNumberNormalized: keywordRegex },
      ];
    }

    const locationText = cleanSearchText(location);
    const provinceText = cleanSearchText(pickupProvince);
    const districtText = cleanSearchText(pickupDistrict);
    const wardText = cleanSearchText(pickupWard);

    if (provinceText) {
      const provinceRegex = {
        $regex: `^${escapeRegex(provinceText)}$`,
        $options: "i",
      };
      andFilters.push({
        $or: [
          { province: provinceRegex },
          { city: provinceRegex },
          { pickupProvince: provinceRegex },
        ],
      });
    }

    if (districtText) {
      const districtRegex = {
        $regex: `^${escapeRegex(districtText)}$`,
        $options: "i",
      };
      andFilters.push({
        $or: [{ district: districtRegex }, { pickupDistrict: districtRegex }],
      });
    }

    if (wardText) {
      const wardRegex = {
        $regex: `^${escapeRegex(wardText)}$`,
        $options: "i",
      };
      andFilters.push({
        $or: [{ ward: wardRegex }, { pickupWard: wardRegex }],
      });
    }

    if (locationText) {
      const locationRegex = {
        $regex: escapeRegex(locationText),
        $options: "i",
      };
      andFilters.push({
        $or: [
          { province: locationRegex },
          { city: locationRegex },
          { district: locationRegex },
          { ward: locationRegex },
          { pickupAddress: locationRegex },
          { address: locationRegex },
          { pickupProvince: locationRegex },
          { pickupDistrict: locationRegex },
          { pickupWard: locationRegex },
        ],
      });
    }

    if (andFilters.length > 0) {
      filter.$and = andFilters;
    }

    const sortOption = { createdAt: -1 };

    const cars = await CarModel.find(filter)
      .select(buildHomeCarListProjection(includeThumbnail) as any)
      .populate("brandId", "_id name")
      .populate("businessId", "_id businessName")
      .sort(sortOption as any)
      .lean();

    const requestedStart =
      typeof startDate === "string" ? new Date(startDate) : undefined;
    const requestedEnd =
      typeof endDate === "string" ? new Date(endDate) : undefined;
    const carIds = cars.map((car) => car._id);
    const [bookabilityMap, unavailableRangeMap, reviewSummaryMap] = await Promise.all([
      this.getScheduleBookabilityMap(
        carIds,
        requestedStart,
        requestedEnd,
        typeof (rentalMode || rentalUnit) === "string"
          ? String(rentalMode || rentalUnit)
          : undefined,
        authUserId,
        !isSearchRequest,
      ),
      this.getUnavailableRangeMap(carIds, authUserId),
      this.getReviewSummaryMap(carIds),
    ]);
    const shouldOnlyReturnBookable =
      isSearchRequest ||
      Boolean(
        location ||
          pickupProvince ||
          pickupDistrict ||
          pickupWard ||
          startDate ||
          endDate,
      );
    const requestedMinRating = toOptionalPositiveNumber(minRating);
    const sortUserLat = toOptionalPositiveNumber(userLat);
    const sortUserLng = toOptionalPositiveNumber(userLng);
    const carsWithAvailability = cars
      .map((car) =>
        this.withRentalAvailability(
        car,
        RentalAvailabilityEnum.AVAILABLE,
        bookabilityMap.get(String(car._id)),
        unavailableRangeMap.get(String(car._id)) || [],
      ),
      )
      .map((car) => ({
        ...car,
        reviewSummary: reviewSummaryMap.get(String(car._id)) || {
          averageRating: 0,
          reviewCount: 0,
        },
      }))
      .filter(
        (car) =>
          !shouldOnlyReturnBookable ||
          car.isBookable !== false ||
          car.rentalAvailability === RentalAvailabilityEnum.CLEANING,
      )
      .filter((car) => {
        if (!requestedMinRating) return true;
        return Number(car.reviewSummary?.averageRating || 0) >= requestedMinRating;
      })
      .sort((a, b) => {
        if (sort === "price_asc") {
          return getComparablePrice(a, selectedRentalMode) - getComparablePrice(b, selectedRentalMode);
        }

        if (sort === "price_desc") {
          return getComparablePrice(b, selectedRentalMode) - getComparablePrice(a, selectedRentalMode);
        }

        if (sort === "rating_desc") {
          return (
            Number(b.reviewSummary?.averageRating || 0) -
              Number(a.reviewSummary?.averageRating || 0) ||
            Number(b.reviewSummary?.reviewCount || 0) -
              Number(a.reviewSummary?.reviewCount || 0)
          );
        }

        if (sort === "nearest" && sortUserLat !== undefined && sortUserLng !== undefined) {
          return (
            getDistanceKm(sortUserLat, sortUserLng, Number(a.pickupLat ?? a.latitude), Number(a.pickupLng ?? a.longitude)) -
            getDistanceKm(sortUserLat, sortUserLng, Number(b.pickupLat ?? b.latitude), Number(b.pickupLng ?? b.longitude))
          );
        }

        return 0;
      });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { cars: carsWithAvailability.map((car) => this.buildHomeCarListDto(car)) },
    });
  }

  async getOneCar(req: Request, res: Response) {
    const authUser = this.getOptionalAuthUser(req);
    const authUserId = this.getAuthUserId(authUser);
    const id = req.params.id as string;
    await expireOldCarts();
    await expireAbandonedPendingBookings();

    const car = await CarModel.findOne({
      _id: id,
      isDeleted: false,
    } as any)
      .populate("brandId")
      .populate("businessId")
      .populate("ownerId", "-password -otpCode");

    if (!car) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    const isPubliclyVisible =
      car.status === CarStatusEnum.APPROVED &&
      !car.isHidden &&
      !(car as any).hiddenByOwner &&
      !(car as any).hiddenByAdmin;
    const canViewAsRelatedParty =
      !isPubliclyVisible && (await this.canViewRentedCar(car, authUser));

    if (!isPubliclyVisible && !canViewAsRelatedParty) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    const requestedStart =
      typeof req.query.startDate === "string"
        ? new Date(req.query.startDate)
        : undefined;
    const requestedEnd =
      typeof req.query.endDate === "string"
        ? new Date(req.query.endDate)
        : undefined;
    const [bookabilityMap, unavailableRangeMap] = await Promise.all([
      this.getScheduleBookabilityMap(
        [car._id],
        requestedStart,
        requestedEnd,
        typeof req.query.rentalMode === "string"
          ? req.query.rentalMode
          : undefined,
        authUserId,
      ),
      this.getUnavailableRangeMap([car._id], authUserId),
    ]);
    const currentUserActiveBooking = authUserId
      ? await BookingModel.findOne({
          carId: car._id,
          userId: authUserId,
          status: { $in: BLOCKING_BOOKING_STATUSES },
          isDeleted: false,
        } as any)
          .select(
            "_id status startDate endDate rentalMode totalPrice paidAmount depositAmount remainingAmount paymentOption",
          )
          .sort({ createdAt: -1 })
          .lean()
      : null;
    const ownerId = (car as any).ownerId?._id || (car as any).ownerId;
    const isCurrentUserConsignmentOwner =
      Boolean(authUserId) &&
      String((car as any).ownerType || "") === OwnerTypeEnum.USER &&
      String(ownerId || "") === authUserId;
    const canShowDetailedPickupAddress =
      String((car as any).ownerType || "") !== OwnerTypeEnum.USER ||
      isCurrentUserConsignmentOwner ||
      DETAILED_PICKUP_BOOKING_STATUSES.includes(
        currentUserActiveBooking?.status as BookingStatusEnum,
      );
    const carWithAvailability = this.withRentalAvailability(
      car,
      RentalAvailabilityEnum.AVAILABLE,
      bookabilityMap.get(String(car._id)),
      unavailableRangeMap.get(String(car._id)) || [],
      canShowDetailedPickupAddress,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        car: {
          ...carWithAvailability,
          currentUserActiveBooking,
        },
      },
    });
  }

  async getMyCars(req: Request, res: Response) {
    const authUser = (req as any).user;

    const owner = await this.getOwnerContext(authUser);
    await syncRentedCarStatuses();

    const cars = await CarModel.find({
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    })
      .populate("brandId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { cars },
    });
  }

  async updateCar(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { id } = req.params;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "carCode")) {
      throw ErrorHelper.requestDataInvalid("Mã xe không được phép chỉnh sửa");
    }

    const owner = await this.getOwnerContext(authUser);

    const existingCar = await CarModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    } as any);

    if (!existingCar) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    if (existingCar.status === CarStatusEnum.RENTED) {
      throw ErrorHelper.requestDataInvalid(UPDATE_CAR_BLOCKED_MESSAGE);
    }

    await this.assertCarHasNoActiveWork(
      String(existingCar._id),
      owner,
      "chỉnh sửa",
    );

    const updateData = pickOwnerEditableCarFields(req.body);
    const mileagePayload = normalizeCarMileagePayload(updateData);
    delete updateData.currentOdometerKm;
    delete updateData.mileagePolicy;
    Object.assign(updateData, mileagePayload);

    if (
      typeof updateData.currentOdometerKm === "number" &&
      existingCar.currentOdometerKm !== undefined &&
      existingCar.currentOdometerKm !== null &&
      updateData.currentOdometerKm < existingCar.currentOdometerKm
    ) {
      throw ErrorHelper.requestDataInvalid(
        "ODO mới không được nhỏ hơn ODO hiện tại",
      );
    }

    if ("images" in updateData) {
      updateData.images = normalizeCarImagesInput(updateData.images);
      assertNoNewBase64CarImages(
        updateData.images,
        Array.isArray(existingCar.images) ? existingCar.images : [],
      );
    }

    if ("registrationCardImages" in updateData) {
      updateData.registrationCardImages = normalizeCarImagesInput(
        updateData.registrationCardImages,
      );
      validateRegistrationCardImages(updateData.registrationCardImages, {
        existingImages: Array.isArray(existingCar.registrationCardImages)
          ? existingCar.registrationCardImages
          : [],
      });
    }

    const addressFields = normalizeCarAddressFields(updateData);
    this.validatePickupAddress(addressFields);
    const normalizedLicensePlate = this.validateLicensePlate(
      updateData.licensePlate,
    );

    if (normalizedLicensePlate) {
      updateData.licensePlate = normalizedLicensePlate;
      updateData.plateNumberNormalized = getPlateNumberKey(normalizedLicensePlate);

      const duplicatedCar = await CarModel.findOne({
        _id: { $ne: id },
        $or: [
          { plateNumberNormalized: updateData.plateNumberNormalized },
          { licensePlate: normalizedLicensePlate },
        ],
        isDeleted: false,
      } as any);

      if (duplicatedCar) {
        throw ErrorHelper.requestDataInvalid(PLATE_DUPLICATED_MESSAGE);
      }
    } else {
      delete updateData.licensePlate;
      delete updateData.plateNumberNormalized;
    }

    const dailyEnabled =
      typeof updateData.allowDailyRental === "boolean"
        ? updateData.allowDailyRental
        : updateData.rentalUnit
          ? updateData.rentalUnit !== RentalUnitEnum.HOUR
          : typeof existingCar.allowDailyRental === "boolean"
            ? existingCar.allowDailyRental
            : existingCar.rentalUnit !== RentalUnitEnum.HOUR;
    const hourlyEnabled =
      typeof updateData.allowHourlyRental === "boolean"
        ? updateData.allowHourlyRental
        : updateData.rentalUnit
          ? updateData.rentalUnit === RentalUnitEnum.HOUR
          : typeof existingCar.allowHourlyRental === "boolean"
            ? existingCar.allowHourlyRental
            : existingCar.rentalUnit === RentalUnitEnum.HOUR;

    if (!dailyEnabled && !hourlyEnabled) {
      throw ErrorHelper.requestDataInvalid(
        "Cần bật ít nhất một hình thức thuê xe",
      );
    }

    const pricingPayload = normalizeCarPricingPayload(
      {
        ...updateData,
        pricing: updateData.pricing ?? existingCar.pricing,
      },
      dailyEnabled,
      hourlyEnabled,
    );
    const deliveryPayload = normalizeDeliveryPayload(updateData);

    updateData.allowDailyRental = dailyEnabled;
    updateData.allowHourlyRental = hourlyEnabled;
    updateData.rentalUnit =
      hourlyEnabled && !dailyEnabled ? RentalUnitEnum.HOUR : RentalUnitEnum.DAY;
    updateData.pricing = pricingPayload.pricing;
    updateData.deliveryEnabled = deliveryPayload.deliveryEnabled;
    updateData.deliveryBaseFee = deliveryPayload.deliveryBaseFee;
    updateData.deliveryFeePerKm = deliveryPayload.deliveryFeePerKm;
    updateData.deliveryMaxDistanceKm = deliveryPayload.deliveryMaxDistanceKm;
    updateData.deliveryNote = deliveryPayload.deliveryNote;

    if (updateData.rentalUnit) {
      if (!Object.values(RentalUnitEnum).includes(updateData.rentalUnit)) {
        throw ErrorHelper.requestDataInvalid("Đơn vị thuê xe không hợp lệ");
      }

    }

    const finalUpdateData = {
      ...updateData,
      ...addressFields,
    };
    const approvalChanges = buildCarApprovalChanges(
      existingCar,
      finalUpdateData,
    );
    const needsReview =
      existingCar.status === CarStatusEnum.APPROVED &&
      approvalChanges.length > 0;
    const nextStatus =
      existingCar.status === CarStatusEnum.APPROVED && !needsReview
        ? CarStatusEnum.APPROVED
        : CarStatusEnum.PENDING;

    const car = await CarModel.findOneAndUpdate(
      {
        _id: id,
        ...this.buildOwnerFilter(owner),
        isDeleted: false,
      } as any,
      {
        ...finalUpdateData,
        status: nextStatus,
        rejectReason: "",
        ...(nextStatus === CarStatusEnum.PENDING && approvalChanges.length > 0
          ? {
              approvalSubmission: {
                submissionType: "UPDATE",
                submittedAt: new Date(),
                submittedBy: authUser.userId,
                submittedByRole: owner.ownerType,
                changes: approvalChanges,
              },
            }
          : {}),
      },
      { new: true },
    );

    if (!car) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    if (nextStatus === CarStatusEnum.PENDING && approvalChanges.length > 0) {
      void sendCarSubmittedToAdminMail(car);
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message:
        nextStatus === CarStatusEnum.PENDING
          ? "Cập nhật xe thành công, vui lòng chờ Admin duyệt lại"
          : "Cập nhật xe thành công",
      data: { car },
    });
  }

  async resubmitCar(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { id } = req.params;
    const owner = await this.getOwnerContext(authUser);

    const existingCar = await CarModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    } as any);

    if (!existingCar) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    if (existingCar.status !== CarStatusEnum.REJECTED) {
      throw ErrorHelper.requestDataInvalid(
        "Chỉ xe bị từ chối mới có thể gửi lại duyệt",
      );
    }

    await this.assertCarHasNoActiveWork(
      String(existingCar._id),
      owner,
      "gửi lại duyệt",
    );

    existingCar.status = CarStatusEnum.PENDING;
    existingCar.rejectReason = "";
    (existingCar as any).approvalSubmission = {
      submissionType: "RESUBMIT",
      submittedAt: new Date(),
      submittedBy: authUser.userId,
      submittedByRole: owner.ownerType,
      changes: [],
    };
    await existingCar.save();
    await existingCar.populate("brandId");
    void sendCarSubmittedToAdminMail(existingCar);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã gửi lại xe để Admin duyệt",
      data: { car: existingCar },
    });
  }

  async deleteCar(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { id } = req.params;

    const owner = await this.getOwnerContext(authUser);

    const existingCar = await CarModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    } as any);

    if (!existingCar) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    await this.assertCarHasNoActiveWork(String(existingCar._id), owner, "xóa");

    const car = await CarModel.findOneAndUpdate(
      {
        _id: id,
        ...this.buildOwnerFilter(owner),
        isDeleted: false,
      } as any,
      {
        isDeleted: true,
      },
      { new: true },
    );

    if (!car) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xóa xe thành công",
      data: { car },
    });
  }

  async hideCar(req: Request, res: Response) {
    return this.updateCarVisibility(req, res, true);
  }

  async unhideCar(req: Request, res: Response) {
    return this.updateCarVisibility(req, res, false);
  }

  async getPendingCars(req: Request, res: Response) {
    const cars = await CarModel.find({
      status: CarStatusEnum.PENDING,
      isDeleted: false,
    })
      .populate("brandId")
      .populate("businessId")
      .populate("ownerId", "-password -otpCode")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { cars },
    });
  }

  async getAllCars(req: Request, res: Response) {
    const { status, ownerType, brandId, type, keyword } = req.query;
    await syncRentedCarStatuses();

    const filter: any = {
      isDeleted: false,
    };

    if (status && status !== "ALL") {
      filter.status = status;
    }

    if (brandId && brandId !== "ALL") {
      filter.brandId = brandId;
    }

    if (type && type !== "ALL") {
      filter.type = type;
    }

    const normalizedKeyword = cleanSearchText(keyword);
    if (normalizedKeyword) {
      const keywordRegex = {
        $regex: escapeRegex(normalizedKeyword),
        $options: "i",
      };
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { carCode: keywordRegex },
            { name: keywordRegex },
            { licensePlate: keywordRegex },
            { plateNumberNormalized: keywordRegex },
          ],
        },
      ];
    }

    if (ownerType && ownerType !== "ALL") {
      if (ownerType === OwnerTypeEnum.USER) {
        filter.ownerType = OwnerTypeEnum.USER;
      }

      if (ownerType === OwnerTypeEnum.BUSINESS) {
        filter.$or = [
          { ownerType: OwnerTypeEnum.BUSINESS },
          { businessId: { $exists: true }, ownerId: { $exists: false } },
        ];
      }
    }

    const cars = await CarModel.find(filter)
      .populate("brandId")
      .populate({
        path: "businessId",
        populate: {
          path: "userId",
          select: "-password -otpCode",
        },
      })
      .populate("ownerId", "-password -otpCode")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { cars },
    });
  }

  async getCarReviews(req: Request, res: Response) {
    const carId = String(req.params.carId || "");
    const viewerUserId = this.getAuthUserId(this.getOptionalAuthUser(req));
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 6)));
    const rating = Number(req.query.rating || 0);
    const sort = String(req.query.sort || "newest");
    const hasImages = String(req.query.hasImages || "") === "true";
    const hasComment = String(req.query.hasComment || "") === "true";
    const hasReply = String(req.query.hasReply || "") === "true";

    if (!/^[a-f\d]{24}$/i.test(carId)) {
      throw ErrorHelper.requestDataInvalid("Xe không hợp lệ");
    }

    const filter: any = {
      carId,
      status: ReviewStatusEnum.VISIBLE,
    };

    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      filter.rating = rating;
    }
    if (hasImages) {
      filter.images = { $exists: true, $ne: [] };
    }
    if (hasComment) {
      filter.comment = { $exists: true, $nin: ["", null] };
    }
    if (hasReply) {
      filter["ownerReply.content"] = { $exists: true, $nin: ["", null] };
    }

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      highest: { rating: -1, createdAt: -1 },
      lowest: { rating: 1, createdAt: -1 },
    };
    const sortOption = sortMap[sort] || sortMap.newest;

    const ratingRows = await ReviewModel.find(filter).select("rating").lean();
    const reviewCount = ratingRows.length;
    const averageRating = reviewCount
      ? Number(
          (
            ratingRows.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
            reviewCount
          ).toFixed(1),
        )
      : 0;

    const reviews = await ReviewModel.find(filter)
      .populate("renterId", "name avatar")
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const distributionRows = await ReviewModel.find({
      carId,
      status: ReviewStatusEnum.VISIBLE,
    })
      .select("rating")
      .lean();
    const distribution = [5, 4, 3, 2, 1].reduce<Record<string, number>>(
      (result, currentRating) => {
        result[String(currentRating)] = distributionRows.filter(
          (review) => Number(review.rating) === currentRating,
        ).length;
        return result;
      },
      {},
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "success",
      data: {
        averageRating,
        reviewCount,
        page,
        limit,
        distribution,
        reviews: reviews.map((review: any) => ({
          id: review._id,
          rating: review.rating,
          criteria: review.criteria || {},
          comment: review.comment || "",
          images: review.images || [],
          ownerReply: review.ownerReply || null,
          helpfulCount: review.helpfulCount || 0,
          isHelpfulByMe: Boolean(
            viewerUserId &&
              Array.isArray(review.helpfulBy) &&
              review.helpfulBy.some(
                (userId: unknown) => String(userId) === viewerUserId,
              ),
          ),
          verifiedRental: true,
          isEdited:
            review.updatedAt &&
            review.createdAt &&
            new Date(review.updatedAt).getTime() -
              new Date(review.createdAt).getTime() >
              1000,
          reviewerName:
            review.reviewerNameSnapshot || review.renterId?.name || "Khách thuê",
          reviewerAvatar: review.renterId?.avatar || "",
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
        })),
      },
    });
  }

  async approveCar(req: Request, res: Response) {
    const { id } = req.params;

    const car = await CarModel.findById(id);
    if (!car || car.isDeleted) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    if (car.status !== CarStatusEnum.PENDING) {
      throw ErrorHelper.requestDataInvalid(
        "Chỉ có thể duyệt xe đang chờ duyệt",
      );
    }

    if (!(car as any).ownerId && car.businessId) {
      (car as any).ownerId = car.businessId;
      (car as any).ownerType = OwnerTypeEnum.BUSINESS;
      (car as any).ownerModel = "Business";
    }

    car.status = CarStatusEnum.APPROVED;
    car.rejectReason = "";
    await car.save();
    void sendCarApprovedMail(car);
    void notificationCenterService.notifyCarApproved(
      car,
      (req as any).user?.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Duyệt xe thành công",
      data: { car },
    });
  }

  async rejectCar(req: Request, res: Response) {
    const { id } = req.params;
    const rejectReason = cleanSearchText(req.body?.rejectReason);

    if (!rejectReason) {
      throw ErrorHelper.requestDataInvalid(
        "Vui lòng nhập lý do từ chối xe",
      );
    }

    const car = await CarModel.findById(id);
    if (!car || car.isDeleted) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    if (car.status !== CarStatusEnum.PENDING) {
      throw ErrorHelper.requestDataInvalid(
        "Chỉ có thể từ chối xe đang chờ duyệt",
      );
    }

    if (!(car as any).ownerId && car.businessId) {
      (car as any).ownerId = car.businessId;
      (car as any).ownerType = OwnerTypeEnum.BUSINESS;
      (car as any).ownerModel = "Business";
    }

    car.status = CarStatusEnum.REJECTED;
    car.rejectReason = rejectReason;
    await car.save();
    void sendCarRejectedMail(car);
    void notificationCenterService.notifyCarRejected(
      car,
      rejectReason,
      (req as any).user?.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Từ chối xe thành công",
      data: { car },
    });
  }
}

export default new CarRoute().router;
