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
}

const BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // Khách đã gửi yêu cầu, tạm giữ slot để chủ xe duyệt
  BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã duyệt, chờ khách thanh toán
  BookingStatusEnum.PAYMENT_PENDING, // Khách đang thanh toán
  BookingStatusEnum.PAID, // Đã thanh toán, lịch thuê chính thức
  BookingStatusEnum.IN_PROGRESS, // Xe đang được thuê
  BookingStatusEnum.PENDING, // Trạng thái cũ: REQUESTED
  BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ: PAYMENT_PENDING
  BookingStatusEnum.CONFIRMED, // Trạng thái cũ
];
const PUBLIC_CAR_STATUSES = [CarStatusEnum.APPROVED, CarStatusEnum.RENTED];
const DELETE_BLOCKING_CONTRACT_STATUSES = [
  ContractStatusEnum.DRAFT,
  ContractStatusEnum.ACTIVE,
];
const DETAILED_PICKUP_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.COMPLETED,
  BookingStatusEnum.WAITING_PAYMENT,
  BookingStatusEnum.CONFIRMED,
];
function cleanSearchText(value?: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalPrice(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;

  const nextValue = Number(value);

  if (!Number.isFinite(nextValue) || nextValue < 0) {
    throw ErrorHelper.requestDataInvalid("Giá thuê không hợp lệ");
  }

  return nextValue;
}

function normalizeCarPricingPayload(body: any, dailyEnabled: boolean, hourlyEnabled: boolean) {
  const pricingInput = body.pricing || {};
  const weekdayPricePerDay = toOptionalPrice(
    pricingInput.weekdayPricePerDay ?? body.weekdayPricePerDay ?? body.pricePerDay,
  );
  const weekendPricePerDay =
    toOptionalPrice(pricingInput.weekendPricePerDay ?? body.weekendPricePerDay) ??
    weekdayPricePerDay;
  const holidayPricePerDay =
    toOptionalPrice(pricingInput.holidayPricePerDay ?? body.holidayPricePerDay) ??
    weekendPricePerDay ??
    weekdayPricePerDay;
  const pricePerHour = toOptionalPrice(
    pricingInput.pricePerHour ?? body.pricePerHour,
  );
  const weekendPricePerHour =
    toOptionalPrice(pricingInput.weekendPricePerHour ?? body.weekendPricePerHour) ??
    pricePerHour;
  const holidayPricePerHour =
    toOptionalPrice(pricingInput.holidayPricePerHour ?? body.holidayPricePerHour) ??
    weekendPricePerHour ??
    pricePerHour;

  if (dailyEnabled && (!weekdayPricePerDay || weekdayPricePerDay <= 0)) {
    throw ErrorHelper.requestDataInvalid("Xe thuê theo ngày cần giá ngày thường");
  }

  if (hourlyEnabled && (!pricePerHour || pricePerHour <= 0)) {
    throw ErrorHelper.requestDataInvalid("Xe thuê theo giờ cần giá theo giờ");
  }

  return {
    pricePerDay: weekdayPricePerDay,
    pricePerHour,
    pricing: {
      weekdayPricePerDay,
      weekendPricePerDay,
      holidayPricePerDay,
      pricePerHour,
      weekendPricePerHour,
      holidayPricePerHour,
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

const IMPORTANT_CAR_REVIEW_FIELDS = [
  "brandId",
  "name",
  "type",
  "licensePlate",
  "pricePerDay",
  "pricePerHour",
  "pricing",
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
  "city",
  "province",
  "district",
  "ward",
  "seats",
  "fuelType",
  "transmission",
  "allowDailyRental",
  "allowHourlyRental",
  "rentalUnit",
  "deliveryEnabled",
  "deliveryBaseFee",
  "deliveryFeePerKm",
  "deliveryMaxDistanceKm",
  "deliveryNote",
  "images",
];

function normalizeComparableValue(value: any): unknown {
  if (value === undefined || value === null || value === "") return "";

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

function hasImportantCarChange(existingCar: any, nextData: Record<string, unknown>) {
  return IMPORTANT_CAR_REVIEW_FIELDS.some((field) => {
    if (!(field in nextData)) return false;

    return (
      JSON.stringify(normalizeComparableValue(existingCar[field])) !==
      JSON.stringify(normalizeComparableValue(nextData[field]))
    );
  });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
          $in: [
            BookingStatusEnum.REQUESTED, // Booking mới đang chờ chủ xe duyệt
            BookingStatusEnum.PENDING, // Booking cũ đang chờ chủ xe duyệt
          ],
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
      { isBookable: boolean; unavailableReason?: string }
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

    const [overlapBookingCarIds, overlapCartCarIds] = await Promise.all([
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
    ]);

    [...overlapBookingCarIds, ...overlapCartCarIds].forEach((carId) => {
      bookabilityMap.set(String(carId), {
        isBookable: false,
        unavailableReason: "Xe không khả dụng trong thời gian đã chọn",
      });
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

    const bookings = await BookingModel.find({
      carId: { $in: carIds },
      ...(currentUserId ? { userId: { $ne: currentUserId } } : {}),
      status: { $in: BLOCKING_BOOKING_STATUSES },
      isDeleted: false,
      endDate: { $gt: new Date() },
    } as any)
      .select("_id carId startDate endDate status")
      .sort({ startDate: 1 })
      .lean();

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

    return rangeMap;
  }

  private getAvailabilityLabel(availability: RentalAvailabilityEnum) {
    if (availability === RentalAvailabilityEnum.PENDING_CONFIRMATION) {
      return "Đang chờ xác nhận";
    }

    if (availability === RentalAvailabilityEnum.HELD_IN_CART) {
      return "Đang được giữ";
    }

    return "Sẵn sàng";
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
    if (
      String(carData.ownerType || "") !== OwnerTypeEnum.USER ||
      showDetailedUserAddress
    ) {
      return carData;
    }

    const publicCarData = { ...carData };
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
    bookability?: { isBookable: boolean; unavailableReason?: string },
    unavailableRanges: any[] = [],
    showDetailedUserAddress = false,
  ) {
    const carData = typeof car.toObject === "function" ? car.toObject() : car;
    const publicCarData = this.getPublicCarAddress(
      carData,
      showDetailedUserAddress,
    );
    const isScheduleBookable = bookability?.isBookable !== false;

    return {
      ...publicCarData,
      rentalAvailability: availability,
      availabilityLabel: isScheduleBookable
        ? this.getAvailabilityLabel(availability)
        : "Không khả dụng",
      isBookable:
        availability === RentalAvailabilityEnum.AVAILABLE && isScheduleBookable,
      unavailableReason: bookability?.unavailableReason,
      unavailableRanges,
    };
  }

  private async assertCarHasNoActiveWork(carId: string, owner: any) {
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
        "Không thể ẩn hoặc hiện xe đang có booking hoặc hợp đồng thuê còn hiệu lực",
      );
    }

    if (activeCart) {
      throw ErrorHelper.requestDataInvalid(
        "Không thể ẩn xe đang được giữ trong giỏ hàng của khách",
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
      images,
      description,
    } = req.body;
    const addressFields = normalizeCarAddressFields(req.body);

    if (!brandId || !name || !seats) {
      throw ErrorHelper.requestDataInvalid("Thiếu brandId, name hoặc seats");
    }
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
    const deliveryPayload = normalizeDeliveryPayload(req.body);

    const car = await CarModel.create({
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
      ...deliveryPayload,
      allowDailyRental: dailyEnabled,
      allowHourlyRental: hourlyEnabled,
      rentalUnit: selectedRentalUnit,
      seats,
      fuelType,
      transmission,
      images,
      description,
      ...addressFields,
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
    } =
      req.query;
    const isSearchRequest = req.path === "/search";

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
    if (authUserId && (authUser as any)?.role === UserRoleEnum.USER) {
      andFilters.push({
        $or: [
          { ownerType: { $ne: OwnerTypeEnum.USER } },
          { ownerId: { $ne: authUserId } },
        ],
      });
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

      andFilters.push({
        $or: [
          { pricePerDay: priceFilter },
          { pricePerHour: priceFilter },
          { "pricing.weekdayPricePerDay": priceFilter },
          { "pricing.weekendPricePerDay": priceFilter },
          { "pricing.holidayPricePerDay": priceFilter },
          { "pricing.pricePerHour": priceFilter },
          { "pricing.weekendPricePerHour": priceFilter },
          { "pricing.holidayPricePerHour": priceFilter },
        ],
      });
    }

    if (keyword) {
      filter.name = { $regex: escapeRegex(String(keyword)), $options: "i" };
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

    const sortOption =
      sort === "price_asc"
        ? { pricePerDay: 1, pricePerHour: 1 }
        : sort === "price_desc"
          ? { pricePerDay: -1, pricePerHour: -1 }
          : { createdAt: -1 };

    const cars = await CarModel.find(filter)
      .populate("brandId")
      .populate("businessId")
      .populate("ownerId", "-password -otpCode")
      .sort(sortOption as any);

    const requestedStart =
      typeof startDate === "string" ? new Date(startDate) : undefined;
    const requestedEnd =
      typeof endDate === "string" ? new Date(endDate) : undefined;
    const carIds = cars.map((car) => car._id);
    const [bookabilityMap, unavailableRangeMap] = await Promise.all([
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
    const carsWithAvailability = cars
      .map((car) =>
        this.withRentalAvailability(
        car,
        RentalAvailabilityEnum.AVAILABLE,
        bookabilityMap.get(String(car._id)),
        unavailableRangeMap.get(String(car._id)) || [],
      ),
      )
      .filter((car) => !shouldOnlyReturnBookable || car.isBookable !== false);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { cars: carsWithAvailability },
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
      status: { $in: PUBLIC_CAR_STATUSES },
      isDeleted: false,
    } as any)
      .populate("brandId")
      .populate("businessId")
      .populate("ownerId", "-password -otpCode");

    if (!car) {
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
          endDate: { $gt: new Date() },
        } as any)
          .select(
            "_id status startDate endDate rentalMode totalPrice paidAmount depositAmount remainingAmount paymentOption",
          )
          .sort({ createdAt: -1 })
          .lean()
      : null;
    const canShowDetailedPickupAddress =
      String((car as any).ownerType || "") !== OwnerTypeEnum.USER ||
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

    const owner = await this.getOwnerContext(authUser);

    const updateData = { ...req.body };
    const existingCar = await CarModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    } as any);

    if (!existingCar) {
      throw ErrorHelper.recordNotFound("Xe");
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
        : updateData.rentalUnit !== RentalUnitEnum.HOUR;
    const hourlyEnabled =
      typeof updateData.allowHourlyRental === "boolean"
        ? updateData.allowHourlyRental
        : updateData.rentalUnit === RentalUnitEnum.HOUR;

    if (!dailyEnabled && !hourlyEnabled) {
      throw ErrorHelper.requestDataInvalid(
        "Cần bật ít nhất một hình thức thuê xe",
      );
    }

    const pricingPayload = normalizeCarPricingPayload(
      updateData,
      dailyEnabled,
      hourlyEnabled,
    );
    const deliveryPayload = normalizeDeliveryPayload(updateData);

    updateData.allowDailyRental = dailyEnabled;
    updateData.allowHourlyRental = hourlyEnabled;
    updateData.rentalUnit =
      hourlyEnabled && !dailyEnabled ? RentalUnitEnum.HOUR : RentalUnitEnum.DAY;
    updateData.pricePerDay = pricingPayload.pricePerDay;
    updateData.pricePerHour = pricingPayload.pricePerHour;
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

      if (
        updateData.rentalUnit === RentalUnitEnum.DAY &&
        (!updateData.pricePerDay || Number(updateData.pricePerDay) <= 0)
      ) {
        throw ErrorHelper.requestDataInvalid(
          "Xe thuê theo ngày cần giá ngày thường",
        );
      }

      if (
        updateData.rentalUnit === RentalUnitEnum.HOUR &&
        (!updateData.pricePerHour || Number(updateData.pricePerHour) <= 0)
      ) {
        throw ErrorHelper.requestDataInvalid(
          "Xe thuê theo giờ cần giá theo giờ",
        );
      }
    }

    const finalUpdateData = {
      ...updateData,
      ...addressFields,
    };
    const needsReview =
      existingCar.status === CarStatusEnum.APPROVED &&
      hasImportantCarChange(existingCar, finalUpdateData);
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
      },
      { new: true },
    );

    if (!car) {
      throw ErrorHelper.recordNotFound("Xe");
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

    const [activeContract, activeBooking] = await Promise.all([
      ContractModel.findOne({
        carId: id,
        ...this.buildOwnerFilter(owner),
        status: { $in: DELETE_BLOCKING_CONTRACT_STATUSES },
        isDeleted: false,
      } as any).select("_id"),
      BookingModel.findOne({
        carId: id,
        ...this.buildOwnerFilter(owner),
        status: { $in: BLOCKING_BOOKING_STATUSES },
        isDeleted: false,
      } as any).select("_id"),
    ]);

    if (activeContract || activeBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Không thể xóa xe đang có booking hoặc hợp đồng thuê còn hiệu lực",
      );
    }

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

    if (keyword) {
      filter.name = { $regex: String(keyword), $options: "i" };
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
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 6)));

    if (!/^[a-f\d]{24}$/i.test(carId)) {
      throw ErrorHelper.requestDataInvalid("Xe không hợp lệ");
    }

    const filter = {
      carId,
      status: ReviewStatusEnum.VISIBLE,
    };

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
      .populate("renterId", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "success",
      data: {
        averageRating,
        reviewCount,
        reviews: reviews.map((review: any) => ({
          id: review._id,
          rating: review.rating,
          comment: review.comment || "",
          reviewerName:
            review.reviewerNameSnapshot || review.renterId?.name || "Khách thuê",
          createdAt: review.createdAt,
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

    if (car.status === CarStatusEnum.RENTED) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đang được thuê, không thể thay đổi trạng thái duyệt",
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

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Duyệt xe thành công",
      data: { car },
    });
  }

  async rejectCar(req: Request, res: Response) {
    const { id } = req.params;
    const { rejectReason } = req.body;

    const car = await CarModel.findById(id);
    if (!car || car.isDeleted) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    if (car.status === CarStatusEnum.RENTED) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đang được thuê, không thể từ chối xe lúc này",
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

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Từ chối xe thành công",
      data: { car },
    });
  }
}

export default new CarRoute().router;
