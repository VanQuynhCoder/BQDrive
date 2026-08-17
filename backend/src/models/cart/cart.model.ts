import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  CartStatusEnum,
  PricingDateTypeEnum,
  RentalModeEnum,
} from "../../constants/model.const";

export type ICart = BaseDocument & {
  /** User đang giữ xe trong giỏ. */
  userId: mongoose.Types.ObjectId;
  /** Xe được giữ tạm trong giỏ. */
  carId: mongoose.Types.ObjectId;
  /** Thời điểm bắt đầu thuê đã chọn. */
  startDate: Date;
  /** Thời điểm kết thúc thuê đã chọn. */
  endDate: Date;
  /** Hình thức thuê theo giờ hoặc theo ngày. */
  rentalMode: string;
  /** Tổng tiền tạm tính tại thời điểm thêm vào giỏ. */
  totalPrice: number;
  /** Snapshot bảng giá để hiển thị lại, không thay thế giá booking chốt. */
  pricingSnapshot?: {
    /** Chế độ thuê của snapshot giá. */
    rentalMode: string;
    /** Đơn giá cơ sở cho mỗi đơn vị tính. */
    basePricePerUnit: number;
    /** Phụ thu cuối tuần cho mỗi đơn vị. */
    weekendSurchargePerUnit: number;
    /** Phụ thu ngày lễ cho mỗi đơn vị. */
    holidaySurchargePerUnit: number;
    /** Chi tiết giá theo từng ngày/khung giờ. */
    breakdown: Array<{
      /** Ngày hoặc khung giờ áp dụng giá. */
      dateOrTime: string;
      /** Loại ngày dùng để chọn quy tắc giá. */
      priceType: PricingDateTypeEnum;
      /** Giá cơ sở của dòng giá. */
      basePrice: number;
      /** Khoản phụ thu của dòng giá. */
      surchargeAmount: number;
      /** Giá cuối cùng sau phụ thu. */
      finalPrice: number;
      /** Số đơn vị được tính trong dòng. */
      unitCount: number;
      /** Thành tiền của dòng chi tiết. */
      price: number;
    }>;
    /** Tổng subtotal trước các khoản ngoài tiền thuê. */
    subtotal: number;
  };
  /** Thời điểm giữ giỏ hết hạn tự động. */
  expiredAt: Date;
  /** Trạng thái giữ giỏ và khả năng chuyển sang booking. */
  status: string;
};

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    rentalMode: {
      type: String,
      enum: Object.values(RentalModeEnum),
      required: true,
      default: RentalModeEnum.DAILY,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    pricingSnapshot: {
      rentalMode: {
        type: String,
        enum: Object.values(RentalModeEnum),
      },
      basePricePerUnit: {
        type: Number,
        required: true,
        min: 0,
      },
      weekendSurchargePerUnit: {
        type: Number,
        required: true,
        min: 0,
      },
      holidaySurchargePerUnit: {
        type: Number,
        required: true,
        min: 0,
      },
      breakdown: [
        {
          dateOrTime: {
            type: String,
            required: true,
            trim: true,
          },
          priceType: {
            type: String,
            enum: Object.values(PricingDateTypeEnum),
            required: true,
          },
          basePrice: {
            type: Number,
            required: true,
            min: 0,
          },
          surchargeAmount: {
            type: Number,
            required: true,
            min: 0,
          },
          finalPrice: {
            type: Number,
            required: true,
            min: 0,
          },
          unitCount: {
            type: Number,
            required: true,
            min: 0,
          },
          price: {
            type: Number,
            required: true,
            min: 0,
          },
        },
      ],
      subtotal: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    expiredAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(CartStatusEnum),
      default: CartStatusEnum.ACTIVE,
    },
  },
  { timestamps: true },
);

cartSchema.index({ userId: 1, status: 1, expiredAt: 1, createdAt: -1 });
cartSchema.index({ carId: 1, status: 1, startDate: 1, endDate: 1, expiredAt: 1 });

const CartModel = mongoose.model<ICart>("Cart", cartSchema);
export { CartModel };
