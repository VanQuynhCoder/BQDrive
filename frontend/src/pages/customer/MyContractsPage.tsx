import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { CalendarDays, Eye, FileText, Loader2 } from "lucide-react";

import Header from "../../components/Header";
import Footer from "../../components/Footer";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  contractService,
  type ContractCar,
  type RentalContract,
} from "../../services/contract.service";
import { getContractStatusLabel } from "../../utils/display.util";
import { formatVietnamDateTime } from "../../utils/date.util";

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

export default function MyContractsPage() {
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    contractService
      .getMyContracts()
      .then((data) => {
        if (active) setContracts(data);
      })
      .catch(() => {
        toast.error("Không thể tải danh sách hợp đồng");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
        <section className="mb-8 rounded-lg bg-primary p-6 text-white md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Hợp đồng
              </p>
              <h1 className="mt-2 text-4xl font-extrabold">
                Hợp đồng của tôi
              </h1>
              <p className="mt-3 max-w-2xl text-white/70">
                Xem lại các hợp đồng thuê xe đã tạo trên hệ thống BQDrive.
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Mã hợp đồng</th>
                  <th className="px-5 py-4">Xe</th>
                  <th className="px-5 py-4">Ngày nhận</th>
                  <th className="px-5 py-4">Ngày trả</th>
                  <th className="px-5 py-4">Tổng tiền</th>
                  <th className="px-5 py-4">Trạng thái</th>
                  <th className="px-5 py-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-muted">
                      <span className="inline-flex items-center gap-2 font-bold">
                        <Loader2 size={18} className="animate-spin text-secondary" />
                        Đang tải hợp đồng...
                      </span>
                    </td>
                  </tr>
                )}

                {!loading &&
                  contracts.map((contract) => {
                    const car = getCar(contract);

                    return (
                      <tr key={contract._id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-extrabold text-primary">
                          {contract.contractCode}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-600">
                          {car?.name || "--"}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays size={16} className="text-secondary" />
                            {formatDateTime(contract.startDate)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {formatDateTime(contract.endDate)}
                        </td>
                        <td className="px-5 py-4 font-extrabold text-primary">
                          {formatCurrency(contract.totalPrice)}
                        </td>
                        <td className="px-5 py-4">
                          <AdminStatusBadge
                            tone={getStatusTone(contract.status)}
                            label={getContractStatusLabel(contract.status)}
                          />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end">
                            <Link
                              to={`/contracts/${contract._id}`}
                              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-white transition hover:bg-primaryDark"
                            >
                              <Eye size={16} className="text-secondary" />
                              Xem chi tiết
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                {!loading && contracts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-muted">
                      Bạn chưa có hợp đồng thuê xe nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}







