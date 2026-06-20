import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  BookingStatusEnum,
  OwnerTypeEnum,
  RentalModeEnum,
  PaymentOptionEnum,
} from "../../constants/model.const";

export type IBooking = BaseDocument & {
  userId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  ownerType: OwnerTypeEnum;
  ownerModel: string;
  businessId?: mongoose.Types.ObjectId;
  carId: mongoose.Types.ObjectId;
  cartId?: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  rentalMode: string;
  totalPrice: number;

  paymentOption: string;
  depositAmount: number;
  remainingAmount: number;
  paidAmount: number;
  isDepositRefundable: boolean;

  status: string;
  cancelReason?: string;
  noShowReason?: string;
  note?: string;
  isDeleted?: boolean;
};

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      required: true,
    },
    cartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cart",
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

    paymentOption: {
      type: String,
      enum: Object.values(PaymentOptionEnum),
      default: PaymentOptionEnum.DEPOSIT,
    },
    depositAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isDepositRefundable: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: Object.values(BookingStatusEnum),
      default: BookingStatusEnum.PENDING,
    },
    cancelReason: {
      type: String,
    },
    noShowReason: {
      type: String,
    },
    note: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const BookingModel = mongoose.model<IBooking>("Booking", bookingSchema);

export { BookingModel };
