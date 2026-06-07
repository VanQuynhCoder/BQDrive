import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";

export type IBrand = BaseDocument & {
  name: string;
  logo?: string;
  description?: string;
  isDeleted?: boolean;
};

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    logo: {
      type: String,
    },
    description: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const BrandModel = mongoose.model<IBrand>("Brand", brandSchema);
export { BrandModel };