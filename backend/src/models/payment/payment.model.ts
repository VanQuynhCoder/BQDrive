import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  PAYMENT_STATUS_VALUES,
  PaymentMethodEnum,
  PaymentRefundStatusEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
} from "../../constants/model.const";

export type IPayment = BaseDocument & {
  /** Booking gốc của giao dịch; vẫn giữ khi giao dịch là phụ phí/gia hạn. */
  bookingId: mongoose.Types.ObjectId;
  /** Phụ phí được thanh toán, nếu có. */
  extraChargeId?: mongoose.Types.ObjectId;
  /** Yêu cầu gia hạn được thanh toán, nếu có. */
  extensionId?: mongoose.Types.ObjectId;
  /** User trả tiền. */
  userId: mongoose.Types.ObjectId;
  /** Số tiền của giao dịch, đơn vị VND. */
  amount: number;
  /** Kênh thanh toán như VNPAY, MANUAL, CASH. */
  method: string;
  /** Trạng thái giao dịch thanh toán. */
  status: string;
  /** Mục đích giao dịch: cọc, toàn bộ, phần còn lại, phụ phí... */
  paymentType: string;
  /** Thời điểm hệ thống ghi nhận thanh toán thành công. */
  paidAt?: Date;
  /** Mã giao dịch nội bộ hoặc mã đối soát. */
  transactionCode?: string;
  // Mã đơn hàng BQDrive gửi sang cổng thanh toán.
  gatewayOrderId?: string;

// Mã giao dịch do cổng thanh toán trả về sau khi thanh toán.
  gatewayTransactionId?: string;

// Thời điểm tạo giao dịch gốc theo định dạng của cổng thanh toán.
  gatewayTransactionDate?: string;

// Thời điểm cổng thanh toán ghi nhận thanh toán thành công.
  gatewayPayDate?: string;
  /** Tổng số tiền của Payment đã hoàn. */
  refundedAmount?: number;
  /** Trạng thái hoàn tiền riêng của Payment. */
  refundStatus: PaymentRefundStatusEnum;
  /** User/admin xác nhận giao dịch thủ công. */
  confirmedBy?: mongoose.Types.ObjectId;
  /** Vai trò người xác nhận thủ công. */
  confirmedByRole?: string;
  /** Ghi chú đối soát hoặc thanh toán. */
  note?: string;
  /** Thời điểm đã gửi nhắc thanh toán phần còn lại. */
  remainingPaymentReminderSentAt?: Date;
};

const paymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    extraChargeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExtraCharge",
      index: true,
    },
    extensionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookingExtension",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: Object.values(PaymentMethodEnum),
      default: PaymentMethodEnum.CASH,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: PaymentStatusEnum.PENDING,
    },
    paymentType: {
      type: String,
      enum: Object.values(PaymentTypeEnum),
      default: PaymentTypeEnum.DEPOSIT,
    },
    paidAt: {
      type: Date,
    },
    transactionCode: {
      type: String,
      trim: true,
    },
    gatewayOrderId: {
      type: String,
      trim: true,
    },
    gatewayTransactionId: {
      type: String,
      trim: true,
    },
    gatewayTransactionDate: {
      type: String,
      trim: true,
    },
    gatewayPayDate: {
      type: String,
      trim: true,
    },
      refundedAmount: {
        type: Number,
        default: 0,
        min: 0,
    },
    refundStatus: {
      type: String,
      enum: Object.values(PaymentRefundStatusEnum),
      default: PaymentRefundStatusEnum.NOT_REFUNDED,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    confirmedByRole: {
      type: String,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
    },
    remainingPaymentReminderSentAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

const PaymentModel = mongoose.model<IPayment>("Payment", paymentSchema);

export { PaymentModel };
