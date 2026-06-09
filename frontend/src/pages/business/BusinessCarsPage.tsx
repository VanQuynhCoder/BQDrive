import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import toast from "react-hot-toast";
import {
  Car,
  Edit,
  Fuel,
  Image,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  businessService,
  type BusinessBrand,
  type BusinessCar,
  type CreateCarData,
  type FuelType,
} from "../../services/business.service";

type CarForm = {
  brandId: string;
  name: string;
  type: string;
  licensePlate: string;
  seats: string;
  fuelType: FuelType;
  transmission: string;
  allowDailyRental: boolean;
  allowHourlyRental: boolean;
  pricePerDay: string;
  pricePerHour: string;
  mainImage: string;
  galleryImages: string[];
  description: string;
};

const emptyForm: CarForm = {
  brandId: "",
  name: "",
  type: "SEDAN",
  licensePlate: "",
  seats: "4",
  fuelType: "GASOLINE",
  transmission: "AUTOMATIC",
  allowDailyRental: true,
  allowHourlyRental: false,
  pricePerDay: "",
  pricePerHour: "",
  mainImage: "",
  galleryImages: [],
  description: "",
};

const carTypeOptions = [
  "SUV",
  "SEDAN",
  "HATCHBACK",
  "PICKUP",
  "MPV",
  "COUPE",
  "CONVERTIBLE",
  "ELECTRIC",
];
const fuelTypeOptions = ["GASOLINE", "DIESEL", "ELECTRIC", "HYBRID"];
const transmissionOptions = ["AUTOMATIC", "MANUAL"];
const maxGalleryImages = 8;
const maxCarImageSize = 1024 * 1024;

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Invalid image result"));
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getStatusBadge(status?: string) {
  const map: Record<string, { label: string; tone: "green" | "red" | "yellow" | "gray" }> = {
    APPROVED: { label: "Đã duyệt", tone: "green" },
    RENTED: { label: "Đang được thuê", tone: "yellow" },
    PENDING: { label: "Chờ duyệt", tone: "yellow" },
    REJECTED: { label: "Từ chối", tone: "red" },
  };

  return map[status || ""] || { label: status || "--", tone: "gray" };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: unknown; data?: unknown } } }
    ).response;

    if (typeof response?.data?.data === "string") return response.data.data;
    if (typeof response?.data?.message === "string") {
      return response.data.message;
    }
  }

  return fallback;
}

function toForm(car: BusinessCar): CarForm {
  const allowDailyRental =
    typeof car.allowDailyRental === "boolean"
      ? car.allowDailyRental
      : car.rentalUnit !== "HOUR";
  const allowHourlyRental =
    typeof car.allowHourlyRental === "boolean"
      ? car.allowHourlyRental
      : car.rentalUnit === "HOUR";
  const images = car.images || [];

  return {
    brandId: car.brandId?._id || "",
    name: car.name || "",
    type: car.type || "SEDAN",
    licensePlate: car.licensePlate || "",
    seats: String(car.seats || 4),
    fuelType: car.fuelType || "GASOLINE",
    transmission: car.transmission || "AUTOMATIC",
    allowDailyRental,
    allowHourlyRental,
    pricePerDay: String(car.pricePerDay || ""),
    pricePerHour: String(car.pricePerHour || ""),
    mainImage: images[0] || "",
    galleryImages: images.slice(1),
    description: car.description || "",
  };
}

export default function BusinessCarsPage() {
  const [cars, setCars] = useState<BusinessCar[]>([]);
  const [brands, setBrands] = useState<BusinessBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CarForm>(emptyForm);
  const [editingCar, setEditingCar] = useState<BusinessCar | null>(null);
  const [deleteCar, setDeleteCar] = useState<BusinessCar | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [nextCars, nextBrands] = await Promise.all([
        businessService.getMyCars(),
        businessService.getBrands(),
      ]);
      setCars(nextCars);
      setBrands(nextBrands);
    } catch {
      toast.error("Không thể tải danh sách xe");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    Promise.all([businessService.getMyCars(), businessService.getBrands()])
      .then(([nextCars, nextBrands]) => {
        if (!active) return;
        setCars(nextCars);
        setBrands(nextBrands);
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

  const brandOptions = useMemo(() => brands, [brands]);

  const openCreate = () => {
    setEditingCar(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (car: BusinessCar) => {
    setEditingCar(car);
    setForm(toForm(car));
    setFormOpen(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setFormOpen(false);
    setEditingCar(null);
    setForm(emptyForm);
  };

  const updateForm = <K extends keyof CarForm>(field: K, value: CarForm[K]) => {
    setForm((prev) => {
      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleMainImageFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (selectedFiles.length === 0) return;

    const invalidFile = selectedFiles.find(
      (file) => !file.type.startsWith("image/"),
    );

    if (invalidFile) {
      toast.error("Vui lòng chỉ chọn file ảnh");
      return;
    }

    const oversizeFile = selectedFiles.find(
      (file) => file.size > maxCarImageSize,
    );

    if (oversizeFile) {
      toast.error("Mỗi ảnh xe nên nhỏ hơn 1MB");
      return;
    }

    try {
      const mainImage = await readImageAsDataUrl(selectedFiles[0]);
      setForm((prev) => ({
        ...prev,
        mainImage,
      }));
      toast.success("Đã chọn ảnh chính của xe");
    } catch {
      toast.error("Không thể đọc file ảnh");
    }
  };

  const handleGalleryImageFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (selectedFiles.length === 0) return;

    if (form.galleryImages.length + selectedFiles.length > maxGalleryImages) {
      toast.error(`Chỉ được chọn tối đa ${maxGalleryImages} ảnh phụ cho mỗi xe`);
      return;
    }

    const invalidFile = selectedFiles.find(
      (file) => !file.type.startsWith("image/"),
    );

    if (invalidFile) {
      toast.error("Vui lòng chỉ chọn file ảnh");
      return;
    }

    const oversizeFile = selectedFiles.find(
      (file) => file.size > maxCarImageSize,
    );

    if (oversizeFile) {
      toast.error("Mỗi ảnh xe nên nhỏ hơn 1MB");
      return;
    }

    try {
      const images = await Promise.all(selectedFiles.map(readImageAsDataUrl));
      setForm((prev) => ({
        ...prev,
        galleryImages: [...prev.galleryImages, ...images],
      }));
      toast.success("Đã chọn ảnh xe");
    } catch {
      toast.error("Không thể đọc file ảnh");
    }
  };

  const removeMainImage = () => {
    setForm((prev) => ({
      ...prev,
      mainImage: "",
    }));
  };

  const removeGalleryImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      galleryImages: prev.galleryImages.filter(
        (_, imageIndex) => imageIndex !== index,
      ),
    }));
  };

  const buildPayload = (): CreateCarData | null => {
    const name = form.name.trim();
    const pricePerDay = Number(form.pricePerDay);
    const pricePerHour = Number(form.pricePerHour);
    const seats = Number(form.seats);

    if (!name || !form.brandId || !form.type || !form.fuelType || !form.seats) {
      toast.error("Vui lòng nhập đầy đủ thông tin bắt buộc");
      return null;
    }

    if (!Number.isFinite(seats) || seats <= 0) {
      toast.error("Số ghế không hợp lệ");
      return null;
    }

    if (!form.allowDailyRental && !form.allowHourlyRental) {
      toast.error("Giá thuê phải lớn hơn 0");
      return null;
    }

    if (
      form.allowDailyRental &&
      (!Number.isFinite(pricePerDay) || pricePerDay <= 0)
    ) {
      toast.error("Gia thue theo ngay phai lon hon 0");
      return null;
    }

    if (
      form.allowHourlyRental &&
      (!Number.isFinite(pricePerHour) || pricePerHour <= 0)
    ) {
      toast.error("Gia thue theo gio phai lon hon 0");
      return null;
    }

    if (!form.mainImage) {
      toast.error("Vui lòng chọn ảnh chính của xe");
      return null;
    }

    const images = [form.mainImage, ...form.galleryImages].filter(Boolean);

    return {
      brandId: form.brandId,
      name,
      type: form.type,
      licensePlate: form.licensePlate.trim(),
      seats,
      fuelType: form.fuelType,
      transmission: form.transmission,
      allowDailyRental: form.allowDailyRental,
      allowHourlyRental: form.allowHourlyRental,
      rentalUnit:
        form.allowHourlyRental && !form.allowDailyRental ? "HOUR" : "DAY",
      pricePerHour: form.allowHourlyRental ? pricePerHour : undefined,
      pricePerDay: form.allowDailyRental ? pricePerDay : undefined,
      images,
      description: form.description.trim(),
    };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const payload = buildPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      if (editingCar) {
        await businessService.updateCar(editingCar._id, payload);
        toast.success("Đã cập nhật xe, vui lòng chờ Admin duyệt lại");
      } else {
        await businessService.createCar(payload);
        toast.success("Đã thêm xe, trạng thái đang chờ Admin duyệt");
      }

      closeForm();
      await fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, "Lưu xe thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCar) return;

    setSubmitting(true);
    try {
      await businessService.deleteCar(deleteCar._id);
      toast.success("Đã xóa xe");
      setDeleteCar(null);
      await fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, "Xóa xe thất bại"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-secondary">
            Kho xe doanh nghiệp
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-primary">
            Quản lý xe
          </h2>
          <p className="mt-2 max-w-2xl text-slate-500">
            Thêm hoặc cập nhật xe. Mọi xe mới và xe chỉnh sửa sẽ ở trạng thái
            chờ Admin duyệt trước khi hiển thị cho khách hàng.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 font-extrabold text-white transition hover:bg-primaryDark"
        >
          <Plus size={19} className="text-secondary" />
          Thêm xe
        </button>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Xe</th>
                <th className="px-5 py-4">Hãng</th>
                <th className="px-5 py-4">Nhiên liệu</th>
                <th className="px-5 py-4">Giá thuê</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Đang tải danh sách xe...
                  </td>
                </tr>
              )}

              {!loading &&
                cars.map((car) => {
                  const status = getStatusBadge(car.status);
                  const carIsElectric = car.fuelType === "ELECTRIC";

                  return (
                    <tr key={car._id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-secondary">
                            {car.images?.[0] ? (
                              <img
                                src={car.images[0]}
                                alt={car.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Car size={22} />
                            )}
                          </div>
                          <div>
                            <p className="font-extrabold text-primary">
                              {car.name}
                            </p>
                            <p className="text-xs font-semibold text-slate-500">
                              {car.licensePlate || "--"} · {car.seats || 0} ghế
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {car.brandId?.name || "--"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700">
                          {carIsElectric ? (
                            <Zap size={16} className="text-secondary" />
                          ) : (
                            <Fuel size={16} className="text-secondary" />
                          )}
                          {car.fuelType || "--"}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-extrabold text-primary">
                        {carIsElectric
                          ? `${formatCurrency(car.pricePerHour)} / giờ`
                          : `${formatCurrency(car.pricePerDay)} / ngày`}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <AdminStatusBadge
                            tone={status.tone}
                            label={status.label}
                          />
                          {car.rejectReason && (
                            <p className="text-xs font-semibold text-red-600">
                              {car.rejectReason}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(car)}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700 transition hover:bg-slate-200"
                          >
                            <Edit size={16} />
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteCar(car)}
                            className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700 transition hover:bg-red-100"
                          >
                            <Trash2 size={16} />
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && cars.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Doanh nghiệp chưa có xe nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-primary px-6 py-5 text-white">
              <div>
                <p className="text-sm font-bold uppercase text-secondary">
                  {editingCar ? "Cập nhật xe" : "Thêm xe mới"}
                </p>
                <h3 className="mt-1 text-2xl font-extrabold">
                  {editingCar ? editingCar.name : "Gửi xe chờ Admin duyệt"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeForm}
                disabled={submitting}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label="Đóng modal"
                title="Đóng modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Tên xe *
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                    placeholder="VinFast VF 8"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Hãng xe *
                  </span>
                  <select
                    value={form.brandId}
                    onChange={(event) =>
                      updateForm("brandId", event.target.value)
                    }
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  >
                    <option value="">Chọn hãng xe</option>
                    {brandOptions.map((brand) => (
                      <option key={brand._id} value={brand._id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Dòng xe *
                  </span>
                  <select
                    value={form.type}
                    onChange={(event) => updateForm("type", event.target.value)}
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  >
                    {carTypeOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Biển số
                  </span>
                  <input
                    value={form.licensePlate}
                    onChange={(event) =>
                      updateForm("licensePlate", event.target.value)
                    }
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                    placeholder="51A-123.45"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Số ghế *
                  </span>
                  <input
                    value={form.seats}
                    onChange={(event) => updateForm("seats", event.target.value)}
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                    inputMode="numeric"
                    placeholder="4"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Nhiên liệu *
                  </span>
                  <select
                    value={form.fuelType}
                    onChange={(event) =>
                      updateForm("fuelType", event.target.value)
                    }
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  >
                    {fuelTypeOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Hộp số
                  </span>
                  <select
                    value={form.transmission}
                    onChange={(event) =>
                      updateForm("transmission", event.target.value)
                    }
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  >
                    {transmissionOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Gia thue theo ngay
                  </span>
                  <span className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-4">
                    <input
                      type="checkbox"
                      checked={form.allowDailyRental}
                      onChange={(event) =>
                        updateForm("allowDailyRental", event.target.checked)
                      }
                    />
                    <input
                      value={form.pricePerDay}
                      onChange={(event) =>
                        updateForm("pricePerDay", event.target.value)
                      }
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      inputMode="numeric"
                      placeholder="900000"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Gia thue theo gio
                  </span>
                  <span className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-4">
                    <input
                      type="checkbox"
                      checked={form.allowHourlyRental}
                      onChange={(event) =>
                        updateForm("allowHourlyRental", event.target.checked)
                      }
                    />
                    <input
                      value={form.pricePerHour}
                      onChange={(event) =>
                        updateForm("pricePerHour", event.target.value)
                      }
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      inputMode="numeric"
                      placeholder="150000"
                    />
                  </span>
                </label>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-lg border border-dashed border-secondary/60 bg-amber-50/40 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-secondary ring-1 ring-secondary/30">
                        <Image size={22} />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-primary">
                          Ảnh chính *
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Ảnh đầu tiên hiển thị trên trang chủ.
                        </p>
                      </div>
                    </div>

                    <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 font-extrabold text-white transition hover:bg-primaryDark">
                      <Upload size={18} className="text-secondary" />
                      Chọn ảnh chính
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleMainImageFileChange}
                      />
                    </label>
                  </div>

                  <div className="mt-4">
                    {form.mainImage ? (
                      <div className="group relative aspect-[16/10] overflow-hidden rounded-lg border border-secondary/30 bg-white">
                        <img
                          src={form.mainImage}
                          alt="Ảnh chính của xe"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute left-3 top-3 rounded-lg bg-secondary px-3 py-1 text-xs font-extrabold text-primary">
                          Ảnh chính
                        </span>
                        <button
                          type="button"
                          onClick={removeMainImage}
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/75 text-white opacity-100 transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label="Xóa ảnh chính"
                          title="Xóa ảnh chính"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex aspect-[16/10] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm font-bold text-slate-400">
                        Chưa chọn ảnh chính
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-secondary ring-1 ring-slate-200">
                        <Image size={22} />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-primary">
                          Ảnh phụ mô tả
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Tối đa {maxGalleryImages} ảnh phụ, mỗi ảnh dưới 1MB.
                        </p>
                      </div>
                    </div>

                    <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary px-5 py-2 font-extrabold text-primary transition hover:bg-primary hover:text-white">
                      <Upload size={18} className="text-secondary" />
                      Chọn ảnh phụ
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleGalleryImageFileChange}
                      />
                    </label>
                  </div>

                  {form.galleryImages.length > 0 ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {form.galleryImages.map((image, index) => (
                        <div
                          key={`${image.slice(0, 36)}-${index}`}
                          className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-white"
                        >
                          <img
                            src={image}
                            alt={`Ảnh phụ ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/75 text-white opacity-100 transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label="Xóa ảnh phụ"
                            title="Xóa ảnh phụ"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400">
                      Có thể thêm ảnh nội thất, ngoại thất, cốp xe, đồng hồ...
                    </div>
                  )}
                </div>
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-extrabold text-slate-700">
                  Mô tả
                </span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                  placeholder="Mô tả tiện nghi, tình trạng xe..."
                />
              </label>

              <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  className="min-h-11 rounded-lg border border-slate-200 px-5 py-2 font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Hủy
                </button>
                <button
                  disabled={submitting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:brightness-95 disabled:opacity-60"
                >
                  {submitting && <Loader2 size={18} className="animate-spin" />}
                  {editingCar ? "Cập nhật xe" : "Thêm xe"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AdminModal
        open={!!deleteCar}
        title="Xóa xe"
        description={
          deleteCar
            ? `Bạn chắc chắn muốn xóa xe ${deleteCar.name}?`
            : undefined
        }
        confirmText="Xóa xe"
        danger
        loading={submitting}
        onClose={() => setDeleteCar(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
