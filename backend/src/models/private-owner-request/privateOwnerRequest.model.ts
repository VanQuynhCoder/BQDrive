import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import { PrivateOwnerRequestStatusEnum } from "../../constants/model.const";

export type IPrivateOwnerRequest = BaseDocument & {
  userId: mongoose.Types.ObjectId;
  fullName: string;
  phone: string;
  identityNumber: string;
  frontImage: string;
  backImage: string;
  address: string;
  reason?: string;
  status: PrivateOwnerRequestStatusEnum;
  adminNote?: string;
  approvedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  isDeleted?: boolean;
};

const privateOwnerRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    identityNumber: {
      type: String,
      required: true,
      trim: true,
    },
    frontImage: {
      type: String,
      required: true,
    },
    backImage: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
    },
    status: {
      type: String,
      enum: Object.values(PrivateOwnerRequestStatusEnum),
      default: PrivateOwnerRequestStatusEnum.PENDING,
    },
    adminNote: {
      type: String,
    },
    approvedAt: {
      type: Date,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectedAt: {
      type: Date,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const PrivateOwnerRequestModel =
  mongoose.model<IPrivateOwnerRequest>(
    "PrivateOwnerRequest",
    privateOwnerRequestSchema,
  );

export { PrivateOwnerRequestModel };