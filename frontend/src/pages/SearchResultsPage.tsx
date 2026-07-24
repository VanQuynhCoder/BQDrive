import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CalendarDays, CarFront, Clock, MapPin, Search } from "lucide-react";

import Header from "../components/Header";
import Footer from "../components/Footer";
import CarCard from "../components/CarCard";
import { carService } from "../services/car.service";
import { buildVietnamDateTime } from "../utils/date.util";

type SearchCar = {
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
  thumbnail?: string;
  images?: string[];
  image?: string;
  ownerName?: string;
  ownerType?: "BUSINESS" | "USER" | string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  brandId?: {
    name?: string;
  } | null;
  businessId?: {
    businessName?: string;
  } | null;
  rentalAvailability?: "AVAILABLE" | "HELD_IN_CART" | "PENDING_CONFIRMATION";
  availabilityLabel?: string;
  isBookable?: boolean;
  unavailableReason?: string;
};

const DEFAULT_START_TIME = "08:00";
const DEFAULT_END_TIME = "18:00";

function getDatePart(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTimePart(value?: string | null, fallback = DEFAULT_START_TIME) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

export default function SearchResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const [cars, setCars] = useState<SearchCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLocation, setSearchLocation] = useState(
    () => query.get("location") || "",
  );
  const [pickupDate, setPickupDate] = useState(
    () => getDatePart(query.get("startDate")),
  );
  const [returnDate, setReturnDate] = useState(
    () => getDatePart(query.get("endDate")),
  );
  const [pickupTime, setPickupTime] = useState(
    () => getTimePart(query.get("startDate"), DEFAULT_START_TIME),
  );
  const [returnTime, setReturnTime] = useState(
    () => getTimePart(query.get("endDate"), DEFAULT_END_TIME),
  );

  useEffect(() => {
    queueMicrotask(() => {
      setSearchLocation(query.get("location") || "");
      setPickupDate(getDatePart(query.get("startDate")));
      setReturnDate(getDatePart(query.get("endDate")));
      setPickupTime(getTimePart(query.get("startDate"), DEFAULT_START_TIME));
      setReturnTime(getTimePart(query.get("endDate"), DEFAULT_END_TIME));
    });
  }, [query]);

  useEffect(() => {
    let active = true;

    async function loadCars() {
      setLoading(true);
      try {
        const data = await carService.searchCars({
          location: query.get("location") || undefined,
          startDate: query.get("startDate") || undefined,
          endDate: query.get("endDate") || undefined,
          rentalMode:
            query.get("rentalMode") === "HOURLY" ? "HOURLY" : "DAILY",
        });

        if (active) setCars(data as SearchCar[]);
      } catch (error) {
        console.log(error);
        toast.error("Không thể tải kết quả tìm kiếm xe");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCars();

    return () => {
      active = false;
    };
  }, [query]);

  const handleSearch = () => {
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

    const nextQuery = new URLSearchParams({
      startDate,
      endDate,
      rentalMode: query.get("rentalMode") || "DAILY",
    });
    const trimmedLocation = searchLocation.trim();

    if (trimmedLocation) {
      nextQuery.set("location", trimmedLocation);
    }

    navigate(`/cars/search?${nextQuery.toString()}`);
  };

  const detailSearchParams = location.search;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-24">
        <section className="bg-primary text-white">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <p className="text-sm font-bold uppercase text-secondary">
              Tìm xe theo lịch nhận xe
            </p>
            <h1 className="mt-2 text-4xl font-extrabold">
              Xe phù hợp với khu vực và thời gian bạn chọn
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-8">
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto]">
              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-primary">
                  Khu vực nhận xe
                </span>
                <span className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3">
                  <MapPin size={18} className="text-secondary" />
                  <input
                    value={searchLocation}
                    onChange={(event) => setSearchLocation(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                    placeholder="Nhập khu vực nhận xe"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-primary">
                  Ngày nhận
                </span>
                <span className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3">
                  <CalendarDays size={18} className="text-secondary" />
                  <input
                    type="date"
                    value={pickupDate}
                    onChange={(event) => setPickupDate(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-primary">
                  Giờ nhận
                </span>
                <span className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3">
                  <Clock size={18} className="text-secondary" />
                  <input
                    type="time"
                    value={pickupTime}
                    onChange={(event) => setPickupTime(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-primary">
                  Ngày trả
                </span>
                <span className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3">
                  <CalendarDays size={18} className="text-secondary" />
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(event) => setReturnDate(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-primary">
                  Giờ trả
                </span>
                <span className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3">
                  <Clock size={18} className="text-secondary" />
                  <input
                    type="time"
                    value={returnTime}
                    onChange={(event) => setReturnTime(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                  />
                </span>
              </label>

              <button
                type="button"
                onClick={handleSearch}
                className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 font-extrabold text-primary transition hover:brightness-95"
              >
                <Search size={18} />
                Tìm xe
              </button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-16">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase text-secondary">
                Kết quả tìm kiếm
              </p>
              <h2 className="mt-1 text-3xl font-extrabold text-primary">
                {loading ? "Đang tìm xe phù hợp" : `${cars.length} xe phù hợp`}
              </h2>
            </div>
          </div>

          {!loading && cars.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {cars.map((car) => (
                <CarCard
                  key={car._id || car.id}
                  car={car}
                  detailSearchParams={detailSearchParams}
                />
              ))}
            </div>
          )}

          {!loading && cars.length === 0 && (
            <div className="rounded-lg border border-border bg-white p-10 text-center">
              <CarFront size={44} className="mx-auto text-secondary" />
              <h3 className="mt-4 text-2xl font-extrabold text-primary">
                Không tìm thấy xe phù hợp
              </h3>
              <p className="mx-auto mt-2 max-w-xl leading-7 text-muted">
                Không tìm thấy xe phù hợp trong khu vực và thời gian bạn chọn.
              </p>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
