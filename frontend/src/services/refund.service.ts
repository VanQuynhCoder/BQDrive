import api from "./api";
import type { RefundStatus as OfficialRefundStatus } from "../constants/status.constants";

export type RefundStatus = OfficialRefundStatus;

export type RefundPayment = {
  _id: string;
  amount?: number;
  method?: string;
  status?: string;
  paymentType?: string;
  refundedAmount?: number;
  paidAt?: string;
};

export type RefundRecipientMethod = "BANK_TRANSFER" | "E_WALLET" | "CASH";

export type RefundRecipientInfo = {
  method: RefundRecipientMethod;
  bankName?: string;
  accountNumber?: string;
  accountNumberMasked?: string;
  accountHolderName?: string;
  walletProvider?: string;
  walletAccount?: string;
  walletAccountMasked?: string;
  walletHolderName?: string;
  cashNote?: string;
  submittedAt?: string;
};

export type RefundProviderOperationStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN";

export type RefundProviderOperation = {
  paymentId?: string | RefundPayment;
  provider?: string;
  refundAmount?: number;
  refundedAmountBefore?: number;
  transactionType?: string;
  originalOrderId?: string;
  originalTransactionId?: string;
  originalTransactionDate?: string;
  requestId?: string;
  responseId?: string;
  refundTransactionId?: string;
  responseCode?: string;
  responseMessage?: string;
  transactionStatus?: string;
  payDate?: string;
  status?: RefundProviderOperationStatus;
  failureReason?: string;
  retryCount?: number;
  requestedAt?: string;
  completedAt?: string;
};

export type RefundBooking = {
  _id: string;
  bookingCode?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  cancelReason?: string;
  cancelReasonText?: string;
  cancelledAt?: string;
  cancelledByRole?: string;
  carId?: {
    _id?: string;
    name?: string;
    licensePlate?: string;
    images?: string[];
  };
  userId?: {
    _id?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
};

export type RefundRecord = {
  _id: string;
  bookingId?: RefundBooking | string;
  requestedBy?: string;
  requestedByRole?: string;
  cancelledBy?: string;
  cancelledByRole?: string;
  reasonCode?: string;
  reasonText?: string;
  paidAmountAtCancellation?: number;
  cancellationFee?: number;
  refundAmount?: number;
  policyRuleApplied?: string;
  policySource?: string;
  method?: string;
  status: RefundStatus;
  paymentIds?: RefundPayment[];
  providerOperations?: RefundProviderOperation[];
  failureReason?: string;
  manualRefundMethod?: string;
  manualRefundReference?: string;
  manualRefundNote?: string;
  manualRefundEvidence?: string[];
  manualRefundSentAt?: string;
  recipientInfo?: RefundRecipientInfo;
  renterConfirmedAt?: string;
  requestedAt?: string;
  processingAt?: string;
  succeededAt?: string;
  failedAt?: string;
  createdAt?: string;
};

export type CheckVnpayStatusResponse = {
  refund: RefundRecord;
  completed: boolean;
  operationStatus: RefundProviderOperationStatus | null;
  reason: string | null;
  message: string;
};

export type RefundPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type RefundListResponse = {
  refunds: RefundRecord[];
  pagination: RefundPagination;
};

export type RefundListParams = {
  page?: number;
  limit?: number;
  status?: string;
  scope?: "all" | "owner";
};

export type ManualRefundSentPayload = {
  manualRefundMethod?: string;
  manualRefundReference?: string;
  manualRefundNote?: string;
  manualRefundEvidence?: string[];
};

export type RefundRecipientInfoPayload =
  | {
      method: "BANK_TRANSFER";
      bankName: string;
      accountNumber: string;
      accountHolderName: string;
    }
  | {
      method: "E_WALLET";
      walletProvider: string;
      walletAccount: string;
      walletHolderName: string;
    }
  | {
      method: "CASH";
      cashNote: string;
    };

export const refundService = {
  getMyRefunds: async (params?: RefundListParams) => {
    const res = await api.get("/refunds/my", { params });
    return res.data.data as RefundListResponse;
  },
  getDetail: async (refundId: string) => {
    const res = await api.get(`/refunds/${refundId}`);
    return res.data.data.refund as RefundRecord;
  },
  checkVnpayStatus: async (
    refundId: string,
  ): Promise<CheckVnpayStatusResponse> => {
    const res = await api.post(`/refunds/${refundId}/check-vnpay-status`);
    return {
      ...(res.data.data as Omit<CheckVnpayStatusResponse, "message">),
      message: String(res.data.message || ""),
    };
  },
  manualSent: async (
    refundId: string,
    payload: ManualRefundSentPayload,
  ) => {
    const res = await api.post(`/refunds/${refundId}/manual-sent`, payload);
    return res.data.data.refund as RefundRecord;
  },
  submitRecipientInfo: async (
    refundId: string,
    payload: RefundRecipientInfoPayload,
  ) => {
    const res = await api.post(`/refunds/${refundId}/recipient-info`, payload);
    return res.data.data.refund as RefundRecord;
  },
  confirmReceived: async (refundId: string) => {
    const res = await api.post(`/refunds/${refundId}/confirm-received`);
    return res.data.data.refund as RefundRecord;
  },
};
