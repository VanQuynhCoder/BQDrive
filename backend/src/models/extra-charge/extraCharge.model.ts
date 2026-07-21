import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  ExtraChargeStatusEnum,
  ExtraChargeTypeEnum,
  OwnerTypeEnum,
  PaymentMethodEnum,
} from "../../constants/model.const";

export type IExtraCharge = BaseDocument & {
  bookingId: mongoose.Types.ObjectId;
  carId: mongoose.Types.ObjectId;
  renterId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  ownerType: OwnerTypeEnum;
  ownerModel: string;
  type: ExtraChargeTypeEnum;
  amount: number;
  description: string;
  evidenceImages?: string[];
  status: ExtraChargeStatusEnum;
  paymentMethod?: PaymentMethodEnum;
  paidAt?: Date;
  confirmedBy?: mongoose.Types.ObjectId;
  confirmedByRole?: OwnerTypeEnum;
  cancelReason?: string;
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
      required: true,
      refPath: "ownerModel",
      index: true,
    },
    ownerType: {
      type: String,
      enum: Object.values(OwnerTypeEnum),
      required: true,
    },
    ownerModel: {
      type: String,
      enum: ["User", "Business"],
      required: true,
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
    status: {
      type: String,
      enum: Object.values(ExtraChargeStatusEnum),
      default: ExtraChargeStatusEnum.PENDING,
      index: true,
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
      enum: Object.values(OwnerTypeEnum),
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
