import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  RefundMethodEnum,
  RefundStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";

export type RefundRecipientMethod = "BANK_TRANSFER" | "E_WALLET" | "CASH";

export type RefundRecipientInfo = {
  method: RefundRecipientMethod;
  bankName?: string;
  accountNumber?: string;
  accountNumberMasked?: string;
  accountHolderName?: string;
  walletProvider?: string;
  walletAccount?: string;
  walletAccountMasked?: string;
  walletHolderName?: string;
  cashNote?: string;
  submittedBy?: mongoose.Types.ObjectId;
  submittedAt?: Date;
  updatedAt?: Date;
};

export type IRefund = BaseDocument & {
  bookingId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  requestedByRole: UserRoleEnum;
  cancelledBy: mongoose.Types.ObjectId;
  cancelledByRole: UserRoleEnum;
  reasonCode: string;
  reasonText: string;
  paidAmountAtCancellation: number;
  cancellationFee: number;
  refundAmount: number;
  policySnapshot?: Record<string, unknown>;
  policyRuleApplied: string;
  policySource: string;
  method: RefundMethodEnum;
  status: RefundStatusEnum;
  paymentIds: mongoose.Types.ObjectId[];
  provider?: string;
  providerRefundId?: string;
  providerTransactionId?: string;
  providerResponseCode?: string;
  providerResponseMessage?: string;
  idempotencyKey: string;
  failureReason?: string;
  retryCount: number;
  recipientInfo?: RefundRecipientInfo;
  manualRefundEvidence?: string[];
  manualRefundMethod?: string;
  manualRefundReference?: string;
  manualRefundNote?: string;
  manualRefundSentAt?: Date;
  renterConfirmedAt?: Date;
  requestedAt: Date;
  processingAt?: Date;
  succeededAt?: Date;
  failedAt?: Date;
  isDeleted: boolean;
};

const refundSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedByRole: {
      type: String,
      enum: Object.values(UserRoleEnum),
      required: true,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cancelledByRole: {
      type: String,
      enum: Object.values(UserRoleEnum),
      required: true,
    },
    reasonCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    reasonText: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    paidAmountAtCancellation: {
      type: Number,
      required: true,
      min: 0,
    },
    cancellationFee: {
      type: Number,
      required: true,
      min: 0,
    },
    refundAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    policySnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    policyRuleApplied: {
      type: String,
      required: true,
      trim: true,
    },
    policySource: {
      type: String,
      required: true,
      trim: true,
    },
    method: {
      type: String,
      enum: Object.values(RefundMethodEnum),
      default: RefundMethodEnum.MANUAL,
    },
    status: {
      type: String,
      enum: Object.values(RefundStatusEnum),
      default: RefundStatusEnum.MANUAL_REQUIRED,
      index: true,
    },
    paymentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
      },
    ],
    provider: {
      type: String,
      trim: true,
    },
    providerRefundId: {
      type: String,
      trim: true,
    },
    providerTransactionId: {
      type: String,
      trim: true,
    },
    providerResponseCode: {
      type: String,
      trim: true,
    },
    providerResponseMessage: {
      type: String,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    failureReason: {
      type: String,
      trim: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    recipientInfo: {
      method: {
        type: String,
        enum: ["BANK_TRANSFER", "E_WALLET", "CASH"],
      },
      bankName: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      accountNumber: {
        type: String,
        trim: true,
        maxlength: 30,
      },
      accountNumberMasked: {
        type: String,
        trim: true,
        maxlength: 40,
      },
      accountHolderName: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      walletProvider: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      walletAccount: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      walletAccountMasked: {
        type: String,
        trim: true,
        maxlength: 120,
      },
      walletHolderName: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      cashNote: {
        type: String,
        trim: true,
        maxlength: 500,
      },
      submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      submittedAt: {
        type: Date,
      },
      updatedAt: {
        type: Date,
      },
    },
    manualRefundEvidence: [
      {
        type: String,
        trim: true,
      },
    ],
    manualRefundMethod: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    manualRefundReference: {
      type: String,
      trim: true,
    },
    manualRefundNote: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    manualRefundSentAt: {
      type: Date,
    },
    renterConfirmedAt: {
      type: Date,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processingAt: {
      type: Date,
    },
    succeededAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

refundSchema.index({ bookingId: 1, status: 1, isDeleted: 1 });
refundSchema.index({ requestedBy: 1, createdAt: -1 });

export const RefundModel = mongoose.model<IRefund>("Refund", refundSchema);
