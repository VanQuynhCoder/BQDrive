import bcrypt from "bcryptjs";
import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { UserModel } from "../../models/user/user.model";
import { BusinessModel } from "../../models/business/business.model";
import { CarModel } from "../../models/car/car.model";
import { BookingModel } from "../../models/booking/booking.model";
import { ContractModel } from "../../models/contract/contract.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { ReviewModel, ReviewStatusEnum } from "../../models/review/review.model";
import { sendOtpMail } from "../../helper/mail.helper";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import { cleanAddressText } from "../../helper/address.helper";
import {
  BookingStatusEnum,
  BusinessTypeEnum,
  ContractStatusEnum,
  OwnerTypeEnum,
  PaymentStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { validatePhone } from "../../utils/validators";

const ACTIVE_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED,
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.IN_PROGRESS,
  BookingStatusEnum.PENDING,
  BookingStatusEnum.WAITING_PAYMENT,
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

    this.router.get(
      "/cars/map",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getCarsMap),
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

    this.router.get(
      "/reviews",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.getReviews),
    );

    this.router.patch(
      "/reviews/:id/hide",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.hideReview),
    );

    this.router.patch(
      "/reviews/:id/show",
      [this.authentication, this.roleGuard([UserRoleEnum.ADMIN])],
      this.route(this.showReview),
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

  private assertObjectId(id: string, message: string) {
    if (!/^[a-f\d]{24}$/i.test(id)) {
      throw ErrorHelper.requestDataInvalid(message);
    }
  }

  private toAdminReviewItem(review: any) {
    return {
      id: review._id,
      bookingId: review.bookingId?._id || review.bookingId,
      bookingCode: String(review.bookingId?._id || review.bookingId || "")
        .slice(-8)
        .toUpperCase(),
      carName: review.carNameSnapshot || review.carId?.name || "Xe",
      licensePlate: review.carId?.licensePlate || "",
      renterName: review.reviewerNameSnapshot || review.renterId?.name || "Khách thuê",
      renterEmail: review.renterId?.email || "",
      rating: review.rating,
      comment: review.comment || "",
      images: review.images || [],
      ownerReply: review.ownerReply || null,
      status: review.status,
      report: review.report || null,
      hiddenReason: review.hiddenReason || "",
      hiddenAt: review.hiddenAt,
      createdAt: review.createdAt,
    };
  }

  private getOwnerName(car: any) {
    if (car.adminOwnerInfo) {
      return car.adminOwnerInfo.name || "--";
    }

    if (car.ownerType === OwnerTypeEnum.BUSINESS) {
      return (
        car.ownerId?.businessName ||
        car.businessId?.businessName ||
        car.ownerId?.userId?.name ||
        "--"
      );
    }

    return car.ownerId?.name || "--";
  }

  private getOwnerEmail(car: any) {
    if (car.adminOwnerInfo) {
      return car.adminOwnerInfo.email || "--";
    }

    if (car.ownerType === OwnerTypeEnum.BUSINESS) {
      return (
        car.ownerId?.userId?.email ||
        car.businessId?.userId?.email ||
        car.ownerId?.email ||
        "--"
      );
    }

    return car.ownerId?.email || "--";
  }

  private getOwnerPhone(car: any) {
    if (car.adminOwnerInfo) {
      return car.adminOwnerInfo.phone || "";
    }

    if (car.ownerType === OwnerTypeEnum.BUSINESS) {
      return car.ownerId?.phone || car.businessId?.phone || car.ownerId?.userId?.phone || "";
    }

    return car.ownerId?.phone || "";
  }

  private getOwnerAddress(car: any) {
    if (car.adminOwnerInfo) {
      return car.adminOwnerInfo.address || "";
    }

    if (car.ownerType === OwnerTypeEnum.BUSINESS) {
      return (
        car.ownerId?.address ||
        car.businessId?.address ||
        car.ownerId?.userId?.address ||
        ""
      );
    }

    return car.ownerId?.address || "";
  }

  private toAdminMapCar(car: any) {
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
      ownerType: car.ownerType,
      ownerName: this.getOwnerName(car),
      ownerEmail: this.getOwnerEmail(car),
      ownerPhone: this.getOwnerPhone(car),
      ownerAddress: this.getOwnerAddress(car),
      images: [],
      lastLocationUpdatedAt: car.lastLocationUpdatedAt,
      locationUpdateCount: car.locationUpdateCount || 0,
    };
  }

  private getAdminOwnerInfo(car: any, lookups: {
    businesses: Map<string, any>;
    users: Map<string, any>;
  }) {
    if (car.ownerType === OwnerTypeEnum.BUSINESS) {
      const business =
        lookups.businesses.get(String(car.ownerId || "")) ||
        lookups.businesses.get(String(car.businessId || ""));
      const user = business?.userId || {};

      return {
        name: business?.businessName || user?.name || "--",
        email: user?.email || "",
        phone: business?.phone || user?.phone || "",
        address: business?.address || user?.address || "",
      };
    }

    const user = lookups.users.get(String(car.ownerId || ""));

    return {
      name: user?.name || "--",
      email: user?.email || "",
      phone: user?.phone || "",
      address: user?.address || "",
    };
  }

  async getCarsMap(req: Request, res: Response) {
    const cars = await CarModel.find({ isDeleted: false } as any)
      .select(
        [
          "_id",
          "name",
          "licensePlate",
          "brandId",
          "businessId",
          "ownerId",
          "ownerType",
          "ownerModel",
          "pickupAddress",
          "pickupFormattedAddress",
          "pickupLat",
          "pickupLng",
          "pickupNote",
          "address",
          "locationNote",
          "status",
          "lastLocationUpdatedAt",
          "locationUpdateCount",
        ].join(" "),
      )
      .populate("brandId", "name")
      .sort({ updatedAt: -1 })
      .lean();

    const businessIds = Array.from(
      new Set(
        cars
          .filter((car) => car.ownerType === OwnerTypeEnum.BUSINESS)
          .flatMap((car) => [car.ownerId, car.businessId])
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    );
    const userIds = Array.from(
      new Set(
        cars
          .filter((car) => car.ownerType === OwnerTypeEnum.USER)
          .map((car) => String(car.ownerId || ""))
          .filter(Boolean),
      ),
    );

    const [businesses, users] = await Promise.all([
      BusinessModel.find({ _id: { $in: businessIds }, isDeleted: false } as any)
        .select("businessName phone address userId")
        .populate("userId", "name email phone address")
        .lean(),
      UserModel.find({ _id: { $in: userIds }, isDeleted: false } as any)
        .select("name email phone address")
        .lean(),
    ]);

    const lookups = {
      businesses: new Map(businesses.map((business) => [String(business._id), business])),
      users: new Map(users.map((user) => [String(user._id), user])),
    };
    const carsWithOwnerInfo = cars.map((car) => ({
      ...car,
      adminOwnerInfo: this.getAdminOwnerInfo(car, lookups),
    }));

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { cars: carsWithOwnerInfo.map((car) => this.toAdminMapCar(car)) },
    });
  }

  async getReviews(req: Request, res: Response) {
    const status = String(req.query.status || "");
    const filter: any = {};

    if (status && Object.values(ReviewStatusEnum).includes(status as ReviewStatusEnum)) {
      filter.status = status;
    }

    const reviews = await ReviewModel.find(filter)
      .populate("bookingId", "_id")
      .populate("carId", "name licensePlate")
      .populate("renterId", "name email")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { reviews: reviews.map((review) => this.toAdminReviewItem(review)) },
    });
  }

  async hideReview(req: Request, res: Response) {
    const authUser = (req as any).user;
    const reviewId = String(req.params.id || "");
    this.assertObjectId(reviewId, "Đánh giá không hợp lệ");

    const review = await ReviewModel.findById(reviewId);
    if (!review) throw ErrorHelper.recordNotFound("Review");

    review.status = ReviewStatusEnum.HIDDEN;
    review.hiddenReason = String(req.body.reason || "Nội dung vi phạm quy định").trim();
    review.hiddenBy = authUser.userId;
    review.hiddenAt = new Date();
    await review.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã ẩn đánh giá",
      data: { review },
    });
  }

  async showReview(req: Request, res: Response) {
    const reviewId = String(req.params.id || "");
    this.assertObjectId(reviewId, "Đánh giá không hợp lệ");

    const review = await ReviewModel.findById(reviewId);
    if (!review) throw ErrorHelper.recordNotFound("Review");

    review.status = ReviewStatusEnum.VISIBLE;
    review.hiddenReason = "";
    review.hiddenBy = undefined as any;
    (review as any).hiddenAt = undefined;
    await review.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã hiển thị lại đánh giá",
      data: { review },
    });
  }

  async getBusinesses(req: Request, res: Response) {
    const businesses = await BusinessModel.find({
      isDeleted: false,
    })
      .populate("userId", "-password -otpCode")
      .sort({ createdAt: -1 });

    const businessIds = businesses.map((business) => business._id);
    const carCountRows = await CarModel.aggregate([
      {
        $match: {
          isDeleted: false,
          $or: [
            { businessId: { $in: businessIds } },
            {
              ownerId: { $in: businessIds },
              ownerType: OwnerTypeEnum.BUSINESS,
            },
          ],
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$businessId", "$ownerId"] },
          totalCars: { $sum: 1 },
        },
      },
    ]);
    const carCountByBusinessId = new Map(
      carCountRows.map((item) => [String(item._id), Number(item.totalCars)]),
    );
    const businessesWithCounts = businesses.map((business) => ({
      ...business.toObject(),
      carCount: carCountByBusinessId.get(String(business._id)) || 0,
      totalCars: carCountByBusinessId.get(String(business._id)) || 0,
    }));

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { businesses: businessesWithCounts },
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
    const phone = validatePhone(req.body.phone);
    const address =
      typeof req.body.address === "string" ? req.body.address.trim() : "";
    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim()
        : "";
    const city = cleanAddressText(req.body.city);
    const province = cleanAddressText(req.body.province) || city;
    const district = cleanAddressText(req.body.district);
    const ward = cleanAddressText(req.body.ward);

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
      city,
      province,
      district,
      ward,
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

  private buildBusinessWorkFilter(businessId: string, carIds: unknown[]) {
    return {
      $or: [
        { businessId },
        {
          ownerId: businessId,
          ownerType: OwnerTypeEnum.BUSINESS,
        },
        ...(carIds.length > 0 ? [{ carId: { $in: carIds } }] : []),
      ],
    };
  }

  private async getBusinessActiveWorkBlockReason(businessId: string) {
    await expireAbandonedPendingBookings();

    const carIds = await CarModel.distinct("_id", {
      isDeleted: false,
      $or: [
        { businessId },
        {
          ownerId: businessId,
          ownerType: OwnerTypeEnum.BUSINESS,
        },
      ],
    } as any);
    const businessWorkFilter = this.buildBusinessWorkFilter(businessId, carIds);

    const activeBooking = await BookingModel.findOne({
      ...businessWorkFilter,
      status: { $in: ACTIVE_BOOKING_STATUSES },
      isDeleted: false,
    } as any).select("_id");

    if (activeBooking) {
      return "đang có booking thuê xe chưa hoàn tất";
    }

    const activeContract = await ContractModel.findOne({
      ...businessWorkFilter,
      status: ContractStatusEnum.ACTIVE,
      isDeleted: false,
    } as any).select("_id");

    if (activeContract) {
      return "đang có hợp đồng thuê xe còn hiệu lực";
    }

    const bookingIds = await BookingModel.distinct("_id", {
      ...businessWorkFilter,
      isDeleted: false,
    } as any);

    if (bookingIds.length === 0) {
      return "";
    }

    const pendingPayment = await PaymentModel.findOne({
      bookingId: { $in: bookingIds },
      status: PaymentStatusEnum.PENDING,
    } as any).select("_id");

    if (pendingPayment) {
      return "đang có thanh toán chưa hoàn tất";
    }

    return "";
  }

  private async hideCarsByAdmin(filter: Record<string, unknown>) {
    await CarModel.updateMany(
      filter as any,
      {
        hiddenByAdmin: true,
        isHidden: true,
      } as any,
    );
  }

  private async restoreCarsAfterAdminUnblock(filter: Record<string, unknown>) {
    const cars = await CarModel.find(filter as any).select("_id hiddenByOwner");

    if (cars.length === 0) {
      return;
    }

    await CarModel.bulkWrite(
      cars.map((car) => ({
        updateOne: {
          filter: { _id: car._id },
          update: {
            $set: {
              hiddenByAdmin: false,
              isHidden: Boolean((car as any).hiddenByOwner),
            },
          } as any,
        },
      })),
    );
  }

  private async checkUserOwnedCarsHaveActiveWork(userId: string) {
    await expireAbandonedPendingBookings();

    const carIds = await CarModel.distinct("_id", {
      ownerId: userId,
      ownerType: OwnerTypeEnum.USER,
      isDeleted: false,
    } as any);

    if (carIds.length === 0) {
      return false;
    }

    const [activeBooking, activeContract, bookingIds] = await Promise.all([
      BookingModel.findOne({
        carId: { $in: carIds },
        status: { $in: ACTIVE_BOOKING_STATUSES },
        isDeleted: false,
      } as any).select("_id"),
      ContractModel.findOne({
        carId: { $in: carIds },
        status: ContractStatusEnum.ACTIVE,
        isDeleted: false,
      } as any).select("_id"),
      BookingModel.distinct("_id", {
        carId: { $in: carIds },
        isDeleted: false,
      } as any),
    ]);

    if (activeBooking || activeContract) {
      return true;
    }

    if (bookingIds.length === 0) {
      return false;
    }

    const pendingPayment = await PaymentModel.findOne({
      bookingId: { $in: bookingIds },
      status: PaymentStatusEnum.PENDING,
    } as any).select("_id");

    return !!pendingPayment;
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

    if (!user) {
      throw ErrorHelper.requestDataInvalid(
        "Tài khoản đăng nhập của doanh nghiệp không còn tồn tại. Không thể mở khóa doanh nghiệp mồ côi.",
      );
    }

    if (user.role === UserRoleEnum.ADMIN) {
      throw ErrorHelper.permissionDeny();
    }

    const hasActiveBooking = await this.checkUserHasActiveBooking(id);

    if (hasActiveBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Không thể khóa tài khoản đang có booking PENDING hoặc CONFIRMED",
      );
    }

    if (user.role === UserRoleEnum.USER) {
      const hasActiveConsignmentWork =
        await this.checkUserOwnedCarsHaveActiveWork(id);

      if (hasActiveConsignmentWork) {
        throw ErrorHelper.requestDataInvalid(
          "Không thể khóa tài khoản đang có xe ký gửi phát sinh booking, hợp đồng hoặc thanh toán chưa đóng",
        );
      }
    }

    if (user.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: user._id,
        isDeleted: false,
      });
      const activeReason = business
        ? await this.getBusinessActiveWorkBlockReason(String(business._id))
        : "";

      if (activeReason) {
        throw ErrorHelper.requestDataInvalid(
          `Không thể khóa doanh nghiệp vì ${activeReason}`,
        );
      }
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
        await this.hideCarsByAdmin(
          {
            businessId: business._id,
            isDeleted: false,
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

    if (!user) {
      throw ErrorHelper.requestDataInvalid(
        "Tài khoản đăng nhập của doanh nghiệp không còn tồn tại. Không thể mở khóa doanh nghiệp mồ côi.",
      );
    }

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
        await this.restoreCarsAfterAdminUnblock(
          {
            businessId: business._id,
            isDeleted: false,
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

    if (user.role === UserRoleEnum.USER) {
      const hasActiveConsignmentWork =
        await this.checkUserOwnedCarsHaveActiveWork(id);

      if (hasActiveConsignmentWork) {
        throw ErrorHelper.requestDataInvalid(
          "Không thể xóa tài khoản đang có xe ký gửi phát sinh booking, hợp đồng hoặc thanh toán chưa đóng",
        );
      }
    }

    if (user.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: user._id,
        isDeleted: false,
      });

      if (business) {
        const activeReason = await this.getBusinessActiveWorkBlockReason(
          String(business._id),
        );

        if (activeReason) {
          throw ErrorHelper.requestDataInvalid(
            `Không thể xóa doanh nghiệp vì ${activeReason}`,
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

    if (!user) {
      throw ErrorHelper.requestDataInvalid(
        "Tài khoản đăng nhập của doanh nghiệp không còn tồn tại. Vui lòng xóa doanh nghiệp mồ côi này thay vì khóa.",
      );
    }

    const activeReason = await this.getBusinessActiveWorkBlockReason(id);

    if (activeReason) {
      throw ErrorHelper.requestDataInvalid(
        `Không thể khóa doanh nghiệp vì ${activeReason}`,
      );
    }

    user.isBlocked = true;
    user.blockedReason = reason;
    user.blockedAt = new Date();
    user.blockedBy = authUser.userId;

    await user.save();

    await this.hideCarsByAdmin(
      {
        businessId: business._id,
        isDeleted: false,
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

    await this.restoreCarsAfterAdminUnblock(
      {
        businessId: business._id,
        isDeleted: false,
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

    const activeReason = await this.getBusinessActiveWorkBlockReason(id);

    if (activeReason) {
      throw ErrorHelper.requestDataInvalid(
        `Không thể xóa doanh nghiệp vì ${activeReason}`,
      );
    }

    const user = await UserModel.findOne({
      _id: business.userId,
      isDeleted: false,
    });

    business.isDeleted = true;
    await business.save();

    await CarModel.updateMany(
      {
        $or: [
          { businessId: business._id },
          {
            ownerId: business._id,
            ownerType: OwnerTypeEnum.BUSINESS,
          },
        ],
        isDeleted: false,
      } as any,
      {
        isDeleted: true,
      },
    );

    if (user) {
      user.isDeleted = true;
      user.deletedReason = reason;
      user.deletedAt = new Date();
      user.deletedBy = authUser.userId;

      await user.save();
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: user
        ? "Xóa mềm doanh nghiệp thành công"
        : "Xóa mềm doanh nghiệp mồ côi thành công",
      data: { business, user },
    });
  }
}

export default new AdminRoute().router;
