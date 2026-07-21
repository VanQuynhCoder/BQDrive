import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  CarFront,
  FileImage,
  IdCard,
  LocateFixed,
  Loader2,
  MapPinned,
  MapPin,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import MapPicker from "../components/maps/MapPicker";
import { authService } from "../services/auth.service";
import {
  bookingService,
  type BookingDeliveryPayload,
  type RenterInfo,
} from "../services/booking.service";
import { cartService } from "../services/cart.service";
import { mapService } from "../services/map.service";
import { getFirstCarImage } from "../utils/image.util";
import { formatVietnamDateTime } from "../utils/date.util";
import {
  isValidCccd,
  isValidDriverLicense,
  isValidEmail,
  isValidVietnamPhone,
  normalizeCccd,
  normalizeDriverLicense,
  normalizePhone,
} from "../utils/validators";

type BookingRequestState =
  | {
      source: "direct";
      car: {
        _id: string;
        name?: string;
        images?: string[];
        licensePlate?: string;
        pickupLat?: number;
        pickupLng?: number;
        deliveryEnabled?: boolean;
        deliveryBaseFee?: number;
        deliveryFeePerKm?: number;
        deliveryMaxDistanceKm?: number;
        deliveryNote?: string;
      };
      bookingData: {
        carId: string;
        startDate: string;
        endDate: string;
        rentalMode: "DAILY" | "HOURLY";
        paymentOption: "DEPOSIT" | "FULL";
      };
      totalPrice?: number;
    }
  | {
      source: "cart";
      cart: {
        _id: string;
        carId: {
          _id: string;
          name?: string;
          images?: string[];
          licensePlate?: string;
          pickupLat?: number;
          pickupLng?: number;
          deliveryEnabled?: boolean;
          deliveryBaseFee?: number;
          deliveryFeePerKm?: number;
          deliveryMaxDistanceKm?: number;
          deliveryNote?: string;
        };
        startDate: string;
        endDate: string;
        rentalMode?: "DAILY" | "HOURLY" | string;
        totalPrice?: number;
      };
      paymentOption: "DEPOSIT" | "FULL";
    };

type ApiError = {
  response?: {
    data?: {
      message?: string;
      data?: string;
    };
  };
};

type DeliveryAddressSource =
  | "MANUAL_TEXT"
  | "GEOCODE"
  | "CURRENT_LOCATION"
  | "MAP_PIN";

const storageKey = "bqdrive.bookingRequest";
const maxDocumentImageSize = 2 * 1024 * 1024;

function getErrorMessage(error: unknown, fallback: string) {
  const apiError = error as ApiError;

  if (typeof apiError.response?.data?.data === "string") {
    return apiError.response.data.data;
  }

  if (typeof apiError.response?.data?.message === "string") {
    return apiError.response.data.message;
  }

  return fallback;
}

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
    reader.onerror = () => reject(reader.error || new Error("Cannot read image"));
    reader.readAsDataURL(file);
  });
}

function getDigits(value: string) {
  return value.replace(/\D/g, "");
}

function getInitialState(locationState: unknown): BookingRequestState | null {
  if (locationState && typeof locationState === "object") {
    const nextState = locationState as BookingRequestState;
    sessionStorage.setItem(storageKey, JSON.stringify(nextState));
    return nextState;
  }

  const rawState = sessionStorage.getItem(storageKey);
  if (!rawState) return null;

  try {
    return JSON.parse(rawState) as BookingRequestState;
  } catch {
    sessionStorage.removeItem(storageKey);
    return null;
  }
}

function getCurrentUserForm() {
  const user = authService.getCurrentUser();

  return {
    fullName: user?.name || "",
    phone: normalizePhone(user?.phone || ""),
    email: user?.email || "",
    cccdNumber: "",
    cccdFrontImage: "",
    cccdBackImage: "",
    driverLicenseNumber: "",
    driverLicenseImage: "",
    note: "",
  };
}

function formatPrice(price?: number) {
  return new Intl.NumberFormat("vi-VN").format(price || 0) + "đ";
}

function formatDateTime(value?: string) {
  return formatVietnamDateTime(value, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function BookingRequestPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [requestState] = useState<BookingRequestState | null>(() =>
    getInitialState(location.state),
  );
  const [form, setForm] = useState<RenterInfo>(() => getCurrentUserForm());
  const [submitting, setSubmitting] = useState(false);
  const [readingField, setReadingField] = useState<keyof RenterInfo | null>(null);
  const [deliveryType, setDeliveryType] = useState<
    "PICKUP_AT_CAR_LOCATION" | "DELIVERY_TO_CUSTOMER"
  >("PICKUP_AT_CAR_LOCATION");
  const [deliveryAddressText, setDeliveryAddressText] = useState("");
  const [deliveryFormattedAddress, setDeliveryFormattedAddress] = useState("");
  const [deliveryAddressSource, setDeliveryAddressSource] =
    useState<DeliveryAddressSource>("MANUAL_TEXT");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>();
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>();
  const [deliveryQuote, setDeliveryQuote] = useState<Awaited<ReturnType<typeof bookingService.quoteBooking>> | null>(null);
  const [calculatingDelivery, setCalculatingDelivery] = useState(false);
  const [findingDeliveryLocation, setFindingDeliveryLocation] = useState(false);
  const [showDeliveryMap, setShowDeliveryMap] = useState(false);
  const [mapPickMode, setMapPickMode] = useState(false);

  useEffect(() => {
    if (!authService.isLoggedIn()) {
      toast.error("Vui lòng đăng nhập");
      navigate("/login");
    }
  }, [navigate]);

  const summary = useMemo(() => {
    if (!requestState) return null;

    if (requestState.source === "cart") {
      return {
        sourceLabel: "Đặt xe từ giỏ hàng",
        car: requestState.cart.carId,
        startDate: requestState.cart.startDate,
        endDate: requestState.cart.endDate,
        rentalMode: requestState.cart.rentalMode || "DAILY",
        totalPrice: requestState.cart.totalPrice,
      };
    }

    return {
      sourceLabel: "Đặt xe trực tiếp",
      car: requestState.car,
      startDate: requestState.bookingData.startDate,
      endDate: requestState.bookingData.endDate,
      rentalMode: requestState.bookingData.rentalMode,
      totalPrice: requestState.totalPrice,
    };
  }, [requestState]);

  const updateForm = (field: keyof RenterInfo, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const deliverySupported = Boolean(summary?.car.deliveryEnabled);
  const displayTotalPrice = deliveryQuote?.totalPrice ?? summary?.totalPrice ?? 0;
  const deliveryFee = deliveryQuote?.deliveryFee || 0;

  const buildDeliveryPayload = (
    overrides: Partial<BookingDeliveryPayload> = {},
  ): BookingDeliveryPayload | null => {
    if (deliveryType !== "DELIVERY_TO_CUSTOMER") {
      return { deliveryType: "PICKUP_AT_CAR_LOCATION" as const };
    }

    if (!deliverySupported) {
      toast.error("Xe này không hỗ trợ giao xe tận nơi");
      return null;
    }

    const address = String(
      overrides.deliveryAddressText ??
        overrides.deliveryAddress ??
        deliveryAddressText,
    ).trim();
    const formattedAddress = String(
      overrides.deliveryFormattedAddress ?? deliveryFormattedAddress,
    ).trim();
    const nextLat = overrides.deliveryLat ?? deliveryLat;
    const nextLng = overrides.deliveryLng ?? deliveryLng;
    const source =
      overrides.deliveryAddressSource ??
      deliveryAddressSource ??
      "MANUAL_TEXT";
    if (!address) {
      toast.error("Vui lòng nhập địa chỉ giao xe");
      return null;
    }

    if (nextLat === undefined || nextLng === undefined) {
      toast.error("Vui lòng chọn vị trí giao xe trên bản đồ hoặc dùng vị trí hiện tại.");
      return null;
    }

    return {
      deliveryType: "DELIVERY_TO_CUSTOMER" as const,
      deliveryAddress: address,
      deliveryAddressText: address,
      deliveryFormattedAddress: formattedAddress || undefined,
      deliveryAddressSource: source,
      deliveryLat: nextLat,
      deliveryLng: nextLng,
      deliveryNote: deliveryNote.trim(),
    };
  };

  const calculateDeliveryQuote = async (
    overrides: Partial<BookingDeliveryPayload> = {},
  ) => {
    if (!requestState || !summary) return null;

    const delivery = buildDeliveryPayload(overrides);
    if (!delivery) return null;

    setCalculatingDelivery(true);
    try {
      const quote = await bookingService.quoteBooking({
        carId: summary.car._id,
        startDate: summary.startDate,
        endDate: summary.endDate,
        rentalMode: summary.rentalMode as "DAILY" | "HOURLY",
        delivery,
      });
      setDeliveryQuote(quote);
      toast.success("Đã tính phí giao xe");
      return quote;
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể tính phí giao xe"));
      return null;
    } finally {
      setCalculatingDelivery(false);
    }
  };

  const handleGeocodeDeliveryAddress = async () => {
    const address = deliveryAddressText.trim();

    if (!address) {
      toast.error("Vui lòng nhập địa chỉ giao xe trước khi tìm vị trí.");
      return;
    }

    setFindingDeliveryLocation(true);
    try {
      const geocode = await mapService.geocodeAddress(address);

      if (!geocode.success || !geocode.data) {
        toast.error(
          geocode.message ||
            "Không tìm thấy vị trí phù hợp trên bản đồ. Bạn có thể dùng vị trí hiện tại hoặc chọn điểm giao xe trên bản đồ.",
        );
        return;
      }

      const nextPayload: Partial<BookingDeliveryPayload> = {
        deliveryAddressText: address,
        deliveryFormattedAddress: geocode.data.formattedAddress,
        deliveryAddressSource: "GEOCODE",
        deliveryLat: geocode.data.lat,
        deliveryLng: geocode.data.lng,
      };

      setDeliveryFormattedAddress(geocode.data.formattedAddress);
      setDeliveryAddressSource("GEOCODE");
      setDeliveryLat(geocode.data.lat);
      setDeliveryLng(geocode.data.lng);
      setShowDeliveryMap(true);
      setMapPickMode(false);
      await calculateDeliveryQuote(nextPayload);
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể tìm vị trí từ địa chỉ."));
    } finally {
      setFindingDeliveryLocation(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ lấy vị trí hiện tại.");
      return;
    }

    setFindingDeliveryLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        let formattedAddress = deliveryFormattedAddress;
        let addressText = deliveryAddressText.trim();

        try {
          const reverse = await mapService.reverseGeocode(lat, lng);
          if (reverse.success && reverse.data?.displayName) {
            formattedAddress = reverse.data.displayName;
            setDeliveryFormattedAddress(formattedAddress);

            if (!addressText) {
              addressText = formattedAddress;
              setDeliveryAddressText(formattedAddress);
            }
          } else if (!addressText) {
            toast.error(
              "Đã lấy vị trí hiện tại. Vui lòng nhập thêm địa chỉ/gợi ý giao xe để chủ xe dễ tìm.",
            );
          }
        } catch {
          if (!addressText) {
            toast.error(
              "Đã lấy vị trí hiện tại. Vui lòng nhập thêm địa chỉ/gợi ý giao xe để chủ xe dễ tìm.",
            );
          }
        }

        setDeliveryLat(lat);
        setDeliveryLng(lng);
        setDeliveryAddressSource("CURRENT_LOCATION");
        setShowDeliveryMap(true);
        setMapPickMode(false);
        setFindingDeliveryLocation(false);

        if (addressText || formattedAddress) {
          await calculateDeliveryQuote({
            deliveryAddressText: addressText || formattedAddress,
            deliveryFormattedAddress: formattedAddress || undefined,
            deliveryAddressSource: "CURRENT_LOCATION",
            deliveryLat: lat,
            deliveryLng: lng,
          });
        }
      },
      () => {
        setFindingDeliveryLocation(false);
        toast.error(
          "Bạn đã từ chối quyền truy cập vị trí. Vui lòng nhập địa chỉ hoặc chọn điểm giao xe trên bản đồ.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handlePickDeliveryLocation = async (location: {
    lat: number;
    lng: number;
  }) => {
    setDeliveryLat(location.lat);
    setDeliveryLng(location.lng);
    setDeliveryAddressSource("MAP_PIN");
    setDeliveryQuote(null);

    let formattedAddress = deliveryFormattedAddress;
    let addressText = deliveryAddressText.trim();

    try {
      const reverse = await mapService.reverseGeocode(location.lat, location.lng);
      if (reverse.success && reverse.data?.displayName) {
        formattedAddress = reverse.data.displayName;
        setDeliveryFormattedAddress(formattedAddress);

        if (!addressText) {
          addressText = formattedAddress;
          setDeliveryAddressText(formattedAddress);
        }
      }
    } catch {
      // Reverse geocoding is only a hint. The selected coordinates remain valid.
    }

    if (!addressText && !formattedAddress) {
      toast.error("Đã chọn vị trí. Vui lòng nhập thêm địa chỉ/gợi ý giao xe.");
      return;
    }

    await calculateDeliveryQuote({
      deliveryAddressText: addressText || formattedAddress,
      deliveryFormattedAddress: formattedAddress || undefined,
      deliveryAddressSource: "MAP_PIN",
      deliveryLat: location.lat,
      deliveryLng: location.lng,
    });
  };

  const handleImageChange = async (
    field: keyof RenterInfo,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    if (file.size > maxDocumentImageSize) {
      toast.error("Ảnh giấy tờ tối đa 2MB");
      return;
    }

    try {
      setReadingField(field);
      updateForm(field, await readImageAsDataUrl(file));
    } catch {
      toast.error("Không thể đọc file ảnh");
    } finally {
      setReadingField(null);
    }
  };

  const validateForm = () => {
    const payload = {
      fullName: form.fullName.trim(),
      phone: normalizePhone(form.phone),
      email: form.email.trim(),
      cccdNumber: normalizeCccd(form.cccdNumber),
      cccdFrontImage: form.cccdFrontImage.trim(),
      cccdBackImage: form.cccdBackImage.trim(),
      driverLicenseNumber: normalizeDriverLicense(form.driverLicenseNumber),
      driverLicenseImage: form.driverLicenseImage.trim(),
      note: form.note?.trim(),
    };

    if (
      !payload.fullName ||
      !payload.phone ||
      !payload.email ||
      !payload.cccdNumber ||
      !payload.cccdFrontImage ||
      !payload.cccdBackImage ||
      !payload.driverLicenseNumber ||
      !payload.driverLicenseImage
    ) {
      toast.error("Vui lòng hoàn tất thông tin người thuê trước khi gửi yêu cầu đặt xe.");
      return null;
    }

    if (payload.fullName.length < 2) {
      toast.error("Họ tên người thuê phải có ít nhất 2 ký tự");
      return null;
    }

    if (!isValidEmail(payload.email)) {
      toast.error("Email người thuê không hợp lệ");
      return null;
    }

    if (!isValidVietnamPhone(payload.phone)) {
      toast.error("Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0.");
      return null;
    }

    if (!isValidCccd(payload.cccdNumber)) {
      toast.error("CCCD phải gồm đúng 12 chữ số.");
      return null;
    }

    if (!isValidDriverLicense(payload.driverLicenseNumber)) {
      toast.error("Số bằng lái xe phải gồm đúng 12 chữ số.");
      return null;
    }

    if ((payload.note || "").length > 500) {
      toast.error("Ghi chú không được vượt quá 500 ký tự");
      return null;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      toast.error("Email người thuê không hợp lệ");
      return null;
    }

    if (getDigits(payload.phone).length < 10) {
      toast.error("Số điện thoại phải có ít nhất 10 số");
      return null;
    }

    if (getDigits(payload.cccdNumber).length < 9) {
      toast.error("CCCD/CMND phải có ít nhất 9 số");
      return null;
    }

    if (payload.driverLicenseNumber.length < 5) {
      toast.error("Số bằng lái xe không hợp lệ");
      return null;
    }

    return payload;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!requestState || submitting) return;

    const renterInfo = validateForm();
    if (!renterInfo) return;

    let deliveryPayload: BookingDeliveryPayload | null = {
      deliveryType: "PICKUP_AT_CAR_LOCATION",
    };

    if (deliveryType === "DELIVERY_TO_CUSTOMER") {
      const quote = deliveryQuote || (await calculateDeliveryQuote());
      if (!quote) return;
      deliveryPayload = buildDeliveryPayload();
      if (!deliveryPayload) return;
    }

    setSubmitting(true);

    try {
      const booking =
        requestState.source === "cart"
          ? await cartService.bookingFromCart(requestState.cart._id, {
              paymentOption: requestState.paymentOption,
              renterInfo,
              delivery: deliveryPayload,
            })
          : await bookingService.createBooking({
              ...requestState.bookingData,
              renterInfo,
              delivery: deliveryPayload,
            });

      sessionStorage.removeItem(storageKey);
      toast.success("Đã gửi yêu cầu đặt xe, vui lòng chờ chủ xe xác nhận");
      navigate(`/bookings/${booking._id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Không thể gửi yêu cầu đặt xe"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!requestState || !summary) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-4xl px-6 pt-32">
          <div className="rounded-lg border border-border bg-white p-10 text-center shadow-sm">
            <CarFront size={48} className="mx-auto text-secondary" />
            <h1 className="mt-4 text-2xl font-extrabold text-primary">
              Chưa có thông tin đặt xe
            </h1>
            <p className="mt-2 text-muted">
              Vui lòng chọn xe và lịch thuê trước khi nhập hồ sơ người thuê.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-secondary px-6 font-extrabold text-primary"
            >
              Tìm xe
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
        <Link
          to={requestState.source === "cart" ? "/cart" : `/cars/${summary.car._id}`}
          className="mb-6 inline-flex items-center gap-2 font-extrabold text-primary hover:text-secondary"
        >
          <ArrowLeft size={18} />
          Quay lại
        </Link>

        <section className="mb-8 rounded-lg bg-primary p-6 text-white md:p-8">
          <p className="text-sm font-bold uppercase text-secondary">
            Hồ sơ thuê xe
          </p>
          <h1 className="mt-2 text-4xl font-extrabold">
            Xác nhận thông tin người thuê
          </h1>
          <p className="mt-3 max-w-3xl text-white/70">
            Chủ xe sẽ xem hồ sơ này trước khi duyệt booking. Sau khi được duyệt,
            bạn chỉ cần thanh toán và không phải nhập lại thông tin.
          </p>
        </section>

        <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-6">
            <div className="rounded-lg border border-border bg-white p-6 shadow-sm md:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-secondary">
                  <UserRound size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-primary">
                    Thông tin cá nhân
                  </h2>
                  <p className="text-sm text-muted">
                    Thông tin được lưu theo booking và dùng cho hợp đồng.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Họ tên người thuê *"
                  value={form.fullName}
                  onChange={(value) => updateForm("fullName", value)}
                />
                <TextField
                  label="Số điện thoại *"
                  value={form.phone}
                  onChange={(value) => updateForm("phone", normalizePhone(value))}
                  inputMode="tel"
                  type="tel"
                  maxLength={10}
                />
                <TextField
                  label="Email *"
                  value={form.email}
                  onChange={(value) => updateForm("email", value)}
                  inputMode="email"
                />
                <TextField
                  label="Số CCCD/CMND *"
                  value={form.cccdNumber}
                  onChange={(value) => updateForm("cccdNumber", normalizeCccd(value))}
                  inputMode="numeric"
                  maxLength={12}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-6 shadow-sm md:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-primary">
                  <MapPin size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-primary">
                    Phương thức nhận xe
                  </h2>
                  <p className="text-sm text-muted">
                    Chọn nhận tại vị trí chủ xe hoặc yêu cầu giao xe tận nơi nếu xe hỗ trợ.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryType("PICKUP_AT_CAR_LOCATION");
                    setDeliveryQuote(null);
                  }}
                  className={`rounded-xl border px-4 py-4 text-left transition ${
                    deliveryType === "PICKUP_AT_CAR_LOCATION"
                      ? "border-secondary bg-secondarySoft text-primary"
                      : "border-border bg-white text-muted hover:border-secondary"
                  }`}
                >
                  <p className="font-extrabold text-primary">
                    Nhận tại vị trí chủ xe
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Không phát sinh phí giao xe.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={!deliverySupported}
                  onClick={() => {
                    if (!deliverySupported) return;
                    setDeliveryType("DELIVERY_TO_CUSTOMER");
                    setDeliveryQuote(null);
                  }}
                  className={`rounded-xl border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    deliveryType === "DELIVERY_TO_CUSTOMER"
                      ? "border-secondary bg-secondarySoft text-primary"
                      : "border-border bg-white text-muted hover:border-secondary"
                  }`}
                >
                  <p className="font-extrabold text-primary">
                    Giao xe tận nơi
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {deliverySupported
                      ? `Tối đa ${summary.car.deliveryMaxDistanceKm || "--"} km`
                      : "Xe này chưa hỗ trợ giao tận nơi."}
                  </p>
                </button>
              </div>

              {deliveryType === "DELIVERY_TO_CUSTOMER" && (
                <div className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-primary">
                      Nhập địa chỉ giao xe *
                    </span>
                    <input
                      value={deliveryAddressText}
                      onChange={(event) => {
                        setDeliveryAddressText(event.target.value);
                        setDeliveryAddressSource((prev) =>
                          deliveryLat === undefined || deliveryLng === undefined
                            ? "MANUAL_TEXT"
                            : prev,
                        );
                        setDeliveryQuote(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleGeocodeDeliveryAddress();
                        }
                      }}
                      className="min-h-12 w-full rounded-lg border border-border px-4 font-semibold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                      placeholder="Ví dụ: Chung cư An Phú, TP. Thủ Đức, TP.HCM"
                    />
                    <span className="mt-2 block text-sm font-semibold leading-6 text-slate-500">
                      Địa chỉ trên OpenStreetMap có thể chưa đầy đủ. Nếu không tìm thấy,
                      bạn có thể dùng vị trí hiện tại hoặc chọn điểm giao xe trực tiếp trên bản đồ.
                    </span>
                  </label>

                  <div className="grid gap-2 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={handleGeocodeDeliveryAddress}
                      disabled={findingDeliveryLocation}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-extrabold text-secondary transition hover:bg-primaryDark disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {findingDeliveryLocation ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Search size={18} />
                      )}
                      Tìm vị trí từ địa chỉ
                    </button>
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={findingDeliveryLocation}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <LocateFixed size={18} />
                      Sử dụng vị trí hiện tại
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeliveryMap(true);
                        setMapPickMode(true);
                      }}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-extrabold transition ${
                        mapPickMode
                          ? "bg-secondarySoft text-primary ring-2 ring-secondary"
                          : "bg-white text-primary ring-1 ring-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <MapPinned size={18} />
                      Chọn trên bản đồ
                    </button>
                  </div>

                  {mapPickMode && (
                    <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-bold leading-6 text-slate-700">
                      Click vào vị trí bạn muốn chủ xe giao xe.
                    </p>
                  )}

                  {showDeliveryMap && (
                    <MapPicker
                      lat={deliveryLat}
                      lng={deliveryLng}
                      height={320}
                      onLocationChange={handlePickDeliveryLocation}
                    />
                  )}
                  <label className="block">
                    <span className="mb-2 block text-sm font-extrabold text-primary">
                      Ghi chú giao xe
                    </span>
                    <input
                      value={deliveryNote}
                      onChange={(event) => setDeliveryNote(event.target.value)}
                      className="min-h-12 w-full rounded-lg border border-border px-4 font-semibold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                      placeholder="Ví dụ: giao trước sảnh chung cư, gọi trước 10 phút..."
                    />
                  </label>
                  {summary.car.deliveryNote && (
                    <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-bold leading-6 text-slate-700">
                      Ghi chú từ chủ xe: {summary.car.deliveryNote}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void calculateDeliveryQuote()}
                    disabled={calculatingDelivery}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-extrabold text-secondary transition hover:bg-primaryDark disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {calculatingDelivery && (
                      <Loader2 size={18} className="animate-spin" />
                    )}
                    Tính phí giao xe
                  </button>
                  {deliveryQuote?.delivery && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                      <p className="font-extrabold text-primary">
                        Tóm tắt giao xe tận nơi
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <SummaryInfo
                          label="Địa chỉ giao xe"
                          value={
                            deliveryAddressText ||
                            deliveryQuote.delivery.deliveryAddress ||
                            "--"
                          }
                        />
                        <SummaryInfo
                          label="Nguồn vị trí"
                          value={
                            deliveryAddressSource === "GEOCODE"
                              ? "Tìm từ địa chỉ"
                              : deliveryAddressSource === "CURRENT_LOCATION"
                                ? "Vị trí hiện tại"
                                : deliveryAddressSource === "MAP_PIN"
                                  ? "Chọn trên bản đồ"
                                  : "Nhập thủ công"
                          }
                        />
                        <SummaryInfo
                          label="Khoảng cách giao xe"
                          value={`${deliveryQuote.delivery.deliveryDistanceKm || 0} km`}
                        />
                        <SummaryInfo
                          label="Thời gian dự kiến"
                          value={deliveryQuote.delivery.deliveryDurationText || "--"}
                        />
                        <SummaryInfo
                          label="Phí mở đầu"
                          value={formatPrice(deliveryQuote.delivery.deliveryBaseFee || 0)}
                        />
                        <SummaryInfo
                          label="Đơn giá/km"
                          value={formatPrice(deliveryQuote.delivery.deliveryFeePerKm || 0)}
                        />
                      </div>
                      <div className="mt-4 flex items-center justify-between rounded-lg bg-secondarySoft px-4 py-3">
                        <span className="font-extrabold text-primary">
                          Phí giao xe
                        </span>
                        <span className="text-lg font-extrabold text-primary">
                          {formatPrice(deliveryQuote.deliveryFee)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-white p-6 shadow-sm md:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-primary">
                  <IdCard size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-primary">
                    Ảnh giấy tờ
                  </h2>
                  <p className="text-sm text-muted">
                    Ảnh chỉ hiển thị cho bạn và chủ xe liên quan đến booking.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <ImageField
                  label="CCCD mặt trước *"
                  value={form.cccdFrontImage}
                  loading={readingField === "cccdFrontImage"}
                  onChange={(event) => handleImageChange("cccdFrontImage", event)}
                />
                <ImageField
                  label="CCCD mặt sau *"
                  value={form.cccdBackImage}
                  loading={readingField === "cccdBackImage"}
                  onChange={(event) => handleImageChange("cccdBackImage", event)}
                />
                <ImageField
                  label="Ảnh bằng lái *"
                  value={form.driverLicenseImage}
                  loading={readingField === "driverLicenseImage"}
                  onChange={(event) => handleImageChange("driverLicenseImage", event)}
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <TextField
                  label="Số bằng lái xe *"
                  value={form.driverLicenseNumber}
                  onChange={(value) =>
                    updateForm("driverLicenseNumber", normalizeDriverLicense(value))
                  }
                  inputMode="numeric"
                  maxLength={12}
                />
                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-primary">
                    Ghi chú
                  </span>
                  <textarea
                    value={form.note || ""}
                    onChange={(event) =>
                      updateForm("note", event.target.value.slice(0, 500))
                    }
                    maxLength={500}
                    rows={4}
                    className="w-full rounded-lg border border-border px-4 py-3 font-semibold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
                    placeholder="Yêu cầu thêm khi nhận xe..."
                  />
                </label>
              </div>
            </div>
          </section>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-lg bg-primary p-6 text-white shadow-xl">
              <p className="text-sm font-bold uppercase text-secondary">
                {summary.sourceLabel}
              </p>
              <div className="my-5 overflow-hidden rounded-lg bg-white/10">
                <img
                  src={getFirstCarImage(summary.car.images)}
                  alt={summary.car.name || "Xe thuê"}
                  className="h-44 w-full object-cover"
                />
                <div className="p-4">
                  <h2 className="text-xl font-extrabold">
                    {summary.car.name || "Xe BQDrive"}
                  </h2>
                  <p className="mt-1 text-sm text-white/60">
                    {summary.car.licensePlate || "Chưa cập nhật biển số"}
                  </p>
                </div>
              </div>

              <div className="space-y-3 border-y border-white/10 py-5 text-sm">
                <SummaryRow label="Nhận xe" value={formatDateTime(summary.startDate)} />
                <SummaryRow label="Trả xe" value={formatDateTime(summary.endDate)} />
                <SummaryRow
                  label="Hình thức"
                  value={summary.rentalMode === "HOURLY" ? "Thuê theo giờ" : "Thuê theo ngày"}
                />
                <SummaryRow
                  label="Tiền thuê xe"
                  value={formatPrice(deliveryQuote?.rentalSubtotal ?? summary.totalPrice)}
                />
                <SummaryRow label="Phí giao xe" value={formatPrice(deliveryFee)} />
                <SummaryRow label="Tổng thanh toán" value={formatPrice(displayTotalPrice)} />
              </div>

              <div className="mt-5 rounded-lg border border-secondary/30 bg-secondary/10 p-4">
                <div className="flex gap-3">
                  <ShieldCheck className="shrink-0 text-secondary" size={20} />
                  <p className="text-sm leading-6 text-white/75">
                    BQDrive không gửi ảnh CCCD/bằng lái qua email và không công
                    khai giấy tờ trên trang chi tiết xe.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || Boolean(readingField)}
                className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-3 font-extrabold text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 size={20} className="animate-spin" />}
                {submitting ? "Đang gửi..." : "Gửi yêu cầu thuê xe"}
              </button>
            </div>
          </aside>
        </form>
      </main>

      <Footer />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  inputMode,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "text" | "tel" | "numeric" | "email";
  type?: "text" | "tel" | "email";
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-primary">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        maxLength={maxLength}
        className="min-h-12 w-full rounded-lg border border-border px-4 font-semibold text-primary outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
      />
    </label>
  );
}

function ImageField({
  label,
  value,
  loading,
  onChange,
}: {
  label: string;
  value: string;
  loading: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-primary">
        {label}
      </span>
      <span className="flex min-h-40 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-soft/50 text-center transition hover:border-secondary hover:bg-secondarySoft/30">
        {loading ? (
          <Loader2 size={24} className="animate-spin text-secondary" />
        ) : value ? (
          <img src={value} alt={label} className="h-40 w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-sm font-bold text-muted">
            <FileImage size={24} className="text-secondary" />
            Chọn ảnh
          </span>
        )}
      </span>
      <input type="file" accept="image/*" onChange={onChange} className="hidden" />
    </label>
  );
}

function SummaryInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-extrabold leading-6 text-primary">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-white/60">{label}</span>
      <span className="text-right font-extrabold">{value}</span>
    </div>
  );
}
