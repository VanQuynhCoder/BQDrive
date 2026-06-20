import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { CarModel } from "../../models/car/car.model";
import { BusinessModel } from "../../models/business/business.model";
import { BookingModel } from "../../models/booking/booking.model";
import { ContractModel } from "../../models/contract/contract.model";
import { CartModel } from "../../models/cart/cart.model";
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
  BookingStatusEnum,
  CarStatusEnum,
  CartStatusEnum,
  ContractStatusEnum,
  OwnerTypeEnum,
  UserRoleEnum,
  RentalModeEnum,
  RentalUnitEnum,
} from "../../constants/model.const";

enum RentalAvailabilityEnum {
  AVAILABLE = "AVAILABLE",
  HELD_IN_CART = "HELD_IN_CART",
  PENDING_CONFIRMATION = "PENDING_CONFIRMATION",
}

const BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // KhÃ¡ch Ä‘Ã£ gá»­i yÃªu cáº§u, táº¡m giá»¯ slot Ä‘á»ƒ chá»§ xe duyá»‡t
  BookingStatusEnum.OWNER_APPROVED, // Chá»§ xe Ä‘Ã£ duyá»‡t, chá» khÃ¡ch thanh toÃ¡n
  BookingStatusEnum.PAYMENT_PENDING, // KhÃ¡ch Ä‘ang thanh toÃ¡n
  BookingStatusEnum.PAID, // ÄÃ£ thanh toÃ¡n, lá»‹ch thuÃª chÃ­nh thá»©c
  BookingStatusEnum.IN_PROGRESS, // Xe Ä‘ang Ä‘Æ°á»£c thuÃª
  BookingStatusEnum.PENDING, // Tráº¡ng thÃ¡i cÅ©: REQUESTED
  BookingStatusEnum.WAITING_PAYMENT, // Tráº¡ng thÃ¡i cÅ©: PAYMENT_PENDING
  BookingStatusEnum.CONFIRMED, // Tráº¡ng thÃ¡i cÅ©
];
const PUBLIC_CAR_STATUSES = [CarStatusEnum.APPROVED, CarStatusEnum.RENTED];
const DELETE_BLOCKING_CONTRACT_STATUSES = [
  ContractStatusEnum.DRAFT,
  ContractStatusEnum.ACTIVE,
];

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
    this.router.get("/getOneCar/:id", this.route(this.getOneCar));

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
            BookingStatusEnum.REQUESTED, // Booking má»›i Ä‘ang chá» chá»§ xe duyá»‡t
            BookingStatusEnum.PENDING, // Booking cÅ© Ä‘ang chá» chá»§ xe duyá»‡t
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
        ...(currentUserId ? { userId: { $ne: currentUserId } } : {}),
        status: {
          $in: BLOCKING_BOOKING_STATUSES,
        },
        isDeleted: false,
        startDate: { $lt: requestedEnd },
        endDate: { $gt: requestedStart },
      } as any),
      CartModel.distinct("carId", {
        carId: { $in: carIds },
        ...(currentUserId ? { userId: { $ne: currentUserId } } : {}),
        status: CartStatusEnum.ACTIVE,
        expiredAt: { $gt: now },
        startDate: { $lt: requestedEnd },
        endDate: { $gt: requestedStart },
      } as any),
    ]);

    [...overlapBookingCarIds, ...overlapCartCarIds].forEach((carId) => {
      bookabilityMap.set(String(carId), {
        isBookable: false,
        unavailableReason: "Xe khÃ´ng kháº£ dá»¥ng trong thá»i gian Ä‘Ã£ chá»n",
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
                ? "Xe khong ho tro thue theo ngay"
                : "Xe khong ho tro thue theo gio",
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
      return "Äang chá» xÃ¡c nháº­n";
    }

    if (availability === RentalAvailabilityEnum.HELD_IN_CART) {
      return "Äang Ä‘Æ°á»£c giá»¯";
    }

    return "Sáºµn sÃ ng";
  }

  private withRentalAvailability(
    car: any,
    availability: RentalAvailabilityEnum,
    bookability?: { isBookable: boolean; unavailableReason?: string },
    unavailableRanges: any[] = [],
  ) {
    const carData = typeof car.toObject === "function" ? car.toObject() : car;
    const isScheduleBookable = bookability?.isBookable !== false;

    return {
      ...carData,
      rentalAvailability: availability,
      availabilityLabel: isScheduleBookable
        ? this.getAvailabilityLabel(availability)
        : "KhÃ´ng kháº£ dá»¥ng",
      isBookable:
        availability === RentalAvailabilityEnum.AVAILABLE && isScheduleBookable,
      unavailableReason: bookability?.unavailableReason,
      unavailableRanges,
    };
  }

  async createCar(req: Request, res: Response) {
    const authUser = (req as any).user;

    const owner = await this.getOwnerContext(authUser, true);

    const {
      brandId,
      name,
      type,
      licensePlate,
      pricePerDay,
      pricePerHour,
      allowDailyRental,
      allowHourlyRental,
      rentalUnit,
      seats,
      fuelType,
      transmission,
      images,
      description,
    } = req.body;

    if (!brandId || !name || !seats) {
      throw ErrorHelper.requestDataInvalid("Thiáº¿u brandId, name hoáº·c seats");
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
      throw ErrorHelper.requestDataInvalid("ÄÆ¡n vá»‹ thuÃª xe khÃ´ng há»£p lá»‡");
    }

    if (
      dailyEnabled &&
      (!pricePerDay || Number(pricePerDay) <= 0)
    ) {
      throw ErrorHelper.requestDataInvalid("Xe thuÃª theo ngÃ y cáº§n pricePerDay");
    }

    if (
      hourlyEnabled &&
      (!pricePerHour || Number(pricePerHour) <= 0)
    ) {
      throw ErrorHelper.requestDataInvalid("Xe thuÃª theo giá» cáº§n pricePerHour");
    }

    const car = await CarModel.create({
      ...(owner.business ? { businessId: owner.business._id } : {}),
      ownerId: owner.ownerId,
      ownerType: owner.ownerType,
      ownerModel: owner.ownerModel,
      brandId,
      name,
      type,
      licensePlate,
      pricePerDay,
      pricePerHour,
      allowDailyRental: dailyEnabled,
      allowHourlyRental: hourlyEnabled,
      rentalUnit: selectedRentalUnit,
      seats,
      fuelType,
      transmission,
      images,
      description,
      status: CarStatusEnum.PENDING,
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "ÄÄƒng xe thÃ nh cÃ´ng, vui lÃ²ng chá» Admin duyá»‡t",
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
      rentalUnit,
      rentalMode,
      startDate,
      endDate,
    } =
      req.query;

    const filter: any = {
      status: { $in: PUBLIC_CAR_STATUSES },
      isDeleted: false,
      isHidden: { $ne: true },
    };

    if (brandId) filter.brandId = brandId;
    if (seats) filter.seats = Number(seats);
    if (rentalUnit) {
      const selectedMode = normalizeRentalMode(String(rentalUnit));

      if (selectedMode === RentalModeEnum.HOURLY) {
        filter.$or = [{ allowHourlyRental: true }, { rentalUnit: RentalUnitEnum.HOUR }];
      }

      if (selectedMode === RentalModeEnum.DAILY) {
        filter.$or = [{ allowDailyRental: true }, { rentalUnit: RentalUnitEnum.DAY }];
      }
    }

    if (minPrice || maxPrice) {
      const priceFilter: any = {};
      if (minPrice) priceFilter.$gte = Number(minPrice);
      if (maxPrice) priceFilter.$lte = Number(maxPrice);

      filter.$or = [
        { pricePerDay: priceFilter },
        { pricePerHour: priceFilter },
      ];
    }

    if (keyword) {
      filter.name = { $regex: keyword, $options: "i" };
    }

    const cars = await CarModel.find(filter)
      .populate("brandId")
      .populate("businessId")
      .sort({ createdAt: -1 });

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
        typeof rentalMode === "string" ? rentalMode : undefined,
        authUserId,
      ),
      this.getUnavailableRangeMap(carIds, authUserId),
    ]);
    const carsWithAvailability = cars.map((car) =>
      this.withRentalAvailability(
        car,
        RentalAvailabilityEnum.AVAILABLE,
        bookabilityMap.get(String(car._id)),
        unavailableRangeMap.get(String(car._id)) || [],
      ),
    );

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
      .populate("businessId");

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
    const carWithAvailability = this.withRentalAvailability(
      car,
      RentalAvailabilityEnum.AVAILABLE,
      bookabilityMap.get(String(car._id)),
      unavailableRangeMap.get(String(car._id)) || [],
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
        "Can bat it nhat mot hinh thuc thue xe",
      );
    }

    if (
      dailyEnabled &&
      (!updateData.pricePerDay || Number(updateData.pricePerDay) <= 0)
    ) {
      throw ErrorHelper.requestDataInvalid("Xe thue theo ngay can pricePerDay");
    }

    if (
      hourlyEnabled &&
      (!updateData.pricePerHour || Number(updateData.pricePerHour) <= 0)
    ) {
      throw ErrorHelper.requestDataInvalid("Xe thue theo gio can pricePerHour");
    }

    updateData.allowDailyRental = dailyEnabled;
    updateData.allowHourlyRental = hourlyEnabled;
    updateData.rentalUnit =
      hourlyEnabled && !dailyEnabled ? RentalUnitEnum.HOUR : RentalUnitEnum.DAY;

    if (updateData.rentalUnit) {
      if (!Object.values(RentalUnitEnum).includes(updateData.rentalUnit)) {
        throw ErrorHelper.requestDataInvalid("ÄÆ¡n vá»‹ thuÃª xe khÃ´ng há»£p lá»‡");
      }

      if (
        updateData.rentalUnit === RentalUnitEnum.DAY &&
        (!updateData.pricePerDay || Number(updateData.pricePerDay) <= 0)
      ) {
        throw ErrorHelper.requestDataInvalid(
          "Xe thuÃª theo ngÃ y cáº§n pricePerDay",
        );
      }

      if (
        updateData.rentalUnit === RentalUnitEnum.HOUR &&
        (!updateData.pricePerHour || Number(updateData.pricePerHour) <= 0)
      ) {
        throw ErrorHelper.requestDataInvalid(
          "Xe thuÃª theo giá» cáº§n pricePerHour",
        );
      }
    }

    const car = await CarModel.findOneAndUpdate(
      {
        _id: id,
        ...this.buildOwnerFilter(owner),
        isDeleted: false,
      } as any,
      {
        ...updateData,
        status: CarStatusEnum.PENDING,
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
      message: "Cáº­p nháº­t xe thÃ nh cÃ´ng, vui lÃ²ng chá» Admin duyá»‡t láº¡i",
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
        "Khong the xoa xe dang co booking hoac hop dong thue con hieu luc",
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
      message: "XÃ³a xe thÃ nh cÃ´ng",
      data: { car },
    });
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

  async approveCar(req: Request, res: Response) {
    const { id } = req.params;

    const car = await CarModel.findById(id);
    if (!car || car.isDeleted) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    if (car.status === CarStatusEnum.RENTED) {
      throw ErrorHelper.requestDataInvalid(
        "Xe Ä‘ang Ä‘Æ°á»£c thuÃª, khÃ´ng thá»ƒ thay Ä‘á»•i tráº¡ng thÃ¡i duyá»‡t",
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

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Duyá»‡t xe thÃ nh cÃ´ng",
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
        "Xe Ä‘ang Ä‘Æ°á»£c thuÃª, khÃ´ng thá»ƒ tá»« chá»‘i xe lÃºc nÃ y",
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

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Tá»« chá»‘i xe thÃ nh cÃ´ng",
      data: { car },
    });
  }
}

export default new CarRoute().router;
