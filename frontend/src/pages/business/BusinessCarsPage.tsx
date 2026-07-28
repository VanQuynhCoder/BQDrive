import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import toast from "react-hot-toast";
import {
  Car,
  Edit,
  Eye,
  EyeOff,
  Fuel,
  Image,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";

import AdminModal from "../../components/admin/AdminModal";
import AdminStatusBadge from "../../components/admin/AdminStatusBadge";
import {
  CarFormNavigation,
  CarFormStepper,
  FieldError,
  type CarFormStep,
} from "../../components/cars/CarFormWizard";
import CarFormReviewStep from "../../components/cars/CarFormReviewStep";
import {
  buildCarWizardPayload,
  carToWizardForm,
  EMPTY_CAR_WIZARD_FORM,
  type CarWizardForm as CarForm,
} from "../../components/cars/carFormWizard.model";
import { useCarFormWizard } from "../../components/cars/useCarFormWizard";
import FormattedNumberInput from "../../components/forms/FormattedNumberInput";
import MapPicker from "../../components/maps/MapPicker";
import {
  businessService,
  type BusinessBrand,
  type BusinessCar,
} from "../../services/business.service";
import { mapService } from "../../services/map.service";
import { uploadService } from "../../services/upload.service";
import { formatAddressArea, formatPickupAddress } from "../../utils/address.util";
import { getCarStatusMeta } from "../../utils/display.util";
import {
  isValidPlateNumber,
  sanitizePlateNumberInput,
} from "../../utils/validators";

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
const maxCarImageSize = 5 * 1024 * 1024;

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getRentalPriceText(car: BusinessCar) {
  const allowDailyRental =
    typeof car.allowDailyRental === "boolean"
      ? car.allowDailyRental
      : car.rentalUnit !== "HOUR";
  const allowHourlyRental =
    typeof car.allowHourlyRental === "boolean"
      ? car.allowHourlyRental
      : car.rentalUnit === "HOUR";
  const prices = [
    allowDailyRental
      ? `${formatCurrency(car.pricing?.basePricePerDay)} / ngày`
      : "",
    allowHourlyRental
      ? `${formatCurrency(car.pricing?.basePricePerHour)} / giờ`
      : "",
  ].filter(Boolean);

  return prices.join(" | ") || "--";
}

function formatPrice(value?: number | null) {
  if (value === undefined || value === null || value < 0) return "--";
  return `${value.toLocaleString("vi-VN")}đ`;
}

function getPricingRows(car: BusinessCar) {
  return [
    {
      label: "Giá cơ bản ngày",
      value: car.pricing?.basePricePerDay,
      unit: "ngày",
    },
    {
      label: "Phụ thu cuối tuần",
      value: car.pricing?.weekendSurchargePerDay,
      unit: "ngày",
    },
    {
      label: "Phụ thu ngày lễ",
      value: car.pricing?.holidaySurchargePerDay,
      unit: "ngày",
    },
    {
      label: "Giá cơ bản giờ",
      value: car.pricing?.basePricePerHour,
      unit: "giờ",
    },
    {
      label: "Phụ thu cuối tuần",
      value: car.pricing?.weekendSurchargePerHour,
      unit: "giờ",
    },
    {
      label: "Phụ thu ngày lễ",
      value: car.pricing?.holidaySurchargePerHour,
      unit: "giờ",
    },
  ];
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

function getStatusBadge(status?: string) {
  return getCarStatusMeta(status);
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

export default function BusinessCarsPage() {
  const [cars, setCars] = useState<BusinessCar[]>([]);
  const [brands, setBrands] = useState<BusinessBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CarForm>(EMPTY_CAR_WIZARD_FORM);
  const [editingCar, setEditingCar] = useState<BusinessCar | null>(null);
  const [deleteCar, setDeleteCar] = useState<BusinessCar | null>(null);
  const [detailCar, setDetailCar] = useState<BusinessCar | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState("");
  const [visibilityUpdatingId, setVisibilityUpdatingId] = useState<string | null>(
    null,
  );
  const wizard = useCarFormWizard("business-car-form-scroll");
  const {
    currentStep,
    highestStep,
    visitedSteps,
    fieldErrors,
    goToStep,
  } = wizard;

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
    setForm(EMPTY_CAR_WIZARD_FORM);
    wizard.initialize(EMPTY_CAR_WIZARD_FORM);
    setGeocodeStatus("");
    setFormOpen(true);
  };

  const openEdit = (car: BusinessCar) => {
    const nextForm = carToWizardForm(car);
    setEditingCar(car);
    setForm(nextForm);
    wizard.initialize(nextForm);
    setGeocodeStatus("");
    setFormOpen(true);
  };

  const closeForm = (force = false) => {
    if (
      !wizard.canClose(
        form,
        submitting || uploadingImages,
        force,
      )
    ) return;
    setFormOpen(false);
    setEditingCar(null);
    setForm(EMPTY_CAR_WIZARD_FORM);
    wizard.reset();
    setGeocodeStatus("");
  };

  const updateForm = <K extends keyof CarForm>(field: K, value: CarForm[K]) => {
    wizard.clearFieldError(field);
    setForm((prev) => {
      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleNextStep = () => {
    wizard.goToNextStep(
      form,
      editingCar ? editingCar.currentOdometerKm ?? null : undefined,
    );
  };

  const handleGeocodeSearch = async () => {
    const address = form.pickupAddress.trim();

    if (!address) {
      toast.error("Vui lòng nhập địa chỉ cần tìm.");
      setGeocodeStatus("Vui lòng nhập địa chỉ cần tìm.");
      return;
    }

    setGeocoding(true);
    setGeocodeStatus("Đang tìm địa chỉ...");

    try {
      const result = await mapService.geocodeAddress(address);

      if (!result.success || !result.data) {
        const message =
          result.message ||
          "Không tìm thấy địa chỉ. Vui lòng chọn thủ công trên bản đồ.";
        setGeocodeStatus(message);
        toast.error(message);
        return;
      }

      const foundAddress = result.data.formattedAddress || address;

      setForm((prev) => ({
        ...prev,
        pickupAddress: foundAddress,
        pickupFormattedAddress: foundAddress,
        pickupLat: String(result.data?.lat ?? ""),
        pickupLng: String(result.data?.lng ?? ""),
        city: result.data?.province || prev.city,
        district: result.data?.district || prev.district,
        ward: result.data?.ward || prev.ward,
      }));
      setGeocodeStatus(
        "Đã tìm thấy vị trí. Bạn có thể chọn lại trên bản đồ nếu chưa chính xác.",
      );
      toast.success("Đã tìm thấy vị trí trên bản đồ");
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Không thể tìm địa chỉ lúc này. Vui lòng thử lại hoặc chọn thủ công trên bản đồ.",
      );
      setGeocodeStatus(message);
      toast.error(message);
    } finally {
      setGeocoding(false);
    }
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
      toast.error("Vui lòng chọn file ảnh JPG, PNG hoặc WEBP");
      return;
    }

    const oversizeFile = selectedFiles.find(
      (file) => file.size > maxCarImageSize,
    );

    if (oversizeFile) {
      toast.error("Mỗi ảnh xe tối đa 5MB");
      return;
    }

    setUploadingImages(true);
    try {
      const selectedFile = selectedFiles[0];

      if (!selectedFile) return;

      const uploadedImage = await uploadService.uploadCarImage(selectedFile);
      setForm((prev) => ({
        ...prev,
        mainImage: uploadedImage.url,
      }));
      toast.success("Đã upload ảnh chính của xe");
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể upload ảnh xe"));
    } finally {
      setUploadingImages(false);
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
      toast.error("Vui lòng chọn file ảnh JPG, PNG hoặc WEBP");
      return;
    }

    const oversizeFile = selectedFiles.find(
      (file) => file.size > maxCarImageSize,
    );

    if (oversizeFile) {
      toast.error("Mỗi ảnh xe tối đa 5MB");
      return;
    }

    setUploadingImages(true);
    try {
      const images = await Promise.all(
        selectedFiles.map((file) =>
          uploadService.uploadCarImage(file).then((image) => image.url),
        ),
      );
      setForm((prev) => ({
        ...prev,
        galleryImages: [...prev.galleryImages, ...images],
      }));
      toast.success("Đã upload ảnh xe");
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể upload ảnh xe"));
    } finally {
      setUploadingImages(false);
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
  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();

    if (currentStep !== 6) {
      handleNextStep();
      return;
    }

    if (uploadingImages) {
      toast.error("Vui lòng chờ upload ảnh hoàn tất");
      return;
    }

    if (editingCar && !wizard.isDirty(form)) {
      toast("Không có thay đổi nào cần lưu.");
      closeForm(true);
      return;
    }

    const editingOdometer = editingCar
      ? (editingCar.currentOdometerKm ?? null)
      : undefined;
    if (wizard.findFirstInvalidStep(form, editingOdometer)) return;

    const payload = buildCarWizardPayload(form);

    setSubmitting(true);
    try {
      if (editingCar) {
        await businessService.updateCar(editingCar._id, payload);
        toast.success("Đã cập nhật xe, vui lòng cho Admin duyệt lại");
      } else {
        await businessService.createCar(payload);
        toast.success("Đã thêm xe, trạng thái đang cho Admin duyệt");
      }

      closeForm(true);
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

  const toggleCarVisibility = async (car: BusinessCar) => {
    setVisibilityUpdatingId(car._id);
    try {
      if (car.isHidden) {
        await businessService.unhideCar(car._id);
        toast.success("Đã hiện xe trên hệ thống");
      } else {
        await businessService.hideCar(car._id);
        toast.success("Đã ẩn xe khỏi hệ thống");
      }

      await fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, "Cập nhật hiển thị xe thất bại"));
    } finally {
      setVisibilityUpdatingId(null);
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
            Thêm hoặc cập nhật xe. Mỗi xe mới và xe chỉnh sửa sẽ ở trạng thái
            cho Admin duyệt trước khi hiển thị cho khách hàng.
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
                    <tr
                      key={car._id}
                      onClick={() => setDetailCar(car)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setDetailCar(car);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      title="Nhấn để xem chi tiết xe"
                      className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                    >
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
                            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500">
                              <MapPin size={13} className="text-secondary" />
                              {formatAddressArea(car)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {car.brandId.name || "--"}
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
                        {getRentalPriceText(car)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <AdminStatusBadge
                            tone={status.tone}
                            label={status.label}
                          />
                          {car.rejectReason && (
                            <p className="text-xs font-semibold text-slate-800">
                              {car.rejectReason}
                            </p>
                          )}
                          {car.isHidden && (
                            <AdminStatusBadge
                              tone="gray"
                              label="Đã ẩn khỏi trang chủ"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void toggleCarVisibility(car);
                            }}
                            disabled={visibilityUpdatingId === car._id}
                            className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {visibilityUpdatingId === car._id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : car.isHidden ? (
                              <Eye size={16} />
                            ) : (
                              <EyeOff size={16} />
                            )}
                            {car.isHidden ? "Hiện xe" : "Ẩn xe"}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEdit(car);
                            }}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700 transition hover:bg-slate-200"
                          >
                            <Edit size={16} />
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteCar(car);
                            }}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-extrabold text-slate-800 transition hover:bg-slate-200"
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

      {detailCar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-primary/20 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-primary px-6 py-5 text-white">
              <div>
                <p className="text-sm font-bold uppercase text-secondary">
                  Chi tiết xe doanh nghiệp
                </p>
                <h3 className="mt-1 text-2xl font-extrabold">
                  {detailCar.name}
                </h3>
                <p className="mt-1 text-sm font-semibold text-white/70">
                  {detailCar.licensePlate || "Chưa có biển số"} ·{" "}
                  {detailCar.brandId?.name || "--"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailCar(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-secondary"
                aria-label="Đóng chi tiết xe"
                title="Đóng"
              >
                <X size={22} />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    {detailCar.images?.[0] ? (
                      <img
                        src={detailCar.images[0]}
                        alt={detailCar.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Image size={36} />
                        <span className="text-sm font-bold">
                          Chưa có ảnh xe
                        </span>
                      </div>
                    )}
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                      <AdminStatusBadge
                        tone={getStatusBadge(detailCar.status).tone}
                        label={getStatusBadge(detailCar.status).label}
                      />
                      {detailCar.isHidden && (
                        <AdminStatusBadge tone="gray" label="Đã ẩn" />
                      )}
                    </div>
                  </div>

                  {detailCar.images && detailCar.images.length > 1 && (
                    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                      {detailCar.images.slice(1).map((image, index) => (
                        <div
                          key={`${image.slice(0, 32)}-${index}`}
                          className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                        >
                          <img
                            src={image}
                            alt={`Ảnh xe ${index + 2}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-200 bg-white p-5">
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

                <aside className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-extrabold uppercase text-slate-400">
                      Hồ sơ xe
                    </p>
                    <h4 className="mt-1 text-xl font-extrabold text-primary">
                      {detailCar.name}
                    </h4>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Hãng xe</dt>
                        <dd className="font-extrabold text-primary">
                          {detailCar.brandId?.name || "--"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Loại xe</dt>
                        <dd className="font-extrabold text-primary">
                          {detailCar.type || "--"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Số ghế</dt>
                        <dd className="font-extrabold text-primary">
                          {detailCar.seats ? `${detailCar.seats} ghế` : "--"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Nhiên liệu</dt>
                        <dd className="font-extrabold text-primary">
                          {getFuelLabel(detailCar.fuelType)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Hộp số</dt>
                        <dd className="font-extrabold text-primary">
                          {getTransmissionLabel(detailCar.transmission)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <MapPin size={18} className="text-secondary" />
                      <h4 className="font-extrabold text-primary">
                        Địa điểm nhận xe
                      </h4>
                    </div>
                    <p className="text-sm font-semibold leading-6 text-slate-600">
                      {formatPickupAddress(detailCar, {
                        includeNote: true,
                        fallback: "Địa điểm nhận xe đang cập nhật",
                      })}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <Fuel size={18} className="text-secondary" />
                      <h4 className="font-extrabold text-primary">Giá thuê</h4>
                    </div>
                    <dl className="space-y-3 text-sm">
                      {getPricingRows(detailCar).map((row) => (
                        <div
                          key={`${row.label}-${row.unit}`}
                          className="flex justify-between gap-4"
                        >
                          <dt className="text-slate-500">{row.label}</dt>
                          <dd className="font-extrabold text-primary">
                            {formatPrice(row.value)}
                            {row.value !== undefined && row.value !== null
                              ? `/${row.unit}`
                              : ""}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailCar(null);
                        openEdit(detailCar);
                      }}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2 font-extrabold text-primary transition hover:bg-secondaryLight"
                    >
                      <Edit size={18} />
                      Sửa xe
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailCar(null)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-2 font-bold text-primary transition hover:bg-slate-50"
                    >
                      Đóng
                    </button>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-primary px-6 py-5 text-white">
              <div>
                <p className="text-sm font-bold uppercase text-secondary">
                  {editingCar ? "Cập nhật xe" : "Thêm xe mới"}
                </p>
                <h3 className="mt-1 text-2xl font-extrabold">
                  {editingCar ? editingCar.name : "Gửi xe cho Admin duyệt"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => closeForm()}
                disabled={submitting || uploadingImages}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label="Đóng modal"
                title="Đóng modal"
              >
                <X size={20} />
              </button>
            </div>

            <CarFormStepper
              currentStep={currentStep}
              highestStep={highestStep}
              onStepChange={goToStep}
            />

            <form
              id="business-car-form-scroll"
              onSubmit={handleSubmit}
              className="overflow-y-auto px-5 py-5 sm:px-6"
            >
              {Object.keys(fieldErrors).length > 0 && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  Vui lòng kiểm tra lại các trường được báo lỗi trong bước này.
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  data-car-form-field="name"
                  className={currentStep === 1 ? "block" : "hidden"}
                >
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Tên xe *
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                    placeholder="VinFast VF 8"
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-xs font-bold text-red-600">
                      {fieldErrors.name}
                    </p>
                  )}
                </label>

                <label
                  data-car-form-field="brandId"
                  className={currentStep === 1 ? "block" : "hidden"}
                >
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
                  {fieldErrors.brandId && (
                    <p className="mt-1 text-xs font-bold text-red-600">
                      {fieldErrors.brandId}
                    </p>
                  )}
                </label>

                <label
                  data-car-form-field="licensePlate"
                  className={currentStep === 1 ? "block" : "hidden"}
                >
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

                <label
                  data-car-form-field="seats"
                  className={currentStep === 1 ? "block" : "hidden"}
                >
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    Biển số
                  </span>
                  <input
                    value={form.licensePlate}
                    onChange={(event) =>
                      updateForm(
                        "licensePlate",
                        sanitizePlateNumberInput(event.target.value),
                      )
                    }
                    onBlur={() => {
                      if (
                        form.licensePlate &&
                        !isValidPlateNumber(form.licensePlate)
                      ) {
                        toast.error(
                          "Biển số ô tô không hợp lệ. Ví dụ đúng: 30A-123.45 hoặc 30A12345.",
                        );
                      }
                    }}
                    maxLength={11}
                    inputMode="text"
                    autoCapitalize="characters"
                    pattern="\d{2}[A-Z]-?(\d{5}|\d{3}\.\d{2})"
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                    placeholder="30A-123.45"
                  />
                  {fieldErrors.licensePlate && (
                    <p className="mt-1 text-xs font-bold text-red-600">
                      {fieldErrors.licensePlate}
                    </p>
                  )}
                </label>

                <label className={currentStep === 1 ? "block" : "hidden"}>
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
                  {fieldErrors.seats && (
                    <p className="mt-1 text-xs font-bold text-red-600">
                      {fieldErrors.seats}
                    </p>
                  )}
                </label>

                <label
                  data-car-form-field="currentOdometerKm"
                  className={currentStep === 3 ? "block sm:col-span-2" : "hidden"}
                >
                  <span className="mb-2 block text-sm font-extrabold text-slate-700">
                    ODO hiện tại {!editingCar && "*"}
                  </span>
                  <FormattedNumberInput
                    value={form.currentOdometerKm}
                    onChange={(value) =>
                      updateForm(
                        "currentOdometerKm",
                        value === null ? "" : String(value),
                      )
                    }
                    min={0}
                    placeholder="45000"
                    suffix="km"
                    className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                    inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                  />
                  {fieldErrors.currentOdometerKm && (
                    <p className="mt-1 text-xs font-bold text-red-600">
                      {fieldErrors.currentOdometerKm}
                    </p>
                  )}
                </label>

                <label className={currentStep === 1 ? "block" : "hidden"}>
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

                <label className={currentStep === 1 ? "block" : "hidden"}>
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

                <div
                  className={
                    currentStep === 3
                      ? "col-span-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                      : "hidden"
                  }
                >
                  <div className="mb-4">
                    <p className="text-sm font-extrabold uppercase text-secondary">
                      Chính sách kilomet
                    </p>
                    <h4 className="mt-1 text-lg font-extrabold text-primary">
                      Thiết lập giới hạn quãng đường
                    </h4>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                      Các giới hạn và phí vượt kilomet sẽ áp dụng cho booking mới.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {form.allowDailyRental && (
                      <label
                        className="block"
                        data-car-form-field="includedKmPerDay"
                      >
                        <span className="mb-2 block text-sm font-extrabold text-slate-700">
                          Giới hạn kilomet mỗi ngày *
                        </span>
                        <FormattedNumberInput
                          value={form.includedKmPerDay}
                          onChange={(value) =>
                            updateForm(
                              "includedKmPerDay",
                              value === null ? "" : String(value),
                            )
                          }
                          min={1}
                          placeholder="250"
                          suffix="km/ngày"
                          className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                          inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                        />
                        <FieldError message={fieldErrors.includedKmPerDay} />
                      </label>
                    )}

                    {form.allowHourlyRental && (
                      <label
                        className="block"
                        data-car-form-field="includedKmPerHour"
                      >
                        <span className="mb-2 block text-sm font-extrabold text-slate-700">
                          Giới hạn kilomet mỗi giờ *
                        </span>
                        <FormattedNumberInput
                          value={form.includedKmPerHour}
                          onChange={(value) =>
                            updateForm(
                              "includedKmPerHour",
                              value === null ? "" : String(value),
                            )
                          }
                          min={1}
                          placeholder="20"
                          suffix="km/giờ"
                          className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                          inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                        />
                        <FieldError message={fieldErrors.includedKmPerHour} />
                      </label>
                    )}

                    <label
                      className="block"
                      data-car-form-field="overageFeePerKm"
                    >
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Phí vượt kilomet
                      </span>
                      <FormattedNumberInput
                        value={form.overageFeePerKm}
                        onChange={(value) =>
                          updateForm(
                            "overageFeePerKm",
                            value === null ? "" : String(value),
                          )
                        }
                        min={0}
                        placeholder="4000"
                        suffix="đồng/km"
                        className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                        inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      />
                    </label>

                    <label
                      className="block"
                      data-car-form-field="graceKm"
                    >
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Số kilomet vượt được miễn
                      </span>
                      <FormattedNumberInput
                        value={form.graceKm}
                        onChange={(value) =>
                          updateForm(
                            "graceKm",
                            value === null ? "" : String(value),
                          )
                        }
                        min={0}
                        placeholder="5"
                        suffix="km"
                        className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                        inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      />
                    </label>
                  </div>
                </div>

                <div
                  data-car-form-field="rentalMode"
                  className={
                    currentStep === 2
                      ? "col-span-full rounded-xl border border-slate-200 bg-slate-50/80 p-4"
                      : "hidden"
                  }
                >
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-extrabold uppercase text-secondary">
                        Bảng giá thuê
                      </p>
                      <h4 className="text-lg font-extrabold text-primary">
                        Thiết lập giá theo ngày và theo giờ
                      </h4>
                    </div>
                    <p className="text-sm font-semibold leading-6 text-slate-500">
                      Phụ thu để trống sẽ được tính là 0 đồng.
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <label className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-extrabold text-primary">
                            Thuê theo ngày
                          </p>
                          <p className="text-xs font-semibold text-slate-500">
                            Áp dụng cho lịch thuê từ 1 ngày trở lên.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={form.allowDailyRental}
                          onChange={(event) =>
                            updateForm("allowDailyRental", event.target.checked)
                          }
                          className="h-5 w-5 accent-secondary"
                        />
                      </label>

                      {form.allowDailyRental ? (
                      <div className="space-y-3">
                        <label
                          className="block"
                          data-car-form-field="basePricePerDay"
                        >
                          <span className="mb-2 block text-sm font-extrabold text-slate-700">
                            Giá thuê cơ bản *
                          </span>
                          <FormattedNumberInput
                            value={form.basePricePerDay}
                            onChange={(value) =>
                              updateForm("basePricePerDay", value)
                            }
                            min={1}
                            placeholder="500000"
                            suffix="đồng/ngày"
                            disabled={!form.allowDailyRental}
                            className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                            inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:text-slate-400"
                          />
                          <FieldError message={fieldErrors.basePricePerDay} />
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-extrabold text-slate-700">
                              Phụ thu cuối tuần
                            </span>
                            <FormattedNumberInput
                              value={form.weekendSurchargePerDay}
                              onChange={(value) =>
                                updateForm("weekendSurchargePerDay", value)
                              }
                              min={0}
                              placeholder="0"
                              suffix="đồng/ngày"
                              disabled={!form.allowDailyRental}
                              className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                              inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:text-slate-400"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-sm font-extrabold text-slate-700">
                              Phụ thu ngày lễ
                            </span>
                            <FormattedNumberInput
                              value={form.holidaySurchargePerDay}
                              onChange={(value) =>
                                updateForm("holidaySurchargePerDay", value)
                              }
                              min={0}
                              placeholder="0"
                              suffix="đồng/ngày"
                              disabled={!form.allowDailyRental}
                              className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                              inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:text-slate-400"
                            />
                          </label>
                        </div>
                        <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
                          <p className="font-semibold text-slate-600">
                            Giá cuối tuần dự kiến:{" "}
                            <strong className="text-primary">
                              {form.basePricePerDay !== null
                                ? `${formatPrice(
                                    form.basePricePerDay +
                                      (form.weekendSurchargePerDay ?? 0),
                                  )}/ngày`
                                : "--"}
                            </strong>
                          </p>
                          <p className="font-semibold text-slate-600">
                            Giá ngày lễ dự kiến:{" "}
                            <strong className="text-primary">
                              {form.basePricePerDay !== null
                                ? `${formatPrice(
                                    form.basePricePerDay +
                                      (form.holidaySurchargePerDay ?? 0),
                                  )}/ngày`
                                : "--"}
                            </strong>
                          </p>
                        </div>
                      </div>
                      ) : (
                        <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                          Bật thuê theo ngày để thiết lập giá cơ bản và phụ thu.
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <label className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-extrabold text-primary">
                            Thuê theo giờ
                          </p>
                          <p className="text-xs font-semibold text-slate-500">
                            Bật nếu xe hỗ trợ thuê ngắn theo giờ.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={form.allowHourlyRental}
                          onChange={(event) =>
                            updateForm("allowHourlyRental", event.target.checked)
                          }
                          className="h-5 w-5 accent-secondary"
                        />
                      </label>

                      {form.allowHourlyRental ? (
                      <div className="space-y-3">
                        <label
                          className="block"
                          data-car-form-field="basePricePerHour"
                        >
                          <span className="mb-2 block text-sm font-extrabold text-slate-700">
                            Giá thuê cơ bản *
                          </span>
                          <FormattedNumberInput
                            value={form.basePricePerHour}
                            onChange={(value) =>
                              updateForm("basePricePerHour", value)
                            }
                            min={1}
                            placeholder="150000"
                            suffix="đồng/giờ"
                            disabled={!form.allowHourlyRental}
                            className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                            inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:text-slate-400"
                          />
                          <FieldError message={fieldErrors.basePricePerHour} />
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-extrabold text-slate-700">
                              Phụ thu cuối tuần
                            </span>
                            <FormattedNumberInput
                              value={form.weekendSurchargePerHour}
                              onChange={(value) =>
                                updateForm("weekendSurchargePerHour", value)
                              }
                              min={0}
                              placeholder="0"
                              suffix="đồng/giờ"
                              disabled={!form.allowHourlyRental}
                              className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                              inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:text-slate-400"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-sm font-extrabold text-slate-700">
                              Phụ thu ngày lễ
                            </span>
                            <FormattedNumberInput
                              value={form.holidaySurchargePerHour}
                              onChange={(value) =>
                                updateForm("holidaySurchargePerHour", value)
                              }
                              min={0}
                              placeholder="0"
                              suffix="đồng/giờ"
                              disabled={!form.allowHourlyRental}
                              className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                              inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:text-slate-400"
                            />
                          </label>
                        </div>
                        <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
                          <p className="font-semibold text-slate-600">
                            Giá cuối tuần dự kiến:{" "}
                            <strong className="text-primary">
                              {form.basePricePerHour !== null
                                ? `${formatPrice(
                                    form.basePricePerHour +
                                      (form.weekendSurchargePerHour ?? 0),
                                  )}/giờ`
                                : "--"}
                            </strong>
                          </p>
                          <p className="font-semibold text-slate-600">
                            Giá ngày lễ dự kiến:{" "}
                            <strong className="text-primary">
                              {form.basePricePerHour !== null
                                ? `${formatPrice(
                                    form.basePricePerHour +
                                      (form.holidaySurchargePerHour ?? 0),
                                  )}/giờ`
                                : "--"}
                            </strong>
                          </p>
                        </div>
                      </div>
                      ) : (
                        <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                          Bật thuê theo giờ để thiết lập giá cơ bản và phụ thu.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={
                  currentStep === 4
                    ? "mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    : "hidden"
                }
              >
                <label className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-extrabold uppercase text-secondary">
                      Giao xe tận nơi
                    </p>
                    <h4 className="mt-1 font-extrabold text-primary">
                      Hỗ trợ giao xe theo số km
                    </h4>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                      Khi bật, khách có thể yêu cầu giao xe tới địa chỉ riêng và phí sẽ được cộng vào booking.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.deliveryEnabled}
                    onChange={(event) =>
                      updateForm("deliveryEnabled", event.target.checked)
                    }
                    className="mt-1 h-5 w-5 accent-secondary"
                  />
                </label>

                {form.deliveryEnabled && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Phí mở đầu
                      </span>
                      <FormattedNumberInput
                        value={form.deliveryBaseFee}
                        onChange={(value) =>
                          updateForm(
                            "deliveryBaseFee",
                            value === null ? "" : String(value),
                          )
                        }
                        min={0}
                        placeholder="20000"
                        suffix="đồng"
                        className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                        inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Đơn giá mỗi km
                      </span>
                      <FormattedNumberInput
                        value={form.deliveryFeePerKm}
                        onChange={(value) =>
                          updateForm(
                            "deliveryFeePerKm",
                            value === null ? "" : String(value),
                          )
                        }
                        min={0}
                        placeholder="10000"
                        suffix="đồng/km"
                        className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                        inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      />
                    </label>
                  <label
                    className="block"
                    data-car-form-field="deliveryMaxDistanceKm"
                  >
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Tối đa km *
                      </span>
                      <FormattedNumberInput
                        value={form.deliveryMaxDistanceKm}
                        onChange={(value) =>
                          updateForm(
                            "deliveryMaxDistanceKm",
                            value === null ? "" : String(value),
                          )
                        }
                        min={0}
                        placeholder="10"
                        suffix="km"
                        className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10"
                        inputClassName="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      />
                      <FieldError
                        message={fieldErrors.deliveryMaxDistanceKm}
                      />
                    </label>
                    <label className="block sm:col-span-3">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Ghi chú giao xe
                      </span>
                      <input
                        value={form.deliveryNote}
                        onChange={(event) =>
                          updateForm("deliveryNote", event.target.value)
                        }
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                        placeholder="Ví dụ: Chỉ giao trong nội thành TP.HCM"
                      />
                    </label>
                  </div>
                )}
              </div>

              {visitedSteps.has(4) && (
              <div
                className={
                  currentStep === 4
                    ? "mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
                    : "hidden"
                }
              >
                <div className="mb-4 flex items-center gap-2">
                  <MapPin size={18} className="text-secondary" />
                  <h4 className="font-extrabold text-primary">
                    Địa điểm nhận xe
                  </h4>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block" data-car-form-field="city">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Tỉnh/Thành phố *
                    </span>
                    <input
                      value={form.city}
                      onChange={(event) => updateForm("city", event.target.value)}
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                      placeholder="TP. Hồ Chí Minh"
                    />
                    <FieldError message={fieldErrors.city} />
                  </label>

                  <label className="block" data-car-form-field="district">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Quận/Huyện *
                    </span>
                    <input
                      value={form.district}
                      onChange={(event) => updateForm("district", event.target.value)}
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                      placeholder="Quận 1"
                    />
                    <FieldError message={fieldErrors.district} />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Phường/Xã
                    </span>
                    <input
                      value={form.ward}
                      onChange={(event) => updateForm("ward", event.target.value)}
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                      placeholder="Phường Bạn Nghé"
                    />
                  </label>

                  <div className="block sm:col-span-2">
                    <label className="block" data-car-form-field="pickupAddress">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Địa chỉ nhận xe *
                      </span>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={form.pickupAddress}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateForm("pickupAddress", value);
                            updateForm("pickupFormattedAddress", value);
                            setGeocodeStatus("");
                          }}
                          className="min-h-11 flex-1 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                          placeholder="Số nhà, tên đường, bãi xe..."
                        />
                        <button
                          type="button"
                          onClick={handleGeocodeSearch}
                          disabled={geocoding || submitting}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 text-sm font-extrabold text-primary transition hover:bg-secondaryDark disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {geocoding && (
                            <Loader2 size={16} className="animate-spin" />
                          )}
                          Tìm trên bản đồ
                        </button>
                      </div>
                      <FieldError message={fieldErrors.pickupAddress} />
                    </label>
                    {geocodeStatus && (
                      <p className="mt-2 rounded-lg border border-secondary/30 bg-secondarySoft/40 px-3 py-2 text-sm font-semibold text-primary">
                        {geocodeStatus}
                      </p>
                    )}
                  </div>

                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Ghi chú địa điểm nhận xe
                    </span>
                    <input
                      value={form.locationNote}
                      onChange={(event) => updateForm("locationNote", event.target.value)}
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                      placeholder="Ví dụ: nhận xe tại tầng hầm B1, cổng bảo vệ..."
                    />
                  </label>

                  <div className="sm:col-span-2">
                    <p className="mb-2 text-sm font-extrabold text-slate-700">
                      Bản đồ vị trí nhận xe
                    </p>
                    <MapPicker
                      lat={form.pickupLat}
                      lng={form.pickupLng}
                      active={currentStep === 4}
                      onLocationChange={({ lat, lng }) => {
                        updateForm("pickupLat", String(lat));
                        updateForm("pickupLng", String(lng));
                      }}
                      height={240}
                    />
                  </div>
                </div>
              </div>
              )}

              {currentStep === 5 && (
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div
                  data-car-form-field="mainImage"
                  className="rounded-lg border border-dashed border-secondary/60 bg-amber-50/40 p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-secondary ring-1 ring-secondary/30">
                        <Image size={22} />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-primary">
                          ảnh chính *
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Ảnh đầu tiên hiển thị trên trang chủ.
                        </p>
                      </div>
                    </div>

                    <label className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 font-extrabold text-white transition hover:bg-primaryDark ${uploadingImages ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                      {uploadingImages ? (
                        <Loader2 size={18} className="animate-spin text-secondary" />
                      ) : (
                        <Upload size={18} className="text-secondary" />
                      )}
                      {uploadingImages ? "Đang upload..." : "Chọn ảnh chính"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleMainImageFileChange}
                        disabled={uploadingImages}
                      />
                    </label>
                  </div>

                  <div className="mt-4">
                    {form.mainImage ? (
                      <div className="group relative aspect-[16/10] overflow-hidden rounded-lg border border-secondary/30 bg-white">
                        <img
                          src={form.mainImage}
                          alt="ảnh chính của xe"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute left-3 top-3 rounded-lg bg-secondary px-3 py-1 text-xs font-extrabold text-primary">
                          ảnh chính
                        </span>
                        <button
                          type="button"
                          onClick={removeMainImage}
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/75 text-white opacity-100 transition hover:bg-primaryDark sm:opacity-0 sm:group-hover:opacity-100"
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
                  <FieldError message={fieldErrors.mainImage} />
                </div>

                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-secondary ring-1 ring-slate-200">
                        <Image size={22} />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-primary">
                          ảnh phụ mô tả
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Tối đa {maxGalleryImages} ảnh phụ, mỗi ảnh tối đa 5MB.
                        </p>
                      </div>
                    </div>

                    <label className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary px-5 py-2 font-extrabold text-primary transition hover:bg-primary hover:text-white ${uploadingImages ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                      {uploadingImages ? (
                        <Loader2 size={18} className="animate-spin text-secondary" />
                      ) : (
                        <Upload size={18} className="text-secondary" />
                      )}
                      {uploadingImages ? "Đang upload..." : "Chọn ảnh phụ"}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleGalleryImageFileChange}
                        disabled={uploadingImages}
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
                            alt={`ảnh phụ ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/75 text-white opacity-100 transition hover:bg-primaryDark sm:opacity-0 sm:group-hover:opacity-100"
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
              )}

              {currentStep === 5 && (
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
                  placeholder="Mô tả tiền nghi, tình trống xe..."
                />
              </label>
              )}

              {currentStep === 6 && (
                <CarFormReviewStep
                  form={form}
                  brands={brandOptions}
                  onEdit={goToStep}
                />
              )}

              <CarFormNavigation
                currentStep={currentStep}
                editing={Boolean(editingCar)}
                hasChanges={wizard.isDirty(form)}
                submitting={submitting}
                uploading={uploadingImages}
                onBack={() =>
                  goToStep((currentStep - 1) as CarFormStep)
                }
                onCancel={() => closeForm()}
                onNext={handleNextStep}
                onSubmit={() => void handleSubmit()}
              />
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










