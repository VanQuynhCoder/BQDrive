// Shared pricing contract: consumed by public, ADMIN, BUSINESS, and USER modules.
export type RentalMode = "DAILY" | "HOURLY";

export type PricingDateType = "WEEKDAY" | "WEEKEND" | "HOLIDAY";

export type CarPricing = {
  basePricePerDay?: number | null;
  weekendSurchargePerDay?: number | null;
  holidaySurchargePerDay?: number | null;
  basePricePerHour?: number | null;
  weekendSurchargePerHour?: number | null;
  holidaySurchargePerHour?: number | null;
};

export type PricingBreakdownItem = {
  dateOrTime: string;
  priceType: PricingDateType;
  basePrice: number;
  surchargeAmount: number;
  finalPrice: number;
  unitCount: number;
  price: number;
};

export type PricingDeliverySnapshot = {
  deliveryType?: string;
  deliveryAddress?: string;
  deliveryAddressText?: string;
  deliveryFormattedAddress?: string;
  deliveryDistanceKm?: number;
  deliveryDurationText?: string;
  deliveryFee?: number;
};

export type PricingSnapshot = {
  rentalMode?: RentalMode;
  basePricePerUnit?: number;
  weekendSurchargePerUnit?: number;
  holidaySurchargePerUnit?: number;
  breakdown?: PricingBreakdownItem[];
  subtotal?: number;
  rentalSubtotal?: number;
  deliveryFee?: number;
  totalPrice?: number;
  delivery?: PricingDeliverySnapshot;
};
