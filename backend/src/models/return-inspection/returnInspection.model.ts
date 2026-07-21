import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  OwnerTypeEnum,
  ReturnInspectionStatusEnum,
} from "../../constants/model.const";

export type IReturnInspection = BaseDocument & {
  bookingId: mongoose.Types.ObjectId;
  carId: mongoose.Types.ObjectId;
  renterId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  ownerType: OwnerTypeEnum;
  ownerModel: string;
  receivedAt: Date;
  receivedBy: mongoose.Types.ObjectId;
  actualReturnAt: Date;
  returnOdometer?: number;
  returnFuelLevel?: number;
  returnPhotos?: string[];
  conditionNotes?: string;
  isLate: boolean;
  lateMinutes: number;
  hasDamage?: boolean;
  hasCleaningIssue?: boolean;
  hasFuelShortage?: boolean;
  inspectionStatus: ReturnInspectionStatusEnum;
  inspectedAt?: Date;
  inspectedBy?: mongoose.Types.ObjectId;
  isDeleted?: boolean;
};

const returnInspectionSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
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
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actualReturnAt: {
      type: Date,
      required: true,
    },
    returnOdometer: {
      type: Number,
      min: 0,
    },
    returnFuelLevel: {
      type: Number,
      min: 0,
      max: 100,
    },
    returnPhotos: [
      {
        type: String,
        trim: true,
      },
    ],
    conditionNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    isLate: {
      type: Boolean,
      default: false,
    },
    lateMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },
    hasDamage: {
      type: Boolean,
      default: false,
    },
    hasCleaningIssue: {
      type: Boolean,
      default: false,
    },
    hasFuelShortage: {
      type: Boolean,
      default: false,
    },
    inspectionStatus: {
      type: String,
      enum: Object.values(ReturnInspectionStatusEnum),
      default: ReturnInspectionStatusEnum.RECEIVED,
      index: true,
    },
    inspectedAt: {
      type: Date,
    },
    inspectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

export const ReturnInspectionModel =
  mongoose.model<IReturnInspection>("ReturnInspection", returnInspectionSchema);
