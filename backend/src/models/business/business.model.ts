import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import { BusinessTypeEnum } from "../../constants/model.const";
export type IBusiness = BaseDocument & {
  userId: mongoose.Types.ObjectId;
  businessName: string;
  businessType: string;
  isRejected?: boolean;
  rejectReason?: string;
  phone?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  description?: string;
  logo?: string;
  isApproved?: boolean;
  isDeleted?: boolean;
};

const businessSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    businessType: {
      type: String,
      enum: Object.values(BusinessTypeEnum),
      required: true,
    },

    isRejected: {
      type: Boolean,
      default: false,
    },

    rejectReason: {
      type: String,
    },
    phone: {
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
    description: {
      type: String,
    },
    logo: {
      type: String,
      trim: true,
    },
    isApproved: {
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

const BusinessModel = mongoose.model<IBusiness>("Business", businessSchema);
export { BusinessModel };
