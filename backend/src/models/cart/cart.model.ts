import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import { CartStatusEnum, RentalModeEnum } from "../../constants/model.const";

export type ICart = BaseDocument & {
  userId: mongoose.Types.ObjectId;
  carId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  rentalMode: string;
  totalPrice: number;
  pricingSnapshot?: {
    rentalMode: string;
    weekdayPricePerDay?: number;
    weekendPricePerDay?: number;
    holidayPricePerDay?: number;
    pricePerHour?: number;
    weekendPricePerHour?: number;
    holidayPricePerHour?: number;
    breakdown?: Array<{
      date: string;
      type: string;
      label?: string;
      unitCount: number;
      unitPrice: number;
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
      type: mongoose.Schema.Types.Mixed,
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
