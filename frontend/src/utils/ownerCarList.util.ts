// Hàm hỗ trợ xử lý danh sách xe của người dùng có xe ký gửi.
import type { CarPricing } from "../types/pricing";

export type OwnerCarStatusFilter =
  | "ALL"
  | "PENDING"
  | "APPROVED"
  | "RENTED"
  | "REJECTED"
  | "HIDDEN";

export type OwnerCarSort =
  | "UPDATED_DESC"
  | "UPDATED_ASC"
  | "NAME_ASC"
  | "NAME_DESC"
  | "PRICE_ASC"
  | "PRICE_DESC"
  | "ODO_ASC"
  | "ODO_DESC";

export type OwnerCarListItem = {
  carCode?: string | null;
  name: string;
  licensePlate?: string;
  brandId?: { name?: string } | string | null;
  pricing?: CarPricing;
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit?: string;
  status?: string;
  isHidden?: boolean;
  hiddenByOwner?: boolean;
  hiddenByAdmin?: boolean;
  isDeleted?: boolean;
  currentOdometerKm?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export const OWNER_CAR_STATUS_OPTIONS: Array<{
  value: OwnerCarStatusFilter;
  label: string;
}> = [
  { value: "ALL", label: "Tất cả" },
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "RENTED", label: "Đang được thuê" },
  { value: "REJECTED", label: "Bị từ chối" },
  { value: "HIDDEN", label: "Đang ẩn" },
];

export const OWNER_CAR_SORT_OPTIONS: Array<{
  value: OwnerCarSort;
  label: string;
}> = [
  { value: "UPDATED_DESC", label: "Mới cập nhật nhất" },
  { value: "UPDATED_ASC", label: "Cũ cập nhật nhất" },
  { value: "NAME_ASC", label: "Tên xe A-Z" },
  { value: "NAME_DESC", label: "Tên xe Z-A" },
  { value: "PRICE_ASC", label: "Giá thấp đến cao" },
  { value: "PRICE_DESC", label: "Giá cao đến thấp" },
  { value: "ODO_ASC", label: "ODO thấp đến cao" },
  { value: "ODO_DESC", label: "ODO cao đến thấp" },
];

export type OwnerCarStatusCounts = Record<OwnerCarStatusFilter, number>;

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN")
    .trim();
}

function normalizePlate(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function getBrandName(car: OwnerCarListItem) {
  return typeof car.brandId === "object" && car.brandId
    ? car.brandId.name || ""
    : "";
}

export function isOwnerCarHidden(
  car: Pick<
    OwnerCarListItem,
    "isHidden" | "hiddenByOwner" | "hiddenByAdmin"
  >,
) {
  return Boolean(car.isHidden || car.hiddenByOwner || car.hiddenByAdmin);
}

export function getOwnerCarRepresentativePrice(car: OwnerCarListItem) {
  const dailyPrice = car.pricing?.basePricePerDay;
  const hourlyPrice = car.pricing?.basePricePerHour;
  const allowDaily =
    typeof car.allowDailyRental === "boolean"
      ? car.allowDailyRental
      : car.rentalUnit !== "HOUR";
  const allowHourly =
    typeof car.allowHourlyRental === "boolean"
      ? car.allowHourlyRental
      : car.rentalUnit === "HOUR";

  if (allowDaily && typeof dailyPrice === "number") return dailyPrice;
  if (allowHourly && typeof hourlyPrice === "number") return hourlyPrice;
  if (typeof dailyPrice === "number") return dailyPrice;
  if (typeof hourlyPrice === "number") return hourlyPrice;
  return null;
}

export function parseOwnerCarStatusFilter(
  value: string | null,
): OwnerCarStatusFilter {
  return OWNER_CAR_STATUS_OPTIONS.some((option) => option.value === value)
    ? (value as OwnerCarStatusFilter)
    : "ALL";
}

export function parseOwnerCarSort(value: string | null): OwnerCarSort {
  return OWNER_CAR_SORT_OPTIONS.some((option) => option.value === value)
    ? (value as OwnerCarSort)
    : "UPDATED_DESC";
}

export function countOwnerCars(
  cars: OwnerCarListItem[],
): OwnerCarStatusCounts {
  const activeCars = cars.filter((car) => !car.isDeleted);

  return {
    ALL: activeCars.length,
    PENDING: activeCars.filter((car) => car.status === "PENDING").length,
    APPROVED: activeCars.filter((car) => car.status === "APPROVED").length,
    RENTED: activeCars.filter((car) => car.status === "RENTED").length,
    REJECTED: activeCars.filter((car) => car.status === "REJECTED").length,
    HIDDEN: activeCars.filter(isOwnerCarHidden).length,
  };
}

function compareOptionalNumber(
  first: number | null,
  second: number | null,
  direction: "asc" | "desc",
) {
  const firstValid = typeof first === "number" && Number.isFinite(first);
  const secondValid = typeof second === "number" && Number.isFinite(second);

  if (!firstValid && !secondValid) return 0;
  if (!firstValid) return 1;
  if (!secondValid) return -1;
  return direction === "asc" ? first - second : second - first;
}

function getUpdatedTimestamp(car: OwnerCarListItem) {
  const value = car.updatedAt || car.createdAt;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function filterAndSortOwnerCars<T extends OwnerCarListItem>(
  cars: T[],
  search: string,
  status: OwnerCarStatusFilter,
  sort: OwnerCarSort,
) {
  const normalizedSearch = normalizeText(search);
  const normalizedPlateSearch = normalizePlate(search);

  const filtered = cars.filter((car) => {
    if (car.isDeleted) return false;

    if (normalizedSearch) {
      const text = normalizeText(
        [
          car.carCode || "",
          car.name,
          car.licensePlate || "",
          getBrandName(car),
        ].join(" "),
      );
      const plateMatches =
        normalizedPlateSearch.length > 0 &&
        normalizePlate(car.licensePlate || "").includes(normalizedPlateSearch);

      if (!text.includes(normalizedSearch) && !plateMatches) return false;
    }

    if (status === "HIDDEN") return isOwnerCarHidden(car);
    if (status !== "ALL" && car.status !== status) return false;
    return true;
  });

  return [...filtered].sort((first, second) => {
    if (sort === "UPDATED_ASC") {
      return getUpdatedTimestamp(first) - getUpdatedTimestamp(second);
    }
    if (sort === "UPDATED_DESC") {
      return getUpdatedTimestamp(second) - getUpdatedTimestamp(first);
    }
    if (sort === "NAME_ASC" || sort === "NAME_DESC") {
      const comparison = first.name.localeCompare(second.name, "vi", {
        sensitivity: "base",
      });
      return sort === "NAME_ASC" ? comparison : -comparison;
    }
    if (sort === "PRICE_ASC" || sort === "PRICE_DESC") {
      return compareOptionalNumber(
        getOwnerCarRepresentativePrice(first),
        getOwnerCarRepresentativePrice(second),
        sort === "PRICE_ASC" ? "asc" : "desc",
      );
    }

    return compareOptionalNumber(
      first.currentOdometerKm ?? null,
      second.currentOdometerKm ?? null,
      sort === "ODO_ASC" ? "asc" : "desc",
    );
  });
}
