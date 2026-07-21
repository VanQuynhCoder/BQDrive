import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import { OwnerTypeEnum } from "../../constants/model.const";

export enum ReviewStatusEnum {
  VISIBLE = "VISIBLE",
  HIDDEN = "HIDDEN",
}

export type IReview = BaseDocument & {
  bookingId: mongoose.Types.ObjectId;
  carId: mongoose.Types.ObjectId;
  renterId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  ownerType: OwnerTypeEnum;
  ownerModel?: "Business" | "User";
  rating: number;
  comment?: string;
  status: ReviewStatusEnum;
  reviewerNameSnapshot?: string;
  carNameSnapshot?: string;
  ownerNameSnapshot?: string;
};

const reviewSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      required: true,
    },
    renterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
      enum: ["Business", "User"],
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating phải là số nguyên từ 1 đến 5",
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: Object.values(ReviewStatusEnum),
      default: ReviewStatusEnum.VISIBLE,
    },
    reviewerNameSnapshot: {
      type: String,
      trim: true,
    },
    carNameSnapshot: {
      type: String,
      trim: true,
    },
    ownerNameSnapshot: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

reviewSchema.index({ bookingId: 1, renterId: 1 }, { unique: true });
reviewSchema.index({ carId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ ownerId: 1, ownerType: 1, createdAt: -1 });

const ReviewModel = mongoose.model<IReview>("Review", reviewSchema);
export { ReviewModel };
