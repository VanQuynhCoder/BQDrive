import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import { OwnerTypeEnum } from "../../constants/model.const";

export enum ReviewStatusEnum {
  VISIBLE = "VISIBLE",
  REPORTED = "REPORTED",
  HIDDEN = "HIDDEN",
}

export type ReviewCriteria = {
  vehicleQuality?: number;
  cleanliness?: number;
  descriptionAccuracy?: number;
  handoverService?: number;
  ownerAttitude?: number;
  punctuality?: number;
};

export type IReview = BaseDocument & {
  bookingId: mongoose.Types.ObjectId;
  carId: mongoose.Types.ObjectId;
  renterId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  ownerType: OwnerTypeEnum;
  ownerModel?: "Business" | "User";
  rating: number;
  criteria?: ReviewCriteria;
  comment?: string;
  images?: string[];
  ownerReply?: {
    content?: string;
    repliedAt?: Date;
    updatedAt?: Date;
  };
  status: ReviewStatusEnum;
  report?: {
    reason?: string;
    reportedBy?: mongoose.Types.ObjectId;
    reportedAt?: Date;
  };
  hiddenReason?: string;
  hiddenBy?: mongoose.Types.ObjectId;
  hiddenAt?: Date;
  helpfulCount?: number;
  helpfulBy?: mongoose.Types.ObjectId[];
  reviewerNameSnapshot?: string;
  carNameSnapshot?: string;
  ownerNameSnapshot?: string;
};

const criteriaRating = {
  type: Number,
  min: 1,
  max: 5,
  validate: {
    validator(value: number) {
      return value === undefined || Number.isInteger(value);
    },
    message: "Điểm tiêu chí phải là số nguyên từ 1 đến 5",
  },
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
    criteria: {
      vehicleQuality: criteriaRating,
      cleanliness: criteriaRating,
      descriptionAccuracy: criteriaRating,
      handoverService: criteriaRating,
      ownerAttitude: criteriaRating,
      punctuality: criteriaRating,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator(images: string[]) {
          return images.length <= 3;
        },
        message: "Mỗi đánh giá chỉ được tối đa 3 ảnh",
      },
    },
    ownerReply: {
      content: {
        type: String,
        trim: true,
        maxlength: 1000,
      },
      repliedAt: Date,
      updatedAt: Date,
    },
    status: {
      type: String,
      enum: Object.values(ReviewStatusEnum),
      default: ReviewStatusEnum.VISIBLE,
    },
    report: {
      reason: {
        type: String,
        trim: true,
        maxlength: 1000,
      },
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reportedAt: Date,
    },
    hiddenReason: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    hiddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    hiddenAt: Date,
    helpfulCount: {
      type: Number,
      default: 0,
    },
    helpfulBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
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
reviewSchema.index({ status: 1, "report.reportedAt": -1 });

const ReviewModel = mongoose.model<IReview>("Review", reviewSchema);
export { ReviewModel };
