export enum UserRoleEnum {
  ADMIN = "ADMIN",
  BUSINESS = "BUSINESS",
  USER = "USER",
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
  REQUESTED = "REQUESTED", // Khách đã gửi yêu cầu thuê, đang chờ chủ xe duyệt
  OWNER_APPROVED = "OWNER_APPROVED", // Chủ xe đã đồng ý cho thuê, khách có thể tạo hợp đồng/thanh toán
  PAYMENT_PENDING = "PAYMENT_PENDING", // Khách đã bắt đầu thanh toán, hệ thống đang chờ kết quả/ghi nhận
  PAID = "PAID", // Khách đã thanh toán đủ khoản cần trả trước, lịch thuê được giữ chính thức
  IN_PROGRESS = "IN_PROGRESS", // Chủ xe đã bàn giao xe, chuyến thuê đang diễn ra
  COMPLETED = "COMPLETED", // Chuyến thuê đã hoàn tất
  CANCELLED = "CANCELLED", // Khách hoặc hệ thống đã hủy booking
  REJECTED = "REJECTED", // Chủ xe từ chối yêu cầu thuê
  NO_SHOW = "NO_SHOW", // Khách không đến nhận xe đúng lịch
  PENDING = "PENDING", // Trạng thái cũ: tương đương REQUESTED, giữ lại để đọc dữ liệu cũ
  WAITING_PAYMENT = "WAITING_PAYMENT", // Trạng thái cũ: tương đương PAYMENT_PENDING, giữ lại để đọc dữ liệu cũ
  CONFIRMED = "CONFIRMED", // Trạng thái cũ: tương đương OWNER_APPROVED/PAID tùy ngữ cảnh, giữ lại để đọc dữ liệu cũ
}

export enum PaymentStatusEnum {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum PaymentMethodEnum {
  CASH = "CASH",
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
export enum DeliveryTypeEnum {
  PICKUP_AT_CAR_LOCATION = "PICKUP_AT_CAR_LOCATION",
  DELIVERY_TO_CUSTOMER = "DELIVERY_TO_CUSTOMER",
}
export enum DeliveryAddressSourceEnum {
  MANUAL_TEXT = "MANUAL_TEXT",
  GEOCODE = "GEOCODE",
  CURRENT_LOCATION = "CURRENT_LOCATION",
  MAP_PIN = "MAP_PIN",
}
export enum ExtraChargeTypeEnum {
  CLEANING = "CLEANING",
  DAMAGE = "DAMAGE",
  LATE_RETURN = "LATE_RETURN",
  FUEL = "FUEL",
  OTHER = "OTHER",
}
export enum ExtraChargeStatusEnum {
  PENDING = "PENDING",
  PAID = "PAID",
  CANCELLED = "CANCELLED",
}
export enum RentalUnitEnum {
  DAY = "DAY",
  HOUR = "HOUR",
}
export enum RentalModeEnum {
  DAILY = "DAILY",
  HOURLY = "HOURLY",
}
export enum PricingDateTypeEnum {
  WEEKDAY = "WEEKDAY",
  WEEKEND = "WEEKEND",
  HOLIDAY = "HOLIDAY",
}
export enum ContractStatusEnum {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}
export enum OwnerTypeEnum {
  BUSINESS = "BUSINESS",
  USER = "USER",
}
