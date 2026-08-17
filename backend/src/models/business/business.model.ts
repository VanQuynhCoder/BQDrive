import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import { BusinessTypeEnum } from "../../constants/model.const";
export type IBusiness = BaseDocument & {
  /** User sở hữu hồ sơ đối tác legacy này. */
  userId: mongoose.Types.ObjectId;
  /** Tên doanh nghiệp/đối tác hiển thị. */
  businessName: string;
  /** Phân loại hình doanh nghiệp trong dữ liệu legacy. */
  businessType: string;
  /** Cho biết hồ sơ bị từ chối hay chưa. */
  isRejected?: boolean;
  /** Lý do admin từ chối hồ sơ đối tác. */
  rejectReason?: string;
  /** Thông tin liên hệ nội bộ của đối tác. */
  phone?: string;
  /** Địa chỉ gốc của đối tác. */
  address?: string;
  /** Tỉnh/thành của địa chỉ đối tác. */
  province?: string;
  /** Thành phố trong dữ liệu địa chỉ legacy. */
  city?: string;
  /** Quận/huyện của đối tác. */
  district?: string;
  /** Phường/xã của đối tác. */
  ward?: string;
  /** Mô tả giới thiệu đối tác. */
  description?: string;
  /** Logo đối tác. */
  logo?: string;
  /** Email công khai để liên hệ. */
  publicEmail?: string;
  /** Số điện thoại công khai để liên hệ. */
  publicPhone?: string;
  /** Website công khai của đối tác. */
  website?: string;
  /** Mô tả ngắn dùng trên danh sách đối tác. */
  shortDescription?: string;
  /** Cờ cho phép hiển thị như đối tác công khai. */
  isPublicPartner?: boolean;
  /** Thứ tự sắp xếp khi hiển thị đối tác. */
  displayOrder?: number;
  /** Cờ admin đã duyệt hồ sơ legacy. */
  isApproved?: boolean;
  /** Cờ xóa mềm hồ sơ legacy. */
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
    publicEmail: {
      type: String,
      trim: true,
    },
    publicPhone: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    shortDescription: {
      type: String,
      trim: true,
    },
    isPublicPartner: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
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
