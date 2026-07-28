import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  CartStatusEnum,
  PricingDateTypeEnum,
  RentalModeEnum,
} from "../../constants/model.const";

export type ICart = BaseDocument & {
  userId: mongoose.Types.ObjectId;
  carId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  rentalMode: string;
  totalPrice: number;
  pricingSnapshot?: {
    rentalMode: string;
    basePricePerUnit: number;
    weekendSurchargePerUnit: number;
    holidaySurchargePerUnit: number;
    breakdown: Array<{
      dateOrTime: string;
      priceType: PricingDateTypeEnum;
      basePrice: number;
      surchargeAmount: number;
      finalPrice: number;
      unitCount: number;
      price: number;
    }>;
    subtotal: number;
  };
  expiredAt: Date;
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
