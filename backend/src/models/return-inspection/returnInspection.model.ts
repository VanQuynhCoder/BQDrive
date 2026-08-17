import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  MileageStatusEnum,
  ReturnInspectionStatusEnum,
} from "../../constants/model.const";
import type {
  VehicleAccessoriesSnapshot,
  VehicleConditionChecklist,
  VehicleDocumentsSnapshot,
} from "../booking/booking.model";

export type IReturnInspection = BaseDocument & {
 /** Booking đang được kiểm tra khi trả xe. */
 bookingId: mongoose.Types.ObjectId;
 /** Xe được nhận lại. */
carId: mongoose.Types.ObjectId;
 /** User renter của booking. */
renterId: mongoose.Types.ObjectId;
 /** User chủ xe tiếp nhận xe trả. */
ownerId: mongoose.Types.ObjectId;
 /** Thời điểm hệ thống tiếp nhận bản ghi kiểm tra. */
receivedAt: Date;
  /** User thực hiện tiếp nhận xe. */
  receivedBy: mongoose.Types.ObjectId;
  /** Thời điểm trả xe thực tế dùng tính trễ. */
  actualReturnAt: Date;
  /** ODO khi nhận lại xe. */
  returnOdometerKm?: number;
  /** Mức nhiên liệu/pin khi nhận lại. */
  returnEnergyLevelPercent?: number;
  /** Ảnh đồng hồ ODO khi trả. */
  returnDashboardImage?: string;
  /** Quãng đường đã đi từ biên bản giao. */
  distanceTravelledKm?: number;
  /** Tổng km bao gồm theo policy booking. */
  totalIncludedKm?: number;
  /** Km vượt hạn mức trước ân hạn. */
  overageKm?: number;
  /** Km thực tế bị tính phí. */
  chargeableOverageKm?: number;
  /** Số tiền vượt km hệ thống gợi ý. */
  suggestedOverageAmount?: number;
  /** Kết quả đánh giá hạn mức km. */
  mileageStatus: MileageStatusEnum;
  // Legacy read compatibility. New writes must use the canonical fields above.
  /** ODO legacy, chỉ đọc tương thích dữ liệu cũ. */
  returnOdometer?: number;
  /** Mức nhiên liệu legacy, chỉ đọc tương thích dữ liệu cũ. */
  returnFuelLevel?: number;
  /** Ảnh trả xe legacy. */
  returnPhotos?: string[];
  /** Ghi chú tình trạng legacy. */
  conditionNotes?: string;
  /** Có trả trễ so với lịch hay không. */
  isLate: boolean;
  /** Số phút trả trễ. */
  lateMinutes: number;
  /** Có ghi nhận hư hỏng. */
  hasDamage?: boolean;
  /** Có phát sinh vệ sinh. */
  hasCleaningIssue?: boolean;
  /** Có thiếu nhiên liệu/pin. */
  hasFuelShortage?: boolean;
  /** Checklist tình trạng xe khi trả. */
  vehicleCondition?: VehicleConditionChecklist;
  /** Snapshot phụ kiện khi trả. */
  accessoriesSnapshot?: VehicleAccessoriesSnapshot;
  /** Snapshot giấy tờ đi theo xe khi trả. */
  vehicleDocumentsSnapshot?: VehicleDocumentsSnapshot;
  /** Trạng thái kiểm tra và chờ xác nhận hai bên. */
  inspectionStatus: ReturnInspectionStatusEnum;
  /** Thời điểm hoàn tất kiểm tra. */
  inspectedAt?: Date;
  /** User thực hiện kiểm tra chi tiết. */
  inspectedBy?: mongoose.Types.ObjectId;
  /** Thời điểm chủ xe xác nhận đã nhận lại. */
  ownerConfirmedAt?: Date;
  /** Chủ xe đã xác nhận. */
  ownerConfirmedBy?: mongoose.Types.ObjectId;
  /** Thời điểm renter xác nhận đã trả xe. */
  renterConfirmedAt?: Date;
  /** Renter đã xác nhận biên bản trả. */
  renterConfirmedBy?: mongoose.Types.ObjectId;
  /** Xóa mềm biên bản nhưng giữ lịch sử tranh chấp. */
  isDeleted?: boolean;
};

const returnInspectionSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
      index: true,
    },
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      required: true,
      index: true,
    },
    renterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
   ownerId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true,
  index: true,
},

    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actualReturnAt: {
      type: Date,
      required: true,
    },
    returnOdometerKm: {
      type: Number,
      min: 0,
      validate: {
        validator: (value: number | undefined) =>
          value === undefined || Number.isInteger(value),
        message: "ODO nhận lại phải là số nguyên không âm",
      },
    },
    returnEnergyLevelPercent: {
      type: Number,
      min: 0,
      max: 100,
    },
    returnDashboardImage: {
      type: String,
      trim: true,
    },
    distanceTravelledKm: {
      type: Number,
      min: 0,
    },
    totalIncludedKm: {
      type: Number,
      min: 0,
    },
    overageKm: {
      type: Number,
      min: 0,
    },
    chargeableOverageKm: {
      type: Number,
      min: 0,
    },
    suggestedOverageAmount: {
      type: Number,
      min: 0,
    },
    mileageStatus: {
      type: String,
      enum: Object.values(MileageStatusEnum),
      default: MileageStatusEnum.NOT_EVALUATED_KM,
    },
    // Legacy read compatibility. Do not use these fields for new writes.
    returnOdometer: {
      type: Number,
      min: 0,
    },
    returnFuelLevel: {
      type: Number,
      min: 0,
      max: 100,
    },
    returnPhotos: [
      {
        type: String,
        trim: true,
      },
    ],
    conditionNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    isLate: {
      type: Boolean,
      default: false,
    },
    lateMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },
    hasDamage: {
      type: Boolean,
      default: false,
    },
    hasCleaningIssue: {
      type: Boolean,
      default: false,
    },
    hasFuelShortage: {
      type: Boolean,
      default: false,
    },
    vehicleCondition: {
      bodyOk: { type: Boolean },
      glassAndMirrorsOk: { type: Boolean },
      lightsOk: { type: Boolean },
      tiresOk: { type: Boolean },
      interiorClean: { type: Boolean },
      seatsAndSeatbeltsOk: { type: Boolean },
      airConditioningOk: { type: Boolean },
      dashboardWarningFree: { type: Boolean },
    },
    accessoriesSnapshot: {
      vehicleKeysPresent: { type: Boolean },
      tireSupportKitPresent: { type: Boolean },
      basicToolkitPresent: { type: Boolean },
      warningTrianglePresent: { type: Boolean },
      chargingCableApplicable: { type: Boolean },
      chargingCablePresent: { type: Boolean },
    },
    vehicleDocumentsSnapshot: {
      registrationPresent: { type: Boolean },
      inspectionCertificatePresent: { type: Boolean },
      insuranceCertificatePresent: { type: Boolean },
    },
    inspectionStatus: {
      type: String,
      enum: Object.values(ReturnInspectionStatusEnum),
      default: ReturnInspectionStatusEnum.RECEIVED,
      index: true,
    },
    inspectedAt: {
      type: Date,
    },
    inspectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    ownerConfirmedAt: { type: Date },
    ownerConfirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    renterConfirmedAt: { type: Date },
    renterConfirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

export const ReturnInspectionModel =
  mongoose.model<IReturnInspection>("ReturnInspection", returnInspectionSchema);
