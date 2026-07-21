import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  ContractStatusEnum,
  OwnerTypeEnum,
  PaymentOptionEnum,
} from "../../constants/model.const";

export type IContract = BaseDocument & {
  bookingId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  carId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  ownerType: OwnerTypeEnum;
  ownerModel: string;
  businessId?: mongoose.Types.ObjectId;
  renterName: string;
  renterPhone: string;
  renterIdentityNumber: string;
  renterAddress: string;
  note?: string;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  depositAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus?: string;
  paymentOption: string;
  pickupAddressSnapshot?: string;
  returnAddressSnapshot?: string;
  ownerAddressSnapshot?: string;
  status: ContractStatusEnum;
  contractCode: string;
  signedAt?: Date;
  isDeleted?: boolean;
};

const contractSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },
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
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "ownerModel",
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
    renterName: {
      type: String,
      required: true,
      trim: true,
    },
    renterPhone: {
      type: String,
      required: true,
      trim: true,
    },
    renterIdentityNumber: {
      type: String,
      required: true,
      trim: true,
    },
    renterAddress: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    depositAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentStatus: {
      type: String,
      trim: true,
    },
    paymentOption: {
      type: String,
      enum: Object.values(PaymentOptionEnum),
      required: true,
    },
    pickupAddressSnapshot: {
      type: String,
      trim: true,
    },
    returnAddressSnapshot: {
      type: String,
      trim: true,
    },
    ownerAddressSnapshot: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(ContractStatusEnum),
      default: ContractStatusEnum.ACTIVE,
    },
    contractCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    signedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const ContractModel = mongoose.model<IContract>("Contract", contractSchema);

export { ContractModel };
