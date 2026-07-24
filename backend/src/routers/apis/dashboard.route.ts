import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import { syncRentedCarStatuses } from "../../helper/car-status.helper";
import {
  BookingStatusEnum,
  CarStatusEnum,
  OwnerTypeEnum,
  PaymentStatusEnum,
  RefundStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { BookingModel } from "../../models/booking/booking.model";
import { BusinessModel } from "../../models/business/business.model";
import { CarModel } from "../../models/car/car.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { RefundModel } from "../../models/refund/refund.model";
import { ReviewModel, ReviewStatusEnum } from "../../models/review/review.model";
import { UserModel } from "../../models/user/user.model";

type StatusCount = {
  status: string;
  count: number;
};

class DashboardRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/admin",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.adminDashboard),
    );
    this.router.get(
      "/admin/stats",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.adminDashboard),
    );
    this.router.get(
      "/business",
      [this.authentication, this.roleGuard([UserRoleEnum.BUSINESS])],
      this.route(this.businessDashboard),
    );
    this.router.get(
      "/business/stats",
      [this.authentication, this.roleGuard([UserRoleEnum.BUSINESS])],
      this.route(this.businessDashboard),
    );
    this.router.get(
      "/consignment/stats",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
      this.route(this.consignmentDashboard),
    );
  }

  private async prepareDashboardData() {
    await expireAbandonedPendingBookings();
    await syncRentedCarStatuses();
  }

  private async countByStatus(
    model: { countDocuments: (filter: any) => any },
    baseFilter: any,
    statuses: string[],
  ): Promise<StatusCount[]> {
    return Promise.all(
      statuses.map(async (status) => ({
        status,
        count: await model.countDocuments({ ...baseFilter, status }),
      })),
    );
  }

  private getStatusCount(stats: StatusCount[], status: string) {
    return stats.find((item) => item.status === status)?.count || 0;
  }

  private sumAmount(payments: Array<{ amount?: number }>) {
    return payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }

  private async getPaymentStats(bookingIds?: any[]) {
    if (bookingIds && bookingIds.length === 0) {
      return {
        paidAmount: 0,
        pendingAmount: 0,
        failedCount: 0,
        refundedAmount: 0,
      };
    }

    const bookingFilter: any =
      bookingIds && bookingIds.length > 0 ? { bookingId: { $in: bookingIds } } : {};

    const [paidPayments, pendingPayments, failedCount, succeededRefunds] =
      await Promise.all([
        PaymentModel.find({
          ...bookingFilter,
          status: PaymentStatusEnum.PAID,
        }).select("amount refundedAmount"),
        PaymentModel.find({
          ...bookingFilter,
          status: PaymentStatusEnum.PENDING,
        }).select("amount"),
        PaymentModel.countDocuments({
          ...bookingFilter,
          status: PaymentStatusEnum.FAILED,
        }),
        RefundModel.find({
          ...bookingFilter,
          status: RefundStatusEnum.SUCCEEDED,
          isDeleted: false,
        }).select("refundAmount"),
      ]);
    const refundAmount = succeededRefunds.reduce(
      (sum, refund) => sum + Number(refund.refundAmount || 0),
      0,
    );

    return {
      paidAmount: Math.max(this.sumAmount(paidPayments) - refundAmount, 0),
      pendingAmount: this.sumAmount(pendingPayments),
      failedCount,
      refundedAmount: refundAmount,
    };
  }

  private getOwnerName(car: any) {
    if (car?.ownerType === OwnerTypeEnum.USER) {
      return car?.ownerId?.name || "Người dùng ký gửi";
    }

    return (
      car?.businessId?.businessName ||
      car?.ownerId?.businessName ||
      "Doanh nghiệp"
    );
  }

  private getCarImage(car: any) {
    return Array.isArray(car?.images) ? car.images.find(Boolean) || "" : "";
  }

  private async getReviewStats(carIds?: unknown[]) {
    if (carIds && carIds.length === 0) {
      return {
        totalReviews: 0,
        averageRating: 0,
        topRatedCars: [],
        lowRatedCars: [],
        mostReviewedCars: [],
      };
    }

    const reviewFilter: any = { status: ReviewStatusEnum.VISIBLE };
    if (carIds) {
      reviewFilter.carId = { $in: carIds };
    }

    const reviews = await ReviewModel.find(reviewFilter)
      .select("carId rating createdAt")
      .lean();

    if (reviews.length === 0) {
      return {
        totalReviews: 0,
        averageRating: 0,
        topRatedCars: [],
        lowRatedCars: [],
        mostReviewedCars: [],
      };
    }

    const grouped = new Map<
      string,
      {
        carId: string;
        ratingTotal: number;
        reviewCount: number;
        latestReviewAt?: Date | string;
      }
    >();

    reviews.forEach((review: any) => {
      const carId = String(review.carId);
      const current =
        grouped.get(carId) ||
        {
          carId,
          ratingTotal: 0,
          reviewCount: 0,
        };

      current.ratingTotal += Number(review.rating || 0);
      current.reviewCount += 1;

      if (
        review.createdAt &&
        (!current.latestReviewAt ||
          new Date(review.createdAt) > new Date(current.latestReviewAt))
      ) {
        current.latestReviewAt = review.createdAt;
      }

      grouped.set(carId, current);
    });

    const cars = await CarModel.find({
      _id: { $in: Array.from(grouped.keys()) },
      isDeleted: false,
    })
      .populate("businessId", "businessName")
      .populate("ownerId", "name businessName")
      .select("name licensePlate images ownerType businessId ownerId")
      .lean();

    const carMap = new Map(cars.map((car: any) => [String(car._id), car]));
    const rows = Array.from(grouped.values())
      .map((item) => {
        const car = carMap.get(item.carId);
        if (!car) return null;

        return {
          carId: item.carId,
          carName: car.name || "Xe",
          licensePlate: car.licensePlate || "",
          image: this.getCarImage(car),
          ownerName: this.getOwnerName(car),
          averageRating: Number((item.ratingTotal / item.reviewCount).toFixed(1)),
          reviewCount: item.reviewCount,
          latestReviewAt: item.latestReviewAt,
        };
      })
      .filter(Boolean) as any[];
    const totalRating = reviews.reduce(
      (sum: number, review: any) => sum + Number(review.rating || 0),
      0,
    );

    return {
      totalReviews: reviews.length,
      averageRating: Number((totalRating / reviews.length).toFixed(1)),
      topRatedCars: [...rows]
        .sort(
          (a, b) =>
            b.averageRating - a.averageRating || b.reviewCount - a.reviewCount,
        )
        .slice(0, 5),
      lowRatedCars: [...rows]
        .sort(
          (a, b) =>
            a.averageRating - b.averageRating || b.reviewCount - a.reviewCount,
        )
        .slice(0, 5),
      mostReviewedCars: [...rows]
        .sort((a, b) => b.reviewCount - a.reviewCount)
        .slice(0, 5),
    };
  }

  private async getRecentBookings(bookingFilter: any) {
    const bookings = await BookingModel.find(bookingFilter)
      .populate("carId", "name licensePlate images")
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    return bookings.map((booking: any) => ({
      bookingId: booking._id,
      bookingCode: String(booking._id).slice(-8).toUpperCase(),
      carName: booking.carId?.name || "Xe",
      licensePlate: booking.carId?.licensePlate || "",
      carImage: this.getCarImage(booking.carId),
      renterName:
        booking.userId?.name || booking.renterInfo?.fullName || "Khách thuê",
      renterEmail: booking.userId?.email || booking.renterInfo?.email || "",
      status: booking.status,
      totalPrice: booking.totalPrice || 0,
      startDate: booking.startDate,
      endDate: booking.endDate,
      createdAt: booking.createdAt,
    }));
  }

  private async getScopedStats(carFilter: any, bookingFilter: any) {
    const [cars, bookings] = await Promise.all([
      CarModel.find(carFilter).select("_id"),
      BookingModel.find(bookingFilter).select("_id"),
    ]);
    const carIds = cars.map((car) => car._id);
    const bookingIds = bookings.map((booking) => booking._id);
    const [carStatusStats, bookingStatusStats, paymentStats, reviewStats, recentBookings] =
      await Promise.all([
        this.countByStatus(CarModel, carFilter, Object.values(CarStatusEnum)),
        this.countByStatus(
          BookingModel,
          bookingFilter,
          Object.values(BookingStatusEnum),
        ),
        this.getPaymentStats(bookingIds),
        this.getReviewStats(carIds),
        this.getRecentBookings(bookingFilter),
      ]);
    const pendingBookings =
      this.getStatusCount(bookingStatusStats, BookingStatusEnum.REQUESTED) +
      this.getStatusCount(bookingStatusStats, BookingStatusEnum.PENDING);
    const confirmedBookings =
      this.getStatusCount(bookingStatusStats, BookingStatusEnum.OWNER_APPROVED) +
      this.getStatusCount(bookingStatusStats, BookingStatusEnum.PAYMENT_PENDING) +
      this.getStatusCount(bookingStatusStats, BookingStatusEnum.PAID) +
      this.getStatusCount(bookingStatusStats, BookingStatusEnum.CONFIRMED);

    return {
      overview: {
        totalCars: carIds.length,
        pendingCars: this.getStatusCount(carStatusStats, CarStatusEnum.PENDING),
        approvedCars: this.getStatusCount(carStatusStats, CarStatusEnum.APPROVED),
        rentedCars: this.getStatusCount(carStatusStats, CarStatusEnum.RENTED),
        rejectedCars: this.getStatusCount(carStatusStats, CarStatusEnum.REJECTED),
        hiddenCars: this.getStatusCount(carStatusStats, CarStatusEnum.HIDDEN),
        totalBookings: bookingIds.length,
        pendingBookings,
        confirmedBookings,
        inProgressBookings: this.getStatusCount(
          bookingStatusStats,
          BookingStatusEnum.IN_PROGRESS,
        ),
        completedBookings: this.getStatusCount(
          bookingStatusStats,
          BookingStatusEnum.COMPLETED,
        ),
        totalPaidRevenue: paymentStats.paidAmount,
        totalReviews: reviewStats.totalReviews,
        averageRating: reviewStats.averageRating,
      },
      carStatusStats,
      bookingStatusStats,
      paymentStats,
      recentBookings,
      topRatedCars: reviewStats.topRatedCars,
      lowRatedCars: reviewStats.lowRatedCars,
      mostReviewedCars: reviewStats.mostReviewedCars,
    };
  }

  async adminDashboard(req: Request, res: Response) {
    await this.prepareDashboardData();

    const [
      totalUsers,
      totalBusinesses,
      totalCars,
      totalBookings,
      consignmentOwnerIds,
      pendingConsignmentCars,
      pendingBusinessCars,
      userConsignmentBookingIds,
      businessBookingIds,
      carStatusStats,
      bookingStatusStats,
      paymentStats,
      reviewStats,
    ] = await Promise.all([
      UserModel.countDocuments({ isDeleted: false }),
      BusinessModel.countDocuments({ isDeleted: false }),
      CarModel.countDocuments({ isDeleted: false }),
      BookingModel.countDocuments({ isDeleted: false }),
      CarModel.distinct("ownerId", {
        ownerType: OwnerTypeEnum.USER,
        isDeleted: false,
      } as any),
      CarModel.countDocuments({
        ownerType: OwnerTypeEnum.USER,
        isDeleted: false,
        status: CarStatusEnum.PENDING,
      } as any),
      CarModel.countDocuments({
        isDeleted: false,
        status: CarStatusEnum.PENDING,
        $or: [
          { ownerType: OwnerTypeEnum.BUSINESS },
          { businessId: { $exists: true }, ownerId: { $exists: false } },
        ],
      } as any),
      BookingModel.distinct("_id", {
        ownerType: OwnerTypeEnum.USER,
        isDeleted: false,
      } as any),
      BookingModel.distinct("_id", {
        isDeleted: false,
        $or: [
          { ownerType: OwnerTypeEnum.BUSINESS },
          { businessId: { $exists: true }, ownerId: { $exists: false } },
        ],
      } as any),
      this.countByStatus(CarModel, { isDeleted: false }, Object.values(CarStatusEnum)),
      this.countByStatus(
        BookingModel,
        { isDeleted: false },
        Object.values(BookingStatusEnum),
      ),
      this.getPaymentStats(),
      this.getReviewStats(),
    ]);
    const [businessPaidPayments, userConsignmentPaidPayments] =
      await Promise.all([
        PaymentModel.find({
          bookingId: { $in: businessBookingIds },
          status: PaymentStatusEnum.PAID,
        }).select("amount"),
        PaymentModel.find({
          bookingId: { $in: userConsignmentBookingIds },
          status: PaymentStatusEnum.PAID,
        }).select("amount"),
      ]);
    const pendingBookings =
      this.getStatusCount(bookingStatusStats, BookingStatusEnum.REQUESTED) +
      this.getStatusCount(bookingStatusStats, BookingStatusEnum.PENDING);
    const overview = {
      totalUsers,
      totalBusinesses,
      totalCars,
      pendingCars: this.getStatusCount(carStatusStats, CarStatusEnum.PENDING),
      approvedCars: this.getStatusCount(carStatusStats, CarStatusEnum.APPROVED),
      rentedCars: this.getStatusCount(carStatusStats, CarStatusEnum.RENTED),
      rejectedCars: this.getStatusCount(carStatusStats, CarStatusEnum.REJECTED),
      hiddenCars: this.getStatusCount(carStatusStats, CarStatusEnum.HIDDEN),
      totalBookings,
      pendingBookings,
      completedBookings: this.getStatusCount(
        bookingStatusStats,
        BookingStatusEnum.COMPLETED,
      ),
      cancelledBookings: this.getStatusCount(
        bookingStatusStats,
        BookingStatusEnum.CANCELLED,
      ),
      noShowBookings: this.getStatusCount(
        bookingStatusStats,
        BookingStatusEnum.NO_SHOW,
      ),
      totalPaidRevenue: paymentStats.paidAmount,
      totalReviews: reviewStats.totalReviews,
      averageRating: reviewStats.averageRating,
      totalConsignmentOwners: consignmentOwnerIds.length,
      pendingConsignmentCars,
      pendingBusinessCars,
      businessRevenue: this.sumAmount(businessPaidPayments),
      userConsignmentRevenue: this.sumAmount(userConsignmentPaidPayments),
    };

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        ...overview,
        revenue: overview.totalPaidRevenue,
        overview,
        bookingStatusStats,
        carStatusStats,
        paymentStats,
        topRatedCars: reviewStats.topRatedCars,
        lowRatedCars: reviewStats.lowRatedCars,
        mostReviewedCars: reviewStats.mostReviewedCars,
      },
    });
  }

  async businessDashboard(req: Request, res: Response) {
    const authUser = (req as any).user;
    await this.prepareDashboardData();

    const business = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
    }

    const carFilter = {
      isDeleted: false,
      $or: [
        { businessId: business._id },
        { ownerId: business._id, ownerType: OwnerTypeEnum.BUSINESS },
      ],
    };
    const bookingFilter = {
      isDeleted: false,
      $or: [
        { businessId: business._id },
        { ownerId: business._id, ownerType: OwnerTypeEnum.BUSINESS },
      ],
    };
    const stats = await this.getScopedStats(carFilter, bookingFilter);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        ...stats.overview,
        revenue: stats.overview.totalPaidRevenue,
        totalRevenue: stats.overview.totalPaidRevenue,
        profile: business,
        business,
        ...stats,
      },
    });
  }

  async consignmentDashboard(req: Request, res: Response) {
    const authUser = (req as any).user;
    await this.prepareDashboardData();

    const carFilter = {
      ownerId: authUser.userId,
      ownerType: OwnerTypeEnum.USER,
      isDeleted: false,
    };
    const bookingFilter = {
      ownerId: authUser.userId,
      ownerType: OwnerTypeEnum.USER,
      isDeleted: false,
    };
    const stats = await this.getScopedStats(carFilter, bookingFilter);
    const overview = {
      ...stats.overview,
      totalConsignmentCars: stats.overview.totalCars,
    };

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        ...overview,
        revenue: overview.totalPaidRevenue,
        totalRevenue: overview.totalPaidRevenue,
        overview,
        carStatusStats: stats.carStatusStats,
        bookingStatusStats: stats.bookingStatusStats,
        paymentStats: stats.paymentStats,
        recentBookings: stats.recentBookings,
        topRatedCars: stats.topRatedCars,
        lowRatedCars: stats.lowRatedCars,
        mostReviewedCars: stats.mostReviewedCars,
      },
    });
  }
}

export default new DashboardRoute().router;
