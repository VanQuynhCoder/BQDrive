import mongoose from "mongoose";

import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BusinessModel } from "../../models/business/business.model";
import { CarModel } from "../../models/car/car.model";
import { BookingModel } from "../../models/booking/booking.model";
import { ExtraChargeModel } from "../../models/extra-charge/extraCharge.model";
import { ReviewModel, ReviewStatusEnum } from "../../models/review/review.model";
import {
  BookingStatusEnum,
  ExtraChargeStatusEnum,
  ExtraChargeTypeEnum,
  OwnerTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import { cleanAddressText } from "../../helper/address.helper";

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
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerCarsMap),
    );

    this.router.patch(
      "/cars/:id/location",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.updateCarLocation),
    );

    this.router.get(
      "/reviews",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerReviews),
    );

    this.router.get(
      "/bookings/:bookingId/extra-charges",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.getExtraCharges),
    );

    this.router.post(
      "/bookings/:bookingId/extra-charges",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.createExtraCharge),
    );

    this.router.patch(
      "/extra-charges/:id/confirm-cash",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.confirmExtraChargeCash),
    );

    this.router.patch(
      "/extra-charges/:id/cancel",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.cancelExtraCharge),
    );
  }

  private async getOwnerContext(authUser: any): Promise<{
    role: OwnerTypeEnum;
    userId: mongoose.Types.ObjectId;
    businessId?: mongoose.Types.ObjectId;
    filter: any;
  }> {
    if (authUser.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: authUser.userId,
        isDeleted: false,
      }).select("_id businessName");

      if (!business) {
        throw ErrorHelper.permissionDeny();
      }

      return {
        role: OwnerTypeEnum.BUSINESS,
        userId: new mongoose.Types.ObjectId(authUser.userId),
        businessId: business._id,
        filter: {
          isDeleted: false,
          $or: [
            {
              ownerId: business._id,
              ownerType: OwnerTypeEnum.BUSINESS,
            },
            {
              businessId: business._id,
            },
          ],
        },
      };
    }

    return {
      role: OwnerTypeEnum.USER,
      userId: new mongoose.Types.ObjectId(authUser.userId),
      filter: {
        isDeleted: false,
        ownerId: authUser.userId,
        ownerType: OwnerTypeEnum.USER,
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
      ownerType: car.ownerType,
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
    car.lastLocationUpdatedByRole = owner.role;
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
        updatedByRole: owner.role,
        updatedAt: now,
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

  private buildOwnerBookingFilter(owner: Awaited<ReturnType<OwnerRoute["getOwnerContext"]>>) {
    if (owner.role === OwnerTypeEnum.BUSINESS && owner.businessId) {
      return {
        $or: [
          { ownerId: owner.businessId, ownerType: OwnerTypeEnum.BUSINESS },
          { businessId: owner.businessId },
        ],
      };
    }

    return {
      ownerId: owner.userId,
      ownerType: OwnerTypeEnum.USER,
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

  private buildExtraChargeOwnerFilter(owner: Awaited<ReturnType<OwnerRoute["getOwnerContext"]>>) {
    if (owner.role === OwnerTypeEnum.BUSINESS && owner.businessId) {
      return {
        ownerId: owner.businessId,
        ownerType: OwnerTypeEnum.BUSINESS,
      };
    }

    return {
      ownerId: owner.userId,
      ownerType: OwnerTypeEnum.USER,
    };
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
      status: ReviewStatusEnum.VISIBLE,
    } as any)
      .populate("bookingId", "_id")
      .populate("carId", "name licensePlate images")
      .populate("renterId", "name email")
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
          bookingCode: review.bookingId?._id
            ? String(review.bookingId._id).slice(-8).toUpperCase()
            : String(review.bookingId || "").slice(-8).toUpperCase(),
          carId: review.carId?._id || review.carId,
          carName: review.carNameSnapshot || review.carId?.name || "Xe",
          licensePlate: review.carId?.licensePlate || "",
          carImage: Array.isArray(review.carId?.images) ? review.carId.images[0] : "",
          renterName: review.reviewerNameSnapshot || review.renterId?.name || "Khách thuê",
          renterEmail: review.renterId?.email || "",
          rating: review.rating,
          comment: review.comment || "",
          createdAt: review.createdAt,
        })),
      },
    });
  }

  async createExtraCharge(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);
    const booking = await this.findOwnerBooking(String(req.params.bookingId), owner);

    if (booking.status !== BookingStatusEnum.IN_PROGRESS) {
      throw ErrorHelper.requestDataInvalid(
        "Chỉ được tạo phí phát sinh khi xe đã được bàn giao hoặc đang thuê.",
      );
    }

    const type = String(req.body.type || "") as ExtraChargeTypeEnum;
    const amount = Number(req.body.amount || 0);
    const description = String(req.body.description || "").trim();
    const evidenceImages = Array.isArray(req.body.evidenceImages)
      ? req.body.evidenceImages.filter((item: unknown) => typeof item === "string" && item.trim())
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

    const extraCharge = await ExtraChargeModel.create({
      bookingId: booking._id,
      carId: booking.carId,
      renterId: booking.userId,
      ownerId:
        owner.role === OwnerTypeEnum.BUSINESS && owner.businessId
          ? owner.businessId
          : owner.userId,
      ownerType: owner.role,
      ownerModel: owner.role === OwnerTypeEnum.BUSINESS ? "Business" : "User",
      type,
      amount: Math.round(amount),
      description,
      evidenceImages,
      status: ExtraChargeStatusEnum.PENDING,
    });

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
    const extraCharge = await ExtraChargeModel.findOne({
      _id: String(req.params.id),
      ...this.buildExtraChargeOwnerFilter(owner),
      status: ExtraChargeStatusEnum.PENDING,
      isDeleted: false,
    } as any);

    if (!extraCharge) {
      throw ErrorHelper.recordNotFound("Phí phát sinh");
    }

    extraCharge.status = ExtraChargeStatusEnum.PAID;
    extraCharge.paymentMethod = PaymentMethodEnum.CASH;
    extraCharge.paidAt = new Date();
    extraCharge.confirmedBy = owner.userId;
    extraCharge.confirmedByRole = owner.role;
    await extraCharge.save();

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
    const extraCharge = await ExtraChargeModel.findOne({
      _id: String(req.params.id),
      ...this.buildExtraChargeOwnerFilter(owner),
      status: ExtraChargeStatusEnum.PENDING,
      isDeleted: false,
    } as any);

    if (!extraCharge) {
      throw ErrorHelper.recordNotFound("Phí phát sinh");
    }

    extraCharge.status = ExtraChargeStatusEnum.CANCELLED;
    extraCharge.cancelReason = cancelReason || "Chủ xe hủy phí phát sinh";
    await extraCharge.save();

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã hủy phí phát sinh",
      data: { extraCharge },
    });
  }
}

export default new OwnerRoute().router;
