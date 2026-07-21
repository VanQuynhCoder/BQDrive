import { ErrorHelper } from "../base/error";
import {
  PricingDateTypeEnum,
  RentalModeEnum,
  RentalUnitEnum,
} from "../constants/model.const";
import { HolidayCalendarModel } from "../models/holiday-calendar/holidayCalendar.model";

const HOUR_MS = 1000 * 60 * 60;
const DAY_MS = HOUR_MS * 24;

export function normalizeRentalMode(mode?: string) {
  if (mode === RentalModeEnum.HOURLY || mode === RentalUnitEnum.HOUR) {
    return RentalModeEnum.HOURLY;
  }

  if (mode === RentalModeEnum.DAILY || mode === RentalUnitEnum.DAY) {
    return RentalModeEnum.DAILY;
  }

  return undefined;
}

export function getCarRentalSupport(car: any) {
  const allowDailyRental =
    typeof car.allowDailyRental === "boolean"
      ? car.allowDailyRental
      : car.rentalUnit !== RentalUnitEnum.HOUR;
  const allowHourlyRental =
    typeof car.allowHourlyRental === "boolean"
      ? car.allowHourlyRental
      : car.rentalUnit === RentalUnitEnum.HOUR;

  return { allowDailyRental, allowHourlyRental };
}

function toFinitePrice(value: unknown, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : fallback;
}

function getPricingConfig(car: any) {
  const pricing = car?.pricing || {};
  const weekdayPricePerDay = toFinitePrice(
    pricing.weekdayPricePerDay ?? car?.pricePerDay,
  );
  const weekendPricePerDay = toFinitePrice(
    pricing.weekendPricePerDay,
    weekdayPricePerDay,
  );
  const holidayPricePerDay = toFinitePrice(
    pricing.holidayPricePerDay,
    weekendPricePerDay || weekdayPricePerDay,
  );
  const pricePerHour = toFinitePrice(pricing.pricePerHour ?? car?.pricePerHour);
  const weekendPricePerHour = toFinitePrice(
    pricing.weekendPricePerHour,
    pricePerHour,
  );
  const holidayPricePerHour = toFinitePrice(
    pricing.holidayPricePerHour,
    weekendPricePerHour || pricePerHour,
  );

  return {
    weekdayPricePerDay,
    weekendPricePerDay,
    holidayPricePerDay,
    pricePerHour,
    weekendPricePerHour,
    holidayPricePerHour,
  };
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getHolidayMap(start: Date, days: number) {
  const rangeStart = startOfDay(start);
  const rangeEnd = addDays(rangeStart, Math.max(days - 1, 0));
  rangeEnd.setHours(23, 59, 59, 999);

  const holidays = await HolidayCalendarModel.find({
    country: "VN",
    type: "HOLIDAY",
    isActive: true,
    isDeleted: { $ne: true },
    $or: [
      {
        startDate: { $lte: rangeEnd },
        endDate: { $gte: rangeStart },
      },
      {
        date: {
          $gte: rangeStart,
          $lte: rangeEnd,
        },
      },
    ],
  } as any).lean();

  const holidayMap = new Map<string, string>();

  holidays.forEach((holiday: any) => {
    const holidayStart = startOfDay(
      new Date(holiday.startDate || holiday.date),
    );
    const holidayEnd = startOfDay(new Date(holiday.endDate || holiday.date));
    const from =
      holidayStart.getTime() > rangeStart.getTime() ? holidayStart : rangeStart;
    const to =
      holidayEnd.getTime() < rangeEnd.getTime()
        ? holidayEnd
        : startOfDay(rangeEnd);

    for (
      let cursor = new Date(from);
      cursor.getTime() <= to.getTime();
      cursor = addDays(cursor, 1)
    ) {
      holidayMap.set(formatDateKey(cursor), holiday.name || "Ngày lễ");
    }
  });

  return holidayMap;
}

function getDateType(date: Date, holidayMap: Map<string, string>) {
  const dateKey = formatDateKey(date);

  if (holidayMap.has(dateKey)) {
    return {
      type: PricingDateTypeEnum.HOLIDAY,
      label: holidayMap.get(dateKey) || "Ngày lễ",
    };
  }

  const day = date.getDay();

  if (day === 0 || day === 6) {
    return {
      type: PricingDateTypeEnum.WEEKEND,
      label: "Cuối tuần",
    };
  }

  return {
    type: PricingDateTypeEnum.WEEKDAY,
    label: "Ngày thường",
  };
}

function getDailyUnitPrice(
  type: PricingDateTypeEnum,
  pricing: ReturnType<typeof getPricingConfig>,
) {
  if (type === PricingDateTypeEnum.HOLIDAY) {
    return pricing.holidayPricePerDay;
  }

  if (type === PricingDateTypeEnum.WEEKEND) {
    return pricing.weekendPricePerDay;
  }

  return pricing.weekdayPricePerDay;
}

function getHourlyUnitPrice(
  type: PricingDateTypeEnum,
  pricing: ReturnType<typeof getPricingConfig>,
) {
  if (type === PricingDateTypeEnum.HOLIDAY) {
    return pricing.holidayPricePerHour;
  }

  if (type === PricingDateTypeEnum.WEEKEND) {
    return pricing.weekendPricePerHour;
  }

  return pricing.pricePerHour;
}

export async function calculateRentalPrice(
  car: any,
  start: Date,
  end: Date,
  rentalMode?: string,
) {
  const diffMs = end.getTime() - start.getTime();

  if (diffMs <= 0) {
    throw ErrorHelper.requestDataInvalid("Thời gian thuê không hợp lệ");
  }

  const diffHours = diffMs / HOUR_MS;
  const selectedRentalMode =
    normalizeRentalMode(rentalMode) ||
    normalizeRentalMode(car.rentalMode) ||
    normalizeRentalMode(car.rentalUnit) ||
    RentalModeEnum.DAILY;
  const { allowDailyRental, allowHourlyRental } = getCarRentalSupport(car);
  const pricing = getPricingConfig(car);

  if (selectedRentalMode === RentalModeEnum.HOURLY) {
    if (!allowHourlyRental) {
      throw ErrorHelper.requestDataInvalid("Xe không hỗ trợ thuê theo giờ");
    }

    if (!pricing.pricePerHour || pricing.pricePerHour <= 0) {
      throw ErrorHelper.requestDataInvalid("Xe cần có giá thuê theo giờ");
    }

    const totalHours = Math.max(1, Math.ceil(diffHours));

    if (totalHours < 2 || totalHours > 24) {
      throw ErrorHelper.requestDataInvalid(
        "Thuê theo giờ chỉ hỗ trợ từ 2 đến 24 giờ",
      );
    }

    const holidayMap = await getHolidayMap(start, 1);
    const dateInfo = getDateType(start, holidayMap);
    const unitPrice = getHourlyUnitPrice(dateInfo.type, pricing);
    const subtotal = totalHours * unitPrice;

    return {
      totalTime: totalHours,
      rentalMode: RentalModeEnum.HOURLY,
      rentalUnit: RentalUnitEnum.HOUR,
      totalPrice: subtotal,
      pricingSnapshot: {
        rentalMode: RentalModeEnum.HOURLY,
        ...pricing,
        breakdown: [
          {
            date: formatDateKey(start),
            type: dateInfo.type,
            label: dateInfo.label,
            unitCount: totalHours,
            unitPrice,
            price: subtotal,
          },
        ],
        subtotal,
      },
    };
  }

  if (!allowDailyRental) {
    throw ErrorHelper.requestDataInvalid("Xe không hỗ trợ thuê theo ngày");
  }

  if (!pricing.weekdayPricePerDay || pricing.weekdayPricePerDay <= 0) {
    throw ErrorHelper.requestDataInvalid("Xe cần có giá thuê theo ngày");
  }

  const rentalDays = Math.max(1, Math.ceil(diffHours / 24));
  const holidayMap = await getHolidayMap(start, rentalDays);
  const breakdown = Array.from({ length: rentalDays }, (_, index) => {
    const rentalDate = addDays(startOfDay(start), index);
    const dateInfo = getDateType(rentalDate, holidayMap);
    const unitPrice = getDailyUnitPrice(dateInfo.type, pricing);

    return {
      date: formatDateKey(rentalDate),
      type: dateInfo.type,
      label: dateInfo.label,
      unitCount: 1,
      unitPrice,
      price: unitPrice,
    };
  });
  const subtotal = breakdown.reduce((sum, item) => sum + item.price, 0);

  return {
    totalTime: rentalDays,
    rentalMode: RentalModeEnum.DAILY,
    rentalUnit: RentalUnitEnum.DAY,
    totalPrice: subtotal,
    pricingSnapshot: {
      rentalMode: RentalModeEnum.DAILY,
      ...pricing,
      breakdown,
      subtotal,
    },
  };
}
