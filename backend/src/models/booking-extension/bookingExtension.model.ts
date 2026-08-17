import mongoose from "mongoose";

import { BaseDocument } from "../../base/baseModel";
import {
  BOOKING_EXTENSION_REQUEST_TYPE_VALUES,
  BOOKING_EXTENSION_STATUS_VALUES,
  BookingExtensionRequestTypeEnum,
  BookingExtensionStatusEnum,
  PricingDateTypeEnum,
  RentalModeEnum,
} from "../../constants/model.const";

export type IBookingExtension = BaseDocument & {
  /** Booking đang yêu cầu gia hạn/chuyển gói. */
  bookingId: mongoose.Types.ObjectId;
  /** Xe chịu ảnh hưởng của thời gian mới. */
  carId: mongoose.Types.ObjectId;
  /** User gửi yêu cầu, thường là renter. */
  requestedBy: mongoose.Types.ObjectId;
  /** Chủ xe đã phản hồi yêu cầu. */
  approvedBy?: mongoose.Types.ObjectId;
  /** Yêu cầu gia hạn giờ hoặc chuyển gói. */
  requestType?: BookingExtensionRequestTypeEnum;
  /** Chế độ thuê trước khi thay đổi. */
  sourceRentalMode?: RentalModeEnum;
  /** Chế độ thuê sau khi được duyệt. */
  targetRentalMode?: RentalModeEnum;
  /** Hạn mức km theo đơn vị mới. */
  targetIncludedKmPerUnit?: number;
  /** Phiên bản lịch xe dùng chống race condition. */
  carBookingRevision?: number;
  /** Thời điểm kết thúc cũ làm mốc tính phần tăng thêm. */
  oldEndAt: Date;
  /** Thời điểm kết thúc mới người thuê yêu cầu. */
  requestedEndAt: Date;
  /** Số phút được gia hạn thực tế. */
  additionalDurationMinutes: number;
  /** Số đơn vị tính tiền sau khi làm tròn theo gói. */
  billableUnits: number;
  /** Số tiền phụ trội phải thanh toán. */
  additionalAmount: number;
  /** Snapshot bảng giá dùng cho yêu cầu này. */
  pricingSnapshot: IBookingExtensionPricingSnapshot;
  /** Snapshot tài chính khi chuyển đổi giữa gói giờ/ngày. */
  conversionSnapshot?: {
    /** Thời điểm bắt đầu booking gốc. */
    bookingStartAt: Date;
    /** Tổng tiền hợp đồng trước chuyển đổi. */
    previousContractedTotal: number;
    /** Tổng tiền hệ thống tính lại. */
    calculatedConvertedTotal: number;
    /** Tổng tiền được áp dụng sau quy tắc làm tròn. */
    appliedConvertedTotal: number;
    /** Snapshot giá trước khi chuyển đổi. */
    pricingBefore?: IBookingExtensionPricingSnapshot & {
      /** Subtotal tiền thuê trước chuyển đổi. */
      rentalSubtotal?: number;
      /** Tỷ lệ phí nền tảng trước chuyển đổi. */
      platformFeeRate?: number;
      /** Phí nền tảng trước chuyển đổi. */
      platformFee?: number;
      /** Phí bảo hiểm mỗi ngày trước chuyển đổi. */
      insuranceFeePerDay?: number;
      /** Số ngày bảo hiểm trước chuyển đổi. */
      insuranceDays?: number;
      /** Tổng phí bảo hiểm trước chuyển đổi. */
      insuranceFee?: number;
      /** Phí giao xe trước chuyển đổi. */
      deliveryFee?: number;
      /** Tổng giá trước chuyển đổi. */
      totalPrice?: number;
    };
    /** Các khoản tiền sau chuyển đổi, dùng làm căn cứ đối soát. */
    financialAfter: {
      /** Subtotal tiền thuê sau chuyển đổi. */
      rentalSubtotal: number;
      /** Tỷ lệ phí nền tảng sau chuyển đổi. */
      platformFeeRate: number;
      /** Phí nền tảng sau chuyển đổi. */
      platformFee: number;
      /** Phí bảo hiểm mỗi ngày sau chuyển đổi. */
      insuranceFeePerDay: number;
      /** Số ngày bảo hiểm sau chuyển đổi. */
      insuranceDays: number;
      /** Tổng phí bảo hiểm sau chuyển đổi. */
      insuranceFee: number;
      /** Phí giao xe sau chuyển đổi. */
      deliveryFee: number;
      /** Tổng giá sau chuyển đổi. */
      totalPrice: number;
    };
    /** Chính sách km trước chuyển đổi. */
    mileageBefore?: IBookingExtensionMileageSnapshot;
    /** Chính sách km sau chuyển đổi. */
    mileageAfter?: IBookingExtensionMileageSnapshot;
  };
  /** Trạng thái yêu cầu: chờ duyệt, từ chối, đã thanh toán/kích hoạt... */
  status: BookingExtensionStatusEnum;
  /** Thời điểm renter gửi yêu cầu. */
  requestedAt: Date;
  /** Thời điểm chủ xe phản hồi. */
  ownerRespondedAt?: Date;
  /** Lý do từ chối yêu cầu. */
  rejectReason?: string;
  /** Hạn thanh toán phần gia hạn. */
  paymentDeadlineAt?: Date;
  /** Payment record cho khoản gia hạn. */
  paymentId?: mongoose.Types.ObjectId;
  /** Thời điểm gia hạn được kích hoạt vào booking. */
  activatedAt?: Date;
  /** Khóa chống nhiều yêu cầu gia hạn chồng nhau. */
  activeLockKey?: string;
  /** Xóa mềm yêu cầu gia hạn. */
  isDeleted: boolean;
};

export type IBookingExtensionPricingSnapshot = {
  /** Chế độ thuê dùng khi tính phần gia hạn. */
  rentalMode: RentalModeEnum;
  /** Đơn giá cơ sở theo đơn vị. */
  basePricePerUnit: number;
  /** Phụ thu cuối tuần theo đơn vị. */
  weekendSurchargePerUnit: number;
  /** Phụ thu ngày lễ theo đơn vị. */
  holidaySurchargePerUnit: number;
  /** Chi tiết giá từng ngày/khung giờ. */
  breakdown: Array<{
    /** Ngày hoặc khung giờ áp dụng. */
    dateOrTime: string;
    /** Loại ngày của dòng giá. */
    priceType: PricingDateTypeEnum;
    /** Giá cơ sở của dòng. */
    basePrice: number;
    /** Phụ thu của dòng. */
    surchargeAmount: number;
    /** Giá sau phụ thu. */
    finalPrice: number;
    /** Số đơn vị tính. */
    unitCount: number;
    /** Thành tiền dòng. */
    price: number;
  }>;
  /** Subtotal phần gia hạn. */
  subtotal: number;
};

export type IBookingExtensionMileageSnapshot = {
  /** Chế độ thuê của hạn mức km. */
  rentalMode: RentalModeEnum;
  /** Km bao gồm mỗi ngày. */
  includedKmPerDay?: number;
  /** Km bao gồm mỗi giờ. */
  includedKmPerHour?: number;
  /** Phí mỗi km vượt. */
  overageFeePerKm: number;
  /** Km ân hạn. */
  graceKm: number;
  /** Số đơn vị tính trong phần gia hạn. */
  billableUnits: number;
  /** Tổng km bao gồm sau khi gia hạn. */
  totalIncludedKm: number;
};

const pricingBreakdownSchema = new mongoose.Schema(
  {
    dateOrTime: { type: String, required: true, trim: true },
    priceType: {
      type: String,
      enum: Object.values(PricingDateTypeEnum),
      required: true,
    },
    basePrice: { type: Number, required: true, min: 0 },
    surchargeAmount: { type: Number, required: true, min: 0 },
    finalPrice: { type: Number, required: true, min: 0 },
    unitCount: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const conversionPricingSnapshotSchema = new mongoose.Schema(
  {
    rentalMode: {
      type: String,
      enum: Object.values(RentalModeEnum),
      required: true,
    },
    basePricePerUnit: { type: Number, required: true, min: 0 },
    weekendSurchargePerUnit: { type: Number, required: true, min: 0 },
    holidaySurchargePerUnit: { type: Number, required: true, min: 0 },
    breakdown: { type: [pricingBreakdownSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    rentalSubtotal: { type: Number, min: 0 },
    platformFeeRate: { type: Number, min: 0 },
    platformFee: { type: Number, min: 0 },
    insuranceFeePerDay: { type: Number, min: 0 },
    insuranceDays: { type: Number, min: 0 },
    insuranceFee: { type: Number, min: 0 },
    deliveryFee: { type: Number, min: 0 },
    totalPrice: { type: Number, min: 0 },
  },
  { _id: false },
);

const conversionMileageSnapshotSchema = new mongoose.Schema(
  {
    rentalMode: {
      type: String,
      enum: Object.values(RentalModeEnum),
      required: true,
    },
    includedKmPerDay: { type: Number, min: 1 },
    includedKmPerHour: { type: Number, min: 1 },
    overageFeePerKm: { type: Number, required: true, min: 0 },
    graceKm: { type: Number, required: true, min: 0 },
    billableUnits: { type: Number, required: true, min: 1 },
    totalIncludedKm: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const conversionSnapshotSchema = new mongoose.Schema(
  {
    bookingStartAt: { type: Date, required: true },
    previousContractedTotal: { type: Number, required: true, min: 0 },
    calculatedConvertedTotal: { type: Number, required: true, min: 0 },
    appliedConvertedTotal: { type: Number, required: true, min: 0 },
    pricingBefore: { type: conversionPricingSnapshotSchema },
    financialAfter: {
      rentalSubtotal: { type: Number, required: true, min: 0 },
      platformFeeRate: { type: Number, required: true, min: 0 },
      platformFee: { type: Number, required: true, min: 0 },
      insuranceFeePerDay: { type: Number, required: true, min: 0 },
      insuranceDays: { type: Number, required: true, min: 1 },
      insuranceFee: { type: Number, required: true, min: 0 },
      deliveryFee: { type: Number, required: true, min: 0 },
      totalPrice: { type: Number, required: true, min: 0 },
    },
    mileageBefore: { type: conversionMileageSnapshotSchema },
    mileageAfter: { type: conversionMileageSnapshotSchema },
  },
  { _id: false },
);

const bookingExtensionSchema = new mongoose.Schema<IBookingExtension>(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    requestType: {
      type: String,
      enum: BOOKING_EXTENSION_REQUEST_TYPE_VALUES,
      default: BookingExtensionRequestTypeEnum.EXTENSION,
      required: true,
      index: true,
    },
    sourceRentalMode: {
      type: String,
      enum: Object.values(RentalModeEnum),
    },
    targetRentalMode: {
      type: String,
      enum: Object.values(RentalModeEnum),
    },
    targetIncludedKmPerUnit: { type: Number, min: 0 },
    carBookingRevision: { type: Number, min: 0 },
    oldEndAt: { type: Date, required: true },
    requestedEndAt: { type: Date, required: true },
    additionalDurationMinutes: { type: Number, required: true, min: 1 },
    billableUnits: { type: Number, required: true, min: 1 },
    additionalAmount: { type: Number, required: true, min: 0 },
    pricingSnapshot: {
      rentalMode: {
        type: String,
        enum: Object.values(RentalModeEnum),
        required: true,
      },
      basePricePerUnit: { type: Number, required: true, min: 0 },
      weekendSurchargePerUnit: { type: Number, required: true, min: 0 },
      holidaySurchargePerUnit: { type: Number, required: true, min: 0 },
      breakdown: { type: [pricingBreakdownSchema], required: true },
      subtotal: { type: Number, required: true, min: 1 },
    },
    conversionSnapshot: {
      type: conversionSnapshotSchema,
      immutable: true,
      default: undefined,
    },
    status: {
      type: String,
      enum: BOOKING_EXTENSION_STATUS_VALUES,
      default: BookingExtensionStatusEnum.REQUESTED,
      required: true,
      index: true,
    },
    requestedAt: { type: Date, required: true, default: Date.now },
    ownerRespondedAt: { type: Date },
    rejectReason: { type: String, trim: true, maxlength: 500 },
    paymentDeadlineAt: { type: Date, index: true },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    activatedAt: { type: Date },
    activeLockKey: { type: String, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

bookingExtensionSchema.index({ bookingId: 1, createdAt: -1 });
bookingExtensionSchema.index(
  { activeLockKey: 1 },
  { unique: true, sparse: true },
);
bookingExtensionSchema.index({
  carId: 1,
  status: 1,
  oldEndAt: 1,
  requestedEndAt: 1,
  paymentDeadlineAt: 1,
});

export const BookingExtensionModel = mongoose.model<IBookingExtension>(
  "BookingExtension",
  bookingExtensionSchema,
);
