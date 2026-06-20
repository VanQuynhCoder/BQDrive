import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Building2,
  Car,
  CheckCircle2,
  Eye,
  Fuel,
  Gauge,
  Image,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
  XCircle,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import { adminService, type AdminCar } from "../../services/admin.service";

type CarAction = "approve" | "reject";
type OwnerType = "BUSINESS" | "USER";

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

function getStatus(status?: string) {
  if (status === "APPROVED") {
    return { tone: "green" as const, label: "Đã duyệt" };
  }

  if (status === "RENTED") {
    return { tone: "yellow" as const, label: "Đang được thuê" };
  }

  if (status === "REJECTED") {
    return { tone: "red" as const, label: "Từ chối" };
  }

  if (status === "HIDDEN") {
    return { tone: "gray" as const, label: "Đã ẩn" };
  }

  return { tone: "yellow" as const, label: "Chờ duyệt" };
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

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function getOwnerUser(car: AdminCar) {
  if (car.ownerType === "USER" && isObject(car.ownerId)) {
    return car.ownerId as {
      name?: string;
      email?: string;
      phone?: string;
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

function formatPrice(value?: number) {
  if (!value || value <= 0) return "--";
  return `${value.toLocaleString("vi-VN")}đ`;
}

function getPriceLabel(car: AdminCar) {
  const isHourly = car.rentalUnit === "HOUR";
  const price = isHourly ? car.pricePerHour : car.pricePerDay;

  if (!price || price <= 0) return "--";
  return `${formatPrice(price)}/${isHourly ? "giờ" : "ngày"}`;
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

    if (action.type === "reject" && !reason.trim()) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }

    setSubmitting(true);
    try {
      if (action.type === "approve") {
        await adminService.approveCar(action.car._id);
        toast.success("Đã duyệt xe");
      }

      if (action.type === "reject") {
        await adminService.rejectCar(action.car._id, reason.trim());
        toast.success("Đã từ chối xe");
      }

      closeAction();
      await fetchCars();
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
      tone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Xe ký gửi",
      value: stats.privateOwnerCars,
      icon: ShieldCheck,
      tone: "bg-emerald-50 text-emerald-700",
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
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-primary">
              Danh sách xe trong hệ thống
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Đang hiển thị {stats.total.toLocaleString("vi-VN")} xe
            </p>
          </div>
          <AdminStatusBadge
            tone="blue"
            label={`${stats.pendingCars.toLocaleString("vi-VN")} xe chờ duyệt`}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Xe</th>
                <th className="px-5 py-4">Loại xe</th>
                <th className="px-5 py-4">Hãng xe</th>
                <th className="px-5 py-4">Chủ sở hữu</th>
                <th className="px-5 py-4">Nguồn</th>
                <th className="px-5 py-4">Giá thuê</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-8 text-center text-slate-500"
                  >
                    Đang tải danh sách xe...
                  </td>
                </tr>
              )}

              {!loading &&
                cars.map((car) => {
                  const status = getStatus(car.status);
                  const ownerType = getOwnerType(car);
                  const canApprove =
                    car.status !== "APPROVED" && car.status !== "RENTED";
                  const canReject =
                    car.status !== "REJECTED" && car.status !== "RENTED";

                  return (
                    <tr key={car._id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
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
                          <div className="min-w-0">
                            <p className="font-extrabold text-primary">
                              {car.name}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-400">
                              {car.licensePlate || "Chưa có biển số"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {getCarTypeLabel(car.type)}
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-700">
                        {car.brandId?.name || "--"}
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-bold text-slate-700">
                            {getOwnerName(car)}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {getOwnerEmail(car)}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={ownerType === "BUSINESS" ? "blue" : "green"}
                          label={getOwnerTypeLabel(car)}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <p className="font-extrabold text-primary">
                            {getPriceLabel(car)}
                          </p>
                          <AdminStatusBadge
                            tone="gray"
                            label={getRentalLabel(car.rentalUnit)}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <AdminStatusBadge
                          tone={status.tone}
                          label={status.label}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openDetail(car)}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700 hover:bg-slate-200"
                          >
                            <Eye size={16} />
                            Chi tiết
                          </button>
                          {canApprove && (
                            <button
                              type="button"
                              onClick={() => openAction("approve", car)}
                              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-700 hover:bg-emerald-100"
                            >
                              <CheckCircle2 size={16} />
                              Duyệt
                            </button>
                          )}
                          {canReject && (
                            <button
                              type="button"
                              onClick={() => openAction("reject", car)}
                              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700 hover:bg-red-100"
                            >
                              <XCircle size={16} />
                              Từ chối
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && cars.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-8 text-center text-slate-500"
                  >
                    Chưa có xe nào trong hệ thống.
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
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
                        <p className="text-xs font-extrabold uppercase text-slate-400">
                          Hãng xe
                        </p>
                        <p className="mt-1 font-extrabold text-primary">
                          {detailCar.brandId?.name || "--"}
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
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-extrabold text-white transition hover:bg-emerald-700"
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
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 px-4 py-2 font-extrabold text-red-700 transition hover:bg-red-100"
                      >
                        <XCircle size={18} />
                        Từ chối
                      </button>
                    )}
                  </div>
                </div>
              </div>

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
                      <dt className="text-slate-500">Theo ngày</dt>
                      <dd className="font-extrabold text-primary">
                        {formatPrice(detailCar.pricePerDay)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Theo giờ</dt>
                      <dd className="font-extrabold text-primary">
                        {formatPrice(detailCar.pricePerHour)}
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
                        {formatDate(detailCar.createdAt)}
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

              <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
                <h4 className="font-extrabold text-primary">Mô tả xe</h4>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                  {detailCar.description?.trim() || "Chưa có mô tả xe."}
                </p>
                {detailCar.rejectReason && (
                  <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
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
        description={action ? `Xe: ${action.car.name}` : undefined}
        confirmText={action?.type === "approve" ? "Duyệt xe" : "Từ chối"}
        danger={action?.type === "reject"}
        loading={submitting}
        onClose={closeAction}
        onConfirm={confirmAction}
      >
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
      </AdminModal>
    </div>
  );
}
