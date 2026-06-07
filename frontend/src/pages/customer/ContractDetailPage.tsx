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
  type RentalContract,
} from "../../services/contract.service";

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value?: string) {
  if (!value) return "--";

  return new Date(value).toLocaleString("vi-VN", {
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
  const business = getBusiness(contract);

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
              label={contract.status}
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
              value={business?.businessName || "--"}
            />
            <InfoItem
              label="Loại chủ xe"
              value={
                contract.ownerType === "PRIVATE_OWNER"
                  ? "Chủ xe tư nhân"
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
            <InfoItem
              label="Tổng tiền"
              value={formatCurrency(contract.totalPrice)}
            />
            <InfoItem
              label="Tiền cọc"
              value={formatCurrency(contract.depositAmount)}
            />
            <InfoItem
              label="Còn lại"
              value={formatCurrency(contract.remainingAmount)}
            />
            <InfoItem
              label="Phương án thanh toán"
              value={contract.paymentOption}
            />
            <InfoItem
              label="Trạng thái hợp đồng"
              value={contract.status}
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
