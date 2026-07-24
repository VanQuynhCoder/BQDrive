import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  ReceiptText,
  RefreshCw,
  X,
} from "lucide-react";

import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  refundService,
  type ManualRefundSentPayload,
  type RefundBooking,
  type RefundRecord,
  type RefundRecipientInfo,
  type RefundStatus,
} from "../../services/refund.service";
import { notifyNotificationSummaryChanged } from "../../services/notification.service";
import { formatVietnamDateTime } from "../../utils/date.util";
import { normalizeImageUrl } from "../../utils/image.util";

type OwnerRefundsPageProps = {
  title: string;
  subtitle: string;
  eyebrow?: string;
};

type RefundFilter =
  | "ALL"
  | "WAITING_FOR_REFUND_INFO"
  | "MANUAL_REQUIRED"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

const refundFilters: Array<{ label: string; value: RefundFilter }> = [
  { label: "Tất cả", value: "ALL" },
  { label: "Chờ thông tin", value: "WAITING_FOR_REFUND_INFO" },
  { label: "Cần xử lý", value: "MANUAL_REQUIRED" },
  { label: "Chờ khách xác nhận", value: "PROCESSING" },
  { label: "Đã hoàn tất", value: "SUCCEEDED" },
  { label: "Thất bại", value: "FAILED" },
  { label: "Đã hủy", value: "CANCELLED" },
];

const refundMethodOptions = [
  { label: "Chuyển khoản ngân hàng", value: "BANK_TRANSFER" },
  { label: "Ví điện tử", value: "E_WALLET" },
  { label: "Tiền mặt", value: "CASH" },
  { label: "Phương thức khác", value: "OTHER" },
];

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value?: string) {
  if (!value) return "--";

  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") return response.data.message;
  }

  return fallback;
}

function getBooking(refund: RefundRecord): RefundBooking | null {
  return typeof refund.bookingId === "object" && refund.bookingId
    ? refund.bookingId
    : null;
}

function getRefundStatusMeta(status?: RefundStatus) {
  const map: Record<
    string,
    { label: string; tone: "green" | "red" | "yellow" | "blue" | "gray" }
  > = {
    PENDING: { label: "Chờ xử lý", tone: "yellow" },
    WAITING_FOR_REFUND_INFO: {
      label: "Chờ khách cung cấp thông tin",
      tone: "yellow",
    },
    MANUAL_REQUIRED: { label: "Chờ chủ xe hoàn tiền", tone: "yellow" },
    PROCESSING: { label: "Đã gửi tiền, chờ khách xác nhận", tone: "blue" },
    SUCCEEDED: { label: "Đã hoàn tiền", tone: "green" },
    FAILED: { label: "Cần xử lý lại", tone: "red" },
    CANCELLED: { label: "Đã hủy hồ sơ", tone: "gray" },
  };

  return map[status || ""] || { label: status || "--", tone: "gray" as const };
}

function getPaymentMethodText(refund: RefundRecord) {
  const methods = Array.from(
    new Set(
      (refund.paymentIds || [])
        .map((payment) => payment.method)
        .filter((method): method is string => Boolean(method)),
    ),
  );

  return methods.length ? methods.join(", ") : refund.method || "--";
}

function getPolicyLabel(policy?: string) {
  const map: Record<string, string> = {
    NO_PAID_AMOUNT: "Chưa thanh toán, không phát sinh hoàn tiền",
    RENTER_CANCEL_BEFORE_OWNER_APPROVAL:
      "Khách hủy trước khi chủ xe duyệt, hoàn 100%",
    FULL_REFUND_BEFORE_48_HOURS: "Hủy trước giờ thuê từ 48 giờ, hoàn 100%",
    PARTIAL_REFUND_24_TO_48_HOURS:
      "Hủy trước giờ thuê 24-48 giờ, hoàn 80%",
    LATE_CANCEL_KEEP_DEPOSIT: "Hủy sát giờ, giữ lại tiền cọc",
    OWNER_CANCEL_FULL_REFUND: "Chủ xe hủy, hoàn 100%",
    PAYMENT_AFTER_CANCEL_FULL_REFUND:
      "Thanh toán đến sau khi booking đã hủy, hoàn 100%",
  };

  return map[policy || ""] || policy || "--";
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof ReceiptText;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-extrabold text-primary">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-secondary">
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words font-extrabold text-primary">{value}</p>
    </div>
  );
}

function RecipientInfoBox({ info }: { info?: RefundRecipientInfo }) {
  if (!info) {
    return (
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-bold leading-6 text-amber-800">
        Người thuê chưa cung cấp thông tin nhận tiền. Bạn chưa thể xác nhận đã
        hoàn tiền trong trạng thái này.
      </div>
    );
  }

  if (info.method === "BANK_TRANSFER") {
    return (
      <div className="rounded-xl border border-secondary/40 bg-secondarySoft/30 p-4">
        <p className="text-sm font-extrabold uppercase text-secondary">
          Thông tin nhận tiền
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <DetailRow label="Phương thức" value="Chuyển khoản ngân hàng" />
          <DetailRow label="Ngân hàng" value={info.bankName || "--"} />
          <DetailRow label="Chủ tài khoản" value={info.accountHolderName || "--"} />
          <DetailRow
            label="Số tài khoản"
            value={info.accountNumber || info.accountNumberMasked || "--"}
          />
        </div>
      </div>
    );
  }

  if (info.method === "E_WALLET") {
    return (
      <div className="rounded-xl border border-secondary/40 bg-secondarySoft/30 p-4">
        <p className="text-sm font-extrabold uppercase text-secondary">
          Thông tin nhận tiền
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <DetailRow label="Phương thức" value="Ví điện tử" />
          <DetailRow label="Tên ví" value={info.walletProvider || "--"} />
          <DetailRow label="Chủ ví" value={info.walletHolderName || "--"} />
          <DetailRow
            label="Tài khoản ví"
            value={info.walletAccount || info.walletAccountMasked || "--"}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-secondary/40 bg-secondarySoft/30 p-4">
      <p className="text-sm font-extrabold uppercase text-secondary">
        Thông tin nhận tiền
      </p>
      <div className="mt-3 grid gap-3">
        <DetailRow label="Phương thức" value="Tiền mặt" />
        <DetailRow label="Ghi chú" value={info.cashNote || "--"} />
      </div>
    </div>
  );
}

function RefundModal({
  refund,
  detailLoading,
  submitting,
  onClose,
  onSubmit,
}: {
  refund: RefundRecord;
  detailLoading: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: ManualRefundSentPayload) => Promise<void>;
}) {
  const booking = getBooking(refund);
  const status = getRefundStatusMeta(refund.status);
  const car = booking?.carId;
  const renter = booking?.userId;
  const carImage = normalizeImageUrl(car?.images?.find(Boolean));
  const [manualRefundMethod, setManualRefundMethod] = useState("BANK_TRANSFER");
  const [manualRefundReference, setManualRefundReference] = useState("");
  const [manualRefundNote, setManualRefundNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const referenceRequired = ["BANK_TRANSFER", "E_WALLET"].includes(
    manualRefundMethod,
  );
  const hasRecipientInfo = Boolean(refund.recipientInfo?.method);
  const canSubmit =
    refund.status === "MANUAL_REQUIRED" &&
    hasRecipientInfo &&
    accepted &&
    (!referenceRequired || manualRefundReference.trim().length > 0) &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;

    await onSubmit({
      manualRefundMethod,
      manualRefundReference: manualRefundReference.trim(),
      manualRefundNote: manualRefundNote.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 px-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 bg-primary px-6 py-5 text-white">
          <div>
            <p className="text-sm font-extrabold uppercase text-secondary">
              Hồ sơ hoàn tiền
            </p>
            <h3 className="mt-1 text-2xl font-extrabold">
              Booking #{booking?._id?.slice(-8).toUpperCase() || "--"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Đóng"
          >
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {detailLoading && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
              <Loader2 size={16} className="animate-spin text-secondary" />
              Đang tải thông tin chi tiết...
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div className="h-40 bg-white">
                {carImage ? (
                  <img
                    src={carImage}
                    alt={car?.name || "Xe"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300">
                    <ReceiptText size={36} />
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-lg font-extrabold text-primary">
                  {car?.name || "Xe BQDrive"}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {car?.licensePlate || "Chưa có biển số"}
                </p>
                <div className="mt-3">
                  <AdminStatusBadge tone={status.tone} label={status.label} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow label="Người thuê" value={renter?.name || "--"} />
                <DetailRow label="Email" value={renter?.email || "--"} />
                <DetailRow
                  label="Đã thanh toán lúc hủy"
                  value={formatCurrency(refund.paidAmountAtCancellation)}
                />
                <DetailRow
                  label="Phí hủy"
                  value={formatCurrency(refund.cancellationFee)}
                />
                <DetailRow
                  label="Số tiền cần hoàn"
                  value={formatCurrency(refund.refundAmount)}
                />
                <DetailRow
                  label="Thanh toán ban đầu"
                  value={getPaymentMethodText(refund)}
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase text-slate-400">
                  Chính sách/lý do hủy
                </p>
                <p className="mt-2 font-bold leading-6 text-primary">
                  {getPolicyLabel(refund.policyRuleApplied)}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {refund.reasonText ||
                    booking?.cancelReasonText ||
                    booking?.cancelReason ||
                    "Không có ghi chú hủy."}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <RecipientInfoBox info={refund.recipientInfo} />
          </div>

          {refund.status === "WAITING_FOR_REFUND_INFO" && (
            <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-bold leading-6 text-amber-800">
              Hồ sơ đang chờ người thuê cung cấp thông tin nhận tiền. Khi người
              thuê gửi thông tin, trạng thái sẽ chuyển sang cần xử lý hoàn tiền.
            </div>
          )}

          {refund.status === "MANUAL_REQUIRED" && hasRecipientInfo && (
            <div className="mt-5 rounded-xl border border-secondary/40 bg-secondarySoft/30 p-5">
              <p className="text-sm font-extrabold uppercase text-secondary">
                Xác nhận đã hoàn tiền
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-primary">
                    Phương thức hoàn tiền thực tế
                  </span>
                  <select
                    value={manualRefundMethod}
                    onChange={(event) =>
                      setManualRefundMethod(event.target.value)
                    }
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 font-bold text-primary outline-none focus:border-secondary"
                  >
                    {refundMethodOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-primary">
                    Mã giao dịch/tham chiếu
                    {referenceRequired && <span className="text-red-600"> *</span>}
                  </span>
                  <input
                    value={manualRefundReference}
                    onChange={(event) =>
                      setManualRefundReference(event.target.value)
                    }
                    maxLength={80}
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 font-bold text-primary outline-none focus:border-secondary"
                    placeholder="VD: MBVCB240723..."
                  />
                </label>
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-bold text-primary">
                  Ghi chú
                </span>
                <textarea
                  value={manualRefundNote}
                  onChange={(event) => setManualRefundNote(event.target.value)}
                  maxLength={500}
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 font-semibold text-primary outline-none focus:border-secondary"
                  placeholder="Ghi chú thêm về giao dịch hoàn tiền nếu có..."
                />
              </label>

              <label className="mt-4 flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm font-bold leading-6 text-slate-700">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-secondary"
                />
                <span>
                  Tôi xác nhận đã hoàn đúng số tiền cho người thuê và chịu trách
                  nhiệm về thông tin đã cung cấp.
                </span>
              </label>
            </div>
          )}

          {["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"].includes(
            refund.status,
          ) && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-700">
              {refund.status === "PROCESSING" &&
                "Bạn đã xác nhận gửi tiền. Hệ thống đang chờ người thuê xác nhận đã nhận tiền."}
              {refund.status === "SUCCEEDED" &&
                "Người thuê đã xác nhận nhận tiền hoàn. Hồ sơ hoàn tiền đã hoàn tất."}
              {refund.status === "FAILED" &&
                `Hoàn tiền thất bại${refund.failureReason ? `: ${refund.failureReason}` : "."}`}
              {refund.status === "CANCELLED" &&
                "Hồ sơ hoàn tiền này đã được hủy."}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-5 font-extrabold text-primary transition hover:bg-slate-100"
          >
            Đóng
          </button>
          {refund.status === "MANUAL_REQUIRED" && hasRecipientInfo && (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 size={18} className="animate-spin" />}
              Xác nhận đã hoàn tiền
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OwnerRefundsPage({
  title,
  subtitle,
  eyebrow = "Hoàn tiền",
}: OwnerRefundsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [filter, setFilter] = useState<RefundFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState("");
  const [selectedRefund, setSelectedRefund] = useState<RefundRecord | null>(null);

  const fetchRefunds = useCallback(
    async (nextFilter = filter) => {
      setLoading(true);
      try {
        const result = await refundService.getMyRefunds({
          scope: "owner",
          status: nextFilter,
          limit: 50,
        });
        setRefunds(result.refunds);
      } catch (error) {
        toast.error(getErrorMessage(error, "Không thể tải danh sách hoàn tiền"));
        setRefunds([]);
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  const openRefundDetail = useCallback(async (refund: RefundRecord) => {
    setSelectedRefund(refund);
    setDetailLoading(true);
    try {
      const detail = await refundService.getDetail(refund._id);
      setSelectedRefund(detail);
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể tải chi tiết hoàn tiền"));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchRefunds();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchRefunds]);

  useEffect(() => {
    const refundId = searchParams.get("refundId");
    if (!refundId || loading || selectedRefund?._id === refundId) return;

    const foundRefund = refunds.find((refund) => refund._id === refundId);
    if (!foundRefund) return;

    const timeoutId = window.setTimeout(() => {
      void openRefundDetail(foundRefund);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loading, openRefundDetail, refunds, searchParams, selectedRefund?._id]);

  const stats = useMemo(() => {
    const waitingInfo = refunds.filter(
      (refund) => refund.status === "WAITING_FOR_REFUND_INFO",
    ).length;
    const needAction = refunds.filter(
      (refund) => refund.status === "MANUAL_REQUIRED",
    ).length;
    const processing = refunds.filter(
      (refund) => refund.status === "PROCESSING",
    ).length;
    const totalAmount = refunds
      .filter((refund) => refund.status !== "CANCELLED")
      .reduce((sum, refund) => sum + Number(refund.refundAmount || 0), 0);

    return { waitingInfo, needAction, processing, totalAmount };
  }, [refunds]);

  const changeFilter = (nextFilter: RefundFilter) => {
    setFilter(nextFilter);
    void fetchRefunds(nextFilter);
  };

  const closeModal = () => {
    if (submittingId || detailLoading) return;
    setSelectedRefund(null);
    if (searchParams.get("refundId")) {
      setSearchParams({});
    }
  };

  const submitManualSent = async (payload: ManualRefundSentPayload) => {
    if (!selectedRefund || submittingId) return;

    setSubmittingId(selectedRefund._id);
    try {
      await refundService.manualSent(selectedRefund._id, payload);
      toast.success(
        "Đã ghi nhận thông tin hoàn tiền. Hệ thống đang chờ người thuê xác nhận đã nhận tiền.",
      );
      setSelectedRefund(null);
      if (searchParams.get("refundId")) {
        setSearchParams({});
      }
      await fetchRefunds();
      notifyNotificationSummaryChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể ghi nhận hoàn tiền"));
    } finally {
      setSubmittingId("");
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">{title}</h2>
        <p className="mt-2 max-w-3xl text-slate-500">{subtitle}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Chờ thông tin"
          value={stats.waitingInfo}
          icon={Clock3}
        />
        <StatCard label="Cần xử lý" value={stats.needAction} icon={AlertTriangle} />
        <StatCard
          label="Chờ khách xác nhận"
          value={stats.processing}
          icon={Clock3}
        />
        <StatCard
          label="Tổng tiền theo dõi"
          value={formatCurrency(stats.totalAmount)}
          icon={Banknote}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {refundFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => changeFilter(item.value)}
                className={`rounded-lg px-4 py-2 text-sm font-extrabold transition ${
                  filter === item.value
                    ? "bg-secondary text-primary"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fetchRefunds()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-primary transition hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Tải lại
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Booking</th>
                <th className="px-5 py-4">Xe</th>
                <th className="px-5 py-4">Người thuê</th>
                <th className="px-5 py-4">Đã thanh toán</th>
                <th className="px-5 py-4">Phí hủy</th>
                <th className="px-5 py-4">Cần hoàn</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    Đang tải danh sách hoàn tiền...
                  </td>
                </tr>
              )}

              {!loading &&
                refunds.map((refund) => {
                  const booking = getBooking(refund);
                  const car = booking?.carId;
                  const renter = booking?.userId;
                  const status = getRefundStatusMeta(refund.status);

                  return (
                    <tr key={refund._id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-extrabold text-primary">
                          #
                          {booking?._id?.slice(-8).toUpperCase() ||
                            refund._id.slice(-8).toUpperCase()}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500">
                          <CalendarDays size={13} className="text-secondary" />
                          {formatDateTime(refund.createdAt)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-extrabold text-primary">
                          {car?.name || "Xe BQDrive"}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {car?.licensePlate || "--"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-extrabold text-primary">
                          {renter?.name || "--"}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {renter?.email || "--"}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatCurrency(refund.paidAmountAtCancellation)}
                      </td>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {formatCurrency(refund.cancellationFee)}
                      </td>
                      <td className="px-5 py-4 font-extrabold text-secondary">
                        {formatCurrency(refund.refundAmount)}
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge tone={status.tone} label={status.label} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openRefundDetail(refund)}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-100 px-4 font-extrabold text-primary transition hover:bg-slate-200"
                          >
                            <ReceiptText size={16} />
                            Chi tiết
                          </button>
                          {refund.status === "MANUAL_REQUIRED" && (
                            <button
                              type="button"
                              onClick={() => void openRefundDetail(refund)}
                              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-secondary px-4 font-extrabold text-primary transition hover:brightness-95"
                            >
                              <CreditCard size={16} />
                              Xử lý
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && refunds.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center">
                    <div className="mx-auto max-w-md">
                      <CheckCircle2 size={38} className="mx-auto text-emerald-500" />
                      <p className="mt-3 text-lg font-extrabold text-primary">
                        Chưa có hồ sơ hoàn tiền cần hiển thị
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        Khi booking bị hủy và có tiền cần hoàn, hồ sơ sẽ xuất
                        hiện tại đây.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRefund && (
        <RefundModal
          refund={selectedRefund}
          detailLoading={detailLoading}
          submitting={submittingId === selectedRefund._id}
          onClose={closeModal}
          onSubmit={submitManualSent}
        />
      )}
    </div>
  );
}
