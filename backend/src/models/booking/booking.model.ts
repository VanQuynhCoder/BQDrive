import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  BookingStatusEnum,
  OwnerTypeEnum,
  RentalModeEnum,
  PaymentOptionEnum,
  DeliveryTypeEnum,
  DeliveryAddressSourceEnum,
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
  pricingSnapshot?: {
    rentalMode: string;
    weekdayPricePerDay?: number;
    weekendPricePerDay?: number;
    holidayPricePerDay?: number;
    pricePerHour?: number;
    weekendPricePerHour?: number;
    holidayPricePerHour?: number;
    breakdown?: Array<{
      date: string;
      type: string;
      label?: string;
      unitCount: number;
      unitPrice: number;
      price: number;
    }>;
    subtotal: number;
    rentalSubtotal?: number;
    deliveryFee?: number;
    totalPrice?: number;
    delivery?: {
      deliveryType: string;
      deliveryAddress?: string;
      deliveryAddressText?: string;
      deliveryFormattedAddress?: string;
      deliveryAddressSource?: string;
      deliveryLat?: number;
      deliveryLng?: number;
      deliveryDistanceKm?: number;
      deliveryDurationText?: string;
      deliveryBaseFee?: number;
      deliveryFeePerKm?: number;
      deliveryMaxDistanceKm?: number;
      deliveryFee?: number;
      deliveryNote?: string;
    };
  };

  paymentOption: string;
  depositAmount: number;
  remainingAmount: number;
  paidAmount: number;
  isDepositRefundable: boolean;
  cancellationPolicySnapshot?: {
    fullRefundBeforeHours: number;
    partialRefundBeforeHours: number;
    partialRefundRate: number;
    lateCancellationRule: string;
    ownerCancellationRefundRate: number;
  };
  pickupAddressSnapshot?: string;
  returnAddressSnapshot?: string;
  renterInfo?: {
    fullName: string;
    phone: string;
    email: string;
    cccdNumber: string;
    cccdFrontImage?: string;
    cccdBackImage?: string;
    driverLicenseNumber: string;
    driverLicenseImage?: string;
    note?: string;
  };

  status: string;
  ownerApprovedAt?: Date;
  paymentDeadlineAt?: Date;
  cancelReason?: string;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;
  cancelledByRole?: string;
  cancelReasonCode?: string;
  cancelReasonText?: string;
  cancellationSummary?: {
    paidAmountAtCancellation: number;
    cancellationFee: number;
    refundAmount: number;
    policyRuleApplied: string;
    refundRequired: boolean;
    refundId?: mongoose.Types.ObjectId;
  };
  noShowReason?: string;
  noShowAt?: Date;
  returnReminderSentAt?: Date;
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
    pricingSnapshot: {
      rentalMode: {
        type: String,
        enum: Object.values(RentalModeEnum),
      },
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
      breakdown: [
        {
          date: {
            type: String,
            trim: true,
          },
          type: {
            type: String,
            trim: true,
          },
          label: {
            type: String,
            trim: true,
          },
          unitCount: {
            type: Number,
            min: 0,
          },
          unitPrice: {
            type: Number,
            min: 0,
          },
          price: {
            type: Number,
            min: 0,
          },
        },
      ],
      subtotal: {
        type: Number,
        min: 0,
      },
      rentalSubtotal: {
        type: Number,
        min: 0,
      },
      deliveryFee: {
        type: Number,
        min: 0,
        default: 0,
      },
      totalPrice: {
        type: Number,
        min: 0,
      },
      delivery: {
        deliveryType: {
          type: String,
          enum: Object.values(DeliveryTypeEnum),
          default: DeliveryTypeEnum.PICKUP_AT_CAR_LOCATION,
        },
        deliveryAddress: {
          type: String,
          trim: true,
        },
        deliveryAddressText: {
          type: String,
          trim: true,
        },
        deliveryFormattedAddress: {
          type: String,
          trim: true,
        },
        deliveryAddressSource: {
          type: String,
          enum: Object.values(DeliveryAddressSourceEnum),
        },
        deliveryLat: {
          type: Number,
        },
        deliveryLng: {
          type: Number,
        },
        deliveryDistanceKm: {
          type: Number,
          min: 0,
        },
        deliveryDurationText: {
          type: String,
          trim: true,
        },
        deliveryBaseFee: {
          type: Number,
          min: 0,
        },
        deliveryFeePerKm: {
          type: Number,
          min: 0,
        },
        deliveryMaxDistanceKm: {
          type: Number,
          min: 0,
        },
        deliveryFee: {
          type: Number,
          min: 0,
          default: 0,
        },
        deliveryNote: {
          type: String,
          trim: true,
        },
      },
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
    cancellationPolicySnapshot: {
      fullRefundBeforeHours: {
        type: Number,
        default: 48,
        min: 0,
      },
      partialRefundBeforeHours: {
        type: Number,
        default: 24,
        min: 0,
      },
      partialRefundRate: {
        type: Number,
        default: 0.8,
        min: 0,
        max: 1,
      },
      lateCancellationRule: {
        type: String,
        default: "KEEP_DEPOSIT",
        trim: true,
      },
      ownerCancellationRefundRate: {
        type: Number,
        default: 1,
        min: 0,
        max: 1,
      },
    },
    pickupAddressSnapshot: {
      type: String,
      trim: true,
    },
    returnAddressSnapshot: {
      type: String,
      trim: true,
    },
    renterInfo: {
      fullName: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
      cccdNumber: {
        type: String,
        trim: true,
      },
      cccdFrontImage: {
        type: String,
        trim: true,
      },
      cccdBackImage: {
        type: String,
        trim: true,
      },
      driverLicenseNumber: {
        type: String,
        trim: true,
      },
      driverLicenseImage: {
        type: String,
        trim: true,
      },
      note: {
        type: String,
        trim: true,
      },
    },

    status: {
      type: String,
      enum: Object.values(BookingStatusEnum),
      default: BookingStatusEnum.PENDING,
    },
    ownerApprovedAt: {
      type: Date,
    },
    paymentDeadlineAt: {
      type: Date,
    },
    cancelReason: {
      type: String,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancelledByRole: {
      type: String,
      trim: true,
    },
    cancelReasonCode: {
      type: String,
      trim: true,
    },
    cancelReasonText: {
      type: String,
      trim: true,
    },
    cancellationSummary: {
      paidAmountAtCancellation: {
        type: Number,
        min: 0,
        default: 0,
      },
      cancellationFee: {
        type: Number,
        min: 0,
        default: 0,
      },
      refundAmount: {
        type: Number,
        min: 0,
        default: 0,
      },
      policyRuleApplied: {
        type: String,
        trim: true,
      },
      refundRequired: {
        type: Boolean,
        default: false,
      },
      refundId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Refund",
      },
    },
    noShowReason: {
      type: String,
    },
    noShowAt: {
      type: Date,
    },
    returnReminderSentAt: {
      type: Date,
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

bookingSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
bookingSchema.index({
  carId: 1,
  status: 1,
  startDate: 1,
  endDate: 1,
  isDeleted: 1,
});
bookingSchema.index({ ownerId: 1, ownerType: 1, isDeleted: 1, createdAt: -1 });

const BookingModel = mongoose.model<IBooking>("Booking", bookingSchema);

export { BookingModel };
