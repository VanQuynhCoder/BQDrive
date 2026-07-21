import { useEffect, useMemo, useState } from "react";

import { carService } from "../../services/car.service";
import { formatAddressArea, formatPickupAddress } from "../../utils/address.util";
import CarCarousel, { type CarouselCar } from "./CarCarousel";

type RelatedCar = {
  _id: string;
  name: string;
  status?: string;
  type?: string;
  seats?: number;
  fuelType?: string;
  transmission?: string;
  pricePerDay?: number;
  images?: string[];
  image?: string;
  pickupAddress?: string;
  pickupFormattedAddress?: string;
  pickupProvince?: string;
  pickupDistrict?: string;
  pickupWard?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  pricing?: {
    weekdayPricePerDay?: number;
  };
  brandId?: {
    _id?: string;
    name?: string;
  } | null;
};

type RelatedCarsProps = {
  currentCar: RelatedCar;
};

function getCarPrice(car: RelatedCar) {
  return Number(car.pricing?.weekdayPricePerDay || car.pricePerDay || 0);
}

function getBrandKey(car: RelatedCar) {
  return String(car.brandId?._id || car.brandId?.name || "").toLowerCase();
}

function getLocationKey(car: RelatedCar) {
  return String(
    car.pickupDistrict ||
      car.district ||
      car.pickupProvince ||
      car.province ||
      car.city ||
      "",
  ).toLowerCase();
}

function getRelatedScore(car: RelatedCar, currentCar: RelatedCar) {
  let score = 0;
  const currentPrice = getCarPrice(currentCar);
  const carPrice = getCarPrice(car);

  if (getBrandKey(car) && getBrandKey(car) === getBrandKey(currentCar)) {
    score += 50;
  }

  if (car.seats && car.seats === currentCar.seats) score += 18;
  if (car.fuelType && car.fuelType === currentCar.fuelType) score += 14;
  if (car.transmission && car.transmission === currentCar.transmission) {
    score += 14;
  }
  if (car.type && car.type === currentCar.type) score += 12;
  if (getLocationKey(car) && getLocationKey(car) === getLocationKey(currentCar)) {
    score += 10;
  }

  if (currentPrice > 0 && carPrice > 0) {
    const diffRatio = Math.abs(carPrice - currentPrice) / currentPrice;
    if (diffRatio <= 0.25) score += 20;
    else if (diffRatio <= 0.5) score += 10;
  }

  return score;
}

function toCarouselCar(car: RelatedCar): CarouselCar {
  return {
    id: car._id,
    name: car.name,
    brandName: car.brandId?.name || "",
    image: car.images?.find(Boolean) || car.image || "",
    pricePerDay: getCarPrice(car),
    location: formatAddressArea(car) || formatPickupAddress(car),
    seats: car.seats,
    fuelType: car.fuelType,
    transmission: car.transmission,
  };
}

export default function RelatedCars({ currentCar }: RelatedCarsProps) {
  const [cars, setCars] = useState<RelatedCar[]>([]);

  useEffect(() => {
    let ignore = false;

    async function loadRelatedCars() {
      try {
        const data = await carService.getHomeCars();
        if (ignore) return;
        setCars(Array.isArray(data) ? data : []);
      } catch {
        if (!ignore) setCars([]);
      }
    }

    void loadRelatedCars();

    return () => {
      ignore = true;
    };
  }, [currentCar._id]);

  const relatedCars = useMemo(() => {
    return cars
      .filter((car) => {
        if (!car?._id || car._id === currentCar._id) return false;
        if (["PENDING", "REJECTED", "HIDDEN"].includes(car.status || "")) {
          return false;
        }
        return true;
      })
      .map((car, index) => ({
        car,
        index,
        score: getRelatedScore(car, currentCar),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ car }) => toCarouselCar(car));
  }, [cars, currentCar]);

  if (relatedCars.length === 0) return null;

  return (
    <CarCarousel
      title="Khám phá thêm xe khác"
      subtitle="Gợi ý thêm các xe đang có trên BQDrive."
      cars={relatedCars}
      autoPlay
    />
  );
}
