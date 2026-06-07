import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";

import {
  CarStatusEnum,
  CarTypeEnum,
  FuelTypeEnum,
  TransmissionEnum,
  RentalUnitEnum,
} from "../../constants/model.const";
export type ICar = BaseDocument & {
  businessId: mongoose.Types.ObjectId;
  brandId: mongoose.Types.ObjectId;
  name: string;
  type: string;
  licensePlate?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  rentalUnit: string;
  seats: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
  description?: string;
  status: string;
  rejectReason?: string;
  isDeleted?: boolean;
};

const carSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(CarTypeEnum),
      required: true,
    },
    licensePlate: {
      type: String,
      trim: true,
    },
    pricePerDay: {
      type: Number,
      min: 0,
    },
    pricePerHour: {
      type: Number,
      min: 0,
    },
    rentalUnit: {
      type: String,
      enum: Object.values(RentalUnitEnum),
      default: RentalUnitEnum.DAY,
    },
    seats: {
      type: Number,
      required: true,
      min: 1,
    },
    fuelType: {
      type: String,
      enum: Object.values(FuelTypeEnum),
    },
    transmission: {
      type: String,
      enum: Object.values(TransmissionEnum),
    },
    images: [
      {
        type: String,
      },
    ],
    description: {
      type: String,
    },
    status: {
      type: String,
      enum: Object.values(CarStatusEnum),
      default: CarStatusEnum.PENDING,
    },
    rejectReason: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const CarModel = mongoose.model<ICar>("Car", carSchema);

export { CarModel };
