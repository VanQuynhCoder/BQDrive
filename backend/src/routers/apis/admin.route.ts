import bcrypt from "bcryptjs";
import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserModel } from "../../models/user/user.model";
import { BusinessModel } from "../../models/business/business.model";
import { CarModel } from "../../models/car/car.model";
import { BookingModel } from "../../models/booking/booking.model";
import { sendOtpMail } from "../../helper/mail.helper";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import {
  BookingStatusEnum,
  BusinessTypeEnum,
  UserRoleEnum,
} from "../../constants/model.const";

const ACTIVE_BOOKING_STATUSES = [
  BookingStatusEnum.PENDING,
  BookingStatusEnum.CONFIRMED,
];
const TEMP_BUSINESS_NAME = "TEMP_BUSINESS";
const TEMP_BUSINESS_PASSWORD = "TEMP_BUSINESS_PASSWORD";

class AdminRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.get(
      "/users",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getUsers),
    );

    this.router.post(
      "/users/block/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.blockUser),
    );

    this.router.post(
      "/users/unblock/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.unblockUser),
    );

    this.router.delete(
      "/users/delete/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.deleteUser),
    );

    this.router.get(
      "/businesses",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getBusinesses),
    );

    this.router.post(
      "/business/send-otp",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.sendBusinessOtp),
    );

    this.router.post(
      "/business/verify-otp",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.verifyBusinessOtp),
    );

    this.router.post(
      "/business/create",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.createBusiness),
    );

    this.router.post(
      "/business/block/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.blockBusiness),
    );

    this.router.post(
      "/business/unblock/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.unblockBusiness),
    );

    this.router.delete(
      "/business/delete/:id",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.deleteBusiness),
    );
  }

  private normalizeEmail(email: unknown) {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  }

  private isTempBusinessUser(user: { name?: string; role?: string }) {
    return (
      user.name === TEMP_BUSINESS_NAME &&
      String(user.role).toUpperCase() === UserRoleEnum.BUSINESS
    );
  }

  async getBusinesses(req: Request, res: Response) {
    const businesses = await BusinessModel.find({
      isDeleted: false,
    })
      .populate("userId", "-password -otpCode")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { businesses },
    });
  }

  async sendBusinessOtp(req: Request, res: Response) {
    const email = this.normalizeEmail(req.body.email);

    if (!email) {
      throw ErrorHelper.requestDataInvalid("Thiếu email doanh nghiệp");
    }

    const existedUser = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (existedUser && !this.isTempBusinessUser(existedUser)) {
      throw ErrorHelper.userExisted();
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpireAt = new Date(Date.now() + 5 * 60 * 1000);
    const temporaryPassword = await bcrypt.hash(
      `${TEMP_BUSINESS_PASSWORD}_${otp}`,
      10,
    );

    if (existedUser) {
      existedUser.name = TEMP_BUSINESS_NAME;
      existedUser.password = temporaryPassword;
      existedUser.role = UserRoleEnum.BUSINESS;
      existedUser.isVerified = false;
      existedUser.otpCode = otp;
      existedUser.otpExpireAt = otpExpireAt;
      await existedUser.save();
    } else {
      await UserModel.create({
        name: TEMP_BUSINESS_NAME,
        email,
        password: temporaryPassword,
        role: UserRoleEnum.BUSINESS,
        isVerified: false,
        otpCode: otp,
        otpExpireAt,
      });
    }

    await sendOtpMail(email, otp);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "OTP đã được gửi tới email doanh nghiệp",
      data: null,
    });
  }

  async verifyBusinessOtp(req: Request, res: Response) {
    const email = this.normalizeEmail(req.body.email);
    const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";

    if (!email || !otp) {
      throw ErrorHelper.requestDataInvalid("Thiếu email hoặc OTP");
    }

    const user = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (!user || !this.isTempBusinessUser(user)) {
      throw ErrorHelper.requestDataInvalid(
        "Vui lòng gửi OTP cho email doanh nghiệp trước",
      );
    }

    if (!user.otpCode || !user.otpExpireAt) {
      throw ErrorHelper.requestDataInvalid("Vui lòng gửi OTP trước");
    }

    if (user.otpCode !== otp) {
      throw ErrorHelper.requestDataInvalid("OTP không chính xác");
    }

    if (user.otpExpireAt < new Date()) {
      throw ErrorHelper.requestDataInvalid("OTP đã hết hạn");
    }

    user.isVerified = true;
    user.set("otpCode", undefined);
    user.set("otpExpireAt", undefined);

    await user.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xác thực OTP thành công",
      data: null,
    });
  }

  async createBusiness(req: Request, res: Response) {
    const businessName =
      typeof req.body.businessName === "string"
        ? req.body.businessName.trim()
        : "";
    const email = this.normalizeEmail(req.body.email);
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const address =
      typeof req.body.address === "string" ? req.body.address.trim() : "";
    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim()
        : "";

    if (!businessName || !email || !password || !phone || !address) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu businessName, email, password, phone hoặc address",
      );
    }

    const user = await UserModel.findOne({
      email,
      isDeleted: false,
    });

    if (!user || !this.isTempBusinessUser(user)) {
      throw ErrorHelper.requestDataInvalid(
        "Vui lòng gửi và xác thực OTP cho email doanh nghiệp trước",
      );
    }

    if (!user.isVerified) {
      throw ErrorHelper.requestDataInvalid(
        "Email doanh nghiệp chưa được xác thực OTP",
      );
    }

    const existedBusiness = await BusinessModel.findOne({
      userId: user._id,
      isDeleted: false,
    });

    if (existedBusiness) {
      throw ErrorHelper.requestDataInvalid("Doanh nghiệp đã tồn tại");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.name = businessName;
    user.password = hashedPassword;
    user.phone = phone;
    user.role = UserRoleEnum.BUSINESS;
    user.isVerified = true;
    user.set("otpCode", undefined);
    user.set("otpExpireAt", undefined);

    await user.save();

    const business = await BusinessModel.create({
      userId: user._id,
      businessName,
      phone,
      address,
      description,
      businessType: BusinessTypeEnum.COMPANY,
      isApproved: true,
      isRejected: false,
    });

    const populatedBusiness = await business.populate(
      "userId",
      "-password -otpCode",
    );
    const createdUser = await UserModel.findById(user._id).select(
      "-password -otpCode",
    );

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Tạo tài khoản doanh nghiệp thành công",
      data: {
        user: createdUser,
        business: populatedBusiness,
      },
    });
  }

  async getUsers(req: Request, res: Response) {
    const { role, keyword, isBlocked } = req.query;

    const filter: any = {
      isDeleted: false,
      role: { $ne: UserRoleEnum.ADMIN },
    };

    if (role) filter.role = role;
    if (typeof isBlocked !== "undefined") {
      filter.isBlocked = isBlocked === "true";
    }

    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { email: { $regex: keyword, $options: "i" } },
        { phone: { $regex: keyword, $options: "i" } },
      ];
    }

    const users = await UserModel.find(filter)
      .select("-password -otpCode")
      .populate("blockedBy", "name email role")
      .populate("deletedBy", "name email role")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { users },
    });
  }

  private async checkUserHasActiveBooking(userId: string) {
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      userId,
      status: { $in: ACTIVE_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    return !!booking;
  }

  private async checkBusinessHasActiveBooking(businessId: string) {
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      businessId,
      status: { $in: ACTIVE_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    return !!booking;
  }

  async blockUser(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { reason } = req.body;

    if (!reason) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập lý do khóa tài khoản");
    }

    const user = await UserModel.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!user) throw ErrorHelper.userNotExist();

    if (user.role === UserRoleEnum.ADMIN) {
      throw ErrorHelper.permissionDeny();
    }

    const hasActiveBooking = await this.checkUserHasActiveBooking(id);

    if (hasActiveBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Không thể khóa tài khoản đang có booking PENDING hoặc CONFIRMED",
      );
    }

    user.isBlocked = true;
    user.blockedReason = reason;
    user.blockedAt = new Date();
    user.blockedBy = authUser.userId;

    await user.save();

    if (user.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: user._id,
        isDeleted: false,
      });

      if (business) {
        await CarModel.updateMany(
          {
            businessId: business._id,
            isDeleted: false,
          },
          {
            isHidden: true,
          } as any,
        );
      }
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Khóa tài khoản thành công",
      data: { user },
    });
  }

  async unblockUser(req: Request, res: Response) {
    const id = String(req.params.id);

    const user = await UserModel.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!user) throw ErrorHelper.userNotExist();

    if (user.role === UserRoleEnum.ADMIN) {
      throw ErrorHelper.permissionDeny();
    }

    user.isBlocked = false;
    user.blockedReason = "";
    user.set("blockedAt", undefined);
    user.set("blockedBy", undefined);

    await user.save();

    if (user.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: user._id,
        isDeleted: false,
      });

      if (business) {
        await CarModel.updateMany(
          {
            businessId: business._id,
            isDeleted: false,
          },
          {
            isHidden: false,
          } as any,
        );
      }
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Mở khóa tài khoản thành công",
      data: { user },
    });
  }

  async deleteUser(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { reason } = req.body;

    if (!reason) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập lý do xóa tài khoản");
    }

    const user = await UserModel.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!user) throw ErrorHelper.userNotExist();

    if (user.role === UserRoleEnum.ADMIN) {
      throw ErrorHelper.permissionDeny();
    }

    const hasActiveBooking = await this.checkUserHasActiveBooking(id);

    if (hasActiveBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Không thể xóa tài khoản đang có booking PENDING hoặc CONFIRMED",
      );
    }

    if (user.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: user._id,
        isDeleted: false,
      });

      if (business) {
        const businessHasActiveBooking =
          await this.checkBusinessHasActiveBooking(String(business._id));

        if (businessHasActiveBooking) {
          throw ErrorHelper.requestDataInvalid(
            "Không thể xóa doanh nghiệp đang có booking PENDING hoặc CONFIRMED",
          );
        }

        business.isDeleted = true;
        await business.save();

        await CarModel.updateMany(
          {
            businessId: business._id,
            isDeleted: false,
          },
          {
            isDeleted: true,
          },
        );
      }
    }

    user.isDeleted = true;
    user.deletedReason = reason;
    user.deletedAt = new Date();
    user.deletedBy = authUser.userId;

    await user.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xóa mềm tài khoản thành công",
      data: { user },
    });
  }

  async blockBusiness(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { reason } = req.body;

    if (!reason) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập lý do khóa doanh nghiệp");
    }

    const business = await BusinessModel.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
    }

    const user = await UserModel.findOne({
      _id: business.userId,
      isDeleted: false,
    });

    if (!user) throw ErrorHelper.userNotExist();

    user.isBlocked = true;
    user.blockedReason = reason;
    user.blockedAt = new Date();
    user.blockedBy = authUser.userId;

    await user.save();

    await CarModel.updateMany(
      {
        businessId: business._id,
        isDeleted: false,
      },
      {
        isHidden: true,
      } as any,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Khóa doanh nghiệp thành công, toàn bộ xe đã được ẩn",
      data: { business, user },
    });
  }

  async unblockBusiness(req: Request, res: Response) {
    const id = String(req.params.id);

    const business = await BusinessModel.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
    }

    const user = await UserModel.findOne({
      _id: business.userId,
      isDeleted: false,
    });

    if (!user) throw ErrorHelper.userNotExist();

    user.isBlocked = false;
    user.blockedReason = "";
    user.set("blockedAt", undefined);
    user.set("blockedBy", undefined);

    await user.save();

    await CarModel.updateMany(
      {
        businessId: business._id,
        isDeleted: false,
      },
      {
        isHidden: false,
      } as any,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Mở khóa doanh nghiệp thành công, xe đã được hiển thị lại",
      data: { business, user },
    });
  }

  async deleteBusiness(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { reason } = req.body;

    if (!reason) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập lý do xóa doanh nghiệp");
    }

    const business = await BusinessModel.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!business) {
      throw ErrorHelper.recordNotFound("Business");
    }

    const hasActiveBooking = await this.checkBusinessHasActiveBooking(id);

    if (hasActiveBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Không thể xóa doanh nghiệp đang có booking PENDING hoặc CONFIRMED",
      );
    }

    const user = await UserModel.findOne({
      _id: business.userId,
      isDeleted: false,
    });

    if (!user) throw ErrorHelper.userNotExist();

    business.isDeleted = true;
    await business.save();

    await CarModel.updateMany(
      {
        businessId: business._id,
        isDeleted: false,
      },
      {
        isDeleted: true,
      },
    );

    user.isDeleted = true;
    user.deletedReason = reason;
    user.deletedAt = new Date();
    user.deletedBy = authUser.userId;

    await user.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xóa mềm doanh nghiệp thành công",
      data: { business, user },
    });
  }
}

export default new AdminRoute().router;
