import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserModel } from "../../models/user/user.model";
import { BusinessModel } from "../../models/business/business.model";
import { BookingModel } from "../../models/booking/booking.model";
import { CarModel } from "../../models/car/car.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { syncRentedCarStatuses } from "../../helper/car-status.helper";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import { cleanAddressText } from "../../helper/address.helper";
import {
  BookingStatusEnum,
  BusinessTypeEnum,
  CarStatusEnum,
  PaymentStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { validatePhone } from "../../utils/validators";

class BusinessRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/dashboard",
      [this.authentication, this.roleGuard([UserRoleEnum.BUSINESS])],
      this.route(this.getDashboard),
    );

    this.router.get(
      "/profile",
      [this.authentication, this.roleGuard([UserRoleEnum.BUSINESS])],
      this.route(this.getProfile),
    );

    this.router.post(
      "/profile",
      [this.authentication, this.roleGuard([UserRoleEnum.BUSINESS])],
      this.route(this.updateProfile),
    );

    this.router.patch(
      "/profile",
      [this.authentication, this.roleGuard([UserRoleEnum.BUSINESS])],
      this.route(this.updateProfile),
    );

    this.router.post(
      "/createBusinessAccount",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.createBusinessAccount),
    );

    this.router.post(
      "/requestBusiness",
      [this.authentication, this.roleGuard([UserRoleEnum.USER])],
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
    const business = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
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
    const businessName =
      typeof req.body.businessName === "string"
        ? req.body.businessName.trim()
        : "";
    const phone = validatePhone(req.body.phone);
    const address =
      typeof req.body.address === "string" ? req.body.address.trim() : "";
    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim()
        : "";
    const logo = cleanAddressText(req.body.logo);
    const city = cleanAddressText(req.body.city);
    const province = cleanAddressText(req.body.province) || city;
    const district = cleanAddressText(req.body.district);
    const ward = cleanAddressText(req.body.ward);

    if (!businessName || !phone || !address) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu businessName, phone hoặc address",
      );
    }

    const business = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
    }

    business.businessName = businessName;
    business.phone = phone;
    business.address = address;
    business.city = city;
    business.province = province;
    business.district = district;
    business.ward = ward;
    business.description = description;
    business.logo = logo;
    await business.save();

    await UserModel.findByIdAndUpdate(authUser.userId, {
      name: businessName,
      phone,
    });

    const updatedBusiness = await BusinessModel.findOne(
      {
        userId: authUser.userId,
        isDeleted: false,
      },
    ).populate("userId", "-password -otpCode");

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Cập nhật thông tin thành công",
      data: { business: updatedBusiness },
    });
  }

  async createBusinessAccount(req: Request, res: Response) {
    throw ErrorHelper.requestDataInvalid(
      "Vui lòng tạo doanh nghiệp bằng luồng OTP tại /admin/business/create",
    );
  }

  async requestBusiness(req: Request, res: Response) {
    const authUser = (req as any).user;
    const {
      businessName,
      address,
      description,
      city,
      province,
      district,
      ward,
    } = req.body;
    const phone = validatePhone(req.body.phone);

    if (!businessName) {
      throw ErrorHelper.requestDataInvalid("Thiếu businessName");
    }

    const existedRequest = await BusinessModel.findOne({
      userId: authUser.userId,
      isDeleted: false,
    });

    if (existedRequest) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn đã gửi yêu cầu hoặc đã là Business",
      );
    }

    const business = await BusinessModel.create({
      userId: authUser.userId,
      businessName,
      phone,
      address,
      city: cleanAddressText(city),
      province: cleanAddressText(province) || cleanAddressText(city),
      district: cleanAddressText(district),
      ward: cleanAddressText(ward),
      description,
      businessType: BusinessTypeEnum.INDIVIDUAL,
      isApproved: false,
    });

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Gửi yêu cầu trở thành Business thành công",
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
      message: "Duyệt Business thành công",
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
      message: "Từ chối Business thành công",
      data: { business },
    });
  }
}

export default new BusinessRoute().router;
