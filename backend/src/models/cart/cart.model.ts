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

const CartModel = mongoose.model<ICart>("Cart", cartSchema);
export { CartModel };
