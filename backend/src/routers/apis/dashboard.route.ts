import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserModel } from "../../models/user/user.model";
import { BusinessModel } from "../../models/business/business.model";
import { CarModel } from "../../models/car/car.model";
import { BookingModel } from "../../models/booking/booking.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { syncRentedCarStatuses } from "../../helper/car-status.helper";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import {
  BookingStatusEnum,
  CarStatusEnum,
  PaymentStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";

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
      "/business",
      [this.authentication, this.roleGuard([UserRoleEnum.BUSINESS])],
      this.route(this.businessDashboard),
    );
  }

  async adminDashboard(req: Request, res: Response) {
    await expireAbandonedPendingBookings();
    await syncRentedCarStatuses();

    const [
      totalUsers,
      totalBusinesses,
      totalCars,
      pendingCars,
      approvedCars,
      totalBookings,
      pendingBookings,
      completedBookings,
      paidPayments,
    ] = await Promise.all([
      UserModel.countDocuments({ isDeleted: false }),
      BusinessModel.countDocuments({ isDeleted: false }),
      CarModel.countDocuments({ isDeleted: false }),
      CarModel.countDocuments({
        isDeleted: false,
        status: CarStatusEnum.PENDING,
      }),
      CarModel.countDocuments({
        isDeleted: false,
        status: CarStatusEnum.APPROVED,
      }),
      BookingModel.countDocuments({ isDeleted: false }),
      BookingModel.countDocuments({
        isDeleted: false,
        status: BookingStatusEnum.PENDING,
      }),
      BookingModel.countDocuments({
        isDeleted: false,
        status: BookingStatusEnum.COMPLETED,
      }),
      PaymentModel.find({
        status: PaymentStatusEnum.PAID,
      }),
    ]);

    const revenue = paidPayments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        totalUsers,
        totalBusinesses,
        totalCars,
        pendingCars,
        approvedCars,
        totalBookings,
        pendingBookings,
        completedBookings,
        revenue,
      },
    });
  }

  async businessDashboard(req: Request, res: Response) {
    const authUser = (req as any).user;
    await expireAbandonedPendingBookings();
    await syncRentedCarStatuses();

    const business = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
    }

    const cars = await CarModel.find({
      businessId: business._id,
      isDeleted: false,
    }).select("_id");

    const carIds = cars.map((car) => car._id);

    const bookings = await BookingModel.find({
      businessId: business._id,
      isDeleted: false,
    }).select("_id");

    const bookingIds = bookings.map((booking) => booking._id);

    const [
      totalCars,
      pendingCars,
      approvedCars,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      paidPayments,
    ] = await Promise.all([
      CarModel.countDocuments({
        businessId: business._id,
        isDeleted: false,
      } as any),
      CarModel.countDocuments({
        businessId: business._id,
        isDeleted: false,
        status: CarStatusEnum.PENDING,
      } as any),
      CarModel.countDocuments({
        businessId: business._id,
        isDeleted: false,
        status: CarStatusEnum.APPROVED,
      } as any),
      BookingModel.countDocuments({
        businessId: business._id,
        isDeleted: false,
      } as any),
      BookingModel.countDocuments({
        businessId: business._id,
        isDeleted: false,
        status: BookingStatusEnum.PENDING,
      } as any),
      BookingModel.countDocuments({
        businessId: business._id,
        isDeleted: false,
        status: BookingStatusEnum.CONFIRMED,
      } as any),
      BookingModel.countDocuments({
        businessId: business._id,
        isDeleted: false,
        status: BookingStatusEnum.COMPLETED,
      } as any),
      PaymentModel.find({
        bookingId: { $in: bookingIds },
        status: PaymentStatusEnum.PAID,
      }),
    ]);

    const revenue = paidPayments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        business,
        totalCars,
        pendingCars,
        approvedCars,
        totalBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        revenue,
      },
    });
  }
}

export default new DashboardRoute().router;
