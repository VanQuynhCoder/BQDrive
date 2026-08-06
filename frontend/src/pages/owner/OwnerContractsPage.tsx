// Shared owner page: routed from both BUSINESS and USER consignment layouts.
import { useEffect, useState } from "react";
import { Eye, FileText, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  contractService,
  type ContractCar,
  type ContractOwnerUser,
  type RentalContract,
} from "../../services/contract.service";
import {
  getContractPaymentStatusLabel,
  getContractStatusLabel,
} from "../../utils/display.util";
import { formatVietnamDateTime } from "../../utils/date.util";

type Props = {
  title: string;
  subtitle: string;
};

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value?: string) {
  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getStatusTone(status?: string) {
  if (status === "COMPLETED") return "green" as const;
  if (status === "CANCELLED") return "red" as const;
  if (status === "ACTIVE") return "blue" as const;
  return "gray" as const;
}

function getPaymentTone(status?: string) {
  if (status === "PAID_FULL") return "green" as const;
  if (status === "DEPOSIT_PAID" || status === "PARTIAL") return "yellow" as const;
  return "gray" as const;
}

function getCar(contract: RentalContract) {
  return typeof contract.carId === "object"
    ? (contract.carId as ContractCar)
    : undefined;
}

function getRenter(contract: RentalContract) {
  return typeof contract.userId === "object"
    ? (contract.userId as ContractOwnerUser)
    : undefined;
}

function getBookingCode(contract: RentalContract) {
  return typeof contract.bookingId === "object"
    ? contract.bookingId.bookingCode || String(contract.bookingId._id).slice(-8).toUpperCase()
    : String(contract.bookingId || "").slice(-8).toUpperCase();
}

function getPaymentSummary(contract: RentalContract) {
  return {
    totalPrice: contract.paymentSummary?.totalPrice ?? contract.totalPrice,
    paidAmount: contract.paymentSummary?.paidAmount ?? contract.paidAmount ?? 0,
    remainingAmount:
      contract.paymentSummary?.remainingAmount ?? contract.remainingAmount ?? 0,
    paymentStatus:
      contract.paymentSummary?.paymentStatus ?? contract.paymentStatus,
  };
}

export default function OwnerContractsPage({ title, subtitle }: Props) {
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    contractService
      .getOwnerContracts()
      .then((data) => {
        if (active) setContracts(data);
      })
      .catch(() => {
        if (active) toast.error("Không thể tải danh sách hợp đồng.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondaryDark">
          Hồ sơ thuê xe
        </p>
        <h2 className="mt-1 text-3xl font-black text-primary">{title}</h2>
        <p className="mt-2 max-w-3xl text-slate-600">{subtitle}</p>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="animate-spin text-secondaryDark" size={30} />
          </div>
        ) : contracts.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <FileText className="text-slate-300" size={40} />
            <p className="mt-3 font-extrabold text-primary">
              Chưa có hợp đồng nào
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Hợp đồng sẽ xuất hiện khi booking thuộc xe của bạn phát sinh hợp đồng hợp lệ.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1060px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Hợp đồng</th>
                    <th className="px-5 py-4">Xe / Booking</th>
                    <th className="px-5 py-4">Người thuê</th>
                    <th className="px-5 py-4">Thời gian thuê</th>
                    <th className="px-5 py-4">Thanh toán</th>
                    <th className="px-5 py-4">Trạng thái</th>
                    <th className="px-5 py-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contracts.map((contract) => {
                    const car = getCar(contract);
                    const renter = getRenter(contract);
                    const payment = getPaymentSummary(contract);
                    return (
                      <tr key={contract._id}>
                        <td className="px-5 py-4">
                          <p className="font-extrabold text-primary">{contract.contractCode}</p>
                          <p className="mt-1 text-xs text-slate-500">Tạo {formatDateTime(contract.createdAt)}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-extrabold text-primary">{car?.name || "--"}</p>
                          <p className="text-xs font-bold text-secondaryDark">{car?.carCode || "Chưa cấp mã xe"}</p>
                          <p className="text-xs text-slate-500">Booking #{getBookingCode(contract)}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-primary">{renter?.name || contract.renterName || "--"}</p>
                          <p className="text-xs text-slate-500">{renter?.email || contract.renterPhone || "--"}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <p><strong className="text-primary">Nhận:</strong> {formatDateTime(contract.startDate)}</p>
                          <p className="mt-1"><strong className="text-primary">Trả:</strong> {formatDateTime(contract.endDate)}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-extrabold text-primary">{formatCurrency(payment.totalPrice)}</p>
                          <p className="text-xs text-emerald-700">Đã trả: {formatCurrency(payment.paidAmount)}</p>
                          <p className="text-xs text-amber-700">Còn lại: {formatCurrency(payment.remainingAmount)}</p>
                          <div className="mt-2">
                            <AdminStatusBadge
                              label={getContractPaymentStatusLabel(payment.paymentStatus)}
                              tone={getPaymentTone(payment.paymentStatus)}
                            />
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <AdminStatusBadge
                            label={getContractStatusLabel(contract.status)}
                            tone={getStatusTone(contract.status)}
                          />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            to={`/contracts/${contract._id}?viewer=owner`}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 font-extrabold text-white transition hover:bg-primaryDark"
                          >
                            <Eye size={17} className="text-secondary" />
                            Xem chi tiết
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-4 md:hidden">
              {contracts.map((contract) => {
                const car = getCar(contract);
                const renter = getRenter(contract);
                const payment = getPaymentSummary(contract);
                return (
                  <article key={contract._id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-primary">{contract.contractCode}</p>
                        <p className="mt-1 text-xs text-slate-500">Booking #{getBookingCode(contract)}</p>
                      </div>
                      <AdminStatusBadge
                        label={getContractStatusLabel(contract.status)}
                        tone={getStatusTone(contract.status)}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Xe</p>
                        <p className="mt-1 font-bold text-primary">{car?.name || "--"}</p>
                        <p className="text-xs text-secondaryDark">{car?.carCode || "Chưa cấp mã"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Người thuê</p>
                        <p className="mt-1 font-bold text-primary">{renter?.name || contract.renterName || "--"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Tổng tiền</p>
                        <p className="mt-1 font-extrabold text-primary">{formatCurrency(payment.totalPrice)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Còn lại</p>
                        <p className="mt-1 font-extrabold text-amber-700">{formatCurrency(payment.remainingAmount)}</p>
                      </div>
                    </div>
                    <Link
                      to={`/contracts/${contract._id}?viewer=owner`}
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 font-extrabold text-white"
                    >
                      <Eye size={17} className="text-secondary" /> Xem chi tiết
                    </Link>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
