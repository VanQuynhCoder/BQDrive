import mongoose from "mongoose";

import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { CarModel } from "../../models/car/car.model";
import { BookingModel } from "../../models/booking/booking.model";
import { UserModel } from "../../models/user/user.model";
import {
  ExtraChargeModel,
  type IExtraCharge,
} from "../../models/extra-charge/extraCharge.model";
import { ReturnInspectionModel } from "../../models/return-inspection/returnInspection.model";
import { ReviewModel, ReviewStatusEnum } from "../../models/review/review.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { RefundModel } from "../../models/refund/refund.model";
import {
  BookingStatusEnum,
  ExtraChargeStatusEnum,
  ExtraChargeTypeEnum,
  PaymentMethodEnum,
  PaymentOptionEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  RefundStatusEnum,
  ReturnInspectionStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { cleanAddressText } from "../../helper/address.helper";
import { getBookingDisplayCode } from "../../helper/booking-code.helper";
import { calculateLateReturnFee } from "../../helper/late-return-fee.helper";
import { transitionBookingStatus } from "../../helper/status.helper";
import { notificationCenterService } from "../../services/notification-center.service";
import {
  sendExtraChargeCancelledMail,
  sendExtraChargePaidMail,
  sendNewExtraChargeMail,
} from "../../helper/mail.helper";
import {
  getBookingUpfrontPaymentAmount,
} from "../../helper/payment-sync.helper";

const OWNER_CAR_BOOKING_GROUPS = [
  "ALL",
  "ACTIVE",
  "UPCOMING",
  "HISTORY",
  "CANCELLED",
] as const;

type OwnerCarBookingGroup = (typeof OWNER_CAR_BOOKING_GROUPS)[number];

const OWNER_BOOKING_GROUPS = [
  "ALL",
  "ACTION_REQUIRED",
  "UPCOMING",
  "ACTIVE",
  "COMPLETED",
  "CLOSED",
] as const;

type OwnerBookingGroup = (typeof OWNER_BOOKING_GROUPS)[number];

const OWNER_BOOKING_GROUP_STATUSES: Record<
  Exclude<OwnerBookingGroup, "ALL">,
  BookingStatusEnum[]
> = {
  ACTION_REQUIRED: [BookingStatusEnum.REQUESTED],
  UPCOMING: [
    BookingStatusEnum.OWNER_APPROVED,
    BookingStatusEnum.PAYMENT_PENDING,
    BookingStatusEnum.PAID,
  ],
  ACTIVE: [
    BookingStatusEnum.IN_PROGRESS,
    BookingStatusEnum.RETURN_INSPECTION,
    BookingStatusEnum.AWAITING_EXTRA_CHARGE,
  ],
  COMPLETED: [BookingStatusEnum.COMPLETED],
  CLOSED: [
    BookingStatusEnum.CANCELLED,
    BookingStatusEnum.REJECTED,
    BookingStatusEnum.NO_SHOW,
  ],
};

const OWNER_BOOKING_SORTS = [
  "newest",
  "oldest",
  "pickup_asc",
  "pickup_desc",
] as const;

type OwnerBookingSort = (typeof OWNER_BOOKING_SORTS)[number];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOwnerBookingGroup(value: unknown): OwnerBookingGroup {
  const normalized = String(value || "ALL").trim().toUpperCase();
  if (!OWNER_BOOKING_GROUPS.includes(normalized as OwnerBookingGroup)) {
    throw ErrorHelper.requestDataInvalid("Nhóm trạng thái booking không hợp lệ");
  }

  return normalized as OwnerBookingGroup;
}

function normalizeOwnerBookingSort(value: unknown): OwnerBookingSort {
  const normalized = String(value || "newest").trim().toLowerCase();
  if (!OWNER_BOOKING_SORTS.includes(normalized as OwnerBookingSort)) {
    throw ErrorHelper.requestDataInvalid("Kiểu sắp xếp booking không hợp lệ");
  }

  return normalized as OwnerBookingSort;
}

function normalizeOwnerBookingStatus(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;

  if (!Object.values(BookingStatusEnum).includes(normalized as BookingStatusEnum)) {
    throw ErrorHelper.requestDataInvalid("Trạng thái booking không hợp lệ");
  }

  return normalized as BookingStatusEnum;
}

const OWNER_CAR_PERFORMANCE_RANGES = [
  "today",
  "7d",
  "this_month",
  "all",
] as const;

type OwnerCarPerformanceRange =
  (typeof OWNER_CAR_PERFORMANCE_RANGES)[number];

type OwnerCarPerformanceDateRange = {
  value: OwnerCarPerformanceRange;
  startDate: Date | null;
  endDate: Date;
};

const VIETNAM_TIME_OFFSET_MS = 7 * 60 * 60 * 1000;

const OWNER_CAR_BOOKING_STATUSES: Record<
  Exclude<OwnerCarBookingGroup, "ALL">,
  BookingStatusEnum[]
> = {
  ACTIVE: [
    BookingStatusEnum.IN_PROGRESS,
    BookingStatusEnum.RETURN_INSPECTION,
    BookingStatusEnum.AWAITING_EXTRA_CHARGE,
  ],
  UPCOMING: [
    BookingStatusEnum.REQUESTED,
    BookingStatusEnum.OWNER_APPROVED,
    BookingStatusEnum.PAYMENT_PENDING,
    BookingStatusEnum.PAID,
  ],
  HISTORY: [BookingStatusEnum.COMPLETED],
  CANCELLED: [
    BookingStatusEnum.CANCELLED,
    BookingStatusEnum.REJECTED,
    BookingStatusEnum.NO_SHOW,
  ],
};

function normalizeOwnerCarBookingGroup(value: unknown): OwnerCarBookingGroup {
  const normalized = String(value || "ALL").trim().toUpperCase();

  if (
    !OWNER_CAR_BOOKING_GROUPS.includes(
      normalized as OwnerCarBookingGroup,
    )
  ) {
    throw ErrorHelper.requestDataInvalid("Nhóm lịch thuê không hợp lệ");
  }

  return normalized as OwnerCarBookingGroup;
}

function normalizeOwnerCarPerformanceRange(
  value: unknown,
): OwnerCarPerformanceRange {
  const normalized = String(value || "this_month").trim().toLowerCase();

  if (
    !OWNER_CAR_PERFORMANCE_RANGES.includes(
      normalized as OwnerCarPerformanceRange,
    )
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Khoảng thời gian thống kê không hợp lệ",
    );
  }

  return normalized as OwnerCarPerformanceRange;
}

function toVietnamBoundary(
  year: number,
  month: number,
  day: number,
  endOfDay = false,
) {
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ) - VIETNAM_TIME_OFFSET_MS,
  );
}

function getOwnerCarPerformanceDateRange(
  value: OwnerCarPerformanceRange,
  now = new Date(),
): OwnerCarPerformanceDateRange {
  if (value === "all") {
    return { value, startDate: null, endDate: now };
  }

  const vietnamNow = new Date(now.getTime() + VIETNAM_TIME_OFFSET_MS);
  const year = vietnamNow.getUTCFullYear();
  const month = vietnamNow.getUTCMonth();
  const day = vietnamNow.getUTCDate();

  if (value === "today") {
    return {
      value,
      startDate: toVietnamBoundary(year, month, day),
      endDate: toVietnamBoundary(year, month, day, true),
    };
  }

  if (value === "7d") {
    const startLocal = new Date(Date.UTC(year, month, day));
    startLocal.setUTCDate(startLocal.getUTCDate() - 6);

    return {
      value,
      startDate: toVietnamBoundary(
        startLocal.getUTCFullYear(),
        startLocal.getUTCMonth(),
        startLocal.getUTCDate(),
      ),
      endDate: toVietnamBoundary(year, month, day, true),
    };
  }

  return {
    value,
    startDate: toVietnamBoundary(year, month, 1),
    endDate: now,
  };
}

function getDateExpressionMatch(
  expression: unknown,
  range: OwnerCarPerformanceDateRange,
) {
  if (!range.startDate) return {};

  return {
    $expr: getDateExpressionCondition(expression, range),
  };
}

function getDateExpressionCondition(
  expression: unknown,
  range: OwnerCarPerformanceDateRange,
): unknown {
  if (!range.startDate) return true;

  return {
    $and: [
      { $gte: [expression, range.startDate] },
      { $lte: [expression, range.endDate] },
    ],
  };
}

function toOwnerCarBookingDto(booking: any) {
  const renter = booking.userId || {};
  const renterInfo = booking.renterInfo || {};
  const delivery = booking.pricingSnapshot?.delivery || {};
  const deliveryType =
    delivery.deliveryType || "PICKUP_AT_CAR_LOCATION";
  const deliveryAddress =
    delivery.deliveryAddressText ||
    delivery.deliveryFormattedAddress ||
    delivery.deliveryAddress ||
    booking.pickupAddressSnapshot ||
    "";

  return {
    _id: String(booking._id || ""),
    bookingCode: getBookingDisplayCode(booking),
    carId: String(booking.carId?._id || booking.carId || ""),
    startDate: booking.startDate,
    endDate: booking.endDate,
    actualPickupAt: booking.actualPickupAt || null,
    actualReturnAt: booking.actualReturnAt || null,
    status: booking.status || "",
    rentalMode: booking.rentalMode || "",
    totalPrice: Number(booking.totalPrice || 0),
    paidAmount: Number(booking.paidAmount || 0),
    remainingAmount: Math.max(Number(booking.remainingAmount || 0), 0),
    delivery: {
      deliveryType,
      address: deliveryAddress,
      distanceKm: Number(delivery.deliveryDistanceKm || 0),
      fee: Number(delivery.deliveryFee || 0),
    },
    pickupAddressSnapshot: booking.pickupAddressSnapshot || "",
    renter: {
      name: renterInfo.fullName || renter.name || "Khách thuê",
      email: renterInfo.email || renter.email || "",
      phone: renterInfo.phone || renter.phone || "",
    },
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

function normalizeRequiredCoordinate(
  value: unknown,
  fieldName: "pickupLat" | "pickupLng",
) {
  const coordinate = Number(value);

  if (!Number.isFinite(coordinate)) {
    throw ErrorHelper.requestDataInvalid(`${fieldName} không hợp lệ`);
  }

  if (fieldName === "pickupLat" && (coordinate < -90 || coordinate > 90)) {
    throw ErrorHelper.requestDataInvalid("pickupLat phải nằm trong khoảng -90 đến 90");
  }

  if (fieldName === "pickupLng" && (coordinate < -180 || coordinate > 180)) {
    throw ErrorHelper.requestDataInvalid(
      "pickupLng phải nằm trong khoảng -180 đến 180",
    );
  }

  return coordinate;
}

class OwnerRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/cars/map",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerCarsMap),
    );

    this.router.patch(
      "/cars/:id/location",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.updateCarLocation),
    );

    this.router.get(
      "/cars/:carId/bookings",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerCarBookings),
    );

    this.router.get(
      "/cars/:carId/performance",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerCarPerformance),
    );

    this.router.get(
      "/reviews",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerReviews),
    );

    this.router.get(
      "/reviews/statistics",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerReviewStatistics),
    );

    this.router.get(
      "/bookings",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerBookings),
    );

    this.router.get(
      "/bookings/:bookingId",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerBookingDetail),
    );

    this.router.post(
      "/reviews/:id/reply",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.replyReview),
    );

    this.router.patch(
      "/reviews/:id/reply",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.replyReview),
    );

    this.router.post(
      "/reviews/:id/report",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.reportReview),
    );

    this.router.get(
      "/bookings/:bookingId/extra-charges",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.getExtraCharges),
    );

    this.router.post(
      "/bookings/:bookingId/extra-charges",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.createExtraCharge),
    );

    this.router.patch(
      "/extra-charges/:id/confirm-cash",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.confirmExtraChargeCash),
    );

    this.router.patch(
      "/extra-charges/:id/cancel",
      [
        this.authentication,
        this.roleGuard([ UserRoleEnum.USER]),
      ],
      this.route(this.cancelExtraCharge),
    );
  }

private async getOwnerContext(authUser: any): Promise<{
  userId: mongoose.Types.ObjectId;
  filter: any;
}> {
  const userId = String(authUser.userId || "");

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw ErrorHelper.permissionDeny();
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  return {
    userId: userObjectId,
    filter: {
      isDeleted: false,
      ownerId: userObjectId,
    },
  };
}
  private toMapCar(car: any) {
    return {
      _id: car._id,
      name: car.name,
      brandName: car.brandId?.name || "",
      licensePlate: car.licensePlate || "",
      pickupAddress: car.pickupAddress || car.address || "",
      pickupFormattedAddress:
        car.pickupFormattedAddress || car.pickupAddress || car.address || "",
      pickupLat: car.pickupLat,
      pickupLng: car.pickupLng,
      pickupNote: car.pickupNote || car.locationNote || "",
      status: car.status,
      car_status: car.status,
      approval_status: car.status,
      ownerType: UserRoleEnum.USER,
      images: car.images || [],
      lastLocationUpdatedAt: car.lastLocationUpdatedAt,
      locationUpdateCount: car.locationUpdateCount || 0,
    };
  }

  async getOwnerCarsMap(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);

    const cars = await CarModel.find(owner.filter)
      .populate("brandId", "name")
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { cars: cars.map((car) => this.toMapCar(car)) },
    });
  }

  async getOwnerCarBookings(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const carId = String(req.params.carId || "");

    if (!mongoose.Types.ObjectId.isValid(carId)) {
      throw ErrorHelper.requestDataInvalid("Mã xe không hợp lệ");
    }

    const car = await CarModel.findOne({
      _id: carId,
      ...owner.filter,
    } as any)
      .select("_id carCode name licensePlate images")
      .lean();

    if (!car) {
      throw ErrorHelper.permissionDeny();
    }

    const group = normalizeOwnerCarBookingGroup(req.query.group);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const baseFilter = {
      carId: car._id,
      isDeleted: false,
    };
    const listFilter: Record<string, unknown> = { ...baseFilter };

    if (group !== "ALL") {
      listFilter.status = {
        $in: OWNER_CAR_BOOKING_STATUSES[group],
      };
    }

    const sortByGroup: Record<OwnerCarBookingGroup, Record<string, 1 | -1>> = {
      ALL: { updatedAt: -1 },
      ACTIVE: { endDate: 1, updatedAt: -1 },
      UPCOMING: { startDate: 1, updatedAt: -1 },
      HISTORY: { updatedAt: -1 },
      CANCELLED: { updatedAt: -1 },
    };
    const now = new Date();
    const bookingProjection = [
      "_id",
      "bookingCode",
      "userId",
      "carId",
      "startDate",
      "endDate",
      "actualPickupAt",
      "actualReturnAt",
      "status",
      "rentalMode",
      "totalPrice",
      "paidAmount",
      "remainingAmount",
      "pricingSnapshot.delivery",
      "pickupAddressSnapshot",
      "renterInfo.fullName",
      "renterInfo.email",
      "renterInfo.phone",
      "createdAt",
      "updatedAt",
    ].join(" ");

    const [
      bookings,
      totalItems,
      summaryRows,
      activeBooking,
      nextBooking,
    ] = await Promise.all([
      BookingModel.find(listFilter as any)
        .select(bookingProjection)
        .populate("userId", "name email phone")
        .sort(sortByGroup[group])
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BookingModel.countDocuments(listFilter as any),
      BookingModel.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: null,
            all: { $sum: 1 },
            active: {
              $sum: {
                $cond: [
                  { $in: ["$status", OWNER_CAR_BOOKING_STATUSES.ACTIVE] },
                  1,
                  0,
                ],
              },
            },
            upcoming: {
              $sum: {
                $cond: [
                  { $in: ["$status", OWNER_CAR_BOOKING_STATUSES.UPCOMING] },
                  1,
                  0,
                ],
              },
            },
            completed: {
              $sum: {
                $cond: [
                  { $in: ["$status", OWNER_CAR_BOOKING_STATUSES.HISTORY] },
                  1,
                  0,
                ],
              },
            },
            cancelled: {
              $sum: {
                $cond: [
                  { $in: ["$status", OWNER_CAR_BOOKING_STATUSES.CANCELLED] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      BookingModel.findOne({
        ...baseFilter,
        status: { $in: OWNER_CAR_BOOKING_STATUSES.ACTIVE },
      } as any)
        .select(bookingProjection)
        .populate("userId", "name email phone")
        .sort({ endDate: 1 })
        .lean(),
      BookingModel.findOne({
        ...baseFilter,
        status: { $in: OWNER_CAR_BOOKING_STATUSES.UPCOMING },
        startDate: { $gte: now },
      } as any)
        .select(bookingProjection)
        .populate("userId", "name email phone")
        .sort({ startDate: 1 })
        .lean(),
    ]);

    const summary = summaryRows[0] || {
      all: 0,
      active: 0,
      upcoming: 0,
      completed: 0,
      cancelled: 0,
    };

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        car: {
          _id: String(car._id),
          carCode: car.carCode || null,
          name: car.name || "",
          licensePlate: car.licensePlate || "",
          image: car.images?.[0] || null,
        },
        summary: {
          all: Number(summary.all || 0),
          active: Number(summary.active || 0),
          upcoming: Number(summary.upcoming || 0),
          completed: Number(summary.completed || 0),
          cancelled: Number(summary.cancelled || 0),
          activeBooking: activeBooking
            ? toOwnerCarBookingDto(activeBooking)
            : null,
          nextBooking: nextBooking
            ? toOwnerCarBookingDto(nextBooking)
            : null,
        },
        bookings: bookings.map(toOwnerCarBookingDto),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      },
    });
  }

  async getOwnerCarPerformance(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const carId = String(req.params.carId || "");

    if (!mongoose.Types.ObjectId.isValid(carId)) {
      throw ErrorHelper.requestDataInvalid("Mã xe không hợp lệ");
    }

    const car = await CarModel.findOne({
      _id: carId,
      ...owner.filter,
    } as any)
      .select("_id carCode name licensePlate images")
      .lean();

    if (!car) {
      throw ErrorHelper.permissionDeny();
    }

    const selectedRange = normalizeOwnerCarPerformanceRange(req.query.range);
    const range = getOwnerCarPerformanceDateRange(selectedRange);
    const bookingFilter = {
      carId: car._id,
      isDeleted: false,
    };
    const bookingIds = await BookingModel.distinct("_id", bookingFilter);

    const activeStatuses = OWNER_CAR_BOOKING_STATUSES.ACTIVE;
    const upcomingStatuses = OWNER_CAR_BOOKING_STATUSES.UPCOMING;
    const pendingCollectionStatuses = [
      BookingStatusEnum.OWNER_APPROVED,
      BookingStatusEnum.PAYMENT_PENDING,
      BookingStatusEnum.PAID,
      BookingStatusEnum.IN_PROGRESS,
      BookingStatusEnum.RETURN_INSPECTION,
      BookingStatusEnum.AWAITING_EXTRA_CHARGE,
    ];
    const rentalPaymentTypes = [
      PaymentTypeEnum.DEPOSIT,
      PaymentTypeEnum.FULL,
      PaymentTypeEnum.REMAINING,
    ];
    const bookingCreatedInRange = getDateExpressionCondition(
      "$createdAt",
      range,
    );
    const bookingCompletedInRange = getDateExpressionCondition(
      { $ifNull: ["$updatedAt", "$createdAt"] },
      range,
    );
    const bookingOperationalInRange = getDateExpressionCondition(
      { $ifNull: ["$startDate", "$createdAt"] },
      range,
    );
    const bookingCancelledInRange = getDateExpressionCondition(
      { $ifNull: ["$cancelledAt", "$updatedAt"] },
      range,
    );
    const bookingNoShowInRange = getDateExpressionCondition(
      { $ifNull: ["$noShowAt", "$updatedAt"] },
      range,
    );
    const paymentRangeMatch = getDateExpressionMatch(
      { $ifNull: ["$paidAt", "$createdAt"] },
      range,
    );
    const refundRangeMatch = getDateExpressionMatch("$succeededAt", range);
    const reviewRangeMatch = getDateExpressionMatch("$createdAt", range);
    const pendingBookingRangeMatch = getDateExpressionMatch(
      { $ifNull: ["$startDate", "$createdAt"] },
      range,
    );
    const pendingExtraChargeRangeMatch = getDateExpressionMatch(
      "$createdAt",
      range,
    );

    const [
      operationRows,
      rentalRevenueRows,
      extraChargeCollectedRows,
      refundedRows,
      pendingBookingRows,
      pendingExtraChargeRows,
      reviewSummaryRows,
      recentReviews,
    ] = await Promise.all([
      BookingModel.aggregate([
        { $match: bookingFilter },
        {
          $group: {
            _id: null,
            totalBookings: {
              $sum: {
                $cond: [bookingCreatedInRange, 1, 0],
              },
            },
            completedTrips: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", BookingStatusEnum.COMPLETED] },
                      bookingCompletedInRange,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            activeTrips: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ["$status", activeStatuses] },
                      bookingOperationalInRange,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            upcomingBookings: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ["$status", upcomingStatuses] },
                      bookingOperationalInRange,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            cancelledBookings: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", BookingStatusEnum.CANCELLED] },
                      bookingCancelledInRange,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            rejectedBookings: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", BookingStatusEnum.REJECTED] },
                      bookingCompletedInRange,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            noShowBookings: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", BookingStatusEnum.NO_SHOW] },
                      bookingNoShowInRange,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      PaymentModel.aggregate([
        {
          $match: {
            bookingId: { $in: bookingIds },
            status: PaymentStatusEnum.PAID,
            paymentType: { $in: rentalPaymentTypes },
          },
        },
        { $match: paymentRangeMatch },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]),
      PaymentModel.aggregate([
        {
          $match: {
            bookingId: { $in: bookingIds },
            status: PaymentStatusEnum.PAID,
            paymentType: PaymentTypeEnum.EXTRA_CHARGE,
          },
        },
        { $match: paymentRangeMatch },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]),
      RefundModel.aggregate([
        {
          $match: {
            bookingId: { $in: bookingIds },
            status: RefundStatusEnum.SUCCEEDED,
            isDeleted: false,
          },
        },
        { $match: refundRangeMatch },
        {
          $group: {
            _id: null,
            total: { $sum: "$refundAmount" },
          },
        },
      ]),
      BookingModel.aggregate([
        {
          $match: {
            ...bookingFilter,
            status: { $in: pendingCollectionStatuses },
            remainingAmount: { $gt: 0 },
          },
        },
        { $match: pendingBookingRangeMatch },
        {
          $group: {
            _id: null,
            total: { $sum: "$remainingAmount" },
          },
        },
      ]),
      ExtraChargeModel.aggregate([
        {
          $match: {
            carId: car._id,
            status: ExtraChargeStatusEnum.PENDING,
            isDeleted: false,
          },
        },
        { $match: pendingExtraChargeRangeMatch },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]),
      ReviewModel.aggregate([
        {
          $match: {
            carId: car._id,
            status: ReviewStatusEnum.VISIBLE,
          },
        },
        { $match: reviewRangeMatch },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
            lowRatingCount: {
              $sum: {
                $cond: [{ $lte: ["$rating", 2] }, 1, 0],
              },
            },
          },
        },
      ]),
      ReviewModel.aggregate([
        {
          $match: {
            carId: car._id,
            status: ReviewStatusEnum.VISIBLE,
          },
        },
        { $match: reviewRangeMatch },
        { $sort: { createdAt: -1 } },
        { $limit: 3 },
        {
          $project: {
            _id: 1,
            rating: 1,
            criteria: 1,
            comment: 1,
            reviewerName: {
              $cond: [
                {
                  $gt: [
                    {
                      $strLenCP: {
                        $ifNull: ["$reviewerNameSnapshot", ""],
                      },
                    },
                    0,
                  ],
                },
                "$reviewerNameSnapshot",
                "Khách thuê",
              ],
            },
            createdAt: 1,
          },
        },
      ]),
    ]);

    const operations = operationRows[0] || {};
    const rentalRevenue = Number(rentalRevenueRows[0]?.total || 0);
    const extraChargeCollected = Number(
      extraChargeCollectedRows[0]?.total || 0,
    );
    const refundedAmount = Number(refundedRows[0]?.total || 0);
    const pendingBookingAmount = Number(
      pendingBookingRows[0]?.total || 0,
    );
    const pendingExtraChargeAmount = Number(
      pendingExtraChargeRows[0]?.total || 0,
    );
    const reviewSummary = reviewSummaryRows[0] || {};

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        car: {
          _id: String(car._id),
          carCode: car.carCode || null,
          name: car.name || "",
          licensePlate: car.licensePlate || "",
          image: car.images?.[0] || null,
        },
        range: {
          value: range.value,
          startDate: range.startDate,
          endDate: range.endDate,
        },
        operations: {
          totalBookings: Number(operations.totalBookings || 0),
          completedTrips: Number(operations.completedTrips || 0),
          activeTrips: Number(operations.activeTrips || 0),
          upcomingBookings: Number(operations.upcomingBookings || 0),
          cancelledBookings: Number(operations.cancelledBookings || 0),
          rejectedBookings: Number(operations.rejectedBookings || 0),
          noShowBookings: Number(operations.noShowBookings || 0),
        },
        finance: {
          rentalRevenue,
          extraChargeCollected,
          refundedAmount,
          netCollected:
            rentalRevenue + extraChargeCollected - refundedAmount,
          pendingCollection:
            pendingBookingAmount + pendingExtraChargeAmount,
          pendingBookingAmount,
          pendingExtraChargeAmount,
        },
        reviews: {
          reviewCount: Number(reviewSummary.reviewCount || 0),
          averageRating: reviewSummary.reviewCount
            ? Number(Number(reviewSummary.averageRating || 0).toFixed(1))
            : null,
          lowRatingCount: Number(reviewSummary.lowRatingCount || 0),
          recentReviews: recentReviews.map((review) => ({
            _id: String(review._id),
            rating: Number(review.rating || 0),
            criteria: review.criteria || {},
            comment: review.comment || "",
            reviewerName: review.reviewerName || "Khách thuê",
            createdAt: review.createdAt,
          })),
        },
      },
    });
  }

  async updateCarLocation(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const pickupLat = normalizeRequiredCoordinate(req.body.pickupLat, "pickupLat");
    const pickupLng = normalizeRequiredCoordinate(req.body.pickupLng, "pickupLng");
    const pickupAddress = cleanAddressText(req.body.pickupAddress);
    const pickupFormattedAddress = cleanAddressText(req.body.pickupFormattedAddress);
    const pickupNote = cleanAddressText(req.body.pickupNote);

    const car = await CarModel.findOne({
      _id: String(req.params.id),
      ...owner.filter,
    } as any);

    if (!car) {
      throw ErrorHelper.permissionDeny();
    }

    const oldLat = car.pickupLat;
    const oldLng = car.pickupLng;
    const oldAddress = car.pickupFormattedAddress || car.pickupAddress || car.address || "";
    const newAddress = pickupFormattedAddress || pickupAddress || oldAddress;
    const now = new Date();

    car.pickupLat = pickupLat;
    car.pickupLng = pickupLng;
    car.latitude = pickupLat;
    car.longitude = pickupLng;

    if (pickupAddress) {
      car.pickupAddress = pickupAddress;
      car.address = pickupAddress;
    }

    if (pickupFormattedAddress) {
      car.pickupFormattedAddress = pickupFormattedAddress;
    } else if (pickupAddress) {
      car.pickupFormattedAddress = pickupAddress;
    }

    if (pickupNote || req.body.pickupNote !== undefined) {
      car.pickupNote = pickupNote;
      car.locationNote = pickupNote;
    }

    car.lastLocationUpdatedAt = now;
    car.lastLocationUpdatedBy = owner.userId;
    car.lastLocationUpdatedByRole = UserRoleEnum.USER;
    car.locationUpdateCount = (car.locationUpdateCount || 0) + 1;
    car.locationHistory = [
      ...(car.locationHistory || []),
      {
        ...(oldLat !== undefined ? { oldLat } : {}),
        ...(oldLng !== undefined ? { oldLng } : {}),
        newLat: pickupLat,
        newLng: pickupLng,
        oldAddress,
        newAddress,
        updatedBy: owner.userId,
        updatedByRole: UserRoleEnum.USER,
        updatedAt: new Date(),
      },
    ].slice(-30);

    await car.save();
    await car.populate("brandId", "name");

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã cập nhật vị trí xe",
      data: { car: this.toMapCar(car) },
    });
  }

private buildOwnerBookingFilter(
  owner: Awaited<ReturnType<OwnerRoute["getOwnerContext"]>>,
) {
  return {
    ownerId: owner.userId,
  };
}

  private async findOwnerBooking(bookingId: string, owner: Awaited<ReturnType<OwnerRoute["getOwnerContext"]>>) {
    const booking = await BookingModel.findOne({
      _id: bookingId,
      ...this.buildOwnerBookingFilter(owner),
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.permissionDeny();
    }

    return booking;
  }

  private getOwnerBookingAvailableActions(booking: any) {
    if (booking.status === BookingStatusEnum.REQUESTED) {
      return ["approve", "reject"];
    }

    if (booking.status === BookingStatusEnum.IN_PROGRESS) {
      return ["return"];
    }

    if (booking.status === BookingStatusEnum.RETURN_INSPECTION) {
      const actions = ["inspection"];
      if (Number(booking.remainingAmount || 0) > 0) {
        actions.push("confirm-remaining");
      }
      return actions;
    }

    if (booking.status === BookingStatusEnum.AWAITING_EXTRA_CHARGE) {
      const actions = ["extra-charge"];
      if (Number(booking.remainingAmount || 0) > 0) {
        actions.push("confirm-remaining");
      }
      return actions;
    }

    if (
      [
        BookingStatusEnum.OWNER_APPROVED,
        BookingStatusEnum.PAYMENT_PENDING,
        BookingStatusEnum.PAID,
      ].includes(booking.status)
    ) {
      const actions = ["cancel"];
      const totalPrice = Number(booking.totalPrice || 0);
      const requiredAmount =
        booking.paymentOption === PaymentOptionEnum.FULL
          ? totalPrice
          : Number(
              booking.upfrontPaymentAmount ||
                getBookingUpfrontPaymentAmount(booking),
            );

      if (Number(booking.paidAmount || 0) >= requiredAmount) {
        if (!booking.handoverSnapshot?.ownerConfirmedAt) {
          actions.unshift("handover");
        }
      }

      const pickupAt = new Date(booking.startDate).getTime();
      const noShowAllowedAt = pickupAt + 30 * 60 * 1000;
      if (Number.isFinite(pickupAt) && Date.now() >= noShowAllowedAt) {
        actions.push("no-show");
      }

      return actions;
    }

    return [];
  }

  private toOwnerBookingListItem(booking: any) {
    const car = booking.carId || {};
    const customer = booking.userId || {};
    const renterInfo = booking.renterInfo || {};
    const delivery = booking.pricingSnapshot?.delivery || {};

    return {
      _id: String(booking._id),
      bookingCode: getBookingDisplayCode(booking),
      car: {
        _id: String(car._id || car || ""),
        carCode: car.carCode || null,
        name: car.name || "",
        licensePlate: car.licensePlate || "",
        image: Array.isArray(car.images) ? car.images[0] || null : null,
        type: car.type || "",
        seats: Number(car.seats || 0),
        fuelType: car.fuelType || "",
        transmission: car.transmission || "",
      },
      customer: {
        _id: String(customer._id || customer || ""),
        name: renterInfo.fullName || customer.name || "Khách thuê",
        avatar: customer.avatar || null,
      },
      startDate: booking.startDate,
      endDate: booking.endDate,
      actualReturnAt: booking.actualReturnAt || null,
      pickupLocation:
        delivery.deliveryAddressText ||
        delivery.deliveryFormattedAddress ||
        delivery.deliveryAddress ||
        booking.pickupAddressSnapshot ||
        "",
      deliveryType: delivery.deliveryType || "PICKUP_AT_CAR_LOCATION",
      status: booking.status,
      availableActions: this.getOwnerBookingAvailableActions(booking),
      pricing: {
        totalPrice: Number(booking.totalPrice || 0),
        paidAmount: Number(booking.paidAmount || 0),
        remainingAmount: Math.max(Number(booking.remainingAmount || 0), 0),
      },
      identityStatus: {
        identityProfileCompleted:
          booking.renterEligibilitySnapshot?.identityProfileCompleted === true,
        identityVerificationStatus:
          booking.renterEligibilitySnapshot?.identityVerificationStatus || null,
        driverLicenseClass:
          booking.renterEligibilitySnapshot?.driverLicenseClass || null,
        licenseEligible:
          booking.renterEligibilitySnapshot?.licenseEligible === true,
      },
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  private toOwnerBookingDetail(booking: any) {
    const item = this.toOwnerBookingListItem(booking);
    const customer = booking.userId || {};
    const renterInfo = booking.renterInfo || {};
    const delivery = booking.pricingSnapshot?.delivery || {};

    return {
      ...item,
      customer: {
        ...item.customer,
        email: renterInfo.email || customer.email || "",
        phone: renterInfo.phone || customer.phone || "",
      },
      identityStatus: {
        identityProfileCompleted:
          booking.renterEligibilitySnapshot?.identityProfileCompleted === true,
        identityVerificationStatus:
          booking.renterEligibilitySnapshot?.identityVerificationStatus || null,
        driverLicenseClass:
          booking.renterEligibilitySnapshot?.driverLicenseClass || null,
        licenseEligible:
          booking.renterEligibilitySnapshot?.licenseEligible === true,
      },
      actualPickupAt: booking.actualPickupAt || null,
      actualReturnAt: booking.actualReturnAt || null,
      handoverSnapshot: booking.handoverSnapshot || null,
      mileagePolicySnapshot: booking.mileagePolicySnapshot || null,
      currentOdometerKm:
        booking.carId?.currentOdometerKm ?? null,
      rentalMode: booking.rentalMode || "",
      pickupLocation:
        booking.pickupAddressSnapshot || item.pickupLocation || "",
      returnLocation:
        booking.returnAddressSnapshot ||
        delivery.deliveryAddressText ||
        delivery.deliveryFormattedAddress ||
        booking.pickupAddressSnapshot ||
        "",
      delivery: {
        deliveryType: delivery.deliveryType || "PICKUP_AT_CAR_LOCATION",
        address:
          delivery.deliveryAddressText ||
          delivery.deliveryFormattedAddress ||
          delivery.deliveryAddress ||
          "",
        distanceKm: Number(delivery.deliveryDistanceKm || 0),
        fee: Number(delivery.deliveryFee || 0),
      },
      paymentOption: booking.paymentOption || "",
      paymentStatus:
        Number(booking.remainingAmount || 0) <= 0 &&
        Number(booking.paidAmount || 0) > 0
          ? "PAID_FULL"
          : Number(booking.paidAmount || 0) > 0
            ? "PARTIAL"
            : "UNPAID",
      note: booking.note || renterInfo.note || "",
    };
  }

  async getOwnerBookings(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const search = String(req.query.search || "").trim().slice(0, 100);
    const group = normalizeOwnerBookingGroup(req.query.group);
    const status = normalizeOwnerBookingStatus(req.query.status);
    const sort = normalizeOwnerBookingSort(req.query.sort);
    const bookingFilter: Record<string, unknown> = {
      ...this.buildOwnerBookingFilter(owner),
      isDeleted: false,
    };

    if (status) {
      bookingFilter.status = status;
    } else if (group !== "ALL") {
      bookingFilter.status = { $in: OWNER_BOOKING_GROUP_STATUSES[group] };
    }

    if (search) {
      const safeRegex = new RegExp(escapeRegex(search), "i");
      const [cars, customers] = await Promise.all([
        CarModel.find({
          $and: [
            owner.filter,
            {
              $or: [
                { carCode: safeRegex },
                { name: safeRegex },
                { licensePlate: safeRegex },
              ],
            },
          ],
        })
          .select("_id")
          .lean(),
        UserModel.find({ name: safeRegex, isDeleted: { $ne: true } })
          .select("_id")
          .lean(),
      ]);

      bookingFilter.$and = [
        {
          $or: [
            { bookingCode: safeRegex },
            { carId: { $in: cars.map((car) => car._id) } },
            { userId: { $in: customers.map((customer) => customer._id) } },
            { "renterInfo.fullName": safeRegex },
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: "$_id" },
                  regex: escapeRegex(search),
                  options: "i",
                },
              },
            },
          ],
        },
      ];
    }

    const sortMap: Record<OwnerBookingSort, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      pickup_asc: { startDate: 1, createdAt: -1 },
      pickup_desc: { startDate: -1, createdAt: -1 },
    };
    const projection = [
      "_id",
      "bookingCode",
      "userId",
      "carId",
      "startDate",
      "endDate",
      "actualReturnAt",
      "status",
      "totalPrice",
      "paymentOption",
      "upfrontPaymentAmount",
      "paidAmount",
      "remainingAmount",
      "pickupAddressSnapshot",
      "pricingSnapshot.delivery",
      "renterInfo.fullName",
      "renterEligibilitySnapshot",
      "createdAt",
      "updatedAt",
    ].join(" ");

    const groupCountFilter = { ...bookingFilter };
    delete groupCountFilter.status;

    const [bookings, totalItems, statusCountRows] = await Promise.all([
      BookingModel.find(bookingFilter as any)
        .select(projection)
        .populate("carId", "carCode name licensePlate images type seats fuelType transmission")
        .populate("userId", "name avatar")
        .sort(sortMap[sort])
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BookingModel.countDocuments(bookingFilter as any),
      BookingModel.aggregate<{ _id: BookingStatusEnum; count: number }>([
        { $match: groupCountFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    const statusCounts = new Map(
      statusCountRows.map((row) => [row._id, Number(row.count || 0)]),
    );
    const countStatuses = (statuses: BookingStatusEnum[]) =>
      statuses.reduce((total, bookingStatus) => {
        return total + (statusCounts.get(bookingStatus) || 0);
      }, 0);
    const groupCounts: Record<OwnerBookingGroup, number> = {
      ALL: [...statusCounts.values()].reduce((total, count) => total + count, 0),
      ACTION_REQUIRED: countStatuses(
        OWNER_BOOKING_GROUP_STATUSES.ACTION_REQUIRED,
      ),
      UPCOMING: countStatuses(OWNER_BOOKING_GROUP_STATUSES.UPCOMING),
      ACTIVE: countStatuses(OWNER_BOOKING_GROUP_STATUSES.ACTIVE),
      COMPLETED: countStatuses(OWNER_BOOKING_GROUP_STATUSES.COMPLETED),
      CLOSED: countStatuses(OWNER_BOOKING_GROUP_STATUSES.CLOSED),
    };

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        bookings: bookings.map((booking) =>
          this.toOwnerBookingListItem(booking),
        ),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
        groupCounts,
      },
    });
  }

  async getOwnerBookingDetail(req: Request, res: Response) {
    const bookingId = String(req.params.bookingId || "");
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw ErrorHelper.requestDataInvalid("Mã booking không hợp lệ");
    }

    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const booking = await BookingModel.findOne({
      _id: bookingId,
      ...this.buildOwnerBookingFilter(owner),
      isDeleted: false,
    } as any)
      .select(
        [
          "_id",
          "bookingCode",
          "userId",
          "carId",
          "startDate",
          "endDate",
          "actualPickupAt",
          "actualReturnAt",
          "handoverSnapshot",
          "mileagePolicySnapshot",
          "status",
          "rentalMode",
          "totalPrice",
          "paidAmount",
          "remainingAmount",
          "paymentOption",
          "upfrontPaymentAmount",
          "pickupAddressSnapshot",
          "returnAddressSnapshot",
          "pricingSnapshot.delivery",
          "renterInfo.fullName",
          "renterInfo.email",
          "renterInfo.phone",
           "renterEligibilitySnapshot",
          "renterInfo.note",
          "note",
          "createdAt",
          "updatedAt",
        ].join(" "),
      )
      .populate("carId", "carCode name licensePlate images currentOdometerKm type seats fuelType transmission")
      .populate("userId", "name email phone avatar")
      .lean();

    if (!booking) {
      throw ErrorHelper.permissionDeny();
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        booking: this.toOwnerBookingDetail(booking),
      },
    });
  }

private buildExtraChargeOwnerFilter(
  owner: Awaited<ReturnType<OwnerRoute["getOwnerContext"]>>,
) {
  return {
    ownerId: owner.userId,
  };
}

  private normalizeReviewContent(value: unknown, fieldName: string) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      throw ErrorHelper.requestDataInvalid(`${fieldName} không được để trống`);
    }

    return text.slice(0, 1000);
  }

  private toOwnerReviewItem(review: any) {
    return {
      id: review._id,
      bookingId: review.bookingId?._id || review.bookingId,
      bookingCode: getBookingDisplayCode(review.bookingId),
      carId: review.carId?._id || review.carId,
      carName: review.carNameSnapshot || review.carId?.name || "Xe",
      licensePlate: review.carId?.licensePlate || "",
      carImage: Array.isArray(review.carId?.images) ? review.carId.images[0] : "",
      renterName: review.reviewerNameSnapshot || review.renterId?.name || "Khách thuê",
      renterEmail: review.renterId?.email || "",
      renterAvatar: review.renterId?.avatar || "",
      rating: review.rating,
      criteria: review.criteria || {},
      comment: review.comment || "",
      images: review.images || [],
      ownerReply: review.ownerReply || null,
      status: review.status,
      report: review.report || null,
      helpfulCount: review.helpfulCount || 0,
      verifiedRental: true,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private async findOwnerReview(
    reviewId: string,
    owner: Awaited<ReturnType<OwnerRoute["getOwnerContext"]>>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      throw ErrorHelper.requestDataInvalid("Đánh giá không hợp lệ");
    }

    const review = await ReviewModel.findOne({
      _id: reviewId,
      ...this.buildExtraChargeOwnerFilter(owner),
    } as any);

    if (!review) throw ErrorHelper.permissionDeny();
    return review;
  }

  async getExtraCharges(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const booking = await this.findOwnerBooking(String(req.params.bookingId), owner);
    const extraCharges = await ExtraChargeModel.find({
      bookingId: booking._id,
      ...this.buildExtraChargeOwnerFilter(owner),
      isDeleted: false,
    } as any).sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { extraCharges },
    });
  }

  async getOwnerReviews(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const ownerFilter = this.buildExtraChargeOwnerFilter(owner);

    const reviews = await ReviewModel.find({
      ...ownerFilter,
      status: { $ne: ReviewStatusEnum.HIDDEN },
    } as any)
      .populate("bookingId", "_id bookingCode")
      .populate("carId", "name licensePlate images")
      .populate("renterId", "name email avatar")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "success",
      data: {
        reviews: reviews.map((review: any) => ({
          id: review._id,
          bookingId: review.bookingId?._id || review.bookingId,
          bookingCode: getBookingDisplayCode(review.bookingId),
          carId: review.carId?._id || review.carId,
          carName: review.carNameSnapshot || review.carId?.name || "Xe",
          licensePlate: review.carId?.licensePlate || "",
          carImage: Array.isArray(review.carId?.images) ? review.carId.images[0] : "",
          renterName: review.reviewerNameSnapshot || review.renterId?.name || "Khách thuê",
          renterEmail: review.renterId?.email || "",
          renterAvatar: review.renterId?.avatar || "",
          rating: review.rating,
          criteria: review.criteria || {},
          comment: review.comment || "",
          images: review.images || [],
          ownerReply: review.ownerReply || null,
          status: review.status,
          report: review.report || null,
          helpfulCount: review.helpfulCount || 0,
          verifiedRental: true,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
        })),
      },
    });
  }

  async getOwnerReviewStatistics(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const ownerFilter = this.buildExtraChargeOwnerFilter(owner);

    const reviews = await ReviewModel.find({
      ...ownerFilter,
      status: { $ne: ReviewStatusEnum.HIDDEN },
    } as any)
      .select("rating ownerReply")
      .lean();

    const distribution = [5, 4, 3, 2, 1].reduce<Record<string, number>>(
      (result, rating) => {
        result[String(rating)] = reviews.filter(
          (review) => Number(review.rating) === rating,
        ).length;
        return result;
      },
      {},
    );
    const totalRating = reviews.reduce(
      (sum, review) => sum + Number(review.rating || 0),
      0,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "success",
      data: {
        totalReviews: reviews.length,
        averageRating: reviews.length
          ? Number((totalRating / reviews.length).toFixed(1))
          : 0,
        fiveStarCount: distribution["5"] || 0,
        lowRatingCount: reviews.filter((review) => Number(review.rating) <= 2).length,
        unrepliedCount: reviews.filter((review: any) => !review.ownerReply?.content).length,
        distribution,
      },
    });
  }

  async replyReview(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const review = await this.findOwnerReview(String(req.params.id), owner);
    const content = this.normalizeReviewContent(req.body.content, "Nội dung phản hồi");
    const now = new Date();

    review.ownerReply = {
      content,
      repliedAt: review.ownerReply?.repliedAt || now,
      updatedAt: now,
    };
    await review.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "Đã lưu phản hồi đánh giá.",
      data: { review: this.toOwnerReviewItem(review.toObject()) },
    });
  }

  async reportReview(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const review = await this.findOwnerReview(String(req.params.id), owner);
    const reason = this.normalizeReviewContent(req.body.reason, "Lý do báo cáo");

    review.status = ReviewStatusEnum.REPORTED;
    review.report = {
      reason,
      reportedBy: authUser.userId,
      reportedAt: new Date(),
    } as any;
    await review.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "Đã gửi báo cáo đánh giá cho admin.",
      data: { review: this.toOwnerReviewItem(review.toObject()) },
    });
  }

  async createExtraCharge(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const type = String(req.body.type || "") as ExtraChargeTypeEnum;
    const amount = Number(req.body.amount || 0);
    const description = String(req.body.description || "").trim();
    const adjustmentReason = String(req.body.adjustmentReason || "").trim();
    const evidenceImages = Array.isArray(req.body.evidenceImages)
      ? req.body.evidenceImages.filter((item: unknown) => typeof item === "string" && item.trim())
          .map((item: string) => item.trim())
          .slice(0, 5)
      : [];

    if (!Object.values(ExtraChargeTypeEnum).includes(type as ExtraChargeTypeEnum)) {
      throw ErrorHelper.requestDataInvalid("Loại phí phát sinh không hợp lệ");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw ErrorHelper.requestDataInvalid("Số tiền phí phát sinh phải lớn hơn 0");
    }

    if (!description) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập mô tả phí phát sinh");
    }

    if (description.length > 1000) {
      throw ErrorHelper.requestDataInvalid(
        "Mô tả phí phát sinh không được vượt quá 1000 ký tự",
      );
    }

    const session = await mongoose.startSession();
    let extraCharge: any;

    try {
      await session.withTransaction(async () => {
        const booking = await BookingModel.findOne({
          _id: String(req.params.bookingId),
          ...this.buildOwnerBookingFilter(owner),
          status: {
            $in: [
              BookingStatusEnum.RETURN_INSPECTION,
              BookingStatusEnum.AWAITING_EXTRA_CHARGE,
            ],
          },
          isDeleted: false,
        } as any).session(session);

        if (!booking) {
          throw ErrorHelper.requestDataInvalid(
            "Booking không thuộc quyền quản lý hoặc chưa ở bước kiểm tra xe trả.",
          );
        }

        const inspection = await ReturnInspectionModel.findOne({
          bookingId: booking._id,
          inspectionStatus: { $ne: ReturnInspectionStatusEnum.CLEARED },
          isDeleted: false,
        } as any).session(session);

        if (!inspection) {
          throw ErrorHelper.requestDataInvalid(
            "Biên bản kiểm tra không tồn tại hoặc đã hoàn tất.",
          );
        }

        let resolvedAmount = Math.round(amount);
        let mileageSnapshot: IExtraCharge["mileageSnapshot"];
        let lateReturnSnapshot: IExtraCharge["lateReturnSnapshot"];
        if (type === ExtraChargeTypeEnum.OVERAGE_KM) {
          const suggestedAmount = Math.round(
            Number(inspection.suggestedOverageAmount || 0),
          );
          const chargeableOverageKm = Number(
            inspection.chargeableOverageKm || 0,
          );
          const policy = booking.mileagePolicySnapshot;

          if (!policy || suggestedAmount <= 0 || chargeableOverageKm <= 0) {
            throw ErrorHelper.requestDataInvalid(
              "Booking không có khoản vượt kilomet hợp lệ để tạo phụ phí.",
            );
          }

          if (Math.round(amount) !== suggestedAmount) {
            throw ErrorHelper.requestDataInvalid(
              "Phí vượt kilomet phải đúng bằng mức hệ thống tính từ biên bản trả xe.",
            );
          }

          mileageSnapshot = {
            rentalMode: policy.rentalMode,
            ...(policy.includedKmPerDay !== undefined
              ? { includedKmPerDay: Number(policy.includedKmPerDay) }
              : {}),
            ...(policy.includedKmPerHour !== undefined
              ? { includedKmPerHour: Number(policy.includedKmPerHour) }
              : {}),
            billableUnits: Number(policy.billableUnits || 0),
            handoverOdometerKm: Number(
              booking.handoverSnapshot?.handoverOdometerKm || 0,
            ),
            returnOdometerKm: Number(inspection.returnOdometerKm || 0),
            distanceTravelledKm: Number(inspection.distanceTravelledKm || 0),
            totalIncludedKm: Number(inspection.totalIncludedKm || 0),
            overageKm: Number(inspection.overageKm || 0),
            graceKm: Number(policy.graceKm || 0),
            chargeableOverageKm,
            overageFeePerKm: Number(policy.overageFeePerKm || 0),
            suggestedOverageAmount: suggestedAmount,
          };
          resolvedAmount = suggestedAmount;
        }

        if (type === ExtraChargeTypeEnum.LATE_RETURN) {
          const calculation = calculateLateReturnFee(
            booking.endDate,
            inspection.actualReturnAt,
          );

          if (calculation.calculatedAmount <= 0) {
            throw ErrorHelper.requestDataInvalid(
              "Xe được trả trong thời gian miễn phí 30 phút, không phát sinh phí trả trễ.",
            );
          }

          if (Math.round(amount) !== calculation.calculatedAmount) {
            throw ErrorHelper.requestDataInvalid(
              "Phí trả xe trễ phải đúng bằng mức hệ thống tính từ thời gian tiếp nhận xe.",
            );
          }

          lateReturnSnapshot = calculation;
          resolvedAmount = calculation.calculatedAmount;
        }

        const duplicatedCharge = await ExtraChargeModel.findOne({
          bookingId: booking._id,
          isDeleted: false,
          status: {
            $in: [ExtraChargeStatusEnum.PENDING, ExtraChargeStatusEnum.PAID],
          },
          ...([
            ExtraChargeTypeEnum.OVERAGE_KM,
            ExtraChargeTypeEnum.LATE_RETURN,
          ].includes(type)
            ? { type }
            : {
                type,
                amount: resolvedAmount,
                description,
              }),
        } as any)
          .select("_id")
          .session(session);

        if (duplicatedCharge) {
          throw ErrorHelper.requestDataInvalid(
            type === ExtraChargeTypeEnum.OVERAGE_KM
              ? "Phụ phí vượt kilomet đã được tạo cho booking này."
              : type === ExtraChargeTypeEnum.LATE_RETURN
                ? "Phụ phí trả xe trễ đã được tạo cho booking này."
                : "Khoản phụ phí giống nhau đang tồn tại.",
          );
        }

        const createdCharges = await ExtraChargeModel.create(
          [
            {
              bookingId: booking._id,
              carId: booking.carId,
              renterId: booking.userId,
              ownerId: owner.userId,
              type,
              amount: resolvedAmount,
              description,
              evidenceImages,
              ...(mileageSnapshot ? { mileageSnapshot } : {}),
              ...(lateReturnSnapshot ? { lateReturnSnapshot } : {}),
              ...(adjustmentReason ? { adjustmentReason } : {}),
              status: ExtraChargeStatusEnum.PENDING,
            },
          ],
          { session },
        );
        extraCharge = createdCharges[0];

        const updatedInspection = await ReturnInspectionModel.findOneAndUpdate(
          {
            _id: inspection._id,
            inspectionStatus: { $ne: ReturnInspectionStatusEnum.CLEARED },
            isDeleted: false,
          } as any,
          {
            $set: {
              inspectionStatus: ReturnInspectionStatusEnum.CHARGES_PENDING,
            },
          },
          { new: true, session },
        );
        const updatedBooking = await BookingModel.findOneAndUpdate(
          {
            _id: booking._id,
            status: {
              $in: [
                BookingStatusEnum.RETURN_INSPECTION,
                BookingStatusEnum.AWAITING_EXTRA_CHARGE,
              ],
            },
            isDeleted: false,
          } as any,
          { $set: { status: BookingStatusEnum.AWAITING_EXTRA_CHARGE } },
          { new: true, session },
        );

        if (!updatedInspection || !updatedBooking) {
          throw ErrorHelper.requestDataInvalid(
            "Trạng thái booking đã thay đổi, vui lòng tải lại trước khi tạo phí.",
          );
        }
      });
    } finally {
      await session.endSession();
    }

    if (!extraCharge) {
      throw ErrorHelper.requestDataInvalid("Không thể tạo phí phát sinh.");
    }

    void notificationCenterService.notifyExtraChargeCreated(
      extraCharge,
      authUser.userId,
    );
    void sendNewExtraChargeMail(extraCharge);

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đã tạo phí phát sinh",
      data: { extraCharge },
    });
  }

  async confirmExtraChargeCash(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const session = await mongoose.startSession();
    let extraCharge: any;
    let payment: any;

    try {
      await session.withTransaction(async () => {
        const paidAt = new Date();
        extraCharge = await ExtraChargeModel.findOneAndUpdate(
          {
            _id: String(req.params.id),
            ...this.buildExtraChargeOwnerFilter(owner),
            status: ExtraChargeStatusEnum.PENDING,
            isDeleted: false,
          } as any,
          {
            $set: {
              status: ExtraChargeStatusEnum.PAID,
              paymentMethod: PaymentMethodEnum.CASH,
              paidAt,
              confirmedBy: owner.userId,
              confirmedByRole: UserRoleEnum.USER,
            },
          },
          { new: true, session },
        );

        if (!extraCharge) {
          throw ErrorHelper.requestDataInvalid(
            "Phụ phí không còn ở trạng thái chờ thanh toán.",
          );
        }

        const createdPayments = await PaymentModel.create(
          [
            {
              bookingId: extraCharge.bookingId,
              extraChargeId: extraCharge._id,
              userId: extraCharge.renterId,
              amount: extraCharge.amount,
              method: PaymentMethodEnum.CASH,
              paymentType: PaymentTypeEnum.EXTRA_CHARGE,
              status: PaymentStatusEnum.PAID,
              paidAt,
              confirmedBy: owner.userId,
              confirmedByRole: UserRoleEnum.USER,
              note: "Chủ xe xác nhận đã thu phí phát sinh bằng tiền mặt",
            },
          ],
          { session },
        );
        payment = createdPayments[0];
        extraCharge.paymentId = payment._id;
        await extraCharge.save({ session });

        const remainingPendingCharge = await ExtraChargeModel.findOne({
          bookingId: extraCharge.bookingId,
          status: ExtraChargeStatusEnum.PENDING,
          isDeleted: false,
        } as any)
          .select("_id")
          .session(session);

        if (!remainingPendingCharge) {
          await ReturnInspectionModel.updateOne(
            {
              bookingId: extraCharge.bookingId,
              inspectionStatus: ReturnInspectionStatusEnum.CHARGES_PENDING,
              isDeleted: false,
            } as any,
            {
              $set: {
                // Đã xử lý hết phụ phí, quay lại bước kiểm tra xe.
                inspectionStatus: ReturnInspectionStatusEnum.INSPECTING,
              },
            },
            { session },
          );

          await BookingModel.updateOne(
            {
              _id: extraCharge.bookingId,
              status: BookingStatusEnum.AWAITING_EXTRA_CHARGE,
              isDeleted: false,
            } as any,
            {
              $set: {
                status: BookingStatusEnum.RETURN_INSPECTION,
              },
            },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    void notificationCenterService.notifyExtraChargePaid(
      extraCharge,
      payment,
      authUser.userId,
    );
    void sendExtraChargePaidMail(extraCharge, payment);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã xác nhận thu phí phát sinh",
      data: { extraCharge },
    });
  }

  async cancelExtraCharge(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const cancelReason = String(req.body.cancelReason || "").trim();
    const session = await mongoose.startSession();
    let extraCharge: any;

    try {
      await session.withTransaction(async () => {
        extraCharge = await ExtraChargeModel.findOneAndUpdate(
          {
            _id: String(req.params.id),
            ...this.buildExtraChargeOwnerFilter(owner),
            status: ExtraChargeStatusEnum.PENDING,
            isDeleted: false,
          } as any,
          {
            $set: {
              status: ExtraChargeStatusEnum.CANCELLED,
              cancelReason: (cancelReason || "Chủ xe hủy phí phát sinh").slice(
                0,
                500,
              ),
            },
          },
          { new: true, session },
        );

        if (!extraCharge) {
          throw ErrorHelper.requestDataInvalid(
            "Phụ phí không còn ở trạng thái có thể hủy.",
          );
        }

        const remainingPendingCharge = await ExtraChargeModel.findOne({
          bookingId: extraCharge.bookingId,
          status: ExtraChargeStatusEnum.PENDING,
          isDeleted: false,
        } as any)
          .select("_id")
          .session(session);

        if (!remainingPendingCharge) {
          await ReturnInspectionModel.updateOne(
            {
              bookingId: extraCharge.bookingId,
              inspectionStatus: ReturnInspectionStatusEnum.CHARGES_PENDING,
              isDeleted: false,
            } as any,
            {
              $set: {
                // Không còn phụ phí chờ xử lý, tiếp tục kiểm tra xe.
                inspectionStatus: ReturnInspectionStatusEnum.INSPECTING,
              },
            },
            { session },
          );

          await BookingModel.updateOne(
            {
              _id: extraCharge.bookingId,
              status: BookingStatusEnum.AWAITING_EXTRA_CHARGE,
              isDeleted: false,
            } as any,
            {
              $set: {
                status: BookingStatusEnum.RETURN_INSPECTION,
              },
            },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    void notificationCenterService.notifyExtraChargeCancelled(
      extraCharge,
      authUser.userId,
    );
    void sendExtraChargeCancelledMail(extraCharge);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã hủy phí phát sinh",
      data: { extraCharge },
    });
  }
}

export default new OwnerRoute().router;
