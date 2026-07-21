import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { BusinessModel } from "../../models/business/business.model";
import { CarModel } from "../../models/car/car.model";
import { BookingModel } from "../../models/booking/booking.model";
import {
  BookingStatusEnum,
  CarStatusEnum,
  OwnerTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

type NotificationSeverity = "info" | "warning" | "danger" | "success";

type NotificationItem = {
  key: string;
  label: string;
  count: number;
  path: string;
  severity: NotificationSeverity;
};

class NotificationRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/summary",
      [this.authentication],
      this.route(this.getSummary),
    );
  }

  private createResponse(items: NotificationItem[]) {
    const visibleItems = items.filter((item) => item.count > 0);

    return {
      total: visibleItems.reduce((sum, item) => sum + item.count, 0),
      items: visibleItems,
    };
  }

  private businessCarFilter(businessId: unknown): any {
    return {
      isDeleted: false,
      $or: [
        { ownerId: businessId, ownerType: OwnerTypeEnum.BUSINESS },
        { businessId },
      ],
    };
  }

  private businessBookingFilter(businessId: unknown): any {
    return {
      isDeleted: false,
      $or: [
        { ownerId: businessId, ownerType: OwnerTypeEnum.BUSINESS },
        { businessId },
      ],
    };
  }

  private userConsignmentCarFilter(userId: unknown): any {
    return {
      isDeleted: false,
      ownerId: userId,
      ownerType: OwnerTypeEnum.USER,
    };
  }

  private userConsignmentBookingFilter(userId: unknown): any {
    return {
      isDeleted: false,
      ownerId: userId,
      ownerType: OwnerTypeEnum.USER,
    };
  }

  private async buildAdminItems(): Promise<NotificationItem[]> {
    const [pendingCars, pendingBusiness] = await Promise.all([
      CarModel.countDocuments({
        isDeleted: false,
        status: CarStatusEnum.PENDING,
      }),
      BusinessModel.countDocuments({
        isDeleted: false,
        isApproved: false,
        isRejected: { $ne: true },
      }),
    ]);

    return [
      {
        key: "pendingCars",
        label: "Xe chờ duyệt",
        count: pendingCars,
        path: "/admin/cars",
        severity: "warning",
      },
      {
        key: "pendingBusiness",
        label: "Doanh nghiệp chờ duyệt",
        count: pendingBusiness,
        path: "/admin/businesses",
        severity: "warning",
      },
    ];
  }

  private async buildBusinessItems(userId: unknown): Promise<NotificationItem[]> {
    const business = await BusinessModel.findOne({
      userId: userId as any,
      isDeleted: false,
    }).select("_id");

    if (!business) {
      return [];
    }

    const carFilter = this.businessCarFilter(business._id);
    const bookingFilter = this.businessBookingFilter(business._id);

    const [
      pendingCars,
      rejectedCars,
      newBookingRequests,
      approvedAwaitingPayment,
      paidAwaitingHandover,
      inProgressNeedComplete,
    ] = await Promise.all([
      CarModel.countDocuments({
        ...carFilter,
        status: CarStatusEnum.PENDING,
      }),
      CarModel.countDocuments({
        ...carFilter,
        status: CarStatusEnum.REJECTED,
      }),
      BookingModel.countDocuments({
        ...bookingFilter,
        status: {
          $in: [BookingStatusEnum.REQUESTED, BookingStatusEnum.PENDING],
        },
      }),
      BookingModel.countDocuments({
        ...bookingFilter,
        status: {
          $in: [
            BookingStatusEnum.OWNER_APPROVED,
            BookingStatusEnum.PAYMENT_PENDING,
            BookingStatusEnum.WAITING_PAYMENT,
          ],
        },
      }),
      BookingModel.countDocuments({
        ...bookingFilter,
        status: { $in: [BookingStatusEnum.PAID, BookingStatusEnum.CONFIRMED] },
      }),
      BookingModel.countDocuments({
        ...bookingFilter,
        status: BookingStatusEnum.IN_PROGRESS,
      }),
    ]);

    return [
      {
        key: "pendingCars",
        label: "Xe doanh nghiệp chờ duyệt",
        count: pendingCars,
        path: "/business/cars",
        severity: "warning",
      },
      {
        key: "rejectedCars",
        label: "Xe doanh nghiệp bị từ chối",
        count: rejectedCars,
        path: "/business/cars",
        severity: "danger",
      },
      {
        key: "newBookingRequests",
        label: "Booking mới cần duyệt",
        count: newBookingRequests,
        path: "/business/bookings",
        severity: "warning",
      },
      {
        key: "approvedAwaitingPayment",
        label: "Booking đã duyệt chờ khách thanh toán",
        count: approvedAwaitingPayment,
        path: "/business/bookings",
        severity: "info",
      },
      {
        key: "paidAwaitingHandover",
        label: "Booking cần bàn giao xe",
        count: paidAwaitingHandover,
        path: "/business/bookings",
        severity: "warning",
      },
      {
        key: "inProgressNeedComplete",
        label: "Booking cần hoàn tất",
        count: inProgressNeedComplete,
        path: "/business/bookings",
        severity: "success",
      },
    ];
  }

  private async buildUserItems(userId: unknown): Promise<NotificationItem[]> {
    const consignmentCarFilter = this.userConsignmentCarFilter(userId);
    const consignmentBookingFilter = this.userConsignmentBookingFilter(userId);

    const [
      bookingOwnerApproved,
      paymentPending,
      activeTrips,
      rejectedBookings,
      consignmentPendingCars,
      consignmentRejectedCars,
      consignmentBookingRequests,
      consignmentPaidAwaitingHandover,
      consignmentInProgressNeedComplete,
    ] = await Promise.all([
      BookingModel.countDocuments({
        isDeleted: false,
        userId: userId as any,
        status: {
          $in: [BookingStatusEnum.OWNER_APPROVED, BookingStatusEnum.CONFIRMED],
        },
      }),
      BookingModel.countDocuments({
        isDeleted: false,
        userId: userId as any,
        status: {
          $in: [
            BookingStatusEnum.PAYMENT_PENDING,
            BookingStatusEnum.WAITING_PAYMENT,
          ],
        },
      }),
      BookingModel.countDocuments({
        isDeleted: false,
        userId: userId as any,
        status: BookingStatusEnum.IN_PROGRESS,
      }),
      BookingModel.countDocuments({
        isDeleted: false,
        userId: userId as any,
        status: BookingStatusEnum.REJECTED,
      }),
      CarModel.countDocuments({
        ...consignmentCarFilter,
        status: CarStatusEnum.PENDING,
      }),
      CarModel.countDocuments({
        ...consignmentCarFilter,
        status: CarStatusEnum.REJECTED,
      }),
      BookingModel.countDocuments({
        ...consignmentBookingFilter,
        status: {
          $in: [BookingStatusEnum.REQUESTED, BookingStatusEnum.PENDING],
        },
      }),
      BookingModel.countDocuments({
        ...consignmentBookingFilter,
        status: { $in: [BookingStatusEnum.PAID, BookingStatusEnum.CONFIRMED] },
      }),
      BookingModel.countDocuments({
        ...consignmentBookingFilter,
        status: BookingStatusEnum.IN_PROGRESS,
      }),
    ]);

    return [
      {
        key: "bookingOwnerApproved",
        label: "Booking đã được duyệt, cần thanh toán",
        count: bookingOwnerApproved,
        path: "/my-contracts",
        severity: "warning",
      },
      {
        key: "paymentPending",
        label: "Thanh toán đang chờ xử lý",
        count: paymentPending,
        path: "/my-payments",
        severity: "warning",
      },
      {
        key: "activeTrips",
        label: "Chuyến thuê đang diễn ra",
        count: activeTrips,
        path: "/my-contracts",
        severity: "info",
      },
      {
        key: "rejectedBookings",
        label: "Booking bị từ chối",
        count: rejectedBookings,
        path: "/my-contracts",
        severity: "danger",
      },
      {
        key: "consignmentPendingCars",
        label: "Xe ký gửi chờ duyệt",
        count: consignmentPendingCars,
        path: "/consignment/cars",
        severity: "warning",
      },
      {
        key: "consignmentRejectedCars",
        label: "Xe ký gửi bị từ chối",
        count: consignmentRejectedCars,
        path: "/consignment/cars",
        severity: "danger",
      },
      {
        key: "consignmentBookingRequests",
        label: "Booking xe ký gửi cần duyệt",
        count: consignmentBookingRequests,
        path: "/consignment/bookings",
        severity: "warning",
      },
      {
        key: "consignmentPaidAwaitingHandover",
        label: "Xe ký gửi cần bàn giao",
        count: consignmentPaidAwaitingHandover,
        path: "/consignment/bookings",
        severity: "warning",
      },
      {
        key: "consignmentInProgressNeedComplete",
        label: "Booking ký gửi cần hoàn tất",
        count: consignmentInProgressNeedComplete,
        path: "/consignment/bookings",
        severity: "success",
      },
    ];
  }

  async getSummary(req: Request, res: Response) {
    const authUser = (req as any).user;
    const role = String(authUser.role || "").toUpperCase();

    let items: NotificationItem[] = [];

    if (role === UserRoleEnum.ADMIN) {
      items = await this.buildAdminItems();
    }

    if (role === UserRoleEnum.BUSINESS) {
      items = await this.buildBusinessItems(authUser.userId);
    }

    if (role === UserRoleEnum.USER) {
      items = await this.buildUserItems(authUser.userId);
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: this.createResponse(items),
    });
  }
}

export default new NotificationRoute().router;
