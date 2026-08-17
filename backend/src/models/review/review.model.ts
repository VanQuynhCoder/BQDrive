import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";

export enum ReviewStatusEnum {
  VISIBLE = "VISIBLE",
  REPORTED = "REPORTED",
  HIDDEN = "HIDDEN",
}

export type ReviewCriteria = {
  /** Điểm chất lượng xe. */
  vehicleQuality?: number;
  /** Điểm vệ sinh xe. */
  cleanliness?: number;
  /** Mức đúng với mô tả đăng xe. */
  descriptionAccuracy?: number;
  /** Chất lượng phục vụ bàn giao. */
  handoverService?: number;
  /** Thái độ chủ xe. */
  ownerAttitude?: number;
  /** Đánh giá tính đúng giờ. */
  punctuality?: number;
};

export type IReview = BaseDocument & {
  /** Booking đã hoàn tất làm nguồn của đánh giá. */
  bookingId: mongoose.Types.ObjectId;
  /** Chủ xe được đánh giá. */
  ownerId: mongoose.Types.ObjectId;
  /** Xe được đánh giá. */
  carId: mongoose.Types.ObjectId;
  /** Renter tạo đánh giá. */
  renterId: mongoose.Types.ObjectId;
  /** Điểm tổng từ 1 đến 5. */
  rating: number;
  /** Điểm chi tiết theo từng tiêu chí. */
  criteria?: ReviewCriteria;
  /** Nội dung nhận xét. */
  comment?: string;
  /** Ảnh minh chứng/đánh giá, tối đa theo validator. */
  images?: string[];
  /** Phản hồi của chủ xe đối với đánh giá. */
  ownerReply?: {
    /** Nội dung phản hồi. */
    content?: string;
    /** Thời điểm phản hồi lần đầu. */
    repliedAt?: Date;
    /** Thời điểm cập nhật phản hồi. */
    updatedAt?: Date;
  };
  /** Trạng thái hiển thị/moderation của đánh giá. */
  status: ReviewStatusEnum;
  /** Thông tin báo cáo đánh giá. */
  report?: {
    /** Lý do báo cáo. */
    reason?: string;
    /** User gửi báo cáo. */
    reportedBy?: mongoose.Types.ObjectId;
    /** Thời điểm báo cáo. */
    reportedAt?: Date;
  };
  /** Lý do admin ẩn đánh giá. */
  hiddenReason?: string;
  /** Admin ẩn đánh giá. */
  hiddenBy?: mongoose.Types.ObjectId;
  /** Thời điểm đánh giá bị ẩn. */
  hiddenAt?: Date;
  /** Số User đánh dấu hữu ích. */
  helpfulCount?: number;
  /** Danh sách User đã đánh dấu hữu ích. */
  helpfulBy?: mongoose.Types.ObjectId[];
  /** Tên renter snapshot để hiển thị lịch sử. */
  reviewerNameSnapshot?: string;
  /** Tên xe snapshot để không phụ thuộc dữ liệu Car hiện tại. */
  carNameSnapshot?: string;
  /** Tên chủ xe snapshot để hiển thị ổn định. */
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
      ref: "User",
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
reviewSchema.index({ ownerId: 1, createdAt: -1 });
reviewSchema.index({ status: 1, "report.reportedAt": -1 });

const ReviewModel = mongoose.model<IReview>("Review", reviewSchema);
export { ReviewModel };
