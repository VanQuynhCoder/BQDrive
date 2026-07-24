import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Fuel,
  Gauge,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";

export type CarouselCar = {
  id: string;
  name: string;
  brandName?: string;
  image?: string;
  pricePerDay?: number;
  location?: string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
};

type CarCarouselProps = {
  title: string;
  subtitle?: string;
  cars: CarouselCar[];
  autoPlay?: boolean;
  intervalMs?: number;
};

const fallbackImage =
  "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1200";

function formatPrice(price?: number) {
  if (!price || price <= 0) return "Đang cập nhật";
  return `${new Intl.NumberFormat("vi-VN").format(price)}đ`;
}

function getSpecLabel(value?: string) {
  const labels: Record<string, string> = {
    ELECTRIC: "Điện",
    GASOLINE: "Xăng",
    DIESEL: "Dầu",
    HYBRID: "Hybrid",
    AUTOMATIC: "Tự động",
    MANUAL: "Số sàn",
  };

  return value ? labels[value] || value : "Đang cập nhật";
}

export default function CarCarousel({
  title,
  subtitle,
  cars,
  autoPlay = true,
  intervalMs = 3600,
}: CarCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [loadingCarId, setLoadingCarId] = useState("");
  const normalizedCars = useMemo(
    () => cars.filter((car) => car.id && car.name),
    [cars],
  );
  const canScroll = normalizedCars.length > 1;

  const scrollByCard = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;

    const firstCard = track.querySelector<HTMLElement>("[data-carousel-card]");
    const cardWidth = firstCard ? firstCard.offsetWidth + 20 : 280;
    const maxScrollLeft = track.scrollWidth - track.clientWidth;

    if (maxScrollLeft <= 0) return;

    if (direction > 0 && track.scrollLeft >= maxScrollLeft - cardWidth) {
      track.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    if (direction < 0 && track.scrollLeft <= 8) {
      track.scrollTo({ left: maxScrollLeft, behavior: "smooth" });
      return;
    }

    track.scrollBy({ left: direction * cardWidth, behavior: "smooth" });
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    track.scrollTo({ left: 0 });
  }, [normalizedCars]);

  useEffect(() => {
    if (!autoPlay || isPaused || !canScroll) return;

    const intervalId = window.setInterval(() => {
      scrollByCard(1);
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [autoPlay, isPaused, canScroll, intervalMs]);

  if (normalizedCars.length === 0) return null;

  return (
    <section className="mt-10 rounded-2xl border border-border bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5">
        <p className="text-sm font-bold uppercase text-secondary">{title}</p>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted">
            {subtitle}
          </p>
        )}
      </div>

      <div
        className="relative mx-auto max-w-6xl"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {canScroll && (
          <>
            <button
              type="button"
              onClick={() => scrollByCard(-1)}
              className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-primary shadow-lg ring-1 ring-border transition hover:bg-secondary hover:text-primary"
              aria-label="Xem xe phía trước"
              title="Xem xe phía trước"
            >
              <ChevronLeft size={23} />
            </button>
            <button
              type="button"
              onClick={() => scrollByCard(1)}
              className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-secondary shadow-lg transition hover:bg-slate-800"
              aria-label="Xem xe tiếp theo"
              title="Xem xe tiếp theo"
            >
              <ChevronRight size={23} />
            </button>
          </>
        )}

        <div
          ref={trackRef}
          className="flex snap-x gap-5 overflow-x-auto scroll-smooth px-12 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {normalizedCars.map((car) => (
            <Link
              key={car.id}
              to={`/cars/${car.id}`}
              onClick={() => setLoadingCarId(car.id)}
              data-carousel-card
              className="group relative w-[230px] shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl sm:w-[250px] lg:w-[270px]"
            >
              {loadingCarId === car.id && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/85 text-primary backdrop-blur-sm">
                  <span className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
                  <span className="text-sm font-extrabold">Đang mở xe...</span>
                </div>
              )}

              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src={car.image || fallbackImage}
                  alt={car.name}
                  loading="lazy"
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.src = fallbackImage;
                  }}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />

                <div className="absolute left-3 top-3 flex max-w-[calc(100%-24px)] flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondarySoft px-2.5 py-1 text-xs font-extrabold text-primary">
                    <ShieldCheck size={14} />
                    Sẵn sàng
                  </span>

                  {car.brandName && (
                    <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold uppercase text-primary backdrop-blur">
                      {car.brandName}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 min-h-12 text-lg font-extrabold leading-6 text-primary">
                    {car.name}
                  </h3>
                  <p className="mt-1 truncate text-xs font-bold uppercase text-muted">
                    {car.brandName || "BQDrive"}
                  </p>
                  {car.location && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted">
                      <MapPin size={15} className="shrink-0 text-secondary" />
                      <span className="truncate">{car.location}</span>
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-end gap-1">
                  <p className="text-xl font-extrabold text-secondary">
                    {formatPrice(car.pricePerDay)}
                  </p>
                  <p className="pb-0.5 text-xs font-semibold text-muted">
                    / ngày
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-y border-border py-3 text-xs font-semibold text-muted">
                  <span className="flex items-center gap-1.5">
                    <Users size={15} className="text-secondary" />
                    {car.seats || "--"} chỗ
                  </span>
                  <span className="flex items-center gap-1.5 truncate">
                    <Fuel size={15} className="shrink-0 text-secondary" />
                    {getSpecLabel(car.fuelType)}
                  </span>
                  <span className="flex items-center gap-1.5 truncate">
                    <Gauge size={15} className="shrink-0 text-secondary" />
                    {getSpecLabel(car.transmission)}
                  </span>
                  <span className="font-semibold text-primary">Theo ngày</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
