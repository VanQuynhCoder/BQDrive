import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";

export type IHolidayCalendar = BaseDocument & {
  name: string;
  date?: Date;
  startDate: Date;
  endDate: Date;
  country: string;
  type: string;
  isActive: boolean;
  note?: string;
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
