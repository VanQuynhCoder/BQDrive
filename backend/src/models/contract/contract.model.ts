import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  CONTRACT_STATUS_VALUES,
  ContractPaymentStatusEnum,
  ContractStatusEnum,
  PaymentOptionEnum,
} from "../../constants/model.const";

export type IContract = BaseDocument & {
  /** Booking là nguồn phát sinh hợp đồng. */
  bookingId: mongoose.Types.ObjectId;
  /** User thuê xe trong hợp đồng. */
  userId: mongoose.Types.ObjectId;
  /** Xe được thuê. */
  carId: mongoose.Types.ObjectId;
  /** User chủ xe ký gửi; vẫn là role USER. */
  ownerId: mongoose.Types.ObjectId;
  /** Tên renter được chụp tại thời điểm lập hợp đồng. */
  renterName: string;
  /** Số điện thoại renter trong snapshot hợp đồng. */
  renterPhone: string;
  /** Địa chỉ renter trong snapshot hợp đồng. */
  renterAddress: string;
  /** Ghi chú/điều khoản bổ sung của hợp đồng. */
  note?: string;
  /** Thời điểm bắt đầu theo booking đã chốt. */
  startDate: Date;
  /** Thời điểm kết thúc theo booking đã chốt. */
  endDate: Date;
  /** Tổng giá trị hợp đồng tại thời điểm ký. */
  totalPrice: number;
  /** Khoản phải trả trước theo phương thức thanh toán. */
  upfrontPaymentAmount: number;
  /** Số tiền đã thu vào hợp đồng. */
  paidAmount: number;
  /** Số tiền còn phải thanh toán. */
  remainingAmount: number;
  /** Trạng thái thanh toán riêng của hợp đồng. */
  paymentStatus: ContractPaymentStatusEnum;
  /** Phương thức thanh toán đã chọn. */
  paymentOption: string;
  /** Địa chỉ nhận xe được snapshot, tránh đổi theo Car. */
  pickupAddressSnapshot?: string;
  /** Địa chỉ trả xe được snapshot. */
  returnAddressSnapshot?: string;
  /** Địa chỉ chủ xe tại thời điểm lập hợp đồng. */
  ownerAddressSnapshot?: string;
  /** Trạng thái ký/hiệu lực của hợp đồng. */
  status: ContractStatusEnum;
  /** Mã hợp đồng hiển thị cho các bên. */
  contractCode: string;
  /** Thời điểm hợp đồng được ký/xác nhận điện tử. */
  signedAt?: Date;
  /** Xóa mềm hợp đồng, giữ dữ liệu pháp lý/lịch sử. */
  isDeleted?: boolean;
};

const contractSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      required: true,
    },
    ownerId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true,
},
    renterName: {
      type: String,
      required: true,
      trim: true,
    },
    renterPhone: {
      type: String,
      required: true,
      trim: true,
    },
    renterAddress: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    upfrontPaymentAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(ContractPaymentStatusEnum),
      default: ContractPaymentStatusEnum.UNPAID,
    },
    paymentOption: {
      type: String,
      enum: Object.values(PaymentOptionEnum),
      required: true,
    },
    pickupAddressSnapshot: {
      type: String,
      trim: true,
    },
    returnAddressSnapshot: {
      type: String,
      trim: true,
    },
    ownerAddressSnapshot: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: CONTRACT_STATUS_VALUES,
      default: ContractStatusEnum.ACTIVE,
    },
    contractCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    signedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const ContractModel = mongoose.model<IContract>("Contract", contractSchema);

export { ContractModel };
