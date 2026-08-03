import mongoose from "mongoose";

import { BaseDocument } from "../../base/baseModel";
import {
  BOOKING_EXTENSION_STATUS_VALUES,
  BookingExtensionStatusEnum,
  PricingDateTypeEnum,
  RentalModeEnum,
} from "../../constants/model.const";

export type IBookingExtension = BaseDocument & {
  bookingId: mongoose.Types.ObjectId;
  carId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  oldEndAt: Date;
  requestedEndAt: Date;
  additionalDurationMinutes: number;
  billableUnits: number;
  additionalAmount: number;
  pricingSnapshot: {
    rentalMode: RentalModeEnum;
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
  status: BookingExtensionStatusEnum;
  requestedAt: Date;
  ownerRespondedAt?: Date;
  rejectReason?: string;
  paymentDeadlineAt?: Date;
  paymentId?: mongoose.Types.ObjectId;
  activatedAt?: Date;
  activeLockKey?: string;
  isDeleted: boolean;
};

const pricingBreakdownSchema = new mongoose.Schema(
  {
    dateOrTime: { type: String, required: true, trim: true },
    priceType: {
      type: String,
      enum: Object.values(PricingDateTypeEnum),
      required: true,
    },
    basePrice: { type: Number, required: true, min: 0 },
    surchargeAmount: { type: Number, required: true, min: 0 },
    finalPrice: { type: Number, required: true, min: 0 },
    unitCount: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const bookingExtensionSchema = new mongoose.Schema<IBookingExtension>(
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
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    oldEndAt: { type: Date, required: true },
    requestedEndAt: { type: Date, required: true },
    additionalDurationMinutes: { type: Number, required: true, min: 1 },
    billableUnits: { type: Number, required: true, min: 1 },
    additionalAmount: { type: Number, required: true, min: 1 },
    pricingSnapshot: {
      rentalMode: {
        type: String,
        enum: Object.values(RentalModeEnum),
        required: true,
      },
      basePricePerUnit: { type: Number, required: true, min: 0 },
      weekendSurchargePerUnit: { type: Number, required: true, min: 0 },
      holidaySurchargePerUnit: { type: Number, required: true, min: 0 },
      breakdown: { type: [pricingBreakdownSchema], required: true },
      subtotal: { type: Number, required: true, min: 1 },
    },
    status: {
      type: String,
      enum: BOOKING_EXTENSION_STATUS_VALUES,
      default: BookingExtensionStatusEnum.REQUESTED,
      required: true,
      index: true,
    },
    requestedAt: { type: Date, required: true, default: Date.now },
    ownerRespondedAt: { type: Date },
    rejectReason: { type: String, trim: true, maxlength: 500 },
    paymentDeadlineAt: { type: Date, index: true },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    activatedAt: { type: Date },
    activeLockKey: { type: String, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

bookingExtensionSchema.index({ bookingId: 1, createdAt: -1 });
bookingExtensionSchema.index(
  { activeLockKey: 1 },
  { unique: true, sparse: true },
);
bookingExtensionSchema.index({
  carId: 1,
  status: 1,
  oldEndAt: 1,
  requestedEndAt: 1,
  paymentDeadlineAt: 1,
});

export const BookingExtensionModel = mongoose.model<IBookingExtension>(
  "BookingExtension",
  bookingExtensionSchema,
);
