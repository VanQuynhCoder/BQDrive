import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, FileText, Loader2, Printer } from "lucide-react";

import Header from "../../components/Header";
import Footer from "../../components/Footer";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  contractService,
  type ContractBusiness,
  type ContractCar,
  type ContractOwnerUser,
  type RentalContract,
} from "../../services/contract.service";
import {
  getContractStatusLabel,
  getPaymentTypeLabel,
} from "../../utils/display.util";
import { formatVietnamDateTime } from "../../utils/date.util";
import {
  formatAddressSnapshot,
  formatFullAddress,
} from "../../utils/address.util";

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

function getStatusTone(status?: string) {
  const map: Record<string, "green" | "red" | "yellow" | "blue" | "gray"> = {
    ACTIVE: "blue",
    COMPLETED: "green",
    CANCELLED: "red",
    DRAFT: "yellow",
  };

  return map[status || ""] || "gray";
}

function getCar(contract: RentalContract) {
  return typeof contract.carId === "object"
    ? (contract.carId as ContractCar)
    : undefined;
}

function getBusiness(contract: RentalContract) {
  return typeof contract.businessId === "object"
    ? (contract.businessId as ContractBusiness)
    : undefined;
}

function getOwnerUser(contract: RentalContract) {
  return contract.ownerType === "USER" && typeof contract.ownerId === "object"
    ? (contract.ownerId as ContractOwnerUser)
    : undefined;
}

function getOwnerBusiness(contract: RentalContract) {
  if (contract.ownerType !== "BUSINESS") return undefined;

  if (typeof contract.ownerId === "object") {
    return contract.ownerId as ContractBusiness;
  }

  return getBusiness(contract);
}

function getContractBooking(contract: RentalContract) {
  return typeof contract.bookingId === "object" ? contract.bookingId : undefined;
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
              Không tìm thủy hợp đồng
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
  const business = getBusiness(contract);
  const booking = getContractBooking(contract);
  const ownerUser = getOwnerUser(contract);
  const ownerBusiness = getOwnerBusiness(contract);
  const lessorName =
    contract.ownerType === "USER"
      ? ownerUser?.name || "Người dùng ký gửi"
      : ownerBusiness?.businessName || business?.businessName || "--";
  const lessorEmail =
    contract.ownerType === "USER"
      ? ownerUser?.email || "--"
      : ownerBusiness?.userId?.email || business?.userId?.email || "--";
  const lessorPhone =
    contract.ownerType === "USER"
      ? ownerUser?.phone || "--"
      : ownerBusiness?.phone || business?.phone || "--";
  const lessorAddress =
    contract.ownerAddressSnapshot ||
    (contract.ownerType === "USER"
      ? formatFullAddress(ownerUser, "--")
      : formatFullAddress(ownerBusiness || business, "--"));
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
    depositAmount: contract.depositAmount || 0,
    paidAmount: contract.paidAmount || 0,
    remainingAmount:
      contract.remainingAmount ??
      Math.max((contract.totalPrice || 0) - (contract.paidAmount || 0), 0),
    paymentStatus: contract.paymentStatus,
  };

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
            <InfoItem
              label="CCCD/CMND"
              value={contract.renterIdentityNumber}
            />
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
              label="Loại chủ xe"
              value={
                contract.ownerType === "USER"
                  ? "Người dùng ký gửi"
                  : "Doanh nghiệp"
              }
            />
            <InfoItem
              label="Ngày nhận xe"
              value={formatDateTime(contract.startDate)}
            />
            <InfoItem
              label="Ngày trả xe"
              value={formatDateTime(contract.endDate)}
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
              label="Tổng tiền"
              value={formatCurrency(paymentSummary.totalPrice)}
            />
            <InfoItem
              label="Tiền cọc"
              value={formatCurrency(paymentSummary.depositAmount)}
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
              label="Phuong án thanh toán"
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
              người thuê đã cung cập trên hệ thống BQDrive. Người thuê và đơn vị
              cho thuê có trách nhiệm thực hiện đúng thời gian nhận/trả xe,
              phương án thanh toán và các điều khoản đã được xác nhận.
            </p>
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










