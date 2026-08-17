import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";

export type IHolidayCalendar = BaseDocument & {
  /** Tên ngày lễ dùng trong bảng giá và lịch đặt xe. */
  name: string;
  /** Ngày đơn của kỳ nghỉ, nếu cấu hình theo một ngày. */
  date?: Date;
  /** Ngày bắt đầu kỳ nghỉ. */
  startDate: Date;
  /** Ngày kết thúc kỳ nghỉ. */
  endDate: Date;
  /** Quốc gia áp dụng lịch ngày lễ. */
  country: string;
  /** Loại ngày lễ hoặc quy tắc giá tương ứng. */
  type: string;
  /** Cho phép/vô hiệu hóa kỳ nghỉ trong tính giá. */
  isActive: boolean;
  /** Ghi chú quản trị cho kỳ nghỉ. */
  note?: string;
  /** Xóa mềm cấu hình, không làm mất lịch sử. */
  isDeleted?: boolean;
};

const holidayCalendarSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    country: {
      type: String,
      default: "VN",
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      default: "HOLIDAY",
      trim: true,
      uppercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

holidayCalendarSchema.index({ country: 1, startDate: 1, endDate: 1 });
holidayCalendarSchema.index({ country: 1, type: 1, isActive: 1, isDeleted: 1 });

const HolidayCalendarModel = mongoose.model<IHolidayCalendar>(
  "HolidayCalendar",
  holidayCalendarSchema,
);

export { HolidayCalendarModel };
