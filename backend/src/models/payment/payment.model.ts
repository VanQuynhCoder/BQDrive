import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  PaymentMethodEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
} from "../../constants/model.const";

export type IPayment = BaseDocument & {
  bookingId: mongoose.Types.ObjectId;
  extraChargeId?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  method: string;
  status: string;
  paymentType: string;
  paidAt?: Date;
  transactionCode?: string;
  confirmedBy?: mongoose.Types.ObjectId;
  confirmedByRole?: string;
  note?: string;
  remainingPaymentReminderSentAt?: Date;
};

const paymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    extraChargeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExtraCharge",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: Object.values(PaymentMethodEnum),
      default: PaymentMethodEnum.CASH,
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatusEnum),
      default: PaymentStatusEnum.PENDING,
    },
    paymentType: {
      type: String,
      enum: Object.values(PaymentTypeEnum),
      default: PaymentTypeEnum.DEPOSIT,
    },
    paidAt: {
      type: Date,
    },
    transactionCode: {
      type: String,
      trim: true,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    confirmedByRole: {
      type: String,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
    },
    remainingPaymentReminderSentAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

const PaymentModel = mongoose.model<IPayment>("Payment", paymentSchema);

export { PaymentModel };
