export enum UserRoleEnum {
  ADMIN = "ADMIN",
  BUSINESS = "BUSINESS",
  CUSTOMER = "CUSTOMER",
  PRIVATE_OWNER = "PRIVATE_OWNER",
}
export enum BusinessTypeEnum {
  COMPANY = "COMPANY",
  INDIVIDUAL = "INDIVIDUAL",
}
export enum CarStatusEnum {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  RENTED = "RENTED",
  REJECTED = "REJECTED",
  HIDDEN = "HIDDEN",
}
export enum CarTypeEnum {
  SUV = "SUV",
  SEDAN = "SEDAN",
  HATCHBACK = "HATCHBACK",
  PICKUP = "PICKUP",
  MPV = "MPV",
  COUPE = "COUPE",
  CONVERTIBLE = "CONVERTIBLE",
  ELECTRIC = "ELECTRIC",
}

export enum FuelTypeEnum {
  GASOLINE = "GASOLINE",
  DIESEL = "DIESEL",
  ELECTRIC = "ELECTRIC",
  HYBRID = "HYBRID",
}

export enum TransmissionEnum {
  AUTOMATIC = "AUTOMATIC",
  MANUAL = "MANUAL",
}
export enum CartStatusEnum {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  BOOKED = "BOOKED",
  CANCELLED = "CANCELLED",
}

export enum BookingStatusEnum {
  PENDING = "PENDING",
  WAITING_PAYMENT = "WAITING_PAYMENT",
  CONFIRMED = "CONFIRMED",
  IN_PROGRESS = "IN_PROGRESS",
  CANCELLED = "CANCELLED",
  REJECTED = "REJECTED",
  COMPLETED = "COMPLETED",
  NO_SHOW = "NO_SHOW",
}

export enum PaymentStatusEnum {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum PaymentMethodEnum {
  CASH = "CASH",
  BANKING = "BANKING",
  MOMO = "MOMO",
  VNPAY = "VNPAY",
}
export enum PaymentOptionEnum {
  DEPOSIT = "DEPOSIT",
  FULL = "FULL",
}

export enum PaymentTypeEnum {
  DEPOSIT = "DEPOSIT",
  FULL = "FULL",
  REMAINING = "REMAINING",
}
export enum RentalUnitEnum {
  DAY = "DAY",
  HOUR = "HOUR",
}
export enum RentalModeEnum {
  DAILY = "DAILY",
  HOURLY = "HOURLY",
}
export enum PrivateOwnerRequestStatusEnum {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}
export enum ContractStatusEnum {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}
export enum OwnerTypeEnum {
  BUSINESS = "BUSINESS",
  PRIVATE_OWNER = "PRIVATE_OWNER",
}
