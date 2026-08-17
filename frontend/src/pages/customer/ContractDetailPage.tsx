import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { AlertTriangle, ArrowLeft, FileText, Loader2, Printer } from "lucide-react";

import Header from "../../components/Header";
import Footer from "../../components/Footer";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  contractService,
  type ContractCar,
  type ContractOwnerUser,
  type RentalContract,
} from "../../services/contract.service";
import {
  getBookingDisplayCode,
  getContractStatusLabel,
  getPaymentMethodLabel,
  getPaymentRefundStatusLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
  getRefundStatusLabel,
} from "../../utils/display.util";
import { formatVietnamDateTime } from "../../utils/date.util";
import {
  formatAddressSnapshot,
  formatFullAddress,
} from "../../utils/address.util";

const VEHICLE_CONDITION_LABELS: Record<string, string> = {
  bodyOk: "Thân vỏ xe",
  glassAndMirrorsOk: "Kính và gương",
  lightsOk: "Đèn xe",
  tiresOk: "Lốp xe",
  interiorClean: "Nội thất sạch",
  seatsAndSeatbeltsOk: "Ghế và dây an toàn",
  airConditioningOk: "Điều hòa",
  dashboardWarningFree: "Đèn cảnh báo",
};

const ACCESSORY_LABELS: Record<string, string> = {
  vehicleKeysPresent: "Chìa khóa xe",
  tireSupportKitPresent: "Bộ dụng cụ lốp",
  basicToolkitPresent: "Bộ dụng cụ cơ bản",
  warningTrianglePresent: "Tam giác cảnh báo",
  chargingCableApplicable: "Có áp dụng cáp sạc",
  chargingCablePresent: "Cáp sạc",
};

const VEHICLE_DOCUMENT_LABELS: Record<string, string> = {
  registrationPresent: "Đăng ký xe",
  inspectionCertificatePresent: "Giấy kiểm định",
  insuranceCertificatePresent: "Giấy bảo hiểm",
};

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value?: string) {
  if (!value) return "Chưa ghi nhận";

  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDuration(minutes?: number) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "Chưa ghi nhận";

  const hours = Math.floor(total / 60);
  const remainingMinutes = total % 60;
  if (!hours) return `${remainingMinutes} phút`;
  if (!remainingMinutes) return `${hours} giờ`;
  return `${hours} giờ ${remainingMinutes} phút`;
}

function formatNumber(value?: number, suffix = "") {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return "Chưa ghi nhận";
  return `${new Intl.NumberFormat("vi-VN").format(normalized)}${suffix}`;
}

function getExtensionStatusLabel(status?: string) {
  const map: Record<string, string> = {
    REQUESTED: "Chờ chủ xe phản hồi",
    OWNER_APPROVED: "Chủ xe đã duyệt",
    PAYMENT_PENDING: "Chờ thanh toán",
    APPLIED: "Đã áp dụng",
    REJECTED: "Bị từ chối",
    CANCELLED: "Đã hủy",
    EXPIRED: "Đã hết hạn",
  };
  return map[status || ""] || status || "Chưa ghi nhận";
}

function getExtraChargeTypeLabel(type?: string) {
  const map: Record<string, string> = {
    CLEANING: "Phí vệ sinh",
    DAMAGE: "Bồi thường hư hỏng",
    LATE_RETURN: "Trả xe muộn",
    FUEL: "Thiếu nhiên liệu/pin",
    OVERAGE_KM: "Vượt số kilomet",
    OTHER: "Phụ phí khác",
  };
  return map[type || ""] || type || "Phụ phí";
}

function getExtraChargeStatusLabel(status?: string) {
  const map: Record<string, string> = {
    PENDING: "Chờ thanh toán",
    PAID: "Đã thanh toán",
    CANCELLED: "Đã hủy",
  };
  return map[status || ""] || status || "Chưa ghi nhận";
}

function getInspectionStatusLabel(status?: string) {
  const map: Record<string, string> = {
    RECEIVED: "Đã tiếp nhận xe",
    INSPECTING: "Đang kiểm tra",
    CHARGES_PENDING: "Chờ xử lý phụ phí",
    CLEARED: "Đã đối soát",
  };
  return map[status || ""] || status || "Chưa ghi nhận";
}

function getMileageStatusLabel(status?: string) {
  const map: Record<string, string> = {
    NOT_EVALUATED_KM: "Chưa đánh giá",
    WITHIN_LIMIT_KM: "Trong định mức",
    EXCEEDED_LIMIT_KM: "Vượt định mức",
  };
  return map[status || ""] || status || "Chưa ghi nhận";
}

function getRefundMethodLabel(method?: string) {
  if (method === "MANUAL") return "Thủ công";
  if (method === "NONE") return "Chưa xác định";
  return getPaymentMethodLabel(method);
}

function getStatusTone(status?: string) {
  const map: Record<string, "green" | "red" | "yellow" | "blue" | "gray"> = {
    ACTIVE: "blue",
    COMPLETED: "green",
    CANCELLED: "red",
  };

  return map[status || ""] || "gray";
}

function getCar(contract: RentalContract) {
  return typeof contract.carId === "object"
    ? (contract.carId as ContractCar)
    : undefined;
}


function getOwnerUser(contract: RentalContract) {
  return typeof contract.ownerId === "object"
    ? (contract.ownerId as ContractOwnerUser)
    : undefined;
}
function getContractBooking(contract: RentalContract) {
  return contract.bookingId && typeof contract.bookingId === "object"
    ? contract.bookingId
    : undefined;
}

function getPaymentSummaryLabel(status?: string) {
  const map: Record<string, string> = {
    PAID_FULL: "Đã thanh toán đủ",
    DEPOSIT_PAID: "Đã thanh toán cọc",
    PARTIAL: "Đã thanh toán một phần",
    PENDING: "Chờ thanh toán",
    UNPAID: "Chưa thanh toán",
  };

  return map[status || ""] || status || "--";
}

function getCancellationReason(booking?: ReturnType<typeof getContractBooking>) {
  if (
    booking?.cancelledByRole === "SYSTEM" &&
    booking.cancelReasonCode === "PAYMENT_TIMEOUT"
  ) {
    return "Hệ thống đã tự động hủy booking do chưa hoàn tất thanh toán trong thời hạn quy định.";
  }

  return (
    booking?.cancelReasonText ||
    booking?.cancelReason ||
    "Không có lý do hủy được ghi nhận."
  );
}

export default function ContractDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [contract, setContract] = useState<RentalContract | null>(null);
  const [loading, setLoading] = useState(() => Boolean(id));

  useEffect(() => {
    let active = true;

    if (!id) {
      return;
    }

    contractService
      .getContractDetail(id)
      .then((data) => {
        if (active) setContract(data);
      })
      .catch(() => {
        toast.error("Không thể tải chi tiết hợp đồng");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 pt-20">
          <Loader2 size={30} className="animate-spin text-secondary" />
        </main>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-7xl px-6 pt-32">
          <div className="rounded-lg border border-border bg-white p-10 text-center">
            <h1 className="text-2xl font-extrabold text-primary">
              Không tìm thấy hợp đồng
            </h1>
            <Link
              to="/my-contracts"
              className="mt-5 inline-flex rounded-lg bg-secondary px-6 py-3 font-bold text-primary"
            >
              Về danh sách hợp đồng
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const car = getCar(contract);
  const booking = getContractBooking(contract);
  const ownerUser = getOwnerUser(contract);

  const lessorName = ownerUser?.name || "Chủ xe ký gửi";
  const lessorEmail = ownerUser?.email || "--";
  const lessorPhone = ownerUser?.phone || "--";

  const lessorAddress =
    contract.ownerAddressSnapshot ||
    formatFullAddress(ownerUser, "--");
  const pickupAddress = formatAddressSnapshot(
    contract.pickupAddressSnapshot || booking?.pickupAddressSnapshot,
    car,
  );
  const returnAddress = formatAddressSnapshot(
    contract.returnAddressSnapshot || booking?.returnAddressSnapshot,
    car,
    pickupAddress,
  );
  const deliverySnapshot = booking?.pricingSnapshot?.delivery;
  const isDeliveryToCustomer =
    deliverySnapshot?.deliveryType === "DELIVERY_TO_CUSTOMER";
  const paymentSummary = contract.paymentSummary || {
    totalPrice: contract.totalPrice || 0,
    upfrontPaymentAmount: contract.upfrontPaymentAmount || 0,
    paidAmount: contract.paidAmount || 0,
    remainingAmount:
      contract.remainingAmount ??
      Math.max((contract.totalPrice || 0) - (contract.paidAmount || 0), 0),
    paymentStatus: contract.paymentStatus,
  };
  const isCancelled = contract.status === "CANCELLED";
  const cancellationReason = getCancellationReason(booking);
  const appendix = contract.appendix;
  const originalEndDate = appendix?.originalSchedule?.endDate || contract.endDate;
  const validExtraChargeTotal = (appendix?.extraCharges || [])
    .filter((charge) => charge.status !== "CANCELLED")
    .reduce((sum, charge) => sum + Math.max(Number(charge.amount || 0), 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-5xl px-6 pb-20 pt-28">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
          <div>
            <p className="font-bold uppercase text-secondary">
              Hợp đồng thuê xe
            </p>
            <h1 className="mt-2 text-4xl font-extrabold text-primary">
              {contract.contractCode}
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={18} />
              Quay lại
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-secondary px-4 py-2 font-extrabold text-primary transition hover:brightness-95"
            >
              <Printer size={18} />
              In hợp đồng
            </button>
          </div>
        </div>

        <article className="rounded-lg border border-border bg-white p-6 shadow-sm md:p-8 print:border-0 print:shadow-none">
          {isCancelled && (
            <section className="mb-7 border border-red-300 bg-red-50 p-5 text-red-900 print:border-2 print:border-black print:bg-white print:text-black">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={22}
                  className="mt-0.5 shrink-0 text-red-600 print:text-black"
                />
                <div>
                  <p className="text-base font-extrabold uppercase">
                    Trạng thái: Đã hủy - Không còn hiệu lực
                  </p>
                  <p className="mt-2 font-semibold">
                    Hợp đồng này đã bị hủy và không còn hiệu lực.
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    <strong>Lý do hủy:</strong> {cancellationReason}
                  </p>
                  {booking?.cancelledAt && (
                    <p className="mt-1 text-sm">
                      <strong>Ngày hủy:</strong>{" "}
                      {formatDateTime(booking.cancelledAt)}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary">
                <FileText size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-primary">
                  Hợp đồng thuê xe BQDrive
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Mã hợp đồng: {contract.contractCode}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Mã đặt xe: {getBookingDisplayCode(booking)}
                </p>
              </div>
            </div>
            <AdminStatusBadge
              tone={getStatusTone(contract.status)}
              label={getContractStatusLabel(contract.status)}
            />
          </div>

          <section className="grid gap-5 md:grid-cols-2">
            <InfoItem label="Người thuê" value={contract.renterName} />
            <InfoItem label="Số điện thoại" value={contract.renterPhone} />
            <InfoItem label="Địa chỉ" value={contract.renterAddress} />
            <InfoItem label="Xe" value={car?.name || "--"} />
            <InfoItem label="Biển số" value={car?.licensePlate || "--"} />
            <InfoItem
              label="Đơn vị cho thuê"
              value={lessorName}
            />
            <InfoItem
              label="Email bên cho thuê"
              value={lessorEmail}
            />
            <InfoItem
              label="Số điện thoại bên cho thuê"
              value={lessorPhone}
            />
            <InfoItem label="Địa chỉ bên cho thuê" value={lessorAddress} />
           <InfoItem
                label="Bên cho thuê"
                value="Chủ xe ký gửi"
              />
            <InfoItem
              label="Ngày nhận xe"
              value={formatDateTime(contract.startDate)}
            />
            <InfoItem
              label="Ngày trả xe theo hợp đồng gốc"
              value={formatDateTime(originalEndDate)}
            />
            <InfoItem label="Địa điểm nhận xe" value={pickupAddress} />
            <InfoItem label="Địa điểm trả xe" value={returnAddress} />
            <InfoItem
              label="Hình thức nhận xe"
              value={isDeliveryToCustomer ? "Giao xe tận nơi" : "Nhận tại vị trí chủ xe"}
            />
            {isDeliveryToCustomer && (
              <InfoItem
                label="Địa chỉ giao xe"
                value={
                  deliverySnapshot?.deliveryAddressText ||
                  deliverySnapshot?.deliveryAddress ||
                  deliverySnapshot?.deliveryFormattedAddress ||
                  "--"
                }
              />
            )}
            <InfoItem
              label="Phí giao xe"
              value={formatCurrency(booking?.pricingSnapshot?.deliveryFee || 0)}
            />
            <InfoItem
              label="Tổng giá trị theo hợp đồng gốc"
              value={formatCurrency(contract.totalPrice)}
            />
            <InfoItem
              label="Thanh toán giữ chỗ"
              value={formatCurrency(paymentSummary.upfrontPaymentAmount)}
            />
            <InfoItem
              label="Đã thanh toán"
              value={formatCurrency(paymentSummary.paidAmount)}
            />
            <InfoItem
              label="Còn lại"
              value={formatCurrency(paymentSummary.remainingAmount)}
            />
            <InfoItem
              label="Phương án thanh toán"
              value={getPaymentTypeLabel(contract.paymentOption)}
            />
            <InfoItem
              label="Trạng thái thanh toán"
              value={getPaymentSummaryLabel(paymentSummary.paymentStatus)}
            />
            <InfoItem
              label="Trạng thái hợp đồng"
              value={getContractStatusLabel(contract.status)}
            />
            <InfoItem
              label="Ngày ký"
              value={formatDateTime(contract.signedAt || contract.createdAt)}
            />
          </section>

          {contract.note && (
            <section className="mt-6 rounded-lg bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase text-slate-500">
                Ghi chú
              </p>
              <p className="mt-2 font-semibold leading-7 text-primary">
                {contract.note}
              </p>
            </section>
          )}

          <section className="mt-8 rounded-lg border border-border p-5">
            <p className="text-sm leading-7 text-muted">
              Hợp đồng này được tạo dựa trên thông tin booking và thông tin
              người thuê đã cung cấp trên hệ thống BQDrive. Người thuê và đơn vị
              cho thuê có trách nhiệm thực hiện đúng thời gian nhận/trả xe,
              phương án thanh toán và các điều khoản đã được xác nhận.
            </p>
          </section>

          <section className="mt-10 border-t-2 border-primary pt-7 print:break-before-page">
            <p className="text-sm font-bold uppercase tracking-wide text-secondary">
              Hồ sơ chuyến thuê
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-primary">
              Phụ lục và phát sinh trong quá trình thuê
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Các thông tin dưới đây được tổng hợp từ lịch sử booking; không làm thay đổi nội dung thỏa thuận gốc.
            </p>

            <div className="mt-5 space-y-4">
              <AppendixSection number={1} title="Gia hạn chuyến thuê">
                {!appendix?.extensions?.length ? (
                  <AppendixEmpty>Không phát sinh gia hạn.</AppendixEmpty>
                ) : (
                  <div className="space-y-3">
                    {appendix.extensions.map((extension, index) => {
                      const extensionPayment = appendix.payments.find(
                        (payment) => payment._id === extension.paymentId,
                      );
                      return (
                        <div key={extension._id} className="rounded-lg border border-slate-200 bg-white p-4 print:border-slate-300">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="font-extrabold text-primary">
                              {extension.requestType === "PLAN_CONVERSION"
                                ? `Chuyển đổi gói lần ${index + 1}`
                                : `Gia hạn lần ${index + 1}`}
                            </p>
                            <span className="text-sm font-bold text-secondary">
                              {getExtensionStatusLabel(extension.status)}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                            <div><p className="text-muted">Kết thúc trước gia hạn</p><p className="font-bold text-primary">{formatDateTime(extension.oldEndAt)}</p></div>
                            <div><p className="text-muted">Thời gian gia hạn thêm</p><p className="font-bold text-primary">{formatDuration(extension.additionalDurationMinutes)}</p></div>
                            <div><p className="text-muted">Kết thúc mới</p><p className="font-bold text-primary">{formatDateTime(extension.requestedEndAt)}</p></div>
                            <div><p className="text-muted">Số tiền phát sinh</p><p className="font-bold text-primary">{formatCurrency(extension.additionalAmount)}</p></div>
                            <div><p className="text-muted">Thời điểm yêu cầu</p><p className="font-bold text-primary">{formatDateTime(extension.requestedAt)}</p></div>
                            <div><p className="text-muted">Xác nhận/áp dụng</p><p className="font-bold text-primary">{formatDateTime(extension.activatedAt || extension.ownerRespondedAt)}</p></div>
                          </div>
                          {extensionPayment && (
                            <p className="mt-3 text-sm text-slate-700">
                              <strong>Thanh toán gia hạn:</strong> {getPaymentStatusLabel(extensionPayment.status)} · {formatCurrency(extensionPayment.amount)}
                            </p>
                          )}
                          {extension.rejectReason && (
                            <p className="mt-3 text-sm text-red-700 print:text-black">
                              <strong>Lý do từ chối:</strong> {extension.rejectReason}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </AppendixSection>

              <AppendixSection number={2} title="Lịch sử thanh toán">
                {!appendix?.payments?.length ? (
                  <AppendixEmpty>Chưa phát sinh giao dịch thanh toán.</AppendixEmpty>
                ) : (
                  <div className="space-y-3">
                    {appendix.payments.map((payment) => (
                      <div key={payment._id} className="rounded-lg border border-slate-200 bg-white p-4 print:border-slate-300">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-extrabold text-primary">{getPaymentTypeLabel(payment.paymentType)}</p>
                            <p className="mt-1 text-sm text-muted">{getPaymentMethodLabel(payment.method)} · {formatDateTime(payment.paidAt || payment.createdAt)}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-lg font-extrabold text-primary">{formatCurrency(payment.amount)}</p>
                            <p className="text-sm font-bold text-secondary">{getPaymentStatusLabel(payment.status)}</p>
                          </div>
                        </div>
                        {(payment.transactionCode || payment.gatewayOrderId) && (
                          <p className="mt-3 break-all text-xs text-muted">Mã tham chiếu: {payment.transactionCode || payment.gatewayOrderId}</p>
                        )}
                        {Number(payment.refundedAmount || 0) > 0 && (
                          <p className="mt-2 text-sm text-slate-700">
                            Đã hoàn: <strong>{formatCurrency(payment.refundedAmount)}</strong> · {getPaymentRefundStatusLabel(payment.refundStatus)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </AppendixSection>

              <AppendixSection number={3} title="Biên bản bàn giao xe">
                {!appendix?.handover ? (
                  <AppendixEmpty>Chưa phát sinh biên bản bàn giao.</AppendixEmpty>
                ) : (
                  <>
                    <AppendixFacts items={[
                      { label: "Thời điểm bàn giao", value: formatDateTime(appendix.handover.recordedAt) },
                      { label: "ODO lúc giao", value: formatNumber(appendix.handover.odometerKm, " km") },
                      { label: "Nhiên liệu/pin", value: formatNumber(appendix.handover.energyLevelPercent, "%") },
                      { label: "Chủ xe xác nhận", value: formatDateTime(appendix.handover.ownerConfirmedAt) },
                      { label: "Người thuê xác nhận", value: formatDateTime(appendix.handover.renterConfirmedAt) },
                    ]} />
                    {appendix.handover.conditionNotes && <p className="mt-4 text-sm leading-6 text-slate-700"><strong>Ghi chú:</strong> {appendix.handover.conditionNotes}</p>}
                    <ChecklistBlock title="Tình trạng xe" checklist={appendix.handover.vehicleCondition} labels={VEHICLE_CONDITION_LABELS} />
                    <ChecklistBlock title="Phụ kiện" checklist={appendix.handover.accessoriesSnapshot} labels={ACCESSORY_LABELS} />
                    <ChecklistBlock title="Giấy tờ theo xe" checklist={appendix.handover.vehicleDocumentsSnapshot} labels={VEHICLE_DOCUMENT_LABELS} />
                    <PhotoStrip label="Ảnh biên bản bàn giao" dashboardImage={appendix.handover.dashboardImage} photos={appendix.handover.photos} />
                  </>
                )}
              </AppendixSection>

              <AppendixSection number={4} title="Biên bản trả xe">
                {!appendix?.returnInspection ? (
                  <AppendixEmpty>Chưa phát sinh biên bản trả xe.</AppendixEmpty>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-white p-3 print:border print:border-slate-200"><p className="text-xs font-bold uppercase text-slate-500">Lúc giao</p><p className="mt-2 text-sm font-bold text-primary">ODO: {formatNumber(appendix.handover?.odometerKm, " km")}</p><p className="mt-1 text-sm font-bold text-primary">Nhiên liệu/pin: {formatNumber(appendix.handover?.energyLevelPercent, "%")}</p></div>
                      <div className="rounded-lg bg-white p-3 print:border print:border-slate-200"><p className="text-xs font-bold uppercase text-slate-500">Lúc trả</p><p className="mt-2 text-sm font-bold text-primary">ODO: {formatNumber(appendix.returnInspection.returnOdometerKm, " km")}</p><p className="mt-1 text-sm font-bold text-primary">Nhiên liệu/pin: {formatNumber(appendix.returnInspection.returnEnergyLevelPercent, "%")}</p></div>
                    </div>
                    <div className="mt-4"><AppendixFacts items={[
                      { label: "Thời điểm trả thực tế", value: formatDateTime(appendix.returnInspection.actualReturnAt) },
                      { label: "Quãng đường sử dụng", value: formatNumber(appendix.returnInspection.distanceTravelledKm, " km") },
                      { label: "Kilomet trong định mức", value: formatNumber(appendix.returnInspection.totalIncludedKm, " km") },
                      { label: "Trạng thái kilomet", value: getMileageStatusLabel(appendix.returnInspection.mileageStatus) },
                      { label: "Trạng thái kiểm tra", value: getInspectionStatusLabel(appendix.returnInspection.inspectionStatus) },
                      { label: "Chủ xe xác nhận", value: formatDateTime(appendix.returnInspection.ownerConfirmedAt) },
                      { label: "Người thuê xác nhận", value: formatDateTime(appendix.returnInspection.renterConfirmedAt) },
                    ]} /></div>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
                      <span className={appendix.returnInspection.hasDamage ? "rounded-full bg-red-100 px-3 py-1 text-red-700 print:border print:border-black print:bg-white print:text-black" : "rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 print:border print:border-black print:bg-white print:text-black"}>Hư hỏng: {appendix.returnInspection.hasDamage ? "Có" : "Không"}</span>
                      <span className={appendix.returnInspection.hasCleaningIssue ? "rounded-full bg-red-100 px-3 py-1 text-red-700 print:border print:border-black print:bg-white print:text-black" : "rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 print:border print:border-black print:bg-white print:text-black"}>Cần vệ sinh: {appendix.returnInspection.hasCleaningIssue ? "Có" : "Không"}</span>
                      <span className={appendix.returnInspection.hasFuelShortage ? "rounded-full bg-red-100 px-3 py-1 text-red-700 print:border print:border-black print:bg-white print:text-black" : "rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 print:border print:border-black print:bg-white print:text-black"}>Thiếu nhiên liệu/pin: {appendix.returnInspection.hasFuelShortage ? "Có" : "Không"}</span>
                    </div>
                    {appendix.returnInspection.conditionNotes && <p className="mt-4 text-sm leading-6 text-slate-700"><strong>Ghi chú:</strong> {appendix.returnInspection.conditionNotes}</p>}
                    <ChecklistBlock title="Tình trạng xe khi trả" checklist={appendix.returnInspection.vehicleCondition} labels={VEHICLE_CONDITION_LABELS} />
                    <ChecklistBlock title="Phụ kiện khi trả" checklist={appendix.returnInspection.accessoriesSnapshot} labels={ACCESSORY_LABELS} />
                    <ChecklistBlock title="Giấy tờ theo xe khi trả" checklist={appendix.returnInspection.vehicleDocumentsSnapshot} labels={VEHICLE_DOCUMENT_LABELS} />
                    <PhotoStrip label="Ảnh biên bản trả xe" dashboardImage={appendix.returnInspection.dashboardImage} photos={appendix.returnInspection.photos} />
                  </>
                )}
              </AppendixSection>

              <AppendixSection number={5} title="Phụ phí phát sinh">
                {!appendix?.extraCharges?.length ? (
                  <AppendixEmpty>Không phát sinh phụ phí.</AppendixEmpty>
                ) : (
                  <>
                    <div className="space-y-3">
                      {appendix.extraCharges.map((charge) => (
                        <div key={charge._id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between print:border-slate-300">
                          <div><p className="font-extrabold text-primary">{getExtraChargeTypeLabel(charge.type)}</p><p className="mt-1 text-sm text-slate-700">{charge.description || "Không có mô tả."}</p><p className="mt-1 text-xs text-muted">Tạo lúc {formatDateTime(charge.createdAt)}</p></div>
                          <div className="text-left sm:text-right"><p className="font-extrabold text-primary">{formatCurrency(charge.amount)}</p><p className="text-sm font-bold text-secondary">{getExtraChargeStatusLabel(charge.status)}</p>{charge.paidAt && <p className="mt-1 text-xs text-muted">Thanh toán: {formatDateTime(charge.paidAt)}{charge.paymentMethod ? ` · ${getPaymentMethodLabel(charge.paymentMethod)}` : ""}</p>}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-between border-t border-slate-300 pt-3 text-base font-extrabold text-primary"><span>Tổng phụ phí hợp lệ</span><span>{formatCurrency(validExtraChargeTotal)}</span></div>
                  </>
                )}
              </AppendixSection>

              {Boolean(appendix?.refunds?.length) && (
                <AppendixSection number={6} title="Hoàn tiền">
                  <div className="space-y-3">
                    {appendix?.refunds.map((refund) => (
                      <div key={refund._id} className="rounded-lg border border-slate-200 bg-white p-4 print:border-slate-300">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-extrabold text-primary">Hoàn tiền qua {getRefundMethodLabel(refund.method)}</p><p className="mt-1 text-sm text-muted">Yêu cầu lúc {formatDateTime(refund.requestedAt)}</p></div><div className="text-left sm:text-right"><p className="font-extrabold text-primary">{formatCurrency(refund.refundAmount)}</p><p className="text-sm font-bold text-secondary">{getRefundStatusLabel(refund.status)}</p></div></div>
                        {refund.succeededAt && <p className="mt-3 text-sm text-slate-700">Hoàn tất lúc: {formatDateTime(refund.succeededAt)}</p>}
                        {refund.reference && <p className="mt-2 break-all text-xs text-muted">Mã tham chiếu: {refund.reference}</p>}
                      </div>
                    ))}
                  </div>
                </AppendixSection>
              )}
            </div>
          </section>
        </article>
      </main>

      <Footer />
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-2 break-words font-extrabold text-primary">{value}</p>
    </div>
  );
}

function AppendixSection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="break-inside-avoid rounded-xl border border-slate-200 bg-slate-50/70 p-4 print:border-black print:bg-white">
      <h3 className="text-base font-extrabold text-primary">
        {number}. {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AppendixEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold text-muted">{children}</p>;
}

function AppendixFacts({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex justify-between gap-4 border-b border-slate-200 pb-2 print:border-slate-300">
          <dt className="text-muted">{item.label}</dt>
          <dd className="text-right font-bold text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ChecklistBlock({
  title,
  checklist,
  labels,
}: {
  title: string;
  checklist?: Record<string, boolean | undefined>;
  labels: Record<string, string>;
}) {
  const entries = Object.entries(labels).filter(
    ([key]) => typeof checklist?.[key] === "boolean",
  );

  if (!entries.length) return null;

  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {entries.map(([key, label]) => {
          const passed = checklist?.[key] === true;
          return (
            <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm print:border print:border-slate-200">
              <span className="text-slate-700">{label}</span>
              <span className={passed ? "font-bold text-emerald-700 print:text-black" : "font-bold text-red-700 print:text-black"}>
                {passed ? "Đạt" : "Không đạt"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhotoStrip({
  dashboardImage,
  photos,
  label,
}: {
  dashboardImage?: string;
  photos?: string[];
  label: string;
}) {
  const images = [dashboardImage, ...(photos || [])]
    .filter((image): image is string => Boolean(image?.trim()))
    .slice(0, 3);

  if (!images.length) return null;

  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map((image, index) => (
          <a key={`${image}-${index}`} href={image} target="_blank" rel="noreferrer" className="print:pointer-events-none">
            <img src={image} alt={`${label} ${index + 1}`} className="h-16 w-24 rounded-md border border-slate-200 object-cover print:h-14 print:w-20" />
          </a>
        ))}
      </div>
    </div>
  );
}










