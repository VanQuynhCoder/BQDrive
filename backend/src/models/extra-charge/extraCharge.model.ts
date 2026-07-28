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
  mileageSnapshot?: {
    rentalMode: string;
    includedKmPerDay?: number;
    includedKmPerHour?: number;
    billableUnits: number;
    handoverOdometerKm: number;
    returnOdometerKm: number;
    distanceTravelledKm: number;
    totalIncludedKm: number;
    overageKm: number;
    graceKm: number;
    chargeableOverageKm: number;
    overageFeePerKm: number;
    suggestedOverageAmount: number;
  };
  adjustmentReason?: string;
  status: ExtraChargeStatusEnum;
  paymentId?: mongoose.Types.ObjectId;
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
