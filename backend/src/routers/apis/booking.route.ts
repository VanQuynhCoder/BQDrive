import axios from "axios";
import { BaseRoute, Request, Response } from "../../base/baseRoute";
import { ErrorHelper } from "../../base/error";
import { BookingModel } from "../../models/booking/booking.model";
import { CarModel } from "../../models/car/car.model";
import { CartModel } from "../../models/cart/cart.model";
import { BusinessModel } from "../../models/business/business.model";
import { ContractModel } from "../../models/contract/contract.model";
import { PaymentModel } from "../../models/payment/payment.model";
import { ExtraChargeModel } from "../../models/extra-charge/extraCharge.model";
import { ReturnInspectionModel } from "../../models/return-inspection/returnInspection.model";
import { calculateRentalPrice } from "../../helper/rental.helper";
import { releaseCarIfNoConfirmedBooking } from "../../helper/car-status.helper";
import { expireOldCarts } from "../../helper/cart.helper";
import { expireAbandonedPendingBookings } from "../../helper/booking-hold.helper";
import { formatAddress } from "../../helper/address.helper";
import {
  buildPaymentSummaryForBooking,
  getContractStatusForBookingStatus,
  syncBookingPaymentFromPaidPayments,
  syncContractFromBooking,
} from "../../helper/payment-sync.helper";
import {
  sendBookingApprovedMail,
  sendBookingCompletedMail,
  sendBookingCreatedMail,
  sendBookingHandoverMail,
  sendBookingNoShowMail,
  sendBookingRejectedMail,
  sendRemainingCashConfirmedMail,
} from "../../helper/mail.helper";
import { notificationCenterService } from "../../services/notification-center.service";
import {
  BookingStatusEnum,
  CarStatusEnum,
  CartStatusEnum,
  DeliveryAddressSourceEnum,
  OwnerTypeEnum,
  DeliveryTypeEnum,
  ExtraChargeStatusEnum,
  PaymentMethodEnum,
  PaymentOptionEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  RentalModeEnum,
  ReturnInspectionStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";
import {
  isValidEmail,
  validateCccd,
  validateDriverLicense,
  validatePhone,
} from "../../utils/validators";

const RENTER_ROLES = [UserRoleEnum.USER];
const OWNER_REVIEW_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // Trạng thái mới: khách vừa gửi yêu cầu, chủ xe cần duyệt
  BookingStatusEnum.PENDING, // Trạng thái cũ: giữ tương thích booking đã tạo trước khi đổi flow
];
const BLOCKING_BOOKING_STATUSES = [
  BookingStatusEnum.REQUESTED, // Chặn lịch ngay khi khách gửi yêu cầu để tránh hai người đặt cùng slot
  BookingStatusEnum.OWNER_APPROVED, // Chủ xe đã đồng ý, khách đang chuẩn bị thanh toán
  BookingStatusEnum.PAYMENT_PENDING, // Khách đã bắt đầu thanh toán, chưa có kết quả cuối
  BookingStatusEnum.PAID, // Đã thanh toán, lịch thuê được giữ chính thức
  BookingStatusEnum.IN_PROGRESS, // Xe đang được bàn giao/đang thuê thực tế
  BookingStatusEnum.RETURN_INSPECTION,
  BookingStatusEnum.AWAITING_EXTRA_CHARGE,
  BookingStatusEnum.PENDING, // Trạng thái cũ: tương đương REQUESTED
  BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ: tương đương PAYMENT_PENDING
  BookingStatusEnum.CONFIRMED, // Trạng thái cũ: tương đương đã được xác nhận
];
const BOOKABLE_CAR_STATUSES = [CarStatusEnum.APPROVED, CarStatusEnum.RENTED];
const HANDOVER_ALLOWED_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.WAITING_PAYMENT,
  BookingStatusEnum.CONFIRMED,
];
const MANUAL_PAYMENT_METHODS = [
  PaymentMethodEnum.CASH,
];
const RENTER_INFO_REQUIRED_MESSAGE =
  "Vui lòng hoàn tất thông tin người thuê trước khi gửi yêu cầu đặt xe.";
const RENTER_INFO_MISSING_FOR_CONFIRM_MESSAGE =
  "Booking thiếu thông tin người thuê, không thể duyệt.";
const PICKUP_GRACE_MINUTES = 30;
const NO_SHOW_ALLOWED_BOOKING_STATUSES = [
  BookingStatusEnum.OWNER_APPROVED,
  BookingStatusEnum.PAYMENT_PENDING,
  BookingStatusEnum.PAID,
  BookingStatusEnum.WAITING_PAYMENT,
  BookingStatusEnum.CONFIRMED,
];
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";

function toCoordinate(value: unknown, min: number, max: number) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : undefined;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function getDrivingDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
) {
  try {
    const response = await axios.get(
      `${OSRM_ROUTE_URL}/${originLng},${originLat};${destLng},${destLat}`,
      {
        params: {
          overview: "false",
          geometries: "geojson",
        },
        headers: {
          "User-Agent": "BQDrive/1.0 delivery fee calculation",
          Accept: "application/json",
        },
        timeout: 8000,
      },
    );
    const distanceMeters = Number(response.data?.routes?.[0]?.distance || 0);
    const durationSeconds = Number(response.data?.routes?.[0]?.duration || 0);

    if (response.data?.code !== "Ok" || !distanceMeters) {
      throw new Error("NO_ROUTE");
    }

    const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
    const durationMinutes = durationSeconds
      ? Math.max(1, Math.round(durationSeconds / 60))
      : 0;

    return {
      distanceKm,
      durationText: durationMinutes ? `${durationMinutes} phút` : undefined,
    };
  } catch {
    throw ErrorHelper.requestDataInvalid(
      "Không thể tính khoảng cách giao xe, vui lòng thử lại hoặc chọn nhận xe tại địa điểm của chủ xe.",
    );
  }
}

function normalizeDeliveryAddressSource(value: unknown) {
  return Object.values(DeliveryAddressSourceEnum).includes(
    value as DeliveryAddressSourceEnum,
  )
    ? (value as DeliveryAddressSourceEnum)
    : DeliveryAddressSourceEnum.MANUAL_TEXT;
}

function calculatePaymentAmounts(totalPrice: number, paymentOption: string) {
  if (paymentOption === PaymentOptionEnum.FULL) {
    return {
      depositAmount: 0,
      remainingAmount: totalPrice,
      paidAmount: 0,
    };
  }

  const depositAmount = Math.round(totalPrice * 0.3);
  const remainingAmount = totalPrice - depositAmount;

  return {
    depositAmount,
    remainingAmount,
    paidAmount: 0,
  };
}

function hydrateLegacyBookingOwner(booking: any) {
  if (!booking.ownerId && booking.businessId) {
    booking.ownerId = booking.businessId;
    booking.ownerType = OwnerTypeEnum.BUSINESS;
    booking.ownerModel = "Business";
  }
}

function assertUserIsNotCarOwner(car: any, userId: string) {
  if (
    car?.ownerType === OwnerTypeEnum.USER &&
    String(car.ownerId || "") === String(userId)
  ) {
    throw ErrorHelper.requestDataInvalid(
      "Không thể thuê xe do chính bạn sở hữu",
    );
  }
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRenterInfo(rawInfo: any) {
  const renterInfo = rawInfo || {};

  return {
    fullName: getTrimmedString(renterInfo.fullName),
    phone: validatePhone(renterInfo.phone, false),
    email: getTrimmedString(renterInfo.email).toLowerCase(),
    cccdNumber: validateCccd(renterInfo.cccdNumber, false),
    cccdFrontImage: getTrimmedString(renterInfo.cccdFrontImage),
    cccdBackImage: getTrimmedString(renterInfo.cccdBackImage),
    driverLicenseNumber: validateDriverLicense(
      renterInfo.driverLicenseNumber,
      false,
    ),
    driverLicenseImage: getTrimmedString(renterInfo.driverLicenseImage),
    note: getTrimmedString(renterInfo.note),
  };
}

function hasCompleteRenterInfo(rawInfo: any) {
  const renterInfo = normalizeRenterInfo(rawInfo);

  return Boolean(
    renterInfo.fullName &&
      renterInfo.phone &&
      renterInfo.email &&
      renterInfo.cccdNumber &&
      renterInfo.cccdFrontImage &&
      renterInfo.cccdBackImage &&
      renterInfo.driverLicenseNumber &&
      renterInfo.driverLicenseImage,
  );
}

function validateAndNormalizeRenterInfo(rawInfo: any) {
  const renterInfo = normalizeRenterInfo(rawInfo);

  if (!hasCompleteRenterInfo(renterInfo)) {
    throw ErrorHelper.requestDataInvalid(RENTER_INFO_REQUIRED_MESSAGE);
  }

  if (renterInfo.fullName.trim().length < 2) {
    throw ErrorHelper.requestDataInvalid("Họ tên người thuê phải có ít nhất 2 ký tự");
  }

  if (!isValidEmail(renterInfo.email)) {
    throw ErrorHelper.requestDataInvalid("Email người thuê không hợp lệ");
  }

  validatePhone(renterInfo.phone);
  validateCccd(renterInfo.cccdNumber);
  validateDriverLicense(renterInfo.driverLicenseNumber);

  if (renterInfo.note.length > 500) {
    throw ErrorHelper.requestDataInvalid("Ghi chú không được vượt quá 500 ký tự");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(renterInfo.email)) {
    throw ErrorHelper.requestDataInvalid("Email người thuê không hợp lệ");
  }

  if (renterInfo.phone.replace(/\D/g, "").length < 10) {
    throw ErrorHelper.requestDataInvalid("Số điện thoại người thuê phải có ít nhất 10 số");
  }

  if (renterInfo.cccdNumber.replace(/\D/g, "").length < 9) {
    throw ErrorHelper.requestDataInvalid("CCCD/CMND phải có ít nhất 9 số");
  }

  return renterInfo;
}

async function ensureNoOverlappedActiveBooking(booking: any) {
  const start = new Date(booking.startDate);
  const end = new Date(booking.endDate);

  const overlappedBooking = await BookingModel.findOne({
    _id: { $ne: booking._id },
    carId: booking.carId,
    status: { $in: BLOCKING_BOOKING_STATUSES },
    isDeleted: false,
    startDate: { $lt: end },
    endDate: { $gt: start },
  } as any);

  if (overlappedBooking) {
    throw ErrorHelper.requestDataInvalid(
      "Xe đã có booking trong khoảng thời gian này",
    );
  }
}

class BookingRoute extends BaseRoute {
  constructor() {
    super();
  }

  customRouting() {
    this.router.post(
      "/quote",
      this.route(this.quoteBooking),
    );

    this.router.post(
      "/createBooking",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.createBooking),
    );

    this.router.post(
      "/bookingFromCart/:cartId",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.bookingFromCart),
    );

    this.router.get(
      "/getMyBookings",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyBookings),
    );

    this.router.get(
      "/my-payment-todos",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyPaymentTodos),
    );

    this.router.get(
      "/getMyBooking/:id",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.getMyBooking),
    );

    this.router.get(
      "/getBusinessBookings",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.getBusinessBookings),
    );

    this.router.get(
      "/owner/history",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.getOwnerBookingHistory),
    );

    this.router.post(
      "/cancelBooking/:id",
      [this.authentication, this.roleGuard(RENTER_ROLES)],
      this.route(this.cancelBooking),
    );

    this.router.post(
      "/confirmBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.confirmBooking),
    );

    this.router.post(
      "/rejectBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.rejectBooking),
    );

    this.router.post(
      "/completeBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.completeBooking),
    );

    this.router.post(
      "/:id/receive-return",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.receiveReturn),
    );

    this.router.post(
      "/:id/inspection/clear",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.clearReturnInspection),
    );

    this.router.get(
      "/:id/return-inspection",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.ADMIN, UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.getReturnInspection),
    );

    this.router.post(
      "/handoverBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.handoverBooking),
    );

    this.router.post(
      "/:id/confirm-remaining-cash",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.confirmRemainingCash),
    );

    this.router.post(
      "/noShowBooking/:id",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.noShowBooking),
    );

    this.router.post(
      "/:id/no-show",
      [
        this.authentication,
        this.roleGuard([UserRoleEnum.BUSINESS, UserRoleEnum.USER]),
      ],
      this.route(this.noShowBooking),
    );
  }

  private async getOwnerContext(authUser: any) {
    if (authUser.role === UserRoleEnum.BUSINESS) {
      const business = await BusinessModel.findOne({
        userId: authUser.userId,
        isDeleted: false,
      });

      if (!business) {
        throw ErrorHelper.recordNotFound("Business");
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

  private getPickupAddressSnapshot(car: any) {
    return formatAddress(car, true) || "Địa chỉ nhận xe đang được cập nhật";
  }

  private getRequiredHandoverPaymentAmount(booking: any) {
    const totalPrice = Number(booking.totalPrice || 0);

    if (booking.paymentOption === PaymentOptionEnum.FULL) {
      return totalPrice;
    }

    return Number(booking.depositAmount || Math.round(totalPrice * 0.3));
  }

  private getInitialHandoverPaymentType(booking: any) {
    return booking.paymentOption === PaymentOptionEnum.FULL
      ? PaymentTypeEnum.FULL
      : PaymentTypeEnum.DEPOSIT;
  }

  private getOutstandingAmount(booking: any) {
    const totalPrice = Number(booking.totalPrice || 0);
    const paidAmount = Number(booking.paidAmount || 0);
    const storedRemainingAmount = Number(booking.remainingAmount || 0);

    return Math.max(storedRemainingAmount || totalPrice - paidAmount, 0);
  }

  private async findPendingManualPaymentForHandover(booking: any) {
    return PaymentModel.findOne({
      bookingId: booking._id,
      method: { $in: MANUAL_PAYMENT_METHODS },
      paymentType: this.getInitialHandoverPaymentType(booking),
      status: PaymentStatusEnum.PENDING,
    }).sort({ createdAt: -1 });
  }

  private assertHandoverPaymentIsSatisfied(booking: any) {
    const requiredAmount = this.getRequiredHandoverPaymentAmount(booking);
    const paidAmount = Number(booking.paidAmount || 0);

    if (requiredAmount > 0 && paidAmount < requiredAmount) {
      throw ErrorHelper.requestDataInvalid(
        booking.paymentOption === PaymentOptionEnum.FULL
          ? "Booking chưa đủ điều kiện bàn giao"
          : "Thanh toán cọc chưa thành công",
      );
    }
  }

  private assertBookingPaymentIsSettled(booking: any) {
    const totalPrice = Number(booking.totalPrice || 0);
    const paidAmount = Number(booking.paidAmount || 0);
    const remainingAmount = this.getOutstandingAmount(booking);

    if (remainingAmount > 0 || paidAmount < totalPrice) {
      throw ErrorHelper.requestDataInvalid(
        "Booking còn số tiền chưa thanh toán. Vui lòng xác nhận đã thu phần còn lại hoặc yêu cầu khách thanh toán trên hệ thống trước khi hoàn tất chuyến.",
      );
    }
  }

  private async confirmRemainingCashPayment(
    booking: any,
    authUser: any,
    note?: string,
  ) {
    await syncBookingPaymentFromPaidPayments(booking);

    const summary = await buildPaymentSummaryForBooking(booking);
    const remainingAmount = Number(summary.remainingAmount || 0);

    if (remainingAmount <= 0) {
      return {
        payment: null,
        summary,
        message: "Booking đã thanh toán đủ.",
      };
    }

    const duplicatedRemainingPayment = await PaymentModel.findOne({
      bookingId: booking._id,
      paymentType: PaymentTypeEnum.REMAINING,
      status: PaymentStatusEnum.PAID,
    }).sort({ paidAt: -1, createdAt: -1 });

    if (duplicatedRemainingPayment) {
      const updatedSummary = await syncBookingPaymentFromPaidPayments(booking);

      return {
        payment: duplicatedRemainingPayment,
        summary: updatedSummary,
        message: "Booking đã thanh toán đủ.",
      };
    }

    const payment = await PaymentModel.create({
      bookingId: booking._id,
      userId: booking.userId,
      amount: remainingAmount,
      method: PaymentMethodEnum.CASH,
      paymentType: PaymentTypeEnum.REMAINING,
      status: PaymentStatusEnum.PAID,
      paidAt: new Date(),
      confirmedBy: authUser.userId,
      confirmedByRole: authUser.role,
      note:
        note ||
        "Chủ xe xác nhận đã thu phần còn lại trực tiếp từ khách.",
    });

    const updatedSummary = await syncBookingPaymentFromPaidPayments(booking);
    await syncContractFromBooking(booking);
    void sendRemainingCashConfirmedMail(booking, payment);

    return {
      payment,
      summary: updatedSummary,
      message: "Đã xác nhận thu phần còn lại.",
    };
  }

  private async confirmPendingManualRemainingAtHandover(booking: any) {
    const outstandingAmount = this.getOutstandingAmount(booking);

    if (outstandingAmount <= 0) return null;

    const payment = await PaymentModel.findOne({
      bookingId: booking._id,
      method: { $in: MANUAL_PAYMENT_METHODS },
      paymentType: PaymentTypeEnum.REMAINING,
      status: PaymentStatusEnum.PENDING,
    }).sort({ createdAt: -1 });

    if (!payment) {
      return null;
    }

    payment.amount = outstandingAmount;
    payment.status = PaymentStatusEnum.PAID;
    payment.paidAt = new Date();
    payment.transactionCode =
      payment.transactionCode || `HANDOVER-${String(booking._id)}-${Date.now()}`;
    await payment.save();
    await syncBookingPaymentFromPaidPayments(booking);

    return payment;
  }

  private async assertNoOtherActiveBookingForHandover(booking: any) {
    const overlappedBooking = await BookingModel.findOne({
      _id: { $ne: booking._id },
      carId: booking.carId,
      status: { $in: BLOCKING_BOOKING_STATUSES },
      isDeleted: false,
      startDate: { $lt: booking.endDate },
      endDate: { $gt: booking.startDate },
    } as any).select("_id");

    if (overlappedBooking) {
      throw ErrorHelper.requestDataInvalid("Xe đang thuộc booking khác");
    }
  }

  private async markBookingCarRented(booking: any) {
    const ownerId = (booking as any).ownerId || booking.businessId;
    const ownerType = (booking as any).ownerType || OwnerTypeEnum.BUSINESS;
    const ownerFilters = [];

    if (ownerId && ownerType) {
      ownerFilters.push({ ownerId, ownerType });
    }

    if (booking.businessId) {
      ownerFilters.push({ businessId: booking.businessId });
    }

    const car = await CarModel.findOneAndUpdate(
      {
        _id: booking.carId,
        ...(ownerFilters.length > 0 ? { $or: ownerFilters } : {}),
        status: { $in: [CarStatusEnum.APPROVED, CarStatusEnum.RENTED] },
        isDeleted: false,
      } as any,
      { status: CarStatusEnum.RENTED },
      { new: true },
    );

    if (!car) {
      throw ErrorHelper.requestDataInvalid("Booking chưa đủ điều kiện bàn giao");
    }

    return car;
  }

  private validateRentalDateRange(start: Date, end: Date) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw ErrorHelper.requestDataInvalid("Thời gian thuê xe không hợp lệ");
    }

    if (start <= new Date()) {
      throw ErrorHelper.requestDataInvalid(
        "Thời gian nhận xe phải lớn hơn thời gian hiện tại",
      );
    }

    if (end <= start) {
      throw ErrorHelper.requestDataInvalid("Ngày thuê không hợp lệ");
    }

  }

  private buildQuoteResponse(rentalResult: any) {
    const breakdown = rentalResult.pricingSnapshot?.breakdown || [];
    const normalizedBreakdown = breakdown.map((item: any) => {
      const holidayName =
        item.type === "HOLIDAY" && item.label !== "Ngày lễ"
          ? item.label
          : undefined;

      return {
        date: item.date,
        type: item.type,
        label:
          item.type === "HOLIDAY"
            ? "Ngày lễ"
            : item.type === "WEEKEND"
              ? "Cuối tuần"
              : "Ngày thường",
        holidayName,
        unitCount: Number(item.unitCount || 1),
        unitPrice: Number(item.unitPrice || 0),
        price: Number(item.price || 0),
      };
    });
    const uniqueTypes = Array.from(
      new Set(normalizedBreakdown.map((item: any) => item.type)),
    );
    const appliedPriceType =
      uniqueTypes.length === 1 ? uniqueTypes[0] : "MIXED";
    const appliedLabel =
      appliedPriceType === "MIXED"
        ? "Nhiều loại ngày"
        : normalizedBreakdown[0]?.label || "Ngày thường";

    return {
      rentalMode: rentalResult.rentalMode,
      appliedPriceType,
      appliedLabel,
      unitPrice:
        appliedPriceType === "MIXED"
          ? undefined
          : normalizedBreakdown[0]?.unitPrice,
      totalTime: rentalResult.totalTime,
      totalPrice: rentalResult.totalPrice,
      rentalSubtotal:
        rentalResult.pricingSnapshot?.rentalSubtotal ??
        rentalResult.pricingSnapshot?.subtotal ??
        rentalResult.totalPrice,
      deliveryFee: Number(rentalResult.pricingSnapshot?.deliveryFee || 0),
      delivery: rentalResult.pricingSnapshot?.delivery,
      breakdown: normalizedBreakdown,
    };
  }

  private async buildDeliveryPricing(car: any, deliveryInput: any = {}) {
    const deliveryType =
      deliveryInput?.deliveryType || DeliveryTypeEnum.PICKUP_AT_CAR_LOCATION;

    if (deliveryType !== DeliveryTypeEnum.DELIVERY_TO_CUSTOMER) {
      return {
        deliveryFee: 0,
        delivery: {
          deliveryType: DeliveryTypeEnum.PICKUP_AT_CAR_LOCATION,
        },
      };
    }

    if (!car.deliveryEnabled) {
      throw ErrorHelper.requestDataInvalid(
        "Xe này không hỗ trợ giao xe tận nơi.",
      );
    }

    const originLat = toCoordinate(car.pickupLat ?? car.latitude, -90, 90);
    const originLng = toCoordinate(car.pickupLng ?? car.longitude, -180, 180);
    const deliveryLat = toCoordinate(deliveryInput.deliveryLat, -90, 90);
    const deliveryLng = toCoordinate(deliveryInput.deliveryLng, -180, 180);
    const deliveryAddressText =
      cleanText(deliveryInput.deliveryAddressText) ||
      cleanText(deliveryInput.deliveryAddress);
    const deliveryFormattedAddress = cleanText(
      deliveryInput.deliveryFormattedAddress,
    );
    const deliveryAddress =
      deliveryAddressText || deliveryFormattedAddress;
    const deliveryAddressSource = normalizeDeliveryAddressSource(
      deliveryInput.deliveryAddressSource,
    );
    const deliveryNote = cleanText(deliveryInput.deliveryNote);

    if (
      originLat === undefined ||
      originLng === undefined ||
      deliveryLat === undefined ||
      deliveryLng === undefined
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu tọa độ để tính phí giao xe tận nơi.",
      );
    }

    if (!deliveryAddress) {
      throw ErrorHelper.requestDataInvalid("Vui lòng nhập địa chỉ giao xe.");
    }

    const routeMetrics = await getDrivingDistanceKm(
      originLat,
      originLng,
      deliveryLat,
      deliveryLng,
    );
    const deliveryDistanceKm = routeMetrics.distanceKm;
    const deliveryMaxDistanceKm = Number(car.deliveryMaxDistanceKm || 0);

    if (deliveryMaxDistanceKm > 0 && deliveryDistanceKm > deliveryMaxDistanceKm) {
      throw ErrorHelper.requestDataInvalid(
        "Khoảng cách giao xe vượt quá phạm vi hỗ trợ của chủ xe.",
      );
    }

    const deliveryBaseFee = Number(car.deliveryBaseFee || 0);
    const deliveryFeePerKm = Number(car.deliveryFeePerKm || 0);
    const deliveryFee = Math.round(
      deliveryBaseFee + deliveryDistanceKm * deliveryFeePerKm,
    );

    return {
      deliveryFee,
      delivery: {
        deliveryType: DeliveryTypeEnum.DELIVERY_TO_CUSTOMER,
        deliveryAddress,
        deliveryAddressText,
        deliveryFormattedAddress,
        deliveryAddressSource,
        deliveryLat,
        deliveryLng,
        deliveryDistanceKm,
        deliveryDurationText: routeMetrics.durationText,
        deliveryBaseFee,
        deliveryFeePerKm,
        deliveryMaxDistanceKm,
        deliveryFee,
        deliveryNote: deliveryNote || car.deliveryNote || "",
      },
    };
  }

  private async applyDeliveryToRentalResult(
    car: any,
    rentalResult: any,
    deliveryInput: any,
  ) {
    const deliveryPricing = await this.buildDeliveryPricing(car, deliveryInput);
    const rentalSubtotal = Number(
      rentalResult.pricingSnapshot?.subtotal || rentalResult.totalPrice || 0,
    );
    const deliveryFee = Number(deliveryPricing.deliveryFee || 0);
    const totalPrice = rentalSubtotal + deliveryFee;

    return {
      ...rentalResult,
      totalPrice,
      pricingSnapshot: {
        ...(rentalResult.pricingSnapshot || {}),
        subtotal: rentalSubtotal,
        rentalSubtotal,
        deliveryFee,
        totalPrice,
        delivery: deliveryPricing.delivery,
      },
    };
  }

  private async assertExtraChargesAreSettled(booking: any) {
    const pendingExtraCharge = await ExtraChargeModel.findOne({
      bookingId: booking._id,
      status: ExtraChargeStatusEnum.PENDING,
      isDeleted: false,
    } as any);

    if (pendingExtraCharge) {
      throw ErrorHelper.requestDataInvalid(
        "Booking còn phí phát sinh chưa xử lý, chưa thể hoàn tất chuyến thuê.",
      );
    }
  }

  private async hasPendingExtraCharge(booking: any) {
    const pendingExtraCharge = await ExtraChargeModel.findOne({
      bookingId: booking._id,
      status: ExtraChargeStatusEnum.PENDING,
      isDeleted: false,
    } as any).select("_id");

    return Boolean(pendingExtraCharge);
  }

  private normalizeReturnPhotos(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim())
      .slice(0, 8);
  }

  private getLateReturnMinutes(booking: any, actualReturnAt: Date) {
    const expectedReturnAt = new Date(booking.endDate);

    if (Number.isNaN(expectedReturnAt.getTime())) return 0;

    return Math.max(
      0,
      Math.ceil((actualReturnAt.getTime() - expectedReturnAt.getTime()) / 60000),
    );
  }

  private async buildReturnCompletionState(booking: any, inspection?: any) {
    const blockers: string[] = [];

    await syncBookingPaymentFromPaidPayments(booking);

    if (!inspection) {
      blockers.push("RETURN_INSPECTION_NOT_FOUND");
    } else if (inspection.inspectionStatus !== ReturnInspectionStatusEnum.CLEARED) {
      blockers.push("INSPECTION_NOT_CLEARED");
    }

    if (this.getOutstandingAmount(booking) > 0) {
      blockers.push("REMAINING_PAYMENT");
    }

    if (await this.hasPendingExtraCharge(booking)) {
      blockers.push("PENDING_EXTRA_CHARGE");
    }

    if (
      [
        BookingStatusEnum.COMPLETED,
        BookingStatusEnum.CANCELLED,
        BookingStatusEnum.REJECTED,
        BookingStatusEnum.NO_SHOW,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      blockers.push("BOOKING_NOT_ACTIVE");
    }

    return {
      canComplete: blockers.length === 0,
      blockers,
    };
  }

  private async findReturnInspectionForBooking(bookingId: any) {
    return ReturnInspectionModel.findOne({
      bookingId,
      isDeleted: false,
    } as any);
  }

  private async findBookingForReturnInspectionRead(id: string, authUser: any) {
    if (authUser.role === UserRoleEnum.ADMIN) {
      return BookingModel.findOne({
        _id: id,
        isDeleted: false,
      } as any)
        .populate("userId", "-password -otpCode")
        .populate("carId")
        .populate("businessId")
        .populate("ownerId", "-password -otpCode");
    }

    if (authUser.role === UserRoleEnum.BUSINESS) {
      const owner = await this.getOwnerContext(authUser);

      return BookingModel.findOne({
        _id: id,
        ...this.buildOwnerFilter(owner),
        isDeleted: false,
      } as any)
        .populate("userId", "-password -otpCode")
        .populate("carId")
        .populate("businessId")
        .populate("ownerId", "-password -otpCode");
    }

    return BookingModel.findOne({
      _id: id,
      isDeleted: false,
      $or: [
        { userId: authUser.userId },
        {
          ownerId: authUser.userId,
          ownerType: OwnerTypeEnum.USER,
        },
      ],
    } as any)
      .populate("userId", "-password -otpCode")
      .populate("carId")
      .populate("businessId")
      .populate("ownerId", "-password -otpCode");
  }

  private async refreshInspectionStatusFromExtraCharges(booking: any) {
    const inspection = await this.findReturnInspectionForBooking(booking._id);

    if (!inspection || inspection.inspectionStatus === ReturnInspectionStatusEnum.CLEARED) {
      return inspection;
    }

    if (await this.hasPendingExtraCharge(booking)) {
      inspection.inspectionStatus = ReturnInspectionStatusEnum.CHARGES_PENDING;
      if (booking.status !== BookingStatusEnum.AWAITING_EXTRA_CHARGE) {
        booking.status = BookingStatusEnum.AWAITING_EXTRA_CHARGE;
        await booking.save();
      }
    } else if (
      inspection.inspectionStatus === ReturnInspectionStatusEnum.CHARGES_PENDING
    ) {
      inspection.inspectionStatus = ReturnInspectionStatusEnum.INSPECTING;
      if (booking.status !== BookingStatusEnum.RETURN_INSPECTION) {
        booking.status = BookingStatusEnum.RETURN_INSPECTION;
        await booking.save();
      }
    }

    await inspection.save();
    return inspection;
  }

  private assertBookingCanBeNoShow(booking: any) {
    if (booking.status === BookingStatusEnum.IN_PROGRESS) {
      throw ErrorHelper.requestDataInvalid(
        "Booking đã được bàn giao, không thể đánh dấu No-show.",
      );
    }

    if (
      [
        BookingStatusEnum.COMPLETED,
        BookingStatusEnum.CANCELLED,
        BookingStatusEnum.REJECTED,
        BookingStatusEnum.NO_SHOW,
      ].includes(booking.status as BookingStatusEnum)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Booking không còn khả dụng để đánh dấu No-show.",
      );
    }

    if (!NO_SHOW_ALLOWED_BOOKING_STATUSES.includes(booking.status as BookingStatusEnum)) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chưa đủ điều kiện để đánh dấu No-show.",
      );
    }

    const pickupTime = new Date(booking.startDate);

    if (Number.isNaN(pickupTime.getTime())) {
      throw ErrorHelper.requestDataInvalid("Thời gian nhận xe không hợp lệ.");
    }

    const noShowAllowedAt =
      pickupTime.getTime() + PICKUP_GRACE_MINUTES * 60 * 1000;

    if (Date.now() < noShowAllowedAt) {
      throw ErrorHelper.requestDataInvalid(
        "Chưa đến giờ nhận xe, không thể đánh dấu No-show.",
      );
    }
  }

  private async validateCarAvailability(
    carId: string,
    start: Date,
    end: Date,
    userId: string,
    ignoredCartId?: string,
  ) {
    const now = new Date();

    await expireAbandonedPendingBookings(now);
    await expireOldCarts(now);
    const existedBooking = await BookingModel.findOne({
      carId,
      status: {
        $in: BLOCKING_BOOKING_STATUSES,
      },
      isDeleted: false,
      startDate: { $lt: end },
      endDate: { $gt: start },
    } as any);

    if (existedBooking) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đã có booking trong khoảng thời gian này",
      );
    }

    const cartFilter: any = {
      carId,
      userId: { $ne: userId },
      status: CartStatusEnum.ACTIVE,
      expiredAt: { $gt: now },
      startDate: { $lt: end },
      endDate: { $gt: start },
    };

    if (ignoredCartId) {
      cartFilter._id = { $ne: ignoredCartId };
    }

    const existedHold = await CartModel.findOne(cartFilter);

    if (existedHold) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đang được người khác giữ trong khoảng thời gian này",
      );
    }
  }

  async createBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const { carId, startDate, endDate, rentalMode, note, paymentOption, renterInfo, delivery } =
      req.body;
    await expireOldCarts();

    if (!carId || !startDate || !endDate || !rentalMode) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu carId, startDate hoặc endDate",
      );
    }

    const normalizedRenterInfo = validateAndNormalizeRenterInfo(renterInfo);

    const car = await CarModel.findOne({
      _id: carId,
      status: { $in: BOOKABLE_CAR_STATUSES },
      isDeleted: false,
    } as any);

    if (!car || (car as any).isHidden || car.status === CarStatusEnum.HIDDEN) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    assertUserIsNotCarOwner(car, authUser.userId);

    if (!Object.values(RentalModeEnum).includes(rentalMode)) {
      throw ErrorHelper.requestDataInvalid("Hình thức thuê không hợp lệ");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    this.validateRentalDateRange(start, end);
    await this.validateCarAvailability(carId, start, end, authUser.userId);

    if (start >= end) {
      throw ErrorHelper.requestDataInvalid("Ngày thuê không hợp lệ");
    }

    const rentalResult = await this.applyDeliveryToRentalResult(
      car,
      await calculateRentalPrice(car, start, end, rentalMode),
      delivery,
    );
    const totalPrice = rentalResult.totalPrice;

    const selectedPaymentOption = paymentOption || PaymentOptionEnum.DEPOSIT;

    if (!Object.values(PaymentOptionEnum).includes(selectedPaymentOption)) {
      throw ErrorHelper.requestDataInvalid("Phương án thanh toán không hợp lệ");
    }

    const paymentAmounts = calculatePaymentAmounts(
      totalPrice,
      selectedPaymentOption,
    );

    const booking = await BookingModel.create({
      userId: authUser.userId,
      ...(car.businessId ? { businessId: car.businessId } : {}),
      ownerId: (car as any).ownerId || car.businessId,
      ownerType: (car as any).ownerType || OwnerTypeEnum.BUSINESS,
      ownerModel:
        ((car as any).ownerType || OwnerTypeEnum.BUSINESS) ===
        OwnerTypeEnum.USER
          ? "User"
          : "Business",
      carId: car._id,
      startDate: start,
      endDate: end,
      rentalMode: rentalResult.rentalMode,
      totalPrice,
      pricingSnapshot: rentalResult.pricingSnapshot,
      paymentOption: selectedPaymentOption,
      depositAmount: paymentAmounts.depositAmount,
      remainingAmount: paymentAmounts.remainingAmount,
      paidAmount: paymentAmounts.paidAmount,
      isDepositRefundable: true,
      pickupAddressSnapshot: this.getPickupAddressSnapshot(car),
      returnAddressSnapshot: this.getPickupAddressSnapshot(car),
      renterInfo: normalizedRenterInfo,
      note,
      status: BookingStatusEnum.REQUESTED, // Booking mới: chờ chủ xe duyệt, chưa cho thanh toán
    });

    void sendBookingCreatedMail(booking);
    void notificationCenterService.notifyBookingCreated(booking, authUser.userId);

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đã gửi yêu cầu đặt xe, vui lòng chờ chủ xe xác nhận",
      data: { booking },
    });
  }

  async bookingFromCart(req: Request, res: Response) {
    const authUser = (req as any).user;
    const cartId = String(req.params.cartId);
    const { paymentOption, renterInfo, delivery } = req.body;
    const now = new Date();

    await expireOldCarts(now);

    const cart = await CartModel.findOne({
      _id: cartId,
      userId: authUser.userId,
      status: CartStatusEnum.ACTIVE,
      expiredAt: { $gt: now },
    } as any);

    if (!cart) {
      throw ErrorHelper.recordNotFound("Giỏ hàng");
    }

    const normalizedRenterInfo = validateAndNormalizeRenterInfo(renterInfo);

    if (cart.expiredAt <= new Date()) {
      cart.status = CartStatusEnum.EXPIRED;
      await cart.save();

      throw ErrorHelper.requestDataInvalid("Giỏ hàng đã hết hạn");
    }

    const car = await CarModel.findOne({
      _id: cart.carId,
      status: { $in: BOOKABLE_CAR_STATUSES },
      isDeleted: false,
    } as any);
    const start = new Date(cart.startDate);
    const end = new Date(cart.endDate);

    if (!car || (car as any).isHidden || car.status === CarStatusEnum.HIDDEN) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    assertUserIsNotCarOwner(car, authUser.userId);

    this.validateRentalDateRange(start, end);
    await this.validateCarAvailability(
      String(car._id),
      start,
      end,
      authUser.userId,
      String(cart._id),
    );

    const selectedPaymentOption = paymentOption || PaymentOptionEnum.DEPOSIT;

    if (!Object.values(PaymentOptionEnum).includes(selectedPaymentOption)) {
      throw ErrorHelper.requestDataInvalid("Phương án thanh toán không hợp lệ");
    }

    const baseRentalResult =
      cart.pricingSnapshot && cart.totalPrice
        ? {
            rentalMode: cart.rentalMode,
            totalPrice: cart.totalPrice,
            pricingSnapshot: cart.pricingSnapshot,
          }
        : await calculateRentalPrice(car, start, end, cart.rentalMode);
    const rentalResult = await this.applyDeliveryToRentalResult(
      car,
      baseRentalResult,
      delivery,
    );
    const totalPrice = Number(rentalResult.totalPrice || cart.totalPrice || 0);

    const paymentAmounts = calculatePaymentAmounts(
      totalPrice,
      selectedPaymentOption,
    );

    const booking = await BookingModel.create({
      userId: authUser.userId,
      ...(car.businessId ? { businessId: car.businessId } : {}),
      ownerId: (car as any).ownerId || car.businessId,
      ownerType: (car as any).ownerType || OwnerTypeEnum.BUSINESS,
      ownerModel:
        ((car as any).ownerType || OwnerTypeEnum.BUSINESS) ===
        OwnerTypeEnum.USER
          ? "User"
          : "Business",
      carId: car._id,
      cartId: cart._id,
      startDate: cart.startDate,
      endDate: cart.endDate,
      rentalMode: rentalResult.rentalMode,
      totalPrice,
      pricingSnapshot: rentalResult.pricingSnapshot,
      paymentOption: selectedPaymentOption,
      depositAmount: paymentAmounts.depositAmount,
      remainingAmount: paymentAmounts.remainingAmount,
      paidAmount: paymentAmounts.paidAmount,
      isDepositRefundable: true,
      pickupAddressSnapshot: this.getPickupAddressSnapshot(car),
      returnAddressSnapshot: this.getPickupAddressSnapshot(car),
      renterInfo: normalizedRenterInfo,
      status: BookingStatusEnum.REQUESTED, // Booking từ giỏ hàng cũng phải chờ chủ xe duyệt trước
    });

    void sendBookingCreatedMail(booking);
    void notificationCenterService.notifyBookingCreated(booking, authUser.userId);

    cart.status = CartStatusEnum.BOOKED;
    await cart.save();

    return res.status(201).json({
      status: 201,
      code: "201",
      message: "Đã gửi yêu cầu đặt xe từ giỏ hàng, vui lòng chờ chủ xe xác nhận",
      data: { booking },
    });
  }

  async getMyBookings(req: Request, res: Response) {
    const authUser = (req as any).user;

    await expireAbandonedPendingBookings();

    const bookings = await BookingModel.find({
      userId: authUser.userId,
      isDeleted: false,
    })
      .populate("carId")
      .populate("businessId")
      .populate("ownerId", "-password -otpCode")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { bookings },
    });
  }

  private getPaymentTodoOwnerName(booking: any) {
    const owner = booking.ownerId;
    const business = booking.businessId;

    if (booking.ownerType === OwnerTypeEnum.USER) {
      return owner?.name || "Người dùng ký gửi";
    }

    return (
      owner?.businessName ||
      business?.businessName ||
      business?.userId?.name ||
      "Doanh nghiệp"
    );
  }

  private buildPaymentTodoCarPayload(car: any) {
    return {
      carId: String(car?._id || ""),
      carName: car?.name || "Xe BQDrive",
      carImage: Array.isArray(car?.images) ? car.images.find(Boolean) || "" : "",
      licensePlate: car?.licensePlate || "",
    };
  }

  async getMyPaymentTodos(req: Request, res: Response) {
    const authUser = (req as any).user;

    await expireAbandonedPendingBookings();

    const excludedStatuses = [
      BookingStatusEnum.COMPLETED,
      BookingStatusEnum.CANCELLED,
      BookingStatusEnum.REJECTED,
      BookingStatusEnum.NO_SHOW,
    ];

    const bookings = await BookingModel.find({
      userId: authUser.userId,
      remainingAmount: { $gt: 0 },
      status: { $nin: excludedStatuses },
      isDeleted: false,
    } as any)
      .populate("carId", "name images licensePlate")
      .populate("businessId", "businessName userId")
      .populate("ownerId", "name businessName")
      .sort({ startDate: 1, createdAt: -1 });

    const todos = [];

    for (const booking of bookings) {
      const summary = await buildPaymentSummaryForBooking(booking);

      if (Number(summary.remainingAmount || 0) <= 0) {
        continue;
      }

      const plainBooking = booking.toObject();
      const carPayload = this.buildPaymentTodoCarPayload(plainBooking.carId);

      todos.push({
        bookingId: String(booking._id),
        bookingCode: String(booking._id).slice(-8).toUpperCase(),
        ...carPayload,
        startDate: plainBooking.startDate,
        endDate: plainBooking.endDate,
        totalPrice: summary.totalPrice,
        paidAmount: summary.paidAmount,
        remainingAmount: summary.remainingAmount,
        paymentStatus: summary.paymentStatus,
        bookingStatus: plainBooking.status,
        ownerName: this.getPaymentTodoOwnerName(plainBooking),
      });
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      success: true,
      message: "success",
      data: { todos },
    });
  }

  async quoteBooking(req: Request, res: Response) {
    const { carId, startDate, endDate, rentalMode, delivery } = req.body;

    if (!carId || !startDate || !endDate || !rentalMode) {
      throw ErrorHelper.requestDataInvalid(
        "Thiếu carId, startDate hoặc endDate",
      );
    }

    if (!Object.values(RentalModeEnum).includes(rentalMode)) {
      throw ErrorHelper.requestDataInvalid("Hình thức thuê không hợp lệ");
    }

    const car = await CarModel.findOne({
      _id: carId,
      status: { $in: BOOKABLE_CAR_STATUSES },
      isDeleted: false,
    } as any);

    if (!car || (car as any).isHidden || car.status === CarStatusEnum.HIDDEN) {
      throw ErrorHelper.recordNotFound("Xe");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    this.validateRentalDateRange(start, end);

    const rentalResult = await this.applyDeliveryToRentalResult(
      car,
      await calculateRentalPrice(car, start, end, rentalMode),
      delivery,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        quote: this.buildQuoteResponse(rentalResult),
      },
    });
  }

  async getMyBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      userId: authUser.userId,
      isDeleted: false,
    } as any)
      .populate("carId")
      .populate("businessId")
      .populate("ownerId", "-password -otpCode");

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { booking },
    });
  }

  async getBusinessBookings(req: Request, res: Response) {
    const authUser = (req as any).user;

    const owner = await this.getOwnerContext(authUser);
    await expireAbandonedPendingBookings();

    const bookings = await BookingModel.find({
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    })
      .populate("userId", "-password")
      .populate("carId")
      .sort({ createdAt: -1 });
    const visibleBookingIds = bookings.map((booking) => booking._id);
    const [payments, returnInspections] = await Promise.all([
      PaymentModel.find({
        bookingId: { $in: visibleBookingIds },
      })
        .sort({ createdAt: -1 })
        .lean(),
      ReturnInspectionModel.find({
        bookingId: { $in: visibleBookingIds },
        isDeleted: false,
      } as any).lean(),
    ]);
    const paymentByBookingId = new Map<string, any>();
    const inspectionByBookingId = new Map<string, any>();

    for (const payment of payments) {
      const bookingId = String(payment.bookingId);
      const currentPayment = paymentByBookingId.get(bookingId);

      if (
        !currentPayment ||
        (payment.method === "CASH" && payment.status === "PENDING")
      ) {
        paymentByBookingId.set(bookingId, payment);
      }
    }

    returnInspections.forEach((inspection) => {
      inspectionByBookingId.set(String(inspection.bookingId || ""), inspection);
    });

    const bookingsWithPayment = bookings.map((booking) => ({
      ...booking.toObject(),
      payment: paymentByBookingId.get(String(booking._id)) || null,
      returnInspection: inspectionByBookingId.get(String(booking._id)) || null,
    }));

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: { bookings: bookingsWithPayment },
    });
  }

  private getOwnerHistoryPaymentStatus(
    totalPrice: number,
    depositAmount: number,
    paidAmount: number,
    payments: any[],
  ) {
    const hasPendingPayment = payments.some(
      (payment) => payment.status === PaymentStatusEnum.PENDING,
    );

    if (totalPrice > 0 && paidAmount >= totalPrice) return "PAID_FULL";
    if (paidAmount > 0) {
      return depositAmount > 0 && paidAmount >= depositAmount
        ? "DEPOSIT_PAID"
        : "PARTIAL";
    }

    return hasPendingPayment ? "PENDING" : "UNPAID";
  }

  private buildOwnerHistoryCarPayload(car: any) {
    const brand = car?.brandId;

    return {
      id: String(car?._id || ""),
      name: car?.name || "Xe đã bị xóa hoặc không còn tồn tại",
      brand:
        typeof brand === "object"
          ? brand?.name || ""
          : car?.brand || car?.brandName || "",
      model: car?.model || "",
      plateNumber: car?.licensePlate || "",
      image: Array.isArray(car?.images) ? car.images.find(Boolean) || "" : "",
    };
  }

  private buildOwnerHistoryRenterPayload(booking: any) {
    const renterInfo = booking?.renterInfo || {};
    const user = booking?.userId || {};

    return {
      id: String(user?._id || booking?.userId || ""),
      fullName: renterInfo.fullName || user.name || "--",
      email: renterInfo.email || user.email || "--",
      phone: renterInfo.phone || user.phone || "--",
      cccdNumber: renterInfo.cccdNumber || "",
      driverLicenseNumber: renterInfo.driverLicenseNumber || "",
    };
  }

  private buildOwnerHistoryOwnerPayload(owner: any, booking: any) {
    const ownerType = (booking as any).ownerType || OwnerTypeEnum.BUSINESS;

    if (ownerType === OwnerTypeEnum.USER) {
      return {
        id: String((booking as any).ownerId || ""),
        type: OwnerTypeEnum.USER,
        name: owner?.name || "Người dùng ký gửi",
      };
    }

    return {
      id: String(owner?.business?._id || (booking as any).ownerId || booking?.businessId || ""),
      type: OwnerTypeEnum.BUSINESS,
      name: owner?.business?.businessName || "Doanh nghiệp",
    };
  }

  private buildOwnerHistoryPaymentPayload(payment: any) {
    return {
      id: String(payment._id || ""),
      paymentCode: String(payment._id || "").slice(-8).toUpperCase(),
      amount: Number(payment.amount || 0),
      method: payment.method || "",
      status: payment.status || "",
      paymentType: payment.paymentType || "",
      transactionCode: payment.transactionCode || "",
      paidAt: payment.paidAt || null,
      createdAt: payment.createdAt || null,
    };
  }

  private matchesOwnerHistoryKeyword(item: any, keyword: string) {
    if (!keyword) return true;

    const normalizedKeyword = keyword.toLowerCase();
    const fields = [
      item.bookingCode,
      item.car?.name,
      item.car?.brand,
      item.car?.plateNumber,
      item.renter?.fullName,
      item.renter?.email,
      item.renter?.phone,
    ];

    return fields.some((field) =>
      String(field || "").toLowerCase().includes(normalizedKeyword),
    );
  }

  async getOwnerBookingHistory(req: Request, res: Response) {
    const authUser = (req as any).user;
    const owner = await this.getOwnerContext(authUser);

    if (!owner) {
      return res.status(200).json({
        status: 200,
        code: "200",
        message: "success",
        data: {
          bookings: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        },
      });
    }

    await expireAbandonedPendingBookings();

    const {
      status,
      paymentStatus,
      carId,
      keyword,
      fromDate,
      toDate,
      page = "1",
      limit = "10",
      sort = "newest",
    } = req.query as Record<string, string>;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const dateFilter: Record<string, Date> = {};

    if (fromDate) {
      const from = new Date(fromDate);
      if (!Number.isNaN(from.getTime())) dateFilter.$gte = from;
    }

    if (toDate) {
      const to = new Date(toDate);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        dateFilter.$lte = to;
      }
    }

    const bookingFilter: Record<string, any> = {
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    };

    if (status && status !== "ALL") {
      bookingFilter.status = status;
    }

    if (carId && carId !== "ALL") {
      bookingFilter.carId = carId;
    }

    if (Object.keys(dateFilter).length > 0) {
      bookingFilter.startDate = dateFilter;
    }

    const bookings = await BookingModel.find(bookingFilter as any)
      .populate("userId", "-password -otpCode")
      .populate({
        path: "carId",
        populate: { path: "brandId", select: "name logo" },
      })
      .sort(
        sort === "oldest"
          ? { createdAt: 1 }
          : sort === "startDate"
            ? { startDate: -1 }
            : { createdAt: -1 },
      );
    const bookingIds = bookings.map((booking) => booking._id);
    const [payments, contracts] = await Promise.all([
      PaymentModel.find({ bookingId: { $in: bookingIds } })
        .sort({ createdAt: 1 })
        .lean(),
      ContractModel.find({
        bookingId: { $in: bookingIds },
        isDeleted: false,
      })
        .select("_id contractCode status bookingId")
        .lean(),
    ]);
    const paymentsByBookingId = new Map<string, any[]>();
    const contractByBookingId = new Map<string, any>();

    payments.forEach((payment) => {
      const bookingId = String(payment.bookingId || "");
      paymentsByBookingId.set(bookingId, [
        ...(paymentsByBookingId.get(bookingId) || []),
        payment,
      ]);
    });

    contracts.forEach((contract) => {
      contractByBookingId.set(String(contract.bookingId || ""), contract);
    });

    const histories = bookings.map((booking) => {
      const plainBooking = booking.toObject();
      const bookingPayments = paymentsByBookingId.get(String(booking._id)) || [];
      const paidAmount = bookingPayments
        .filter((payment) => payment.status === PaymentStatusEnum.PAID)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const totalPrice = Number(plainBooking.totalPrice || 0);
      const depositAmount = Number(plainBooking.depositAmount || 0);
      const remainingAmount = Math.max(totalPrice - Math.min(paidAmount, totalPrice), 0);
      const summaryStatus = this.getOwnerHistoryPaymentStatus(
        totalPrice,
        depositAmount,
        paidAmount,
        bookingPayments,
      );
      const contract = contractByBookingId.get(String(booking._id));

      return {
        bookingId: String(booking._id),
        bookingCode: String(booking._id).slice(-8).toUpperCase(),
        status: plainBooking.status || "",
        paymentStatus: summaryStatus,
        rentalMode: plainBooking.rentalMode || "",
        startDate: plainBooking.startDate,
        endDate: plainBooking.endDate,
        pickupTime: plainBooking.startDate,
        returnTime: plainBooking.endDate,
        pickupAddressSnapshot: plainBooking.pickupAddressSnapshot || "",
        returnAddressSnapshot: plainBooking.returnAddressSnapshot || "",
        note: plainBooking.note || "",
        car: this.buildOwnerHistoryCarPayload(plainBooking.carId),
        renter: this.buildOwnerHistoryRenterPayload(plainBooking),
        owner: this.buildOwnerHistoryOwnerPayload(owner, plainBooking),
        pricing: {
          totalPrice,
          depositAmount,
          paidAmount: Math.min(paidAmount, totalPrice),
          remainingAmount,
        },
        paymentSummary: {
          totalPrice,
          paidAmount: Math.min(paidAmount, totalPrice),
          remainingAmount,
          status: summaryStatus,
        },
        payments: bookingPayments.map((payment) =>
          this.buildOwnerHistoryPaymentPayload(payment),
        ),
        contract: contract
          ? {
              id: String(contract._id || ""),
              contractCode: contract.contractCode || "",
              status: getContractStatusForBookingStatus(plainBooking.status),
            }
          : null,
        createdAt: plainBooking.createdAt,
        completedAt:
          plainBooking.status === BookingStatusEnum.COMPLETED
            ? plainBooking.updatedAt
            : null,
        cancelledAt:
          plainBooking.status === BookingStatusEnum.CANCELLED
            ? plainBooking.updatedAt
            : null,
        noShowAt: plainBooking.noShowAt || null,
      };
    });
    const filteredHistories = histories.filter(
      (item) =>
        (!paymentStatus || paymentStatus === "ALL" || item.paymentStatus === paymentStatus) &&
        this.matchesOwnerHistoryKeyword(item, String(keyword || "").trim()),
    );
    const total = filteredHistories.length;
    const totalPages = Math.ceil(total / limitNumber);
    const pagedHistories = filteredHistories.slice(
      (pageNumber - 1) * limitNumber,
      pageNumber * limitNumber,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        bookings: pagedHistories,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages,
        },
      },
    });
  }

  async cancelBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { cancelReason } = req.body;

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      userId: authUser.userId,
      status: {
        $in: [
          BookingStatusEnum.REQUESTED, // Khách được hủy khi chủ xe chưa duyệt
          BookingStatusEnum.OWNER_APPROVED, // Khách được hủy khi đã duyệt nhưng chưa thanh toán
          BookingStatusEnum.PAYMENT_PENDING, // Khách được hủy nếu đang chờ thanh toán và chưa trả tiền
          BookingStatusEnum.PENDING, // Trạng thái cũ
          BookingStatusEnum.WAITING_PAYMENT, // Trạng thái cũ
          BookingStatusEnum.CONFIRMED, // Trạng thái cũ trước khi tách OWNER_APPROVED/PAID
        ],
      },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    hydrateLegacyBookingOwner(booking);
    booking.status = BookingStatusEnum.CANCELLED;
    booking.cancelReason = cancelReason || "Customer hủy booking";
    await booking.save();
    void notificationCenterService.notifyBookingCancelled(booking, authUser.userId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Hủy booking thành công",
      data: { booking },
    });
  }

  async confirmBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    const owner = await this.getOwnerContext(authUser);
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: { $in: OWNER_REVIEW_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    hydrateLegacyBookingOwner(booking);

    if (!hasCompleteRenterInfo((booking as any).renterInfo)) {
      throw ErrorHelper.requestDataInvalid(RENTER_INFO_MISSING_FOR_CONFIRM_MESSAGE);
    }

    await ensureNoOverlappedActiveBooking(booking);

    const car = await CarModel.findOne({
      _id: booking.carId,
      ...this.buildOwnerFilter(owner),
      status: { $in: BOOKABLE_CAR_STATUSES },
      isDeleted: false,
    } as any);

    if (!car) {
      throw ErrorHelper.requestDataInvalid("Xe hiện không khả dụng để xác nhận");
    }
    booking.status = BookingStatusEnum.OWNER_APPROVED; // Chủ xe đồng ý: khách bắt đầu được tạo hợp đồng/thanh toán
    await booking.save();
    void sendBookingApprovedMail(booking);
    void notificationCenterService.notifyBookingApproved(booking, authUser.userId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Xác nhận booking thành công",
      data: { booking },
    });
  }

  async rejectBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { rejectReason } = req.body;

    const owner = await this.getOwnerContext(authUser);
    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: { $in: OWNER_REVIEW_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking PENDING");
    }

    hydrateLegacyBookingOwner(booking);
    booking.status = BookingStatusEnum.REJECTED;
    booking.cancelReason = rejectReason || "Business rejected booking";
    await booking.save();
    void sendBookingRejectedMail(booking);
    void notificationCenterService.notifyBookingRejected(
      booking,
      booking.cancelReason,
      authUser.userId,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Reject booking success",
      data: { booking },
    });
  }

  async confirmRemainingCash(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const note = String(req.body?.note || "").trim();
    const owner = await this.getOwnerContext(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: {
        $nin: [
          BookingStatusEnum.COMPLETED,
          BookingStatusEnum.CANCELLED,
          BookingStatusEnum.REJECTED,
          BookingStatusEnum.NO_SHOW,
        ],
      },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn không có quyền xác nhận thanh toán booking này.",
      );
    }

    hydrateLegacyBookingOwner(booking);

    const allowedStatuses = [
      BookingStatusEnum.OWNER_APPROVED,
      BookingStatusEnum.PAYMENT_PENDING,
      BookingStatusEnum.PAID,
      BookingStatusEnum.WAITING_PAYMENT,
      BookingStatusEnum.CONFIRMED,
      BookingStatusEnum.IN_PROGRESS,
    ];

    if (!allowedStatuses.includes(booking.status as BookingStatusEnum)) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chưa đủ điều kiện xác nhận thu phần còn lại.",
      );
    }

    const result = await this.confirmRemainingCashPayment(
      booking,
      authUser,
      note,
    );
    if (result.payment) {
      void notificationCenterService.notifyCashPaymentConfirmed(
        booking,
        result.payment,
        authUser.userId,
      );
    }
    const freshBooking = await BookingModel.findById(booking._id)
      .populate("userId", "-password")
      .populate("carId")
      .populate("businessId")
      .populate("ownerId", "-password -otpCode");

    return res.status(200).json({
      status: 200,
      code: "200",
      message: result.message,
      data: {
        booking: freshBooking || booking,
        payment: result.payment,
        paymentSummary: result.summary,
      },
    });
  }

  async handoverBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const owner = await this.getOwnerContext(authUser);

    await expireAbandonedPendingBookings();

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: { $in: HANDOVER_ALLOWED_BOOKING_STATUSES },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.requestDataInvalid("Booking chưa đủ điều kiện bàn giao");
    }

    hydrateLegacyBookingOwner(booking);
    await syncBookingPaymentFromPaidPayments(booking);
    await this.assertNoOtherActiveBookingForHandover(booking);

    if (
      Number(booking.paidAmount || 0) <
      this.getRequiredHandoverPaymentAmount(booking)
    ) {
      const pendingManualPayment =
        await this.findPendingManualPaymentForHandover(booking);

      if (!pendingManualPayment) {
        this.assertHandoverPaymentIsSatisfied(booking);
      } else {
        pendingManualPayment.status = PaymentStatusEnum.PAID;
        pendingManualPayment.paidAt = new Date();
        await pendingManualPayment.save();
        await syncBookingPaymentFromPaidPayments(booking);
      }
    }

    this.assertHandoverPaymentIsSatisfied(booking);
    await this.confirmPendingManualRemainingAtHandover(booking);
    await this.markBookingCarRented(booking);

    booking.status = BookingStatusEnum.IN_PROGRESS;
    await booking.save();
    void sendBookingHandoverMail(booking);
    void notificationCenterService.notifyHandoverCompleted(booking, authUser.userId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Bàn giao xe thành công",
      data: { booking },
    });
  }

  async receiveReturn(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const owner = await this.getOwnerContext(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: BookingStatusEnum.IN_PROGRESS,
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.requestDataInvalid(
        "Booking chưa ở trạng thái đang thuê hoặc bạn không có quyền tiếp nhận xe trả.",
      );
    }

    hydrateLegacyBookingOwner(booking);

    const existedInspection = await this.findReturnInspectionForBooking(booking._id);

    if (existedInspection) {
      throw ErrorHelper.requestDataInvalid(
        "Xe đã được tiếp nhận trả trước đó.",
      );
    }

    const actualReturnAt = new Date(req.body?.actualReturnAt || new Date());

    if (Number.isNaN(actualReturnAt.getTime())) {
      throw ErrorHelper.requestDataInvalid("Thời gian trả xe thực tế không hợp lệ.");
    }

    if (actualReturnAt.getTime() < new Date(booking.startDate).getTime()) {
      throw ErrorHelper.requestDataInvalid(
        "Thời gian trả xe không được trước thời gian nhận xe.",
      );
    }

    const returnOdometerRaw = req.body?.returnOdometer;
    const returnFuelLevelRaw = req.body?.returnFuelLevel;
    const returnOdometer =
      returnOdometerRaw === undefined || returnOdometerRaw === ""
        ? undefined
        : Number(returnOdometerRaw);
    const returnFuelLevel =
      returnFuelLevelRaw === undefined || returnFuelLevelRaw === ""
        ? undefined
        : Number(returnFuelLevelRaw);

    if (
      returnOdometer !== undefined &&
      (!Number.isFinite(returnOdometer) || returnOdometer < 0)
    ) {
      throw ErrorHelper.requestDataInvalid("Số kilomet lúc trả không hợp lệ.");
    }

    if (
      returnFuelLevel !== undefined &&
      (!Number.isFinite(returnFuelLevel) ||
        returnFuelLevel < 0 ||
        returnFuelLevel > 100)
    ) {
      throw ErrorHelper.requestDataInvalid(
        "Mức nhiên liệu lúc trả phải nằm trong khoảng 0 đến 100.",
      );
    }

    const conditionNotes = String(req.body?.conditionNotes || "").trim();

    if (conditionNotes.length > 1000) {
      throw ErrorHelper.requestDataInvalid(
        "Ghi chú tình trạng xe không được vượt quá 1000 ký tự.",
      );
    }

    const lateMinutes = this.getLateReturnMinutes(booking, actualReturnAt);

    const inspectionPayload: any = {
      bookingId: booking._id,
      carId: booking.carId,
      renterId: booking.userId,
      ownerId: booking.ownerId || booking.businessId,
      ownerType: booking.ownerType || OwnerTypeEnum.BUSINESS,
      ownerModel:
        (booking.ownerType || OwnerTypeEnum.BUSINESS) === OwnerTypeEnum.USER
          ? "User"
          : "Business",
      receivedAt: new Date(),
      receivedBy: authUser.userId,
      actualReturnAt,
      returnPhotos: this.normalizeReturnPhotos(req.body?.returnPhotos),
      conditionNotes,
      isLate: lateMinutes > 0,
      lateMinutes,
      hasDamage: Boolean(req.body?.hasDamage),
      hasCleaningIssue: Boolean(req.body?.hasCleaningIssue),
      hasFuelShortage: Boolean(req.body?.hasFuelShortage),
      inspectionStatus: ReturnInspectionStatusEnum.RECEIVED,
    };

    if (returnOdometer !== undefined) {
      inspectionPayload.returnOdometer = returnOdometer;
    }

    if (returnFuelLevel !== undefined) {
      inspectionPayload.returnFuelLevel = returnFuelLevel;
    }

    const inspection = await ReturnInspectionModel.create(inspectionPayload);

    booking.status = BookingStatusEnum.RETURN_INSPECTION;
    await booking.save();
    void notificationCenterService.notifyReturnReceived(booking, authUser.userId);

    const completionState = await this.buildReturnCompletionState(booking, inspection);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã tiếp nhận xe trả. Vui lòng kiểm tra tình trạng xe.",
      data: { booking, inspection, completionState },
    });
  }

  async getReturnInspection(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const booking = await this.findBookingForReturnInspectionRead(id, authUser);

    if (!booking) {
      throw ErrorHelper.recordNotFound("Booking");
    }

    hydrateLegacyBookingOwner(booking);
    const inspection = await this.refreshInspectionStatusFromExtraCharges(booking);
    const extraCharges = await ExtraChargeModel.find({
      bookingId: booking._id,
      isDeleted: false,
    } as any).sort({ createdAt: -1 });
    const completionState = await this.buildReturnCompletionState(
      booking,
      inspection,
    );

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "success",
      data: {
        booking,
        inspection,
        extraCharges,
        completionState,
      },
    });
  }

  async clearReturnInspection(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const owner = await this.getOwnerContext(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: {
        $in: [
          BookingStatusEnum.RETURN_INSPECTION,
          BookingStatusEnum.AWAITING_EXTRA_CHARGE,
        ],
      },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn không có quyền kiểm tra xe hoặc booking chưa ở bước kiểm tra.",
      );
    }

    hydrateLegacyBookingOwner(booking);
    const inspection = await this.findReturnInspectionForBooking(booking._id);

    if (!inspection) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn phải tiếp nhận xe trả trước khi xác nhận kiểm tra.",
      );
    }

    if (inspection.inspectionStatus === ReturnInspectionStatusEnum.CLEARED) {
      throw ErrorHelper.requestDataInvalid("Biên bản kiểm tra đã được hoàn tất.");
    }

    if (await this.hasPendingExtraCharge(booking)) {
      inspection.inspectionStatus = ReturnInspectionStatusEnum.CHARGES_PENDING;
      await inspection.save();
      booking.status = BookingStatusEnum.AWAITING_EXTRA_CHARGE;
      await booking.save();

      throw ErrorHelper.requestDataInvalid(
        "Booking vẫn còn phí phát sinh đang chờ xử lý.",
      );
    }

    const conditionNotes = String(req.body?.conditionNotes || "").trim();

    if (conditionNotes) {
      inspection.conditionNotes = conditionNotes.slice(0, 1000);
    }

    inspection.inspectionStatus = ReturnInspectionStatusEnum.CLEARED;
    inspection.inspectedAt = new Date();
    inspection.inspectedBy = authUser.userId;
    await inspection.save();

    booking.status = BookingStatusEnum.RETURN_INSPECTION;
    await booking.save();
    void notificationCenterService.notifyReturnInspectionCleared(
      booking,
      authUser.userId,
    );

    const completionState = await this.buildReturnCompletionState(booking, inspection);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã xác nhận xe không có phát sinh.",
      data: { booking, inspection, completionState },
    });
  }

  async completeBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);

    const owner = await this.getOwnerContext(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      status: {
        $in: [
          BookingStatusEnum.RETURN_INSPECTION,
          BookingStatusEnum.AWAITING_EXTRA_CHARGE,
        ],
      },
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn phải tiếp nhận và kiểm tra xe trước khi hoàn tất booking.",
      );
    }

    hydrateLegacyBookingOwner(booking);
    const inspection = await this.findReturnInspectionForBooking(booking._id);

    if (!inspection) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn phải tiếp nhận và kiểm tra xe trước khi hoàn tất booking.",
      );
    }

    if (inspection.inspectionStatus !== ReturnInspectionStatusEnum.CLEARED) {
      throw ErrorHelper.requestDataInvalid(
        "Việc kiểm tra tình trạng xe chưa hoàn tất.",
      );
    }

    await syncBookingPaymentFromPaidPayments(booking);
    this.assertBookingPaymentIsSettled(booking);
    await this.assertExtraChargesAreSettled(booking);
    booking.status = BookingStatusEnum.COMPLETED;
    await booking.save();
    await syncContractFromBooking(booking);
    await releaseCarIfNoConfirmedBooking(booking.carId);
    void sendBookingCompletedMail(booking);
    void notificationCenterService.notifyBookingCompleted(booking, authUser.userId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Hoàn tất booking thành công",
      data: { booking },
    });
  }

  async noShowBooking(req: Request, res: Response) {
    const authUser = (req as any).user;
    const id = String(req.params.id);
    const { noShowReason } = req.body;

    const owner = await this.getOwnerContext(authUser);

    const booking = await BookingModel.findOne({
      _id: id,
      ...this.buildOwnerFilter(owner),
      isDeleted: false,
    } as any);

    if (!booking) {
      throw ErrorHelper.requestDataInvalid(
        "Bạn không có quyền xử lý booking này.",
      );
    }

    hydrateLegacyBookingOwner(booking);
    this.assertBookingCanBeNoShow(booking);

    booking.status = BookingStatusEnum.NO_SHOW;
    booking.isDepositRefundable = false;
    booking.noShowReason =
      noShowReason || "Khách hàng không đến nhận xe đúng thời gian.";
    booking.noShowAt = new Date();

    await booking.save();
    await releaseCarIfNoConfirmedBooking(booking.carId);
    void sendBookingNoShowMail(booking);
    void notificationCenterService.notifyNoShow(booking, authUser.userId);

    return res.status(200).json({
      status: 200,
      code: "200",
      message: "Đã đánh dấu khách không nhận xe.",
      data: { booking },
    });
  }
}

export default new BookingRoute().router;
