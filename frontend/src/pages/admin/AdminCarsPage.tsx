import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  ArrowRight,
  Building2,
  Car,
  CheckCircle2,
  Eye,
  Fuel,
  FileBadge2,
  Gauge,
  Image,
  MapPin,
  Milestone,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
  XCircle,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import MapPreview from "../../components/maps/MapPreview";
import CarPricingOverview from "../../components/pricing/CarPricingOverview";
import { adminService, type AdminCar } from "../../services/admin.service";
import { notifyNotificationSummaryChanged } from "../../services/notification.service";
import {
  formatAddressArea,
  formatFullAddress,
  formatPickupAddress,
} from "../../utils/address.util";
import { getCarStatusMeta } from "../../utils/display.util";
import {
  formatCurrencyWithUnit,
  getBaseRentalPrice,
} from "../../utils/pricing.util";

type CarAction = "approve" | "reject";
type OwnerType = "BUSINESS" | "USER";
type OwnerFilter = "ALL" | OwnerType;
type RegistrationCardPreview = {
  src: string;
  label: string;
};

const carTypeLabels: Record<string, string> = {
  SUV: "SUV",
  SEDAN: "Sedan",
  HATCHBACK: "Hatchback",
  PICKUP: "Bán tải",
  MPV: "MPV",
  COUPE: "Coupe",
  CONVERTIBLE: "Mui trần",
  ELECTRIC: "Xe điện",
};

function getRentalLabel(unit?: string) {
  return unit === "HOUR" ? "Theo giờ" : "Theo ngày";
}

function getStatus(status: string) {
  return getCarStatusMeta(status);
}

function isPendingCar(car: AdminCar) {
  return car.status === "PENDING";
}

function getCarTypeLabel(type?: string) {
  if (!type) return "--";
  return carTypeLabels[type] || type;
}

function getOwnerType(car: AdminCar): OwnerType {
  if (car.ownerType === "USER") {
    return "USER";
  }

  return "BUSINESS";
}

function getOwnerTypeLabel(car: AdminCar) {
  return getOwnerType(car) === "USER" ? "Người dùng ký gửi" : "Doanh nghiệp";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOwnerUser(car: AdminCar) {
  if (car.ownerType === "USER" && isObject(car.ownerId)) {
    return car.ownerId as {
      name?: string;
      email?: string;
      phone?: string;
      address: string;
      province?: string;
      city?: string;
      district?: string;
      ward?: string;
    };
  }

  return car.businessId?.userId;
}

function getOwnerName(car: AdminCar) {
  if (car.ownerType === "USER") {
    const ownerUser = getOwnerUser(car);
    return ownerUser?.name || "--";
  }

  return car.businessId?.businessName || car.businessId?.userId?.name || "--";
}

function getOwnerEmail(car: AdminCar) {
  return getOwnerUser(car)?.email || "--";
}

function getOwnerPhone(car: AdminCar) {
  if (car.ownerType === "USER") {
    return getOwnerUser(car)?.phone || "--";
  }

  return car.businessId?.phone || car.businessId?.userId?.phone || "--";
}

function getOwnerAddress(car: AdminCar) {
  if (car.ownerType === "USER") {
    return formatFullAddress(getOwnerUser(car), "--");
  }

  return formatFullAddress(car.businessId, "--");
}

function getPriceLabel(car: AdminCar) {
  const rental = getBaseRentalPrice(car);
  return formatCurrencyWithUnit(rental.price, rental.unit);
}

function getCarImages(car: AdminCar) {
  return (car.images || []).filter(Boolean);
}

function formatDate(value?: string) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function hasNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function formatKilometers(value: number | null | undefined) {
  return hasNumber(value)
    ? `${new Intl.NumberFormat("vi-VN").format(value)} km`
    : "Chưa cập nhật";
}

function hasMileagePolicy(car: AdminCar) {
  const policy = car.mileagePolicy;

  return Boolean(
    policy &&
      [
        policy.includedKmPerDay,
        policy.includedKmPerHour,
        policy.overageFeePerKm,
        policy.graceKm,
      ].some(hasNumber),
  );
}

function getFuelLabel(value?: string) {
  const labels: Record<string, string> = {
    GASOLINE: "Xăng",
    DIESEL: "Dầu",
    ELECTRIC: "Điện",
    HYBRID: "Hybrid",
  };

  return value ? labels[value] || value : "--";
}

function getTransmissionLabel(value?: string) {
  const labels: Record<string, string> = {
    AUTOMATIC: "Số tự động",
    MANUAL: "Số sàn",
  };

  return value ? labels[value] || value : "--";
}

function formatApprovalChangeValue(field: string, value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "Chưa có";
  }
  if (field === "brandId") return "Hãng xe đã thay đổi";
  if (value === "true") return "Có";
  if (value === "false") return "Không";
  if (field === "fuelType") return getFuelLabel(String(value));
  if (field === "transmission") return getTransmissionLabel(String(value));
  if (field === "type") return getCarTypeLabel(String(value));

  const numericValue = Number(value);
  if (
    Number.isFinite(numericValue) &&
    (field.startsWith("pricing.") ||
      field === "deliveryBaseFee" ||
      field === "deliveryFeePerKm" ||
      field === "mileagePolicy.overageFeePerKm")
  ) {
    return `${new Intl.NumberFormat("vi-VN").format(numericValue)} đồng`;
  }
  if (
    Number.isFinite(numericValue) &&
    (field === "currentOdometerKm" || field.startsWith("mileagePolicy."))
  ) {
    return `${new Intl.NumberFormat("vi-VN").format(numericValue)} km`;
  }

  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default function AdminCarsPage() {
  const [cars, setCars] = useState<AdminCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [action, setAction] = useState<{
    type: CarAction;
    car: AdminCar;
  } | null>(null);
  const [detailCar, setDetailCar] = useState<AdminCar | null>(null);
  const [activeDetailImageIndex, setActiveDetailImageIndex] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("ALL");
  const [registrationCardPreview, setRegistrationCardPreview] =
    useState<RegistrationCardPreview | null>(null);

  useEffect(() => {
    if (!registrationCardPreview) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRegistrationCardPreview(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [registrationCardPreview]);

  const fetchCars = async () => {
    setLoading(true);
    try {
      const data = await adminService.getCars();
      setCars(data);
    } catch {
      toast.error("Không thể tải danh sách xe");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    adminService
      .getCars()
      .then((data) => {
        if (active) setCars(data);
      })
      .catch(() => {
        toast.error("Không thể tải danh sách xe");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const businessCars = cars.filter(
      (car) => getOwnerType(car) === "BUSINESS",
    ).length;
    const privateOwnerCars = cars.filter(
      (car) => getOwnerType(car) === "USER",
    ).length;
    const pendingCars = cars.filter((car) => car.status === "PENDING").length;

    return {
      total: cars.length,
      businessCars,
      privateOwnerCars,
      pendingCars,
    };
  }, [cars]);

  const filteredCars = useMemo(() => {
    if (ownerFilter === "ALL") return cars;

    return cars.filter((car) => getOwnerType(car) === ownerFilter);
  }, [cars, ownerFilter]);

  const ownerFilterOptions: Array<{
    value: OwnerFilter;
    label: string;
    count: number;
  }> = [
    { value: "ALL", label: "Tất cả", count: stats.total },
    {
      value: "BUSINESS",
      label: "Doanh nghiệp",
      count: stats.businessCars,
    },
    {
      value: "USER",
      label: "Người dùng ký gửi",
      count: stats.privateOwnerCars,
    },
  ];

  const openAction = (type: CarAction, car: AdminCar) => {
    setReason("");
    setAction({ type, car });
  };

  const closeAction = () => {
    setReason("");
    setAction(null);
  };

  const openDetail = (car: AdminCar) => {
    setDetailCar(car);
    setActiveDetailImageIndex(0);
  };

  const closeDetail = () => {
    setDetailCar(null);
    setActiveDetailImageIndex(0);
  };

  const openActionFromDetail = (type: CarAction, car: AdminCar) => {
    closeDetail();
    openAction(type, car);
  };

  const confirmAction = async () => {
    if (!action) return;

    if (action?.type === "reject" && !reason.trim()) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }

    setSubmitting(true);
    try {
      if (action?.type === "approve") {
        await adminService.approveCar(action?.car._id);
        toast.success("Đã duyệt xe");
      }

      if (action?.type === "reject") {
        await adminService.rejectCar(action?.car._id, reason.trim());
        toast.success("Đã từ chối xe");
      }

      closeAction();
      await fetchCars();
      notifyNotificationSummaryChanged();
    } catch {
      toast.error("Thao tác thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const detailImages = detailCar ? getCarImages(detailCar) : [];
  const activeDetailImage = detailImages[activeDetailImageIndex] || "";

  const cards = [
    {
      label: "Tất cả xe",
      value: stats.total,
      icon: Car,
      tone: "bg-slate-100 text-slate-700",
    },
    {
      label: "Xe doanh nghiệp",
      value: stats.businessCars,
      icon: Building2,
      tone: "bg-primary text-secondary",
    },
    {
      label: "Xe ký gửi",
      value: stats.privateOwnerCars,
      icon: ShieldCheck,
      tone: "bg-secondarySoft text-primary",
    },
    {
      label: "Chờ duyệt",
      value: stats.pendingCars,
      icon: SlidersHorizontal,
      tone: "bg-amber-50 text-amber-700",
    },
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-bold uppercase text-secondary">
          Danh sách xe
        </p>
        <h2 className="mt-2 text-3xl font-extrabold text-primary">
          Quản lý Xe
        </h2>
        <p className="mt-2 max-w-3xl text-slate-500">
          Theo dõi toàn bộ xe trong hệ thống, kiểm tra hãng xe, loại xe, chủ sở
          hữu và trạng thái kiểm duyệt.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-extrabold text-primary">
                  {loading ? "..." : value.toLocaleString("vi-VN")}
                </p>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone}`}
              >
                <Icon size={22} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-primary">
              Danh sách xe trong hệ thống
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Đang hiển thị {filteredCars.length.toLocaleString("vi-VN")} trên
              tổng {stats.total.toLocaleString("vi-VN")} xe. Nhấp vào một dòng
              để xem chi tiết và xử lý kiểm duyệt.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div
              className="grid grid-cols-1 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 sm:grid-cols-3"
              role="group"
              aria-label="Lọc xe theo nguồn sở hữu"
            >
              {ownerFilterOptions.map((option) => {
                const active = ownerFilter === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setOwnerFilter(option.value)}
                    aria-pressed={active}
                    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-1 ${
                      active
                        ? "bg-primary text-secondary shadow-sm"
                        : "bg-transparent text-slate-600 hover:bg-white hover:text-primary"
                    }`}
                  >
                    <span>{option.label}</span>
                    <span
                      className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                        active
                          ? "bg-secondary text-primary"
                          : "bg-white text-slate-500 ring-1 ring-slate-200"
                      }`}
                    >
                      {option.count.toLocaleString("vi-VN")}
                    </span>
                  </button>
                );
              })}
            </div>
            <AdminStatusBadge
              tone="blue"
              label={`${stats.pendingCars.toLocaleString("vi-VN")} xe chờ duyệt`}
            />
          </div>
        </div>

        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="w-[12%] px-3 py-4">Mã xe</th>
                <th className="w-[25%] px-3 py-4">Xe</th>
                <th className="w-[11%] px-3 py-4">Hãng / loại</th>
                <th className="w-[19%] px-3 py-4">Chủ sở hữu</th>
                <th className="w-[11%] px-3 py-4">Nguồn</th>
                <th className="w-[12%] px-3 py-4">Giá thuê</th>
                <th className="w-[10%] px-3 py-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-slate-500"
                  >
                    Đang tải danh sách xe...
                  </td>
                </tr>
              )}

              {!loading &&
                filteredCars.map((car) => {
                  const status = getStatus(car.status);
                  const ownerType = getOwnerType(car);
                  const pendingReview = isPendingCar(car);

                  return (
                    <tr
                      key={car._id}
                      onClick={() => openDetail(car)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event?.preventDefault();
                          openDetail(car);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      className="cursor-pointer align-middle transition hover:bg-slate-50"
                      title="Nhấp để xem chi tiết và xử lý xe"
                    >
                      <td className="px-3 py-3 font-mono text-xs font-extrabold text-amber-700">
                        <span className="block break-words">
                          {car.carCode || "Chưa được cấp"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            {car.images?.[0] ? (
                              <img
                                src={car.images[0]}
                                alt={car.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Car size={22} className="text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-start gap-2">
                              {pendingReview && (
                                <span
                                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.12)]"
                                  title="Xe đang chờ duyệt"
                                  aria-label="Xe đang chờ duyệt"
                                />
                              )}
                              <p className="line-clamp-2 font-extrabold leading-5 text-primary">
                                {car.name}
                              </p>
                            </div>
                            <p className="mt-1 truncate text-xs font-bold text-slate-400">
                              {car.licensePlate || "Chưa có biển số"}
                            </p>
                            <p className="mt-1 flex min-w-0 items-center gap-1 text-xs font-semibold text-slate-500">
                              <MapPin size={13} className="shrink-0 text-secondary" />
                              <span className="truncate">
                                {formatAddressArea(car)}
                              </span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <span className="block truncate font-bold text-slate-700">
                          {car.brandId.name || "--"}
                        </span>
                        <span className="mt-1 block truncate text-xs">
                          {getCarTypeLabel(car.type)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-bold leading-5 text-slate-700">
                            {getOwnerName(car)}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-400">
                            {getOwnerEmail(car)}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <AdminStatusBadge
                          tone={ownerType === "BUSINESS" ? "blue" : "green"}
                          label={getOwnerTypeLabel(car)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <p className="truncate font-extrabold text-primary">
                            {getPriceLabel(car)}
                          </p>
                          <AdminStatusBadge
                            tone="gray"
                            label={getRentalLabel(car.rentalUnit)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {pendingReview && (
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.12)]"
                              title="Xe đang chờ duyệt"
                              aria-label="Xe đang chờ duyệt"
                            />
                          )}
                          <AdminStatusBadge
                            tone={status.tone}
                            label={status.label}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && filteredCars.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-slate-500"
                  >
                    {cars.length === 0
                      ? "Chưa có xe nào trong hệ thống."
                      : "Không có xe phù hợp với bộ lọc đã chọn."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detailCar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
          <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-primary px-5 py-4 text-white">
              <div>
                <p className="text-xs font-extrabold uppercase text-secondary">
                  Chi tiết xe kiểm duyệt
                </p>
                <h3 className="mt-1 text-2xl font-extrabold">
                  {detailCar.name}
                </h3>
                <p className="mt-1 font-mono text-xs font-extrabold text-secondary">
                  Mã xe: {detailCar.carCode || "Chưa được cấp"}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-300">
                  {detailCar.licensePlate || "Chưa có biển số"} ·{" "}
                  {getOwnerName(detailCar)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Đóng chi tiết xe"
                title="Đóng"
              >
                <X size={22} />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              {detailCar.approvalSubmission && (
                <section className="mb-5 rounded-lg border border-secondary/50 bg-yellow-50 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-extrabold uppercase text-amber-700">
                        Lần gửi duyệt gần nhất
                      </p>
                      <h4 className="mt-1 text-lg font-extrabold text-primary">
                        {detailCar.approvalSubmission.submissionType === "UPDATE"
                          ? "Chủ xe vừa cập nhật thông tin"
                          : detailCar.approvalSubmission.submissionType ===
                              "RESUBMIT"
                            ? "Chủ xe gửi lại yêu cầu duyệt"
                            : "Xe mới được gửi kiểm duyệt"}
                      </h4>
                      <p className="mt-1 text-sm font-semibold text-slate-600">
                        {detailCar.approvalSubmission.submittedAt
                          ? `Gửi lúc ${formatDate(
                              detailCar.approvalSubmission.submittedAt,
                            )}`
                          : "Chưa ghi nhận thời gian gửi"}
                      </p>
                    </div>
                    <span className="w-fit rounded-lg bg-primary px-3 py-2 text-xs font-extrabold text-secondary">
                      {detailCar.approvalSubmission.submissionType === "UPDATE"
                        ? `${detailCar.approvalSubmission.changes?.length || 0} mục đã sửa`
                        : detailCar.approvalSubmission.submissionType ===
                            "RESUBMIT"
                          ? "Gửi lại"
                          : "Xe mới"}
                    </span>
                  </div>

                  {detailCar.approvalSubmission.submissionType === "UPDATE" &&
                    (detailCar.approvalSubmission.changes?.length || 0) > 0 && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {detailCar.approvalSubmission.changes?.map(
                          (change, index) => (
                            <div
                              key={`${change.field}-${index}`}
                              className="rounded-lg border border-amber-200 bg-white p-4"
                            >
                              <p className="text-xs font-extrabold uppercase text-amber-700">
                                {change.label}
                              </p>
                              {change.field === "brandId" ? (
                                <p className="mt-2 font-bold text-primary">
                                  Hãng xe đã được thay đổi. Hãng hiện tại là {" "}
                                  {detailCar.brandId.name || "--"}.
                                </p>
                              ) : (
                                <div className="mt-2 flex items-center gap-2 text-sm">
                                  <span className="min-w-0 flex-1 break-words rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-600">
                                    {formatApprovalChangeValue(
                                      change.field,
                                      change.previousValue,
                                    )}
                                  </span>
                                  <ArrowRight
                                    size={17}
                                    className="shrink-0 text-secondary"
                                  />
                                  <span className="min-w-0 flex-1 break-words rounded-lg bg-emerald-50 px-3 py-2 font-extrabold text-emerald-800">
                                    {formatApprovalChangeValue(
                                      change.field,
                                      change.currentValue,
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    )}

                  {detailCar.approvalSubmission.submissionType === "RESUBMIT" && (
                    <p className="mt-4 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                      Xe được gửi lại với dữ liệu hiện tại, không phát sinh chỉnh
                      sửa mới trong thao tác gửi lại này.
                    </p>
                  )}
                </section>
              )}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div>
                  <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    {activeDetailImage ? (
                      <img
                        src={activeDetailImage}
                        alt={`${detailCar.name} ${activeDetailImageIndex + 1}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Image size={40} />
                        <span className="text-sm font-bold">
                          Chưa có hình ảnh xe
                        </span>
                      </div>
                    )}

                    {detailImages.length > 0 && (
                      <span className="absolute right-3 top-3 rounded-lg bg-slate-950/75 px-3 py-1 text-xs font-extrabold text-white">
                        {activeDetailImageIndex + 1}/{detailImages.length}
                      </span>
                    )}

                    {activeDetailImageIndex === 0 && detailImages.length > 0 && (
                      <span className="absolute left-3 top-3 rounded-lg bg-secondary px-3 py-1 text-xs font-extrabold text-primary">
                        Ảnh chính
                      </span>
                    )}
                  </div>

                  {detailImages.length > 1 && (
                    <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
                      {detailImages.map((image, index) => (
                        <button
                          key={`${image.slice(0, 36)}-${index}`}
                          type="button"
                          onClick={() => setActiveDetailImageIndex(index)}
                          className={`relative aspect-square overflow-hidden rounded-lg border bg-slate-100 transition ${
                            activeDetailImageIndex === index
                              ? "border-secondary ring-2 ring-secondary"
                              : "border-slate-200 hover:border-primary"
                          }`}
                          aria-label={`Xem ảnh xe ${index + 1}`}
                        >
                          <img
                            src={image}
                            alt={`Ảnh xe ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                          {index === 0 && (
                            <span className="absolute inset-x-1 bottom-1 rounded bg-slate-950/75 py-0.5 text-[10px] font-extrabold text-white">
                              Chính
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold uppercase text-slate-400">
                        Hồ sơ xe
                      </p>
                      <h4 className="mt-1 text-xl font-extrabold text-primary">
                        {detailCar.name}
                      </h4>
                    </div>
                    <AdminStatusBadge
                      tone={getStatus(detailCar.status).tone}
                      label={getStatus(detailCar.status).label}
                    />
                  </div>

                  <div className="mt-5 space-y-3 text-sm">
                    <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
                      <p className="text-xs font-extrabold uppercase text-slate-400">
                        Chủ sở hữu
                      </p>
                      <p className="mt-1 font-extrabold text-primary">
                        {getOwnerName(detailCar)}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {getOwnerEmail(detailCar)}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {getOwnerPhone(detailCar)}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {getOwnerAddress(detailCar)}
                      </p>
                    </div>

                    <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
                      <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-slate-400">
                        <MapPin size={14} className="text-secondary" />
                        Địa điểm nhận xe
                      </p>
                      <p className="mt-1 font-extrabold leading-6 text-primary">
                        {formatPickupAddress(detailCar, { includeNote: true })}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
                        <p className="text-xs font-extrabold uppercase text-slate-400">
                          Hãng xe
                        </p>
                        <p className="mt-1 font-extrabold text-primary">
                          {detailCar.brandId.name || "--"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
                        <p className="text-xs font-extrabold uppercase text-slate-400">
                          Loại xe
                        </p>
                        <p className="mt-1 font-extrabold text-primary">
                          {getCarTypeLabel(detailCar.type)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    {detailCar.status !== "APPROVED" &&
                      detailCar.status !== "RENTED" && (
                      <button
                        type="button"
                        onClick={() => openActionFromDetail("approve", detailCar)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 font-extrabold text-primary transition hover:bg-secondaryLight"
                      >
                        <CheckCircle2 size={18} />
                        Duyệt xe
                      </button>
                    )}
                    {detailCar.status !== "REJECTED" &&
                      detailCar.status !== "RENTED" && (
                      <button
                        type="button"
                        onClick={() => openActionFromDetail("reject", detailCar)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 font-extrabold text-slate-800 transition hover:bg-slate-200"
                      >
                        <XCircle size={18} />
                        Từ chối
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary">
                    <FileBadge2 size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold uppercase text-secondary">
                      Hồ sơ pháp lý
                    </p>
                    <h4 className="mt-1 font-extrabold text-primary">
                      Ảnh cà vẹt xe
                    </h4>
                    <p className="mt-1 text-sm text-slate-600">
                      Chỉ Admin và chủ xe được xem các ảnh này trong quá trình
                      kiểm duyệt.
                    </p>
                  </div>
                </div>

                {(detailCar.registrationCardImages?.length || 0) > 0 ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {detailCar.registrationCardImages?.map((image, index) => {
                      const label =
                        index === 0 ? "Cà vẹt mặt trước" : "Cà vẹt mặt sau";

                      return (
                        <button
                          key={`${image.slice(0, 36)}-registration-${index}`}
                          type="button"
                          onClick={() =>
                            setRegistrationCardPreview({ src: image, label })
                          }
                          className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition hover:border-secondary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-secondary"
                          aria-label={`Xem lớn ${label}`}
                        >
                          <img
                            src={image}
                            alt={label}
                            className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          />
                          <span className="absolute inset-x-0 bottom-9 flex items-center justify-center gap-2 bg-primary/85 px-3 py-2 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
                            <Eye size={15} /> Xem ảnh
                          </span>
                          <p className="px-3 py-2 text-sm font-extrabold text-primary">
                            {label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-5 text-sm font-bold text-amber-800">
                    Xe cũ chưa có ảnh cà vẹt trong hồ sơ. Các xe tạo mới sẽ bắt
                    buộc bổ sung trước khi gửi duyệt.
                  </div>
                )}
              </section>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="mb-4 flex items-center gap-2 text-primary">
                    <Gauge size={18} className="text-secondary" />
                    <h4 className="font-extrabold">Thông số</h4>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Số ghế</dt>
                      <dd className="font-extrabold text-primary">
                        {detailCar.seats ? `${detailCar.seats} ghế` : "--"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Nhiên liệu</dt>
                      <dd className="font-extrabold text-primary">
                        {getFuelLabel(detailCar.fuelType)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Hộp số</dt>
                      <dd className="font-extrabold text-primary">
                        {getTransmissionLabel(detailCar.transmission)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="mb-4 flex items-center gap-2 text-primary">
                    <Fuel size={18} className="text-secondary" />
                    <h4 className="font-extrabold">Giá thuê</h4>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Đơn vị thuê</dt>
                      <dd className="font-extrabold text-primary">
                        {getRentalLabel(detailCar.rentalUnit)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Giá từ</dt>
                      <dd className="text-right font-extrabold text-primary">
                        {getPriceLabel(detailCar)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="mb-4 flex items-center gap-2 text-primary">
                    <Users size={18} className="text-secondary" />
                    <h4 className="font-extrabold">Kiểm duyệt</h4>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Nguồn</dt>
                      <dd className="font-extrabold text-primary">
                        {getOwnerTypeLabel(detailCar)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Ngày gửi</dt>
                      <dd className="font-extrabold text-primary">
                        {formatDate(
                          detailCar.approvalSubmission?.submittedAt ||
                            detailCar.createdAt,
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Số ảnh</dt>
                      <dd className="font-extrabold text-primary">
                        {detailImages.length}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-4">
                  <p className="text-xs font-extrabold uppercase text-secondary">
                    Kiểm duyệt giá thuê
                  </p>
                  <h4 className="mt-1 font-extrabold uppercase text-primary">
                    Giá cơ bản và phụ thu
                  </h4>
                </div>
                <CarPricingOverview
                  pricing={detailCar.pricing}
                  allowDailyRental={detailCar.allowDailyRental}
                  allowHourlyRental={detailCar.allowHourlyRental}
                  rentalUnit={detailCar.rentalUnit}
                />
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2 text-primary">
                  <MapPin size={18} className="text-secondary" />
                  <h4 className="font-extrabold">Vị trí nhận xe</h4>
                </div>
                <p className="text-sm font-semibold leading-6 text-slate-600">
                  {formatPickupAddress(detailCar, { includeNote: true }) ||
                    "Xe chưa cập nhật địa chỉ nhận xe."}
                </p>
                <div className="mt-4">
                  <MapPreview
                    lat={detailCar.pickupLat}
                    lng={detailCar.pickupLng}
                    address={
                      detailCar.pickupFormattedAddress ||
                      detailCar.pickupAddress ||
                      detailCar.address
                    }
                    height={280}
                  />
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2 text-primary">
                  <Milestone size={18} className="text-secondary" />
                  <h4 className="font-extrabold uppercase">
                    ODO và chính sách kilomet
                  </h4>
                </div>
                <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <dt className="text-slate-500">ODO hiện tại</dt>
                    <dd className="mt-1 font-extrabold text-primary">
                      {formatKilometers(detailCar.currentOdometerKm)}
                    </dd>
                  </div>
                  {!hasMileagePolicy(detailCar) ? (
                    <div className="sm:col-span-1 lg:col-span-4">
                      <dt className="text-slate-500">Chính sách kilomet</dt>
                      <dd className="mt-1 font-extrabold text-primary">
                        Chưa thiết lập
                      </dd>
                    </div>
                  ) : (
                    <>
                      <div>
                        <dt className="text-slate-500">Giới hạn ngày</dt>
                        <dd className="mt-1 font-extrabold text-primary">
                          {hasNumber(detailCar.mileagePolicy?.includedKmPerDay)
                            ? `${new Intl.NumberFormat("vi-VN").format(
                                detailCar.mileagePolicy.includedKmPerDay,
                              )} km/ngày`
                            : "Chưa thiết lập"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Giới hạn giờ</dt>
                        <dd className="mt-1 font-extrabold text-primary">
                          {hasNumber(detailCar.mileagePolicy?.includedKmPerHour)
                            ? `${new Intl.NumberFormat("vi-VN").format(
                                detailCar.mileagePolicy.includedKmPerHour,
                              )} km/giờ`
                            : "Không áp dụng"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Phí vượt</dt>
                        <dd className="mt-1 font-extrabold text-primary">
                          {hasNumber(detailCar.mileagePolicy?.overageFeePerKm)
                            ? `${new Intl.NumberFormat("vi-VN").format(
                                detailCar.mileagePolicy.overageFeePerKm,
                              )} đồng/km`
                            : "Chưa thiết lập"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Mức miễn</dt>
                        <dd className="mt-1 font-extrabold text-primary">
                          {hasNumber(detailCar.mileagePolicy?.graceKm)
                            ? `${new Intl.NumberFormat("vi-VN").format(
                                detailCar.mileagePolicy.graceKm,
                              )} km`
                            : "Chưa thiết lập"}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
                <h4 className="font-extrabold text-primary">Mô tả xe</h4>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                  {detailCar.description?.trim() || "Chưa có mô tả xe."}
                </p>
                {detailCar.rejectReason && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-100 p-4 text-sm text-slate-800">
                    <p className="font-extrabold">Lý do từ chối</p>
                    <p className="mt-1">{detailCar.rejectReason}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <AdminModal
        open={!!action}
        title={action?.type === "approve" ? "Duyệt xe" : "Từ chối xe"}
        description={
          action?.type === "approve"
            ? "Kiểm tra nhanh thông tin xe trước khi đưa lên hệ thống."
            : "Kiểm tra nhanh thông tin xe và nhập lý do từ chối."
        }
        confirmText={action?.type === "approve" ? "Duyệt xe" : "Từ chối"}
        danger={action?.type === "reject"}
        loading={submitting}
        onClose={closeAction}
        onConfirm={confirmAction}
      >
        {action && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex gap-4">
                <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {action?.car.images?.[0] ? (
                    <img
                      src={action?.car.images[0]}
                      alt={action?.car.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Car size={26} className="text-slate-400" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="line-clamp-2 text-lg font-extrabold text-primary">
                      {action?.car.name}
                    </h4>
                    <AdminStatusBadge
                      tone={getStatus(action?.car.status).tone}
                      label={getStatus(action?.car.status).label}
                    />
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {action?.car.licensePlate || "Chưa có biển số"}
                  </p>
                  <p className="mt-1 font-mono text-xs font-extrabold text-amber-700">
                    Mã xe: {action?.car.carCode || "Chưa được cấp"}
                  </p>
                  <p className="mt-2 flex min-w-0 items-center gap-1 text-sm font-semibold text-slate-500">
                    <MapPin size={14} className="shrink-0 text-secondary" />
                    <span className="truncate">
                      {formatAddressArea(action?.car)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Chủ sở hữu
                  </p>
                  <p className="mt-1 font-extrabold text-primary">
                    {getOwnerName(action?.car)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {getOwnerEmail(action?.car)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Nguồn xe
                  </p>
                  <p className="mt-1 font-extrabold text-primary">
                    {getOwnerTypeLabel(action?.car)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Hãng / loại xe
                  </p>
                  <p className="mt-1 font-extrabold text-primary">
                    {action?.car.brandId.name || "--"} ·{" "}
                    {getCarTypeLabel(action?.car.type)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Giá thuê
                  </p>
                  <p className="mt-1 font-extrabold text-primary">
                    {getPriceLabel(action?.car)}
                  </p>
                </div>
              </div>
            </div>

            {action.car.approvalSubmission && (
              <div className="rounded-lg border border-secondary/40 bg-yellow-50 px-4 py-3 text-sm">
                <p className="font-extrabold text-primary">
                  {action.car.approvalSubmission.submissionType === "UPDATE"
                    ? `Chủ xe vừa sửa ${
                        action.car.approvalSubmission.changes?.length || 0
                      } mục`
                    : action.car.approvalSubmission.submissionType ===
                        "RESUBMIT"
                      ? "Xe được gửi lại duyệt"
                      : "Xe mới gửi duyệt"}
                </p>
                <p className="mt-1 font-semibold text-slate-600">
                  {action.car.approvalSubmission.submittedAt
                    ? formatDate(action.car.approvalSubmission.submittedAt)
                    : "Chưa ghi nhận thời gian gửi"}
                  . Mở Chi tiết xe để đối chiếu đầy đủ nội dung trước và sau.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-extrabold uppercase text-slate-400">
                Ảnh cà vẹt xe
              </p>
              {(action.car.registrationCardImages?.length || 0) > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {action.car.registrationCardImages?.map((image, index) => {
                    const label =
                      index === 0 ? "Cà vẹt mặt trước" : "Cà vẹt mặt sau";

                    return (
                      <button
                        key={`${image.slice(0, 32)}-action-registration-${index}`}
                        type="button"
                        onClick={() =>
                          setRegistrationCardPreview({ src: image, label })
                        }
                        className="group relative overflow-hidden rounded-lg border border-slate-200 text-left transition hover:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary"
                        aria-label={`Xem lớn ${label}`}
                      >
                        <img
                          src={image}
                          alt={label}
                          className="aspect-[16/10] w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                        />
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-primary/85 px-3 py-2 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
                          <Eye size={15} /> Xem ảnh
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 font-bold text-amber-700">
                  Xe cũ chưa có ảnh cà vẹt trong hồ sơ.
                </p>
              )}
            </div>

            {action?.type === "approve" && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                Sau khi duyệt, xe sẽ được phép hiển thị cho khách hàng nếu không
                bị chủ xe ẩn.
              </div>
            )}

            {action?.type === "reject" && (
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  Lý do từ chối
                </span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-secondary"
                  placeholder="Nhập lý do từ chối xe..."
                />
              </label>
            )}
          </div>
        )}
      </AdminModal>

      {registrationCardPreview &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[5200] flex items-center justify-center bg-slate-950/90 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Xem ${registrationCardPreview.label}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setRegistrationCardPreview(null);
              }
            }}
          >
            <div className="flex max-h-full w-full max-w-5xl flex-col">
              <div className="mb-3 flex items-center justify-between gap-4 text-white">
                <p className="text-lg font-extrabold">
                  {registrationCardPreview.label}
                </p>
                <button
                  type="button"
                  onClick={() => setRegistrationCardPreview(null)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-secondary"
                  aria-label="Đóng ảnh xem trước"
                >
                  <XCircle size={24} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-white p-2 shadow-2xl">
                <img
                  src={registrationCardPreview.src}
                  alt={registrationCardPreview.label}
                  className="max-h-[82vh] w-full object-contain"
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}












