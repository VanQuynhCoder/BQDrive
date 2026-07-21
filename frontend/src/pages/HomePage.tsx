import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CarFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Filter,
  Headphones,
  MapPin,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import CarCard from "../components/CarCard";
import { authService } from "../services/auth.service";
import { bookingService } from "../services/booking.service";
import { cartService } from "../services/cart.service";
import { carService, type PublicBrand } from "../services/car.service";
import { buildVietnamDateTime } from "../utils/date.util";

type RentalAvailability =
  | "AVAILABLE"
  | "HELD_IN_CART"
  | "PENDING_CONFIRMATION";

type HomeCar = {
  _id: string;
  id: number;
  name: string;
  pricePerDay?: number;
  pricePerHour?: number;
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit?: string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  images?: string[];
  image?: string;
  brandId: {
    name?: string;
  };
  businessId: {
    businessName?: string;
  };
  rentalAvailability?: RentalAvailability;
  availabilityLabel?: string;
  isBookable?: boolean;
  unavailableReason?: string;
  holdingCartId?: string;
  holdExpiredAt?: string;
  resumeBookingId?: string;
  resumeExpiresAt?: string;
};

type HomeBooking = {
  _id: string;
  carId: string | { _id: string };
  status: string;
  paidAmount: number;
  createdAt: string;
};

type HomeCart = {
  _id: string;
  carId: string | { _id: string };
  status: string;
  expiredAt: string;
};

type HomeFilters = {
  location: string;
  type: string;
  seats: string;
  brandId: string;
  minPrice: string;
  maxPrice: string;
  fuelType: string;
  transmission: string;
  rentalMode: "" | "DAILY" | "HOURLY";
  sort: string;
  deliveryOnly: string;
  minRating: string;
  userLat: string;
  userLng: string;
};

type HomeFilterDropdown =
  | "seats"
  | "price"
  | "rating"
  | "fuelType"
  | "transmission"
  | "type"
  | "rentalMode";

const heroImage =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1800";

const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME = "18:00";
const BOOKING_HOLD_MINUTES = 10;
const BOOKING_HOLD_MS = BOOKING_HOLD_MINUTES * 60 * 1000;
const HOME_CARS_PER_PAGE = 6;
const emptyHomeFilters: HomeFilters = {
  location: "",
  type: "",
  seats: "",
  brandId: "",
  minPrice: "",
  maxPrice: "",
  fuelType: "",
  transmission: "",
  rentalMode: "",
  sort: "",
  deliveryOnly: "",
  minRating: "",
  userLat: "",
  userLng: "",
};
const popularAreas = [
  "Quận 1",
  "Bình Thạnh",
  "Gò Vấp",
  "Tân Bình",
  "Thủ Đức",
  "Quận 7",
  "TP.HCM",
];
const carTypeOptions = [
  { value: "SEDAN", label: "Sedan" },
  { value: "SUV", label: "SUV" },
  { value: "HATCHBACK", label: "Hatchback" },
  { value: "PICKUP", label: "Bán tải" },
  { value: "MPV", label: "MPV" },
];
const seatOptions = ["4", "5", "7", "9", "16"];
const fuelTypeOptions = [
  { value: "GASOLINE", label: "Xăng" },
  { value: "DIESEL", label: "Dầu" },
  { value: "ELECTRIC", label: "Điện" },
  { value: "HYBRID", label: "Hybrid" },
];
const transmissionOptions = [
  { value: "AUTOMATIC", label: "Số tự động" },
  { value: "MANUAL", label: "Số sàn" },
];
const sortOptions = [
  { value: "", label: "Phù hợp nhất" },
  { value: "price_asc", label: "Giá thấp đến cao" },
  { value: "price_desc", label: "Giá cao đến thấp" },
  { value: "newest", label: "Mới nhất" },
];
const homeSortOptions = [
  ...sortOptions.filter(() => false),
  { value: "", label: "Phù hợp nhất" },
  { value: "price_asc", label: "Giá thấp đến cao" },
  { value: "price_desc", label: "Giá cao đến thấp" },
  { value: "rating_desc", label: "Đánh giá tốt" },
  { value: "nearest", label: "Gần nhất" },
  { value: "newest", label: "Mới nhất" },
];

const priceRangeOptions = [
  { label: "Dưới 500.000đ", minPrice: "", maxPrice: "500000" },
  { label: "500.000đ - 1.000.000đ", minPrice: "500000", maxPrice: "1000000" },
  { label: "1.000.000đ - 2.000.000đ", minPrice: "1000000", maxPrice: "2000000" },
  { label: "Trên 2.000.000đ", minPrice: "2000000", maxPrice: "" },
];

const ratingOptions = [
  { value: "4.5", label: "Từ 4.5 sao" },
  { value: "4", label: "Từ 4 sao" },
  { value: "3", label: "Từ 3 sao" },
];

const serviceHighlights = [
  {
    icon: ShieldCheck,
    title: "Xe được kiểm duyệt",
    text: "Danh sách xe hiển thị sau khi được kiểm tra thông tin và trạng thái.",
  },
  {
    icon: Headphones,
    title: "Hỗ trợ nhanh",
    text: "Luồng đặt xe, xác nhận và theo dõi booking được xử lý rõ ràng.",
  },
  {
    icon: BadgeDollarSign,
    title: "Giá minh bạch",
    text: "Hiển thị đơn giá theo giờ hoặc theo ngày trước khi khách đặt xe.",
  },
];

const rentalSteps = [
  {
    icon: Search,
    title: "Tìm xe",
    text: "Chọn dòng xe phù hợp với lịch trình, ngân sách và số chỗ cần dùng.",
  },
  {
    icon: CalendarCheck2,
    title: "Đặt lịch",
    text: "Chọn thời gian nhận trả xe và gửi yêu cầu giữ lịch trên hệ thống.",
  },
  {
    icon: CheckCircle2,
    title: "Xác nhận",
    text: "Đơn vị cho thuê kiểm tra lịch trống và xác nhận booking.",
  },
  {
    icon: CarFront,
    title: "Nhận xe",
    text: "Kiểm tra xe, hoàn tất thủ tục và bắt đầu hành trình đúng lịch.",
  },
];

function buildHomeFilterParams(filters: HomeFilters) {
  return {
    location: filters.location.trim() || undefined,
    type: filters.type || undefined,
    seats: filters.seats ? Number(filters.seats) : undefined,
    brandId: filters.brandId || undefined,
    minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
    maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
    fuelType: filters.fuelType || undefined,
    transmission: filters.transmission || undefined,
    rentalMode: filters.rentalMode || undefined,
    sort: filters.sort || undefined,
    deliveryOnly: filters.deliveryOnly === "true" ? true : undefined,
    minRating: filters.minRating ? Number(filters.minRating) : undefined,
    userLat: filters.userLat ? Number(filters.userLat) : undefined,
    userLng: filters.userLng ? Number(filters.userLng) : undefined,
  };
}

function formatVnd(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";

  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

function getBrandInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export default function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [cars, setCars] = useState<HomeCar[]>([]);
  const [brands, setBrands] = useState<PublicBrand[]>([]);
  const [searchLocation, setSearchLocation] = useState("");
  const [homeFilters, setHomeFilters] = useState<HomeFilters>(emptyHomeFilters);
  const [appliedHomeFilters, setAppliedHomeFilters] =
    useState<HomeFilters>(emptyHomeFilters);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [openHomeFilterDropdown, setOpenHomeFilterDropdown] =
    useState<HomeFilterDropdown | null>(null);
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [pickupTime, setPickupTime] = useState(DEFAULT_START_TIME);
  const [returnTime, setReturnTime] = useState(DEFAULT_END_TIME);
  const [appliedSchedule, setAppliedSchedule] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const [homeCarsPage, setHomeCarsPage] = useState(1);

  useEffect(() => {
    let active = true;

    carService
      .getBrands()
      .then((nextBrands) => {
        if (active) setBrands(nextBrands);
      })
      .catch(console.log);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadHomeCars() {
      try {
        const filterParams = buildHomeFilterParams(appliedHomeFilters);
        const homeCars = (await carService.getHomeCars(
          {
            ...(appliedSchedule || {}),
            ...filterParams,
          },
        )) as HomeCar[];
        let myBookings: HomeBooking[] = [];
        let myCarts: HomeCart[] = [];

        if (authService.isLoggedIn() && authService.getRole() === "USER") {
          try {
            [myBookings, myCarts] = await Promise.all([
              bookingService.getMyBookings() as Promise<HomeBooking[]>,
              cartService.getMyCart() as Promise<HomeCart[]>,
            ]);
          } catch (error) {
            console.log(error);
          }
        }

        const resumableBookingByCarId = new Map<
          string,
          { bookingId?: string; expiresAt: string }
        >();
        const activeCartByCarId = new Map<
          string,
          { cartId: string; expiredAt: string }
        >();
        const now = Date.now();

        myCarts.forEach((cart) => {
          if (cart.status && cart.status !== "ACTIVE") return;
          if (!cart.expiredAt || new Date(cart.expiredAt).getTime() <= now) {
            return;
          }

          const carId =
            typeof cart.carId === "string" ? cart.carId : cart.carId._id;

          if (carId && !activeCartByCarId.has(carId)) {
            activeCartByCarId.set(carId, {
              cartId: cart._id,
              expiredAt: cart.expiredAt,
            });
          }
        });

        myBookings.forEach((booking) => {
          if (!["REQUESTED", "PENDING"].includes(booking.status || "")) return; // REQUESTED là trạng thái mới chờ chủ xe duyệt, PENDING là dữ liệu cũ

          const paidAmount = booking.paidAmount || 0;
          if (paidAmount > 0) return;

          const createdAt = booking.createdAt
            ? new Date(booking.createdAt).getTime()
            : 0;
          if (createdAt > 0 && createdAt + BOOKING_HOLD_MS <= now) return;

          const carId =
            typeof booking.carId === "string"
              ? booking.carId
              : booking.carId._id;

          if (carId && !resumableBookingByCarId.has(carId)) {
            resumableBookingByCarId.set(carId, {
              bookingId: booking._id,
              expiresAt:
                createdAt > 0
                  ? new Date(createdAt + BOOKING_HOLD_MS).toISOString()
                  : "",
            });
          }
        });

        const carsWithResumeAction = homeCars.map((car) => {
          const carId = car._id || String(car.id || "");
          const activeCart = activeCartByCarId.get(carId);
          const resumeBooking = resumableBookingByCarId.get(carId);

          if (activeCart) {
            return {
              ...car,
              holdingCartId: activeCart.cartId,
              holdExpiredAt: activeCart.expiredAt,
            };
          }

          return resumeBooking
            ? {
                ...car,
                resumeBookingId: resumeBooking.bookingId,
                resumeExpiresAt: resumeBooking.expiresAt,
              }
            : car;
        });

        if (active) {
          setCars(carsWithResumeAction);
          setHomeCarsPage(1);
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadHomeCars();

    return () => {
      active = false;
    };
  }, [appliedHomeFilters, appliedSchedule]);

  useEffect(() => {
    if (!location.hash) return;

    window.setTimeout(() => {
      document
        .getElementById(location.hash.slice(1))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [location.hash]);

  const handleSearchCars = () => {
    const trimmedLocation = searchLocation.trim();

    if (!pickupDate || !returnDate) {
      toast.error("Vui lòng chọn ngày nhận và ngày trả xe");
      return;
    }

    const startDate = buildVietnamDateTime(pickupDate, pickupTime);
    const endDate = buildVietnamDateTime(returnDate, returnTime);

    if (new Date(endDate) <= new Date(startDate)) {
      toast.error("Thời gian trả xe phải sau thời gian nhận xe");
      return;
    }

    const params = new URLSearchParams({
      startDate,
      endDate,
      rentalMode: "DAILY",
    });

    if (trimmedLocation) {
      params.set("location", trimmedLocation);
    }

    setAppliedSchedule({ startDate, endDate });
    navigate(`/cars/search?${params.toString()}`);
  };

  const updateHomeFilter = (key: keyof HomeFilters, value: string) => {
    setHomeFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const applyHomeFilters = (nextFilters = homeFilters) => {
    if ((pickupDate || returnDate) && (!pickupDate || !returnDate)) {
      toast.error("Vui lòng chọn đủ ngày nhận và ngày trả xe");
      return;
    }

    if (pickupDate && returnDate) {
      const startDate = buildVietnamDateTime(pickupDate, pickupTime);
      const endDate = buildVietnamDateTime(returnDate, returnTime);

      if (new Date(endDate) <= new Date(startDate)) {
        toast.error("Thời gian trả xe phải sau thời gian nhận xe");
        return;
      }

      setAppliedSchedule({ startDate, endDate });
    } else {
      setAppliedSchedule(null);
    }

    setHomeFilters(nextFilters);
    setAppliedHomeFilters(nextFilters);
    setIsFilterPanelOpen(false);
    setOpenHomeFilterDropdown(null);
  };

  const resetHomeFilters = () => {
    setHomeFilters(emptyHomeFilters);
    setAppliedHomeFilters(emptyHomeFilters);
    setAppliedSchedule(null);
    setIsFilterPanelOpen(false);
    setOpenHomeFilterDropdown(null);
  };

  const applyNextHomeFilters = useCallback((nextFilters: HomeFilters) => {
    setHomeFilters(nextFilters);
    setAppliedHomeFilters(nextFilters);
  }, []);

  const toggleHomeFilter = (key: keyof HomeFilters, value: string) => {
    setHomeFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? "" : value,
    }));
  };

  const selectPriceRange = (minPrice: string, maxPrice: string) => {
    setHomeFilters((prev) => {
      const isActive =
        prev.minPrice === minPrice && prev.maxPrice === maxPrice;

      return {
        ...prev,
        minPrice: isActive ? "" : minPrice,
        maxPrice: isActive ? "" : maxPrice,
      };
    });
  };

  const removeHomeFilter = useCallback((...keys: Array<keyof HomeFilters>) => {
    const nextFilters = {
      ...homeFilters,
    };

    keys.forEach((key) => {
      nextFilters[key] = "" as never;
    });

    applyNextHomeFilters(nextFilters);
  }, [applyNextHomeFilters, homeFilters]);

  const applyPopularArea = (area: string) => {
    const nextFilters = {
      ...homeFilters,
      location: area,
    };

    applyNextHomeFilters(nextFilters);
  };

  const handleHomeDropdownToggle = (
    dropdown: HomeFilterDropdown,
    isOpen: boolean,
  ) => {
    setOpenHomeFilterDropdown((currentDropdown) => {
      if (isOpen) return dropdown;
      return currentDropdown === dropdown ? null : currentDropdown;
    });
  };

  const useCurrentLocationForNearestSort = () => {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ lấy vị trí hiện tại");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextFilters = {
          ...homeFilters,
          sort: "nearest",
          userLat: String(position.coords.latitude),
          userLng: String(position.coords.longitude),
        };

        setHomeFilters(nextFilters);
        setAppliedHomeFilters(nextFilters);
        toast.success("Đã dùng vị trí hiện tại để sắp xếp xe gần nhất");
      },
      () => {
        toast.error("Không thể lấy vị trí hiện tại. Vui lòng cấp quyền vị trí.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const availableCarCount = useMemo(
    () =>
      cars.filter(
        (car) =>
          car.isBookable !== false &&
          (car.rentalAvailability || "AVAILABLE") === "AVAILABLE",
      ).length,
    [cars],
  );
  const homeCarsTotalPages = Math.max(
    1,
    Math.ceil(cars.length / HOME_CARS_PER_PAGE),
  );
  const normalizedHomeCarsPage = Math.min(homeCarsPage, homeCarsTotalPages);
  const pagedHomeCars = useMemo(() => {
    const startIndex = (normalizedHomeCarsPage - 1) * HOME_CARS_PER_PAGE;

    return cars.slice(startIndex, startIndex + HOME_CARS_PER_PAGE);
  }, [cars, normalizedHomeCarsPage]);

  const activeFilterCount = useMemo(
    () => {
      const visibleKeys: Array<keyof HomeFilters> = [
        "location",
        "type",
        "seats",
        "brandId",
        "minPrice",
        "maxPrice",
        "fuelType",
        "transmission",
        "rentalMode",
        "sort",
        "deliveryOnly",
        "minRating",
      ];

      return (
        visibleKeys.filter((key) => String(homeFilters[key]).trim()).length +
        (pickupDate && returnDate ? 1 : 0)
      );
    },
    [homeFilters, pickupDate, returnDate],
  );
  const activeFilterChips = useMemo(() => {
    const selectedBrand = brands.find(
      (brand) => brand._id === homeFilters.brandId,
    );
    const selectedType = carTypeOptions.find(
      (item) => item.value === homeFilters.type,
    );
    const selectedFuel = fuelTypeOptions.find(
      (item) => item.value === homeFilters.fuelType,
    );
    const selectedTransmission = transmissionOptions.find(
      (item) => item.value === homeFilters.transmission,
    );
    const selectedSort = homeSortOptions.find(
      (item) => item.value === homeFilters.sort,
    );
    const selectedRating = ratingOptions.find(
      (item) => item.value === homeFilters.minRating,
    );
    const selectedRentalMode =
      homeFilters.rentalMode === "DAILY"
        ? "Thuê theo ngày"
        : homeFilters.rentalMode === "HOURLY"
          ? "Thuê theo giờ"
          : "";
    const selectedPriceRange = priceRangeOptions.find(
      (item) =>
        item.minPrice === homeFilters.minPrice &&
        item.maxPrice === homeFilters.maxPrice,
    );
    const customPriceLabel =
      !selectedPriceRange && (homeFilters.minPrice || homeFilters.maxPrice)
        ? [
            homeFilters.minPrice ? `Từ ${formatVnd(homeFilters.minPrice)}` : "",
            homeFilters.maxPrice ? `Đến ${formatVnd(homeFilters.maxPrice)}` : "",
          ]
            .filter(Boolean)
            .join(" ")
        : "";

    return [
      homeFilters.location
        ? {
            key: "location",
            label: homeFilters.location,
            remove: () => removeHomeFilter("location"),
          }
        : null,
      selectedBrand
        ? {
            key: "brand",
            label: selectedBrand.name,
            remove: () => removeHomeFilter("brandId"),
          }
        : null,
      selectedType
        ? {
            key: "type",
            label: selectedType.label,
            remove: () => removeHomeFilter("type"),
          }
        : null,
      homeFilters.seats
        ? {
            key: "seats",
            label: `${homeFilters.seats} chỗ`,
            remove: () => removeHomeFilter("seats"),
          }
        : null,
      selectedPriceRange || customPriceLabel
        ? {
            key: "price",
            label: selectedPriceRange?.label || customPriceLabel,
            remove: () => removeHomeFilter("minPrice", "maxPrice"),
          }
        : null,
      selectedFuel
        ? {
            key: "fuelType",
            label: selectedFuel.label,
            remove: () => removeHomeFilter("fuelType"),
          }
        : null,
      selectedTransmission
        ? {
            key: "transmission",
            label: selectedTransmission.label,
            remove: () => removeHomeFilter("transmission"),
          }
        : null,
      selectedRentalMode
        ? {
            key: "rentalMode",
            label: selectedRentalMode,
            remove: () => removeHomeFilter("rentalMode"),
          }
        : null,
      homeFilters.deliveryOnly
        ? {
            key: "deliveryOnly",
            label: "Có giao tận nơi",
            remove: () => removeHomeFilter("deliveryOnly"),
          }
        : null,
      selectedRating
        ? {
            key: "rating",
            label: selectedRating.label,
            remove: () => removeHomeFilter("minRating"),
          }
        : null,
      pickupDate && returnDate
        ? {
            key: "schedule",
            label: "Còn trống theo ngày đã chọn",
            remove: () => {
              setPickupDate("");
              setReturnDate("");
              setAppliedSchedule(null);
            },
          }
        : null,
      selectedSort?.value
        ? {
            key: "sort",
            label: selectedSort.label,
            remove: () => removeHomeFilter("sort"),
          }
        : null,
    ].filter(
      (
        item,
      ): item is { key: string; label: string; remove: () => void } =>
        Boolean(item),
    );
  }, [brands, homeFilters, pickupDate, removeHomeFilter, returnDate]);

  const stats = useMemo(
    () => [
      {
        value: `${availableCarCount}+`,
        label: "xe sẵn sàng",
      },
      {
        value: "Linh hoạt",
        label: "giờ nhận/trả xe",
      },
      {
        value: "10 phút",
        label: "giữ xe trong giỏ hàng",
      },
    ],
    [availableCarCount],
  );
  const dropdownButtonClass =
    "flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 text-sm font-extrabold text-primary transition hover:border-secondary/70 [&::-webkit-details-marker]:hidden";
  const dropdownPanelClass =
    "mt-2 rounded-lg border border-border bg-white p-3 shadow-sm";
  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-bold transition ${
      active
        ? "border-secondary bg-secondarySoft text-primary"
        : "border-border bg-white text-muted hover:border-secondary/70 hover:text-primary"
    }`;
  const minPriceValue = Math.min(Number(homeFilters.minPrice || 0), 3000000);
  const maxPriceValue = Math.min(Number(homeFilters.maxPrice || 3000000), 3000000);
  const safeMinPrice = Math.min(minPriceValue, maxPriceValue - 100000);
  const safeMaxPrice = Math.max(maxPriceValue, safeMinPrice + 100000);
  const priceMinPercent = (safeMinPrice / 3000000) * 100;
  const priceMaxPercent = (safeMaxPrice / 3000000) * 100;
  const setPriceRange = (minPrice: number, maxPrice: number) => {
    setHomeFilters((prev) => ({
      ...prev,
      minPrice: String(Math.max(0, Math.min(minPrice, 3000000))),
      maxPrice: String(Math.max(0, Math.min(maxPrice, 3000000))),
    }));
  };
  const filterContent = (
    <div className="space-y-5">
      <div className="space-y-3">
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 transition focus-within:border-secondary">
          <MapPin size={17} className="shrink-0 text-secondary" />
          <input
            value={homeFilters.location}
            onChange={(event) => updateHomeFilter("location", event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
            placeholder="Nhập khu vực nhận xe"
          />
        </label>

        <select
          value={homeFilters.sort}
          onChange={(event) => updateHomeFilter("sort", event.target.value)}
          className="min-h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-bold text-primary outline-none transition focus:border-secondary"
        >
          {homeSortOptions.map((item) => (
            <option key={item.value || "relevance"} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        {homeFilters.sort === "nearest" && (!homeFilters.userLat || !homeFilters.userLng) && (
          <button
            type="button"
            onClick={useCurrentLocationForNearestSort}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-extrabold text-secondary transition hover:bg-primaryDark"
          >
            <MapPin size={16} />
            Lấy vị trí hiện tại
          </button>
        )}

        <div className="rounded-lg border border-border bg-soft/60 p-3">
          <p className="mb-3 text-sm font-extrabold text-primary">
            Xe còn trống theo ngày
          </p>
          <div className="grid gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-muted">
                Nhận xe
              </span>
              <input
                type="date"
                value={pickupDate}
                onChange={(event) => setPickupDate(event.target.value)}
                className="min-h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-bold text-primary outline-none transition focus:border-secondary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-muted">
                Trả xe
              </span>
              <input
                type="date"
                value={returnDate}
                onChange={(event) => setReturnDate(event.target.value)}
                className="min-h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-bold text-primary outline-none transition focus:border-secondary"
              />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="time"
              value={pickupTime}
              onChange={(event) => setPickupTime(event.target.value)}
              className="min-h-10 rounded-lg border border-border bg-white px-3 text-sm font-bold text-primary outline-none transition focus:border-secondary"
              aria-label="Giờ nhận xe"
            />
            <input
              type="time"
              value={returnTime}
              onChange={(event) => setReturnTime(event.target.value)}
              className="min-h-10 rounded-lg border border-border bg-white px-3 text-sm font-bold text-primary outline-none transition focus:border-secondary"
              aria-label="Giờ trả xe"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={resetHomeFilters}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-extrabold text-primary transition hover:bg-soft"
          >
            <RotateCcw size={16} />
            Xóa lọc
          </button>
          <button
            type="button"
            onClick={() => applyHomeFilters()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-secondary px-4 text-sm font-extrabold text-primary transition hover:brightness-95"
          >
            <Search size={17} />
            Áp dụng
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-primary">Hãng xe</p>
          <span className="text-xs font-bold text-muted">{brands.length} hãng</span>
        </div>
        <div className="grid gap-2">
          {brands.map((brand) => {
            const active = homeFilters.brandId === brand._id;

            return (
              <button
                key={brand._id}
                type="button"
                onClick={() => toggleHomeFilter("brandId", brand._id)}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                  active
                    ? "border-secondary bg-secondarySoft text-primary shadow-sm"
                    : "border-border bg-white text-primary hover:border-secondary/60"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-soft text-xs font-extrabold text-primary">
                  {brand.logo ? (
                    <img
                      src={brand.logo}
                      alt={brand.name}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    getBrandInitials(brand.name)
                  )}
                </span>
                <span className="truncate text-sm font-extrabold">{brand.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => toggleHomeFilter("deliveryOnly", "true")}
          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm font-extrabold transition ${
            homeFilters.deliveryOnly
              ? "border-secondary bg-secondarySoft text-primary"
              : "border-border bg-white text-primary hover:border-secondary/70"
          }`}
        >
          <span>Xe có giao tận nơi</span>
          <span
            className={`h-5 w-5 rounded-full border ${
              homeFilters.deliveryOnly
                ? "border-secondary bg-secondary"
                : "border-slate-300 bg-white"
            }`}
          />
        </button>

        <details
          className="group"
          open={openHomeFilterDropdown === "seats"}
          onToggle={(event) =>
            handleHomeDropdownToggle("seats", event.currentTarget.open)
          }
        >
          <summary className={dropdownButtonClass}>
            <span>Số chỗ</span>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </summary>
          <div className={dropdownPanelClass}>
            <div className="flex flex-wrap gap-2">
              {seatOptions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleHomeFilter("seats", item)}
                  className={chipClass(homeFilters.seats === item)}
                >
                  {item} chỗ
                </button>
              ))}
            </div>
          </div>
        </details>

        <details
          className="group"
          open={openHomeFilterDropdown === "price"}
          onToggle={(event) =>
            handleHomeDropdownToggle("price", event.currentTarget.open)
          }
        >
          <summary className={dropdownButtonClass}>
            <span>Mức giá</span>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </summary>
          <div className={dropdownPanelClass}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <input
                value={formatVnd(String(safeMinPrice))}
                readOnly
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-right text-sm font-bold text-primary"
              />
              <span className="text-muted">~</span>
              <input
                value={formatVnd(String(safeMaxPrice))}
                readOnly
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-right text-sm font-bold text-primary"
              />
            </div>
            <div className="relative h-8">
              <div className="absolute left-1 right-1 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200" />
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
                style={{ left: `${priceMinPercent}%`, right: `${100 - priceMaxPercent}%` }}
              />
              <input
                type="range"
                min="0"
                max="3000000"
                step="100000"
                value={safeMinPrice}
                onChange={(event) => {
                  const nextMin = Math.min(Number(event.target.value), safeMaxPrice - 100000);
                  setPriceRange(nextMin, safeMaxPrice);
                }}
                className="pointer-events-none absolute inset-x-0 top-1/2 h-1 w-full -translate-y-1/2 appearance-none bg-transparent accent-primary [&::-webkit-slider-thumb]:pointer-events-auto"
              />
              <input
                type="range"
                min="0"
                max="3000000"
                step="100000"
                value={safeMaxPrice}
                onChange={(event) => {
                  const nextMax = Math.max(Number(event.target.value), safeMinPrice + 100000);
                  setPriceRange(safeMinPrice, nextMax);
                }}
                className="pointer-events-none absolute inset-x-0 top-1/2 h-1 w-full -translate-y-1/2 appearance-none bg-transparent accent-primary [&::-webkit-slider-thumb]:pointer-events-auto"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {priceRangeOptions.map((item) => {
                const active =
                  homeFilters.minPrice === item.minPrice &&
                  homeFilters.maxPrice === item.maxPrice;

                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => selectPriceRange(item.minPrice, item.maxPrice)}
                    className={chipClass(active)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </details>

        <details
          className="group"
          open={openHomeFilterDropdown === "rating"}
          onToggle={(event) =>
            handleHomeDropdownToggle("rating", event.currentTarget.open)
          }
        >
          <summary className={dropdownButtonClass}>
            <span>Đánh giá</span>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </summary>
          <div className={dropdownPanelClass}>
            <div className="flex flex-wrap gap-2">
              {ratingOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleHomeFilter("minRating", item.value)}
                  className={chipClass(homeFilters.minRating === item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </details>

        <details
          className="group"
          open={openHomeFilterDropdown === "fuelType"}
          onToggle={(event) =>
            handleHomeDropdownToggle("fuelType", event.currentTarget.open)
          }
        >
          <summary className={dropdownButtonClass}>
            <span>Nhiên liệu</span>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </summary>
          <div className={dropdownPanelClass}>
            <div className="flex flex-wrap gap-2">
              {fuelTypeOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleHomeFilter("fuelType", item.value)}
                  className={chipClass(homeFilters.fuelType === item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </details>

        <details
          className="group"
          open={openHomeFilterDropdown === "transmission"}
          onToggle={(event) =>
            handleHomeDropdownToggle("transmission", event.currentTarget.open)
          }
        >
          <summary className={dropdownButtonClass}>
            <span>Hộp số</span>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </summary>
          <div className={dropdownPanelClass}>
            <div className="flex flex-wrap gap-2">
              {transmissionOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleHomeFilter("transmission", item.value)}
                  className={chipClass(homeFilters.transmission === item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </details>

        <details
          className="group"
          open={openHomeFilterDropdown === "type"}
          onToggle={(event) =>
            handleHomeDropdownToggle("type", event.currentTarget.open)
          }
        >
          <summary className={dropdownButtonClass}>
            <span>Loại xe</span>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </summary>
          <div className={dropdownPanelClass}>
            <div className="flex flex-wrap gap-2">
              {carTypeOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleHomeFilter("type", item.value)}
                  className={chipClass(homeFilters.type === item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </details>

        <details
          className="group"
          open={openHomeFilterDropdown === "rentalMode"}
          onToggle={(event) =>
            handleHomeDropdownToggle("rentalMode", event.currentTarget.open)
          }
        >
          <summary className={dropdownButtonClass}>
            <span>Hình thức thuê</span>
            <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
          </summary>
          <div className={dropdownPanelClass}>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "DAILY", label: "Thuê theo ngày" },
                { value: "HOURLY", label: "Thuê theo giờ" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleHomeFilter("rentalMode", item.value)}
                  className={chipClass(homeFilters.rentalMode === item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>

      <div className="border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-extrabold text-primary">Khu vực phổ biến</span>
          {popularAreas.map((area) => (
            <button
              key={area}
              type="button"
              onClick={() => applyPopularArea(area)}
              className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                homeFilters.location === area
                  ? "border-secondary bg-secondarySoft text-primary"
                  : "border-border bg-white text-muted hover:border-secondary/70 hover:text-primary"
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />

      <main className="pt-20">
        <section className="relative overflow-hidden bg-primary text-white">
          <img
            src={heroImage}
            alt="Dịch vụ thuê xe BQDrive"
            className="absolute inset-0 h-full w-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-black/55" />

          <div className="relative mx-auto grid min-h-[650px] max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_430px]">
            <div className="min-w-0 max-w-3xl">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur">
                  <Sparkles size={17} />
                  Thuê xe linh hoạt cho mọi lịch trình
                </span>

                <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-extrabold text-primary">
                  <ShieldCheck size={17} />
                  Đối tác kiểm duyệt
                </span>
              </div>

              <h1 className="text-5xl font-extrabold leading-tight md:text-7xl">
                BQDrive
              </h1>

              <p className="mt-6 max-w-2xl break-words text-lg leading-8 text-white/80">
                Nền tảng thuê xe kết nối khách hàng với doanh nghiệp và cá
                nhân cho thuê xe uy tín, giúp đặt lịch nhanh, giá rõ ràng và
                theo dõi booking thuận tiện.
              </p>

              <div className="mt-9 grid max-w-2xl gap-3 sm:grid-cols-3">
                {stats.map((item) => (
                  <div
                    key={item.label}
                    className="border-l-2 border-secondary pl-4"
                  >
                    <p className="text-2xl font-extrabold text-secondary">
                      {item.value}
                    </p>
                    <p className="mt-1 text-sm text-white/70">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 max-w-full rounded-lg bg-white p-5 text-primary shadow-2xl shadow-black/25 lg:w-full">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase text-secondary">
                    Tìm xe nhanh
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold">
                    Chọn lịch trình
                  </h2>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                  <Search size={24} />
                </div>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Địa điểm</span>
                  <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                    <MapPin size={19} className="shrink-0 text-secondary" />
                    <input
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      placeholder="Bạn muốn nhận xe ở đâu?"
                      value={searchLocation}
                      onChange={(event) => setSearchLocation(event.target.value)}
                    />
                  </span>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">
                      Ngày nhận
                    </span>
                    <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                      <CalendarDays
                        size={19}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        className="w-full min-w-0 flex-1 bg-transparent outline-none"
                        type="date"
                        value={pickupDate}
                        onChange={(event) => setPickupDate(event.target.value)}
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">
                      Giờ nhận
                    </span>
                    <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                      <Clock
                        size={19}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        className="w-full min-w-0 flex-1 bg-transparent outline-none"
                        type="time"
                        value={pickupTime}
                        onChange={(event) => setPickupTime(event.target.value)}
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">
                      Ngày trả
                    </span>
                    <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                      <CalendarDays
                        size={19}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        className="w-full min-w-0 flex-1 bg-transparent outline-none"
                        type="date"
                        value={returnDate}
                        onChange={(event) => setReturnDate(event.target.value)}
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">
                      Giờ trả
                    </span>
                    <span className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 transition focus-within:border-secondary">
                      <Clock
                        size={19}
                        className="shrink-0 text-secondary"
                      />
                      <input
                        className="w-full min-w-0 flex-1 bg-transparent outline-none"
                        type="time"
                        value={returnTime}
                        onChange={(event) => setReturnTime(event.target.value)}
                      />
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleSearchCars}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-3 font-extrabold text-primary transition hover:brightness-95"
                >
                  <Search size={20} />
                  Tìm xe phù hợp
                </button>

                <div className="grid gap-3 border-t border-border pt-4 text-sm text-muted sm:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <Clock size={17} className="text-secondary" />
                    Giờ nhận/trả linh hoạt
                  </p>
                  <p className="flex items-center gap-2">
                    <Building2 size={17} className="text-secondary" />
                    Đối tác BQDrive
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-white">
          <div className="mx-auto grid max-w-7xl gap-4 px-6 py-8 md:grid-cols-3">
            {serviceHighlights.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondarySoft text-secondary">
                  <Icon size={24} />
                </div>

                <div>
                  <h3 className="font-extrabold text-primary">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id="home-cars"
          className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 md:py-20"
        >
          <div className="mb-6 rounded-lg border border-border bg-white p-4 shadow-sm lg:hidden">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold uppercase text-secondary">
                  <SlidersHorizontal size={17} />
                  Bộ lọc xe
                </p>
                <h3 className="mt-1 text-lg font-extrabold text-primary">
                  Lọc nhanh danh sách xe nổi bật
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-secondarySoft px-3 py-1 text-xs font-extrabold text-primary">
                    {activeFilterCount} bộ lọc
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsFilterPanelOpen(true)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-extrabold text-white"
                >
                  <Filter size={17} />
                  Bộ lọc
                </button>
              </div>
            </div>

            {activeFilterChips.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.remove}
                    className="inline-flex items-center gap-2 rounded-full bg-secondarySoft px-3 py-1.5 text-sm font-extrabold text-primary transition hover:bg-secondary/30"
                  >
                    {chip.label}
                    <X size={14} />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 hidden md:block">{filterContent}</div>
          </div>

          {isFilterPanelOpen && (
            <div className="fixed inset-0 z-50 bg-primary/50 lg:hidden">
              <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase text-secondary">
                      Bộ lọc xe
                    </p>
                    <h3 className="text-lg font-extrabold text-primary">
                      Tìm xe phù hợp
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFilterPanelOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-soft text-primary"
                    aria-label="Đóng bộ lọc"
                  >
                    <X size={20} />
                  </button>
                </div>

                {filterContent}
              </div>
            </div>
          )}
          <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
            <aside className="hidden overflow-hidden rounded-2xl border border-border bg-white shadow-sm lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-6.5rem)] lg:self-start">
              <div className="border-b border-border px-5 py-4">
                <p className="flex items-center gap-2 text-sm font-bold uppercase text-secondary">
                  <SlidersHorizontal size={17} />
                  Bộ lọc xe
                </p>
                <h3 className="mt-1 text-xl font-extrabold text-primary">
                  Bộ lọc tìm kiếm
                </h3>
                {activeFilterCount > 0 && (
                  <p className="mt-2 text-sm font-bold text-muted">
                    Đang áp dụng {activeFilterCount} bộ lọc
                  </p>
                )}
              </div>
              <div className="max-h-[calc(100vh-190px)] overflow-y-auto p-5">
                {filterContent}
              </div>
            </aside>

            <div className="min-w-0">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Đội xe nổi bật
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-primary md:text-4xl">
                Xe đã sẵn sàng cho chuyến đi của bạn
              </h2>
              <p className="mt-3 max-w-2xl leading-7 text-muted">
                Những dòng xe được duyệt trên hệ thống, có thông tin giá và đơn
                vị cho thuê rõ ràng.
              </p>
            </div>

            <button
              type="button"
              onClick={resetHomeFilters}
              className="inline-flex items-center gap-2 font-extrabold text-primary transition hover:text-secondary"
            >
              Xem tất cả
              <ArrowRight size={18} />
            </button>
          </div>

          {activeFilterChips.length > 0 && (
            <div className="mb-5 hidden flex-wrap gap-2 lg:flex">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.remove}
                  className="inline-flex items-center gap-2 rounded-full bg-secondarySoft px-3 py-1.5 text-sm font-extrabold text-primary transition hover:bg-secondary/30"
                >
                  {chip.label}
                  <X size={14} />
                </button>
              ))}
            </div>
          )}

          {cars.length > 0 ? (
            <>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {pagedHomeCars.map((car) => (
                  <CarCard key={car._id || car.id} car={car} />
                ))}
              </div>

              {cars.length > 0 && (
                <div className="mt-8 flex justify-center rounded-2xl border border-border bg-white px-5 py-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setHomeCarsPage((page) => Math.max(1, page - 1))
                      }
                      disabled={normalizedHomeCarsPage === 1}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-primary transition hover:bg-soft disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Trang trước"
                    >
                      <ChevronLeft size={20} />
                    </button>

                    {Array.from({ length: homeCarsTotalPages }, (_, index) => {
                      const page = index + 1;
                      const active = page === normalizedHomeCarsPage;

                      return (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setHomeCarsPage(page)}
                          className={`h-10 min-w-10 rounded-lg px-3 text-sm font-extrabold transition ${
                            active
                              ? "bg-primary text-secondary"
                              : "border border-border bg-white text-primary hover:bg-soft"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() =>
                        setHomeCarsPage((page) =>
                          Math.min(homeCarsTotalPages, page + 1),
                        )
                      }
                      disabled={normalizedHomeCarsPage === homeCarsTotalPages}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-primary transition hover:bg-soft disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Trang sau"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-border bg-white p-10 text-center">
              <CarFront size={44} className="mx-auto text-secondary" />
              <h3 className="mt-4 text-2xl font-extrabold text-primary">
                Đang tải danh sách xe
              </h3>
              <p className="mt-2 text-muted">
                Hệ thống đang lấy các xe mới nhất đã được duyệt.
              </p>
            </div>
          )}
            </div>
          </div>
        </section>

        <section className="bg-white py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-8 max-w-3xl">
              <p className="text-sm font-bold uppercase text-secondary">
                Quy trình thuê xe
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-primary md:text-4xl">
                Cách thức thuê xe trên BQDrive chỉ với 4 bước đơn giản
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {rentalSteps.map(({ icon: Icon, title, text }, index) => (
                <div
                  key={title}
                  className="rental-step-card relative min-h-[250px] overflow-hidden rounded-lg border border-border bg-white p-6"
                  style={
                    {
                      "--step-delay": `${index * 1.25}s`,
                    } as CSSProperties
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="rental-step-icon relative flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Icon size={23} />
                    </div>
                    <span className="relative text-base font-extrabold text-secondary">
                      0{index + 1}
                    </span>
                  </div>

                  <h3 className="mt-6 text-xl font-extrabold text-primary">
                    {title}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-8 rounded-lg bg-primary p-6 text-white md:grid-cols-[minmax(0,1fr)_360px] md:p-10">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Dành cho đối tác
              </p>
              <h2 className="mt-2 text-3xl font-extrabold">
                Quản lý xe cho thuê trên cùng một hệ thống
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-white/70">
                BQDrive hỗ trợ doanh nghiệp và cá nhân đăng xe, nhận booking và
                theo dõi trạng thái thuê xe theo từng lịch trình.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              {["Đăng xe chờ duyệt", "Nhận booking", "Theo dõi thanh toán"].map(
                (item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2
                      size={20}
                      className="shrink-0 text-secondary"
                    />
                    <span className="font-bold">{item}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}











