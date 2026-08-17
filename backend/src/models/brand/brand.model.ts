import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";

export type IBrand = BaseDocument & {
  /** Tên thương hiệu dùng để phân loại và hiển thị xe. */
  name: string;
  /** Ảnh logo thương hiệu; chỉ phục vụ hiển thị công khai. */
  logo?: string;
  /** Mô tả bổ sung về thương hiệu. */
  description?: string;
  /** Cờ xóa mềm, giữ lại dữ liệu lịch sử thay vì xóa vật lý. */
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
