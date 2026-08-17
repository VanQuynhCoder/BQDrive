import mongoose from "mongoose";
import { BaseDocument } from "../../base/baseModel";
import {
  REFUND_STATUS_VALUES,
  RefundMethodEnum,
  RefundStatusEnum,
  UserRoleEnum,
} from "../../constants/model.const";

export type RefundRecipientMethod = "BANK_TRANSFER" | "E_WALLET" | "CASH";

export type RefundRecipientInfo = {
  /** Kênh nhận tiền hoàn của renter. */
  method: RefundRecipientMethod;
  /** Tên ngân hàng nhận tiền. */
  bankName?: string;
  /** Số tài khoản gốc, chỉ dùng trong luồng được phép. */
  accountNumber?: string;
  /** Số tài khoản đã che để hiển thị/lưu an toàn. */
  accountNumberMasked?: string;
  /** Tên chủ tài khoản ngân hàng. */
  accountHolderName?: string;
  /** Nhà cung cấp ví điện tử. */
  walletProvider?: string;
  /** Tài khoản ví gốc. */
  walletAccount?: string;
  /** Tài khoản ví đã che. */
  walletAccountMasked?: string;
  /** Tên chủ ví điện tử. */
  walletHolderName?: string;
  /** Ghi chú khi hoàn bằng tiền mặt. */
  cashNote?: string;
  /** User gửi/cập nhật thông tin nhận hoàn. */
  submittedBy?: mongoose.Types.ObjectId;
  /** Thời điểm gửi thông tin nhận hoàn. */
  submittedAt?: Date;
  /** Thời điểm cập nhật thông tin nhận hoàn gần nhất. */
  updatedAt?: Date;
};
export type RefundProviderOperation = {
  /** Payment gốc được hoàn trong operation này. */
  paymentId: mongoose.Types.ObjectId;
  /** Nhà cung cấp thanh toán thực hiện hoàn. */
  provider: string;

  // Số tiền hoàn cho riêng giao dịch thanh toán này, đơn vị VND.
  refundAmount: number;
// Tổng tiền Payment đã được hoàn trước operation này.
  refundedAmountBefore: number;
  // Với VNPay: 02 = hoàn toàn phần, 03 = hoàn một phần.
  transactionType?: string;

  // Metadata của giao dịch thanh toán gốc.
  originalOrderId?: string;
  originalTransactionId?: string;
  originalTransactionDate?: string;

  // Request/response của lần gọi hoàn tiền.
  requestId: string;
  responseId?: string;
  refundTransactionId?: string;
  responseCode?: string;
  responseMessage?: string;
  transactionStatus?: string;
  payDate?: string;

  /** Trạng thái riêng của lần gọi provider. */
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  /** Lý do provider thất bại. */
  failureReason?: string;
  /** Số lần retry operation. */
  retryCount: number;

  /** Thời điểm gửi request hoàn. */
  requestedAt?: Date;
  /** Thời điểm provider hoàn tất operation. */
  completedAt?: Date;
};
export type IRefund = BaseDocument & {
  /** Booking bị hủy làm phát sinh yêu cầu hoàn. */
  bookingId: mongoose.Types.ObjectId;
  /** User/actor khởi tạo yêu cầu hoàn. */
  requestedBy: mongoose.Types.ObjectId;
  /** Role của người yêu cầu hoàn. */
  requestedByRole: UserRoleEnum;
  /** User thực hiện thao tác hủy booking. */
  cancelledBy: mongoose.Types.ObjectId;
  /** Role của người hủy booking. */
  cancelledByRole: UserRoleEnum;
  /** Mã lý do hủy để phân loại chính sách. */
  reasonCode: string;
  /** Diễn giải lý do hủy. */
  reasonText: string;
  /** Tổng đã thanh toán tại lúc hủy. */
  paidAmountAtCancellation: number;
  /** Phí hủy bị giữ lại. */
  cancellationFee: number;
  /** Số tiền dự kiến hoặc thực tế phải hoàn. */
  refundAmount: number;
  /** Snapshot chính sách dùng để audit, không tính lại theo policy mới. */
  policySnapshot?: Record<string, unknown>;
  /** Quy tắc cụ thể đã áp dụng. */
  policyRuleApplied: string;
  /** Nguồn policy: hệ thống hay admin. */
  policySource: string;
  /** Phương thức hoàn tiền. */
  method: RefundMethodEnum;
  /** Trạng thái vòng đời refund. */
  status: RefundStatusEnum;
  /** Các Payment được phân bổ để hoàn. */
  paymentIds: mongoose.Types.ObjectId[];
  /** Lịch sử từng operation với cổng thanh toán. */
  providerOperations?: RefundProviderOperation[];
  /** Tên provider như VNPAY. */
  provider?: string;
  /** Mã refund do provider cấp. */
  providerRefundId?: string;
  /** Mã giao dịch hoàn của provider. */
  providerTransactionId?: string;
  /** Mã phản hồi provider. */
  providerResponseCode?: string;
  /** Nội dung phản hồi provider. */
  providerResponseMessage?: string;
  // Mã request hoàn tiền do BQDrive gửi sang cổng thanh toán.
  providerRequestId?: string;

  // Mã phản hồi do cổng thanh toán sinh ra.
  providerResponseId?: string;

  // Trạng thái giao dịch hoàn tiền tại cổng thanh toán.
  providerTransactionStatus?: string;

  // Thời điểm cổng thanh toán ghi nhận giao dịch hoàn tiền.
  providerPayDate?: string;
  /** Khóa chống tạo/trừ tiền hoàn trùng. */
  idempotencyKey: string;
  /** Lý do refund thất bại ở cấp nghiệp vụ. */
  failureReason?: string;
  /** Số lần xử lý lại refund. */
  retryCount: number;
  /** Thông tin tài khoản nhận khi hoàn thủ công. */
  recipientInfo?: RefundRecipientInfo;
  /** Ảnh/chứng từ admin hoàn thủ công. */
  manualRefundEvidence?: string[];
  /** Kênh hoàn thủ công đã sử dụng. */
  manualRefundMethod?: string;
  /** Mã tham chiếu giao dịch thủ công. */
  manualRefundReference?: string;
  /** Ghi chú của admin khi hoàn thủ công. */
  manualRefundNote?: string;
  /** Thời điểm admin đánh dấu đã gửi tiền thủ công. */
  manualRefundSentAt?: Date;
  /** Thời điểm renter xác nhận đã nhận tiền. */
  renterConfirmedAt?: Date;
  /** Thời điểm tạo yêu cầu hoàn. */
  requestedAt: Date;
  /** Thời điểm bắt đầu xử lý refund. */
  processingAt?: Date;
  /** Thời điểm hoàn thành thành công. */
  succeededAt?: Date;
  /** Thời điểm xử lý thất bại. */
  failedAt?: Date;
  /** Xóa mềm yêu cầu hoàn để giữ audit. */
  isDeleted: boolean;
};

const refundSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedByRole: {
      type: String,
      enum: Object.values(UserRoleEnum),
      required: true,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cancelledByRole: {
      type: String,
      enum: Object.values(UserRoleEnum),
      required: true,
    },
    reasonCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    reasonText: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    paidAmountAtCancellation: {
      type: Number,
      required: true,
      min: 0,
    },
    cancellationFee: {
      type: Number,
      required: true,
      min: 0,
    },
    refundAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    policySnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    policyRuleApplied: {
      type: String,
      required: true,
      trim: true,
    },
    policySource: {
      type: String,
      required: true,
      trim: true,
    },
    method: {
      type: String,
      enum: Object.values(RefundMethodEnum),
      default: RefundMethodEnum.MANUAL,
    },
    status: {
      type: String,
      enum: REFUND_STATUS_VALUES,
      default: RefundStatusEnum.WAITING_FOR_REFUND_INFO,
      index: true,
    },
    paymentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
      },
    ],
    providerOperations: [
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
    },

    provider: {
      type: String,
      required: true,
      trim: true,
    },

    refundAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Tổng tiền Payment đã được hoàn trước operation này.
      refundedAmountBefore: {
        type: Number,
        required: true,
        min: 0,
      },

    transactionType: {
      type: String,
      trim: true,
    },

    originalOrderId: {
      type: String,
      trim: true,
    },

    originalTransactionId: {
      type: String,
      trim: true,
    },

    originalTransactionDate: {
      type: String,
      trim: true,
    },

    requestId: {
      type: String,
      required: true,
      trim: true,
    },

    responseId: {
      type: String,
      trim: true,
    },

    refundTransactionId: {
      type: String,
      trim: true,
    },

    responseCode: {
      type: String,
      trim: true,
    },

    responseMessage: {
      type: String,
      trim: true,
    },

    transactionStatus: {
      type: String,
      trim: true,
    },

    payDate: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "SUCCEEDED",
        "FAILED",
        "UNKNOWN",
      ],
      default: "PENDING",
    },

    failureReason: {
      type: String,
      trim: true,
    },

    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    requestedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },
  },
],
    provider: {
      type: String,
      trim: true,
    },
    providerRefundId: {
      type: String,
      trim: true,
    },
    providerTransactionId: {
      type: String,
      trim: true,
    },
    providerResponseCode: {
      type: String,
      trim: true,
    },
    providerResponseMessage: {
      type: String,
      trim: true,
    },
    providerRequestId: {
      type: String,
      trim: true,
    },
    providerResponseId: {
      type: String,
      trim: true,
    },
    providerTransactionStatus: {
      type: String,
      trim: true,
    },
    providerPayDate: {
      type: String,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    failureReason: {
      type: String,
      trim: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    recipientInfo: {
      method: {
        type: String,
        enum: ["BANK_TRANSFER", "E_WALLET", "CASH"],
      },
      bankName: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      accountNumber: {
        type: String,
        trim: true,
        maxlength: 30,
      },
      accountNumberMasked: {
        type: String,
        trim: true,
        maxlength: 40,
      },
      accountHolderName: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      walletProvider: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      walletAccount: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      walletAccountMasked: {
        type: String,
        trim: true,
        maxlength: 120,
      },
      walletHolderName: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      cashNote: {
        type: String,
        trim: true,
        maxlength: 500,
      },
      submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      submittedAt: {
        type: Date,
      },
      updatedAt: {
        type: Date,
      },
    },
    manualRefundEvidence: [
      {
        type: String,
        trim: true,
      },
    ],
    manualRefundMethod: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    manualRefundReference: {
      type: String,
      trim: true,
    },
    manualRefundNote: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    manualRefundSentAt: {
      type: Date,
    },
    renterConfirmedAt: {
      type: Date,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processingAt: {
      type: Date,
    },
    succeededAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

refundSchema.index({ bookingId: 1, status: 1, isDeleted: 1 });
refundSchema.index({ requestedBy: 1, createdAt: -1 });

export const RefundModel = mongoose.model<IRefund>("Refund", refundSchema);
