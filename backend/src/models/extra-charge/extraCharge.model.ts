import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  ExtraChargeStatusEnum,
  ExtraChargeTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from "../../constants/model.const";

export type IExtraCharge = BaseDocument & {
  /** Booking phát sinh khoản phụ thu. */
  bookingId: mongoose.Types.ObjectId;
  /** Xe liên quan đến phụ thu. */
  carId: mongoose.Types.ObjectId;
  /** Renter chịu khoản phụ thu. */
  renterId: mongoose.Types.ObjectId;
  /** Chủ xe tạo/xác nhận phụ thu. */
  ownerId: mongoose.Types.ObjectId;
  /** Loại phụ thu: trễ, vượt km, hư hỏng, vệ sinh... */
  type: ExtraChargeTypeEnum;
  /** Số tiền phụ thu, đơn vị VND. */
  amount: number;
  /** Mô tả căn cứ và nội dung phụ thu. */
  description: string;
  /** Ảnh bằng chứng do chủ xe gửi. */
  evidenceImages?: string[];
  /** Snapshot số km làm căn cứ tính phụ thu. */
  mileageSnapshot?: {
    /** Chế độ thuê dùng để tính hạn mức. */
    rentalMode: string;
    /** Km bao gồm mỗi ngày. */
    includedKmPerDay?: number;
    /** Km bao gồm mỗi giờ. */
    includedKmPerHour?: number;
    /** Số đơn vị tính. */
    billableUnits: number;
    /** ODO lúc bàn giao. */
    handoverOdometerKm: number;
    /** ODO lúc trả xe. */
    returnOdometerKm: number;
    /** Tổng km đã đi. */
    distanceTravelledKm: number;
    /** Tổng km được bao gồm. */
    totalIncludedKm: number;
    /** Km vượt hạn mức trước ân hạn. */
    overageKm: number;
    /** Km được miễn trừ. */
    graceKm: number;
    /** Km thực tế phải tính phí. */
    chargeableOverageKm: number;
    /** Đơn giá km vượt. */
    overageFeePerKm: number;
    /** Số tiền vượt km hệ thống đề xuất. */
    suggestedOverageAmount: number;
  };
  /** Snapshot số phút trễ và quy tắc tính phí trễ. */
  lateReturnSnapshot?: {
    /** Giờ trả theo lịch booking. */
    scheduledReturnAt: Date;
    /** Giờ trả thực tế. */
    actualReturnAt: Date;
    /** Tổng số phút trả trễ. */
    lateMinutes: number;
    /** Số phút ân hạn. */
    graceMinutes: number;
    /** Số phút bị tính phí. */
    chargeableMinutes: number;
    /** Kích thước block tính phí. */
    blockMinutes: number;
    /** Số block bị tính. */
    chargedBlocks: number;
    /** Đơn giá mỗi block. */
    feePerBlock: number;
    /** Số tiền hệ thống tính theo snapshot. */
    calculatedAmount: number;
  };
  /** Lý do điều chỉnh số tiền phụ thu. */
  adjustmentReason?: string;
  /** Trạng thái chờ xác nhận/thanh toán/hoàn tất. */
  status: ExtraChargeStatusEnum;
  /** Payment dùng để thu phụ phí, nếu thanh toán online. */
  paymentId?: mongoose.Types.ObjectId;
  /** Phương thức thanh toán phụ phí. */
  paymentMethod?: PaymentMethodEnum;
  /** Thời điểm phụ phí được thanh toán. */
  paidAt?: Date;
  /** User xác nhận hoặc hủy phụ phí. */
  confirmedBy?: mongoose.Types.ObjectId;
  /** Vai trò người xác nhận. */
  confirmedByRole?: UserRoleEnum;
  /** Lý do hủy phụ phí. */
  cancelReason?: string;
  /** Xóa mềm phụ phí để giữ đối soát. */
  isDeleted?: boolean;
};

const extraChargeSchema = new mongoose.Schema(
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
    renterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(ExtraChargeTypeEnum),
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    evidenceImages: [
      {
        type: String,
        trim: true,
      },
    ],
    mileageSnapshot: {
      rentalMode: {
        type: String,
        trim: true,
      },
      includedKmPerDay: {
        type: Number,
        min: 1,
      },
      includedKmPerHour: {
        type: Number,
        min: 1,
      },
      billableUnits: {
        type: Number,
        min: 1,
      },
      handoverOdometerKm: {
        type: Number,
        min: 0,
      },
      returnOdometerKm: {
        type: Number,
        min: 0,
      },
      distanceTravelledKm: {
        type: Number,
        min: 0,
      },
      totalIncludedKm: {
        type: Number,
        min: 0,
      },
      overageKm: {
        type: Number,
        min: 0,
      },
      graceKm: {
        type: Number,
        min: 0,
      },
      chargeableOverageKm: {
        type: Number,
        min: 0,
      },
      overageFeePerKm: {
        type: Number,
        min: 0,
      },
      suggestedOverageAmount: {
        type: Number,
        min: 0,
      },
    },
    lateReturnSnapshot: {
      scheduledReturnAt: {
        type: Date,
      },
      actualReturnAt: {
        type: Date,
      },
      lateMinutes: {
        type: Number,
        min: 0,
      },
      graceMinutes: {
        type: Number,
        min: 0,
      },
      chargeableMinutes: {
        type: Number,
        min: 0,
      },
      blockMinutes: {
        type: Number,
        min: 1,
      },
      chargedBlocks: {
        type: Number,
        min: 0,
      },
      feePerBlock: {
        type: Number,
        min: 0,
      },
      calculatedAmount: {
        type: Number,
        min: 0,
      },
    },
    adjustmentReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: Object.values(ExtraChargeStatusEnum),
      default: ExtraChargeStatusEnum.PENDING,
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethodEnum),
    },
    paidAt: {
      type: Date,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    confirmedByRole: {
  type: String,
  enum: [
    UserRoleEnum.ADMIN,
    UserRoleEnum.USER,
  ],
},
    cancelReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

export const ExtraChargeModel = mongoose.model<IExtraCharge>(
  "ExtraCharge",
  extraChargeSchema,
);
