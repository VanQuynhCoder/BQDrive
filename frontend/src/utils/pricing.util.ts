import type { CarPricing, RentalMode } from "../types/pricing";

export function hasPricingNumber(
  value: number | null | undefined,
): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

export function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)} đồng`;
}

export function formatCurrencyWithUnit(
  value: number | null | undefined,
  unit: "ngày" | "giờ",
) {
  return hasPricingNumber(value)
    ? `${formatCurrency(value)}/${unit}`
    : "Chưa cập nhật giá";
}

export function getBaseRentalPrice(input: {
  pricing?: CarPricing | null;
  allowDailyRental?: boolean;
  allowHourlyRental?: boolean;
  rentalUnit?: string;
}) {
  const allowDailyRental =
    typeof input.allowDailyRental === "boolean"
      ? input.allowDailyRental
      : input.rentalUnit !== "HOUR";
  const allowHourlyRental =
    typeof input.allowHourlyRental === "boolean"
      ? input.allowHourlyRental
      : input.rentalUnit === "HOUR";

  if (!allowDailyRental && allowHourlyRental) {
    return {
      price: input.pricing?.basePricePerHour,
      unit: "giờ" as const,
      mode: "HOURLY" as RentalMode,
      label: "Thuê theo giờ",
    };
  }

  return {
    price: input.pricing?.basePricePerDay,
    unit: "ngày" as const,
    mode: "DAILY" as RentalMode,
    label: "Thuê theo ngày",
  };
}

export function hasAnySurcharge(pricing?: CarPricing | null) {
  return [
    pricing?.weekendSurchargePerDay,
    pricing?.holidaySurchargePerDay,
    pricing?.weekendSurchargePerHour,
    pricing?.holidaySurchargePerHour,
  ].some((value) => hasPricingNumber(value) && value > 0);
}

