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
import MapPicker from "../../components/maps/MapPicker";
import {
  businessService,
  type BusinessBrand,
  type BusinessCar,
  type CreateCarData,
  type FuelType,
} from "../../services/business.service";
import { mapService } from "../../services/map.service";
import { formatAddressArea, formatPickupAddress } from "../../utils/address.util";
import {
  isValidPlateNumber,
  normalizePlateNumber,
  sanitizePlateNumberInput,
} from "../../utils/validators";

type CarForm = {
  brandId: string;
  name: string;
  type: string;
  licensePlate: string;
  city: string;
  district?: string;
  ward?: string;
  pickupAddress: string;
  pickupFormattedAddress: string;
  pickupPlaceId: string;
  pickupLat: string;
  pickupLng: string;
  locationNote: string;
  seats: string;
  fuelType: FuelType;
  transmission?: string;
  allowDailyRental: boolean;
  allowHourlyRental: boolean;
  pricePerDay: string;
  weekendPricePerDay: string;
  holidayPricePerDay: string;
  pricePerHour: string;
  weekendPricePerHour: string;
  holidayPricePerHour: string;
  deliveryEnabled: boolean;
  deliveryBaseFee: string;
  deliveryFeePerKm: string;
  deliveryMaxDistanceKm: string;
  deliveryNote: string;
  mainImage: string;
  galleryImages: string[];
  description: string;
};

const emptyForm: CarForm = {
  brandId: "",
  name: "",
  type: "SEDAN",
  licensePlate: "",
  city: "",
  district: "",
  ward: "",
  pickupAddress: "",
  pickupFormattedAddress: "",
  pickupPlaceId: "",
  pickupLat: "",
  pickupLng: "",
  locationNote: "",
  seats: "4",
  fuelType: "GASOLINE",
  transmission: "AUTOMATIC",
  allowDailyRental: true,
  allowHourlyRental: false,
  pricePerDay: "",
  weekendPricePerDay: "",
  holidayPricePerDay: "",
  pricePerHour: "",
  weekendPricePerHour: "",
  holidayPricePerHour: "",
  deliveryEnabled: false,
  deliveryBaseFee: "",
  deliveryFeePerKm: "",
  deliveryMaxDistanceKm: "",
  deliveryNote: "",
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
    allowDailyRental ? `${formatCurrency(car.pricePerDay)} / ngày` : "",
    allowHourlyRental ? `${formatCurrency(car.pricePerHour)} / giờ` : "",
  ].filter(Boolean);

  return prices.join(" | ") || "--";
}

function formatPrice(value?: number) {
  if (!value || value <= 0) return "--";
  return `${value.toLocaleString("vi-VN")}đ`;
}

function getPricingRows(car: BusinessCar) {
  return [
    {
      label: "Ngày thường",
      value: car.pricing?.weekdayPricePerDay || car.pricePerDay,
      unit: "ngày",
    },
    {
      label: "Cuối tuần",
      value:
        car.pricing?.weekendPricePerDay ||
        car.pricing?.weekdayPricePerDay ||
        car.pricePerDay,
      unit: "ngày",
    },
    {
      label: "Ngày lễ",
      value:
        car.pricing?.holidayPricePerDay ||
        car.pricing?.weekendPricePerDay ||
        car.pricing?.weekdayPricePerDay ||
        car.pricePerDay,
      unit: "ngày",
    },
    {
      label: "Giờ thường",
      value: car.pricing?.pricePerHour || car.pricePerHour,
      unit: "giờ",
    },
    {
      label: "Giờ cuối tuần",
      value:
        car.pricing?.weekendPricePerHour ||
        car.pricing?.pricePerHour ||
        car.pricePerHour,
      unit: "giờ",
    },
    {
      label: "Giờ ngày lễ",
      value:
        car.pricing?.holidayPricePerHour ||
        car.pricing?.weekendPricePerHour ||
        car.pricing?.pricePerHour ||
        car.pricePerHour,
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
    brandId: car.brandId._id || "",
    name: car.name || "",
    type: car.type || "SEDAN",
    licensePlate: car.licensePlate || "",
    city: car.city || car.province || "",
    district: car.district || "",
    ward: car.ward || "",
    pickupAddress: car.pickupAddress || car.address || "",
    pickupFormattedAddress:
      car.pickupFormattedAddress || car.pickupAddress || car.address || "",
    pickupPlaceId: car.pickupPlaceId || "",
    pickupLat: String(car.pickupLat ?? car.latitude ?? ""),
    pickupLng: String(car.pickupLng ?? car.longitude ?? ""),
    locationNote: car.locationNote || "",
    seats: String(car.seats || 4),
    fuelType: car.fuelType || "GASOLINE",
    transmission: car.transmission || "AUTOMATIC",
    allowDailyRental,
    allowHourlyRental,
    pricePerDay: String(car.pricing?.weekdayPricePerDay || car.pricePerDay || ""),
    weekendPricePerDay: String(car.pricing?.weekendPricePerDay || ""),
    holidayPricePerDay: String(car.pricing?.holidayPricePerDay || ""),
    pricePerHour: String(car.pricing?.pricePerHour || car.pricePerHour || ""),
    weekendPricePerHour: String(car.pricing?.weekendPricePerHour || ""),
    holidayPricePerHour: String(car.pricing?.holidayPricePerHour || ""),
    deliveryEnabled: Boolean(car.deliveryEnabled),
    deliveryBaseFee: String(car.deliveryBaseFee || ""),
    deliveryFeePerKm: String(car.deliveryFeePerKm || ""),
    deliveryMaxDistanceKm: String(car.deliveryMaxDistanceKm || ""),
    deliveryNote: car.deliveryNote || "",
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
  const [detailCar, setDetailCar] = useState<BusinessCar | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState("");
  const [visibilityUpdatingId, setVisibilityUpdatingId] = useState<string | null>(
    null,
  );

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
    setGeocodeStatus("");
    setFormOpen(true);
  };

  const openEdit = (car: BusinessCar) => {
    setEditingCar(car);
    setForm(toForm(car));
    setGeocodeStatus("");
    setFormOpen(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setFormOpen(false);
    setEditingCar(null);
    setForm(emptyForm);
    setGeocodeStatus("");
  };

  const updateForm = <K extends keyof CarForm>(field: K, value: CarForm[K]) => {
    setForm((prev) => {
      return {
        ...prev,
        [field]: value,
      };
    });
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
      toast.error("Vui lòng chờ chủn file ảnh");
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
      toast.error("Vui lòng chờ chủn file ảnh");
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
    const weekendPricePerDay = form.weekendPricePerDay
      ? Number(form.weekendPricePerDay)
      : pricePerDay;
    const holidayPricePerDay = form.holidayPricePerDay
      ? Number(form.holidayPricePerDay)
      : weekendPricePerDay;
    const pricePerHour = Number(form.pricePerHour);
    const weekendPricePerHour = form.weekendPricePerHour
      ? Number(form.weekendPricePerHour)
      : pricePerHour;
    const holidayPricePerHour = form.holidayPricePerHour
      ? Number(form.holidayPricePerHour)
      : weekendPricePerHour;
    const seats = Number(form.seats);
    const city = form.city.trim();
    const district = (form.district || "").trim();
    const pickupAddress = form.pickupAddress.trim();
    const pickupFormattedAddress =
      form.pickupFormattedAddress.trim() || pickupAddress;
    const pickupLat = form.pickupLat ? Number(form.pickupLat) : undefined;
    const pickupLng = form.pickupLng ? Number(form.pickupLng) : undefined;
    const licensePlate = normalizePlateNumber(form.licensePlate);

    if (!name || !form.brandId || !form.type || !form.fuelType || !form.seats) {
      toast.error("Vui lòng nhập đầy đủ thông tin bắt buộc");
      return null;
    }

    if (!pickupAddress || !district || !city) {
      toast.error("Vui lòng nhập địa chỉ nhận xe, quận/huyện và tỉnh/thành phố");
      return null;
    }

    if (licensePlate && !isValidPlateNumber(licensePlate)) {
      toast.error("Biển số ô tô không hợp lệ. Ví dụ đúng: 30A-123.45 hoặc 30A12345.");
      return null;
    }

    if (
      (pickupLat !== undefined && !Number.isFinite(pickupLat)) ||
      (pickupLng !== undefined && !Number.isFinite(pickupLng))
    ) {
      toast.error("Tọa độ địa điểm nhận xe không hợp lệ");
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
      toast.error("Giá thuê theo ngày phải lớn hơn 0");
      return null;
    }

    if (
      form.allowDailyRental &&
      (!Number.isFinite(weekendPricePerDay) ||
        weekendPricePerDay < 0 ||
        !Number.isFinite(holidayPricePerDay) ||
        holidayPricePerDay < 0)
    ) {
      toast.error("Giá cuối tuần/ngày lễ không được âm");
      return null;
    }

    if (
      form.allowHourlyRental &&
      (!Number.isFinite(pricePerHour) || pricePerHour <= 0)
    ) {
      toast.error("Giá thuê theo giờ phải lớn hơn 0");
      return null;
    }

    if (
      form.allowHourlyRental &&
      (!Number.isFinite(weekendPricePerHour) ||
        weekendPricePerHour < 0 ||
        !Number.isFinite(holidayPricePerHour) ||
        holidayPricePerHour < 0)
    ) {
      toast.error("Giá giờ cuối tuần/ngày lễ không được âm");
      return null;
    }

    if (!form.mainImage) {
      toast.error("Vui lòng chọn ảnh chính của xe");
      return null;
    }

    const images = [form.mainImage, ...form.galleryImages].filter(Boolean);
    const deliveryBaseFee = form.deliveryBaseFee ? Number(form.deliveryBaseFee) : 0;
    const deliveryFeePerKm = form.deliveryFeePerKm ? Number(form.deliveryFeePerKm) : 0;
    const deliveryMaxDistanceKm = form.deliveryMaxDistanceKm
      ? Number(form.deliveryMaxDistanceKm)
      : undefined;

    if (
      form.deliveryEnabled &&
      (!Number.isFinite(deliveryMaxDistanceKm) || !deliveryMaxDistanceKm || deliveryMaxDistanceKm <= 0)
    ) {
      toast.error("Vui lòng nhập khoảng cách giao xe tối đa");
      return null;
    }

    return {
      brandId: form.brandId,
      name,
      type: form.type,
      licensePlate,
      seats,
      fuelType: form.fuelType,
      transmission: form.transmission,
      allowDailyRental: form.allowDailyRental,
      allowHourlyRental: form.allowHourlyRental,
      rentalUnit:
        form.allowHourlyRental && !form.allowDailyRental ? "HOUR" : "DAY",
      pricePerHour: form.allowHourlyRental ? pricePerHour : undefined,
      pricePerDay: form.allowDailyRental ? pricePerDay : undefined,
      pricing: {
        weekdayPricePerDay: form.allowDailyRental ? pricePerDay : undefined,
        weekendPricePerDay: form.allowDailyRental
          ? weekendPricePerDay
          : undefined,
        holidayPricePerDay: form.allowDailyRental
          ? holidayPricePerDay
          : undefined,
        pricePerHour: form.allowHourlyRental ? pricePerHour : undefined,
        weekendPricePerHour: form.allowHourlyRental
          ? weekendPricePerHour
          : undefined,
        holidayPricePerHour: form.allowHourlyRental
          ? holidayPricePerHour
          : undefined,
      },
      images,
      description: form.description.trim(),
      pickupAddress,
      pickupFormattedAddress,
      pickupPlaceId: form.pickupPlaceId.trim(),
      pickupLat,
      pickupLng,
      pickupProvince: city,
      pickupDistrict: district,
      pickupWard: (form.ward || "").trim(),
      pickupNote: form.locationNote.trim(),
      city,
      province: city,
      district,
      ward: (form.ward || "").trim(),
      locationNote: form.locationNote.trim(),
      deliveryEnabled: form.deliveryEnabled,
      deliveryBaseFee: form.deliveryEnabled ? deliveryBaseFee : 0,
      deliveryFeePerKm: form.deliveryEnabled ? deliveryFeePerKm : 0,
      deliveryMaxDistanceKm: form.deliveryEnabled ? deliveryMaxDistanceKm : undefined,
      deliveryNote: form.deliveryEnabled ? form.deliveryNote.trim() : "",
    };
  };

  const handleSubmit = async (event: FormEvent) => {
    event?.preventDefault();

    const payload = buildPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      if (editingCar) {
        await businessService.updateCar(editingCar._id, payload);
        toast.success("Đã cập nhật xe, vui lòng cho Admin duyệt lại");
      } else {
        await businessService.createCar(payload);
        toast.success("Đã thêm xe, trạng thái đang cho Admin duyệt");
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
                            {row.value ? `/${row.unit}` : ""}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
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

                <div className="col-span-full rounded-xl border border-slate-200 bg-slate-50/80 p-4">
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
                      Giá cuối tuần/ngày lễ có thể để trống để dùng giá mặc định.
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

                      <div className="space-y-3">
                        <label className="block">
                          <span className="mb-2 block text-sm font-extrabold text-slate-700">
                            Giá ngày thường *
                          </span>
                          <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10">
                            <input
                              value={form.pricePerDay}
                              onChange={(event) =>
                                updateForm("pricePerDay", event.target.value)
                              }
                              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:text-slate-400"
                              inputMode="numeric"
                              placeholder="900000"
                              disabled={!form.allowDailyRental}
                            />
                            <span className="text-xs font-extrabold text-slate-400">
                              đ/ngày
                            </span>
                          </div>
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-extrabold text-slate-700">
                              Cuối tuần
                            </span>
                            <input
                              value={form.weekendPricePerDay}
                              onChange={(event) =>
                                updateForm("weekendPricePerDay", event.target.value)
                              }
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:bg-slate-100 disabled:text-slate-400"
                              inputMode="numeric"
                              placeholder="Bằng ngày thường"
                              disabled={!form.allowDailyRental}
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-sm font-extrabold text-slate-700">
                              Ngày lễ
                            </span>
                            <input
                              value={form.holidayPricePerDay}
                              onChange={(event) =>
                                updateForm("holidayPricePerDay", event.target.value)
                              }
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:bg-slate-100 disabled:text-slate-400"
                              inputMode="numeric"
                              placeholder="Bằng cuối tuần"
                              disabled={!form.allowDailyRental}
                            />
                          </label>
                        </div>
                      </div>
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

                      <div className="space-y-3">
                        <label className="block">
                          <span className="mb-2 block text-sm font-extrabold text-slate-700">
                            Giá giờ thường *
                          </span>
                          <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10">
                            <input
                              value={form.pricePerHour}
                              onChange={(event) =>
                                updateForm("pricePerHour", event.target.value)
                              }
                              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:text-slate-400"
                              inputMode="numeric"
                              placeholder="150000"
                              disabled={!form.allowHourlyRental}
                            />
                            <span className="text-xs font-extrabold text-slate-400">
                              đ/giờ
                            </span>
                          </div>
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-extrabold text-slate-700">
                              Cuối tuần
                            </span>
                            <input
                              value={form.weekendPricePerHour}
                              onChange={(event) =>
                                updateForm("weekendPricePerHour", event.target.value)
                              }
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:bg-slate-100 disabled:text-slate-400"
                              inputMode="numeric"
                              placeholder="Bằng giờ thường"
                              disabled={!form.allowHourlyRental}
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-sm font-extrabold text-slate-700">
                              Ngày lễ
                            </span>
                            <input
                              value={form.holidayPricePerHour}
                              onChange={(event) =>
                                updateForm("holidayPricePerHour", event.target.value)
                              }
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 disabled:bg-slate-100 disabled:text-slate-400"
                              inputMode="numeric"
                              placeholder="Bằng cuối tuần"
                              disabled={!form.allowHourlyRental}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                      <input
                        value={form.deliveryBaseFee}
                        onChange={(event) =>
                          updateForm("deliveryBaseFee", event.target.value)
                        }
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                        inputMode="numeric"
                        placeholder="20000"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Đơn giá mỗi km
                      </span>
                      <input
                        value={form.deliveryFeePerKm}
                        onChange={(event) =>
                          updateForm("deliveryFeePerKm", event.target.value)
                        }
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                        inputMode="numeric"
                        placeholder="10000"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-extrabold text-slate-700">
                        Tối đa km *
                      </span>
                      <input
                        value={form.deliveryMaxDistanceKm}
                        onChange={(event) =>
                          updateForm("deliveryMaxDistanceKm", event.target.value)
                        }
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                        inputMode="decimal"
                        placeholder="10"
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

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <MapPin size={18} className="text-secondary" />
                  <h4 className="font-extrabold text-primary">
                    Địa điểm nhận xe
                  </h4>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Tỉnh/Thành phố *
                    </span>
                    <input
                      value={form.city}
                      onChange={(event) => updateForm("city", event.target.value)}
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                      placeholder="TP. Hồ Chí Minh"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-slate-700">
                      Quận/Huyện *
                    </span>
                    <input
                      value={form.district}
                      onChange={(event) => updateForm("district", event.target.value)}
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                      placeholder="Quận 1"
                    />
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
                    <label className="block">
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
                      onLocationChange={({ lat, lng }) => {
                        updateForm("pickupLat", String(lat));
                        updateForm("pickupLng", String(lng));
                      }}
                      height={240}
                    />
                  </div>
                </div>
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
                          ảnh chính *
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          ảnh đầu tiên hiển thị trên trang chỗ.
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
                          Tối đa {maxGalleryImages} ảnh phụ, mới ảnh dưới 1MB.
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
            ? `Bạn chỗc chọn muốn xóa xe ${deleteCar.name}?`
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










