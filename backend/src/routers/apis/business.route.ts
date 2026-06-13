import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserModel } from "../../models/user/user.model";
import { BusinessModel } from "../../models/business/business.model";
import { BookingModel } from "../../models/booking/booking.model";
import { CarModel } from "../../models/car/car.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { syncRentedCarStatuses } from "../../helper/car-status.helper";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import {
  BookingStatusEnum,
  BusinessTypeEnum,
  CarStatusEnum,
  PaymentStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";

class BusinessRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/dashboard",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.getDashboard),
    );

    this.router.get(
      "/profile",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.getProfile),
    );

    this.router.post(
      "/profile",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.PRIVATE_OWNER]),
      ],
      this.route(this.updateProfile),
    );

    this.router.post(
      "/createBusinessAccount",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.createBusinessAccount),
    );

    this.router.post(
      "/requestBusiness",
      [this.authentication, this.roleGuard([UserRoleEnum.CUSTOMER])],
      this.route(this.requestBusiness),
    );

    this.router.get(
      "/getAllBusiness",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getAllBusiness),
    );

    this.router.get(
      "/getBusinessRequests",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getBusinessRequests),
    );

    this.router.post(
      "/approveBusiness/:businessId",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.approveBusiness),
    );

    this.router.post(
      "/rejectBusiness/:businessId",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.rejectBusiness),
    );
  }

  private async getBusinessByAuthUser(authUser: any) {
    let business = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (!business && authUser.role === UserRoleEnum.PRIVATE_OWNER) {
      const user = await UserModel.findOne({
        _id: authUser.userId,
        isDeleted: false,
      });

      if (!user) {
        throw ErrorHelper.userNotExist();
      }

      business = await BusinessModel.create({
        userId: authUser.userId,
        businessName: user.name || "Chủ xe tư nhân",
        businessType: BusinessTypeEnum.INDIVIDUAL,
        isApproved: true,
        ...(user.phone ? { phone: user.phone } : {}),
      });
    }

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
    }

    if (authUser.role === UserRoleEnum.PRIVATE_OWNER) {
      let shouldSave = false;

      if (!business.isApproved) {
        business.isApproved = true;
        shouldSave = true;
      }

      if (business.businessType !== BusinessTypeEnum.INDIVIDUAL) {
        business.businessType = BusinessTypeEnum.INDIVIDUAL;
        shouldSave = true;
      }

      if (shouldSave) {
        await business.save();
      }
    }

    await business.populate("userId", "-password -otpCode");

    return business;
  }

  private paidRevenuePipeline(
    businessId: unknown,
    matchDate?: Record<string, Date>,
  ) {
    return [
      {
        $match: {
          status: PaymentStatusEnum.PAID,
          ...(matchDate ? { paidAt: matchDate } : {}),
        },
      },
      {
        $lookup: {
          from: "bookings",
          localField: "bookingId",
          foreignField: "_id",
          as: "booking",
        },
      },
      { $unwind: "$booking" },
      { $match: { "booking.businessId": businessId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ];
  }

  async getDashboard(req: Request, res: Response) {
    const authUser = (req as any).user;
    const business = await this.getBusinessByAuthUser(authUser);
    await expireAbandonedPendingBookings();
    await syncRentedCarStatuses();

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      totalCars,
      approvedCars,
      pendingCars,
      rejectedCars,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      revenueToday,
      revenueThisMonth,
      totalRevenue,
    ] = await Promise.all([
      CarModel.countDocuments({ businessId: business._id, isDeleted: false }),
      CarModel.countDocuments({
        businessId: business._id,
        status: CarStatusEnum.APPROVED,
        isDeleted: false,
      }),
      CarModel.countDocuments({
        businessId: business._id,
        status: CarStatusEnum.PENDING,
        isDeleted: false,
      }),
      CarModel.countDocuments({
        businessId: business._id,
        status: CarStatusEnum.REJECTED,
        isDeleted: false,
      }),
      BookingModel.countDocuments({
        businessId: business._id,
        isDeleted: false,
      }),
      BookingModel.countDocuments({
        businessId: business._id,
        status: {
          $in: [
            BookingStatusEnum.REQUESTED, // Trạng thái mới: chờ chủ xe duyệt
            BookingStatusEnum.PENDING, // Trạng thái cũ
          ],
        },
        isDeleted: false,
      }),
      BookingModel.countDocuments({
        businessId: business._id,
        status: {
          $in: [
            BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã duyệt, chờ thanh toán
            BookingStatusEnum.PAYMENT_PENDING, // Khách đang thanh toán
            BookingStatusEnum.PAID, // Đã thanh toán
            BookingStatusEnum.CONFIRMED, // Trạng thái cũ
          ],
        },
        isDeleted: false,
      }),
      BookingModel.countDocuments({
        businessId: business._id,
        status: BookingStatusEnum.COMPLETED,
        isDeleted: false,
      }),
      PaymentModel.aggregate(
        this.paidRevenuePipeline(business._id, {
          $gte: startOfToday,
          $lt: startOfTomorrow,
        }),
      ),
      PaymentModel.aggregate(
        this.paidRevenuePipeline(business._id, {
          $gte: startOfMonth,
          $lt: startOfNextMonth,
        }),
      ),
      PaymentModel.aggregate(this.paidRevenuePipeline(business._id)),
    ]);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        totalCars,
        approvedCars,
        pendingCars,
        rejectedCars,
        totalBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        revenueToday: revenueToday[0]?.total || 0,
        revenueThisMonth: revenueThisMonth[0]?.total || 0,
        totalRevenue: totalRevenue[0]?.total || 0,
        profile: business,
      },
    });
  }

  async getProfile(req: Request, res: Response) {
    const authUser = (req as any).user;
    const business = await this.getBusinessByAuthUser(authUser);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { business },
    });
  }

  async updateProfile(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { businessName, phone, address, description } = req.body;

    if (!businessName || !phone || !address) {
      throw ErrorHelper.requestDataInvalid(
        "Thieu businessName, phone hoac address",
      );
    }

    const business = await BusinessModel.findOneAndUpdate(
      {
        userId: authUser.userId,
        isDeleted: false,
      },
      {
        businessName,
        phone,
        address,
        description,
      },
      { new: true },
    ).populate("userId", "-password -otpCode");

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
    }

    await UserModel.findByIdAndUpdate(authUser.userId, {
      name: businessName,
      phone,
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Cap nhat thong tin thanh cong",
      data: { business },
    });
  }

  async createBusinessAccount(req: Request, res: Response) {
    throw ErrorHelper.requestDataInvalid(
      "Vui long tao doanh nghiep bang luong OTP tai /admin/business/create",
    );
  }

  async requestBusiness(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { businessName, phone, address, description } = req.body;

    if (!businessName) {
      throw ErrorHelper.requestDataInvalid("Thieu businessName");
    }

    const existedRequest = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (existedRequest) {
      throw ErrorHelper.requestDataInvalid(
        "Ban da gui yeu cau hoac da la Business",
      );
    }

    const business = await BusinessModel.create({
      userId: authUser.userId,
      businessName,
      phone,
      address,
      description,
      businessType: BusinessTypeEnum.INDIVIDUAL,
      isApproved: false,
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Gui yeu cau tro thanh Business thanh cong",
      data: { business },
    });
  }

  async getAllBusiness(req: Request, res: Response) {
    const businesses = await BusinessModel.find({
      isDeleted: false,
    })
      .populate("userId", "-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { businesses },
    });
  }

  async getBusinessRequests(req: Request, res: Response) {
    const businesses = await BusinessModel.find({
      isApproved: false,
      isRejected: false,
      isDeleted: false,
      businessType: BusinessTypeEnum.INDIVIDUAL,
    })
      .populate("userId", "-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { businesses },
    });
  }

  async approveBusiness(req: Request, res: Response) {
    const { businessId } = req.params;

    const business = await BusinessModel.findByIdAndUpdate(
      businessId,
      {
        isApproved: true,
        isRejected: false,
        rejectReason: "",
      },
      { new: true },
    );

    if (!business || business.isDeleted) {
      throw ErrorHelper.recordNotFound("Business");
    }

    await UserModel.findByIdAndUpdate(business.userId, {
      role: UserRoleEnum.BUSINESS,
    });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Duyet Business thanh cong",
      data: { business },
    });
  }

  async rejectBusiness(req: Request, res: Response) {
    const { businessId } = req.params;
    const { rejectReason } = req.body;

    const business = await BusinessModel.findByIdAndUpdate(
      businessId,
      {
        isApproved: false,
        isRejected: true,
        rejectReason,
      },
      { new: true },
    );

    if (!business || business.isDeleted) {
      throw ErrorHelper.recordNotFound("Business");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Tu choi Business thanh cong",
      data: { business },
    });
  }
}

export default new BusinessRoute().router;
