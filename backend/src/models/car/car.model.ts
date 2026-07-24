import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";

import {
  CarStatusEnum,
  CarTypeEnum,
  FuelTypeEnum,
  TransmissionEnum,
  RentalUnitEnum,
  OwnerTypeEnum,
} from "../../constants/model.const";
export type ICar = BaseDocument & {
  ownerId: mongoose.Types.ObjectId;
  ownerType: OwnerTypeEnum;
  ownerModel: string;
  businessId?: mongoose.Types.ObjectId;
  brandId: mongoose.Types.ObjectId;
  name: string;
  type: string;
  licensePlate?: string;
  plateNumberNormalized?: string;
  pricePerDay?: number;
  pricePerHour?: number;
  pricing?: {
    weekdayPricePerDay?: number;
    weekendPricePerDay?: number;
    holidayPricePerDay?: number;
    pricePerHour?: number;
    weekendPricePerHour?: number;
    holidayPricePerHour?: number;
  };
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit: string;
  seats: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
  description?: string;
  pickupAddress?: string;
  pickupFormattedAddress?: string;
  pickupPlaceId?: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupProvince?: string;
  pickupDistrict?: string;
  pickupWard?: string;
  pickupNote?: string;
  pickupLocationText?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
  latitude?: number;
  longitude?: number;
  lastLocationUpdatedAt?: Date;
  lastLocationUpdatedBy?: mongoose.Types.ObjectId;
  lastLocationUpdatedByRole?: OwnerTypeEnum;
  locationUpdateCount?: number;
  locationHistory?: Array<{
    oldLat?: number;
    oldLng?: number;
    newLat: number;
    newLng: number;
    oldAddress?: string;
    newAddress?: string;
    updatedBy: mongoose.Types.ObjectId;
    updatedByRole: OwnerTypeEnum;
    updatedAt: Date;
  }>;
  deliveryEnabled?: boolean;
  deliveryBaseFee?: number;
  deliveryFeePerKm?: number;
  deliveryMaxDistanceKm?: number;
  deliveryNote?: string;
  status: string;
  rejectReason?: string;
  isHidden?: boolean;
  hiddenByOwner?: boolean;
  hiddenByAdmin?: boolean;
  isDeleted?: boolean;
};

const carSchema = new mongoose.Schema(
  {
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
    plateNumberNormalized: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    pricePerDay: {
      type: Number,
      min: 0,
    },
    pricePerHour: {
      type: Number,
      min: 0,
    },
    pricing: {
      weekdayPricePerDay: {
        type: Number,
        min: 0,
      },
      weekendPricePerDay: {
        type: Number,
        min: 0,
      },
      holidayPricePerDay: {
        type: Number,
        min: 0,
      },
      pricePerHour: {
        type: Number,
        min: 0,
      },
      weekendPricePerHour: {
        type: Number,
        min: 0,
      },
      holidayPricePerHour: {
        type: Number,
        min: 0,
      },
    },
    allowDailyRental: {
      type: Boolean,
      default: true,
    },
    allowHourlyRental: {
      type: Boolean,
      default: false,
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
    pickupAddress: {
      type: String,
      trim: true,
    },
    pickupFormattedAddress: {
      type: String,
      trim: true,
    },
    pickupPlaceId: {
      type: String,
      trim: true,
    },
    pickupLat: {
      type: Number,
    },
    pickupLng: {
      type: Number,
    },
    pickupProvince: {
      type: String,
      trim: true,
    },
    pickupDistrict: {
      type: String,
      trim: true,
    },
    pickupWard: {
      type: String,
      trim: true,
    },
    pickupNote: {
      type: String,
      trim: true,
    },
    pickupLocationText: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    province: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    ward: {
      type: String,
      trim: true,
    },
    locationNote: {
      type: String,
      trim: true,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    lastLocationUpdatedAt: {
      type: Date,
    },
    lastLocationUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastLocationUpdatedByRole: {
      type: String,
      enum: [OwnerTypeEnum.BUSINESS, OwnerTypeEnum.USER],
    },
    locationUpdateCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    locationHistory: [
      {
        oldLat: {
          type: Number,
        },
        oldLng: {
          type: Number,
        },
        newLat: {
          type: Number,
          required: true,
        },
        newLng: {
          type: Number,
          required: true,
        },
        oldAddress: {
          type: String,
          trim: true,
        },
        newAddress: {
          type: String,
          trim: true,
        },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        updatedByRole: {
          type: String,
          enum: [OwnerTypeEnum.BUSINESS, OwnerTypeEnum.USER],
          required: true,
        },
        updatedAt: {
          type: Date,
          required: true,
        },
      },
    ],
    deliveryEnabled: {
      type: Boolean,
      default: false,
    },
    deliveryBaseFee: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryFeePerKm: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryMaxDistanceKm: {
      type: Number,
      min: 0,
    },
    deliveryNote: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(CarStatusEnum),
      default: CarStatusEnum.PENDING,
    },
    rejectReason: {
      type: String,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    hiddenByOwner: {
      type: Boolean,
      default: false,
    },
    hiddenByAdmin: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

carSchema.index({ status: 1, isDeleted: 1, isHidden: 1, createdAt: -1 });
carSchema.index({ brandId: 1, status: 1, isDeleted: 1 });
carSchema.index({ ownerId: 1, ownerType: 1, isDeleted: 1, createdAt: -1 });

const CarModel = mongoose.model<ICar>("Car", carSchema);

export { CarModel };
