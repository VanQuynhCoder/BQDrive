// Kiểu dữ liệu dùng chung cho nghiệp vụ tính giá thuê 
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

  rentalDepositRate?: number;
  rentalDepositAmount?: number;

  platformFeeRate?: number;
  platformFee?: number;

  insuranceFeePerDay?: number;
  insuranceDays?: number;
  insuranceFee?: number;

  upfrontPaymentAmount?: number;

  deliveryFee?: number;
  totalPrice?: number;

  delivery?: PricingDeliverySnapshot;
};
