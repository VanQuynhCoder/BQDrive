export const RENTAL_POLICY = Object.freeze({
  hourly: Object.freeze({
    minHours: 4,
    maxTotalHours: 24,
    minExtensionHours: 2,
  }),
  daily: Object.freeze({
    minDays: 1,
    minExtensionDays: 1,
    keepReturnTimeOnExtension: true,
  }),
});

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const HOURLY_RENTAL_MIN_HOURS = RENTAL_POLICY.hourly.minHours;
export const HOURLY_RENTAL_MAX_TOTAL_HOURS =
  RENTAL_POLICY.hourly.maxTotalHours;
export const HOURLY_EXTENSION_MIN_HOURS =
  RENTAL_POLICY.hourly.minExtensionHours;
export const DAILY_EXTENSION_MIN_DAYS =
  RENTAL_POLICY.daily.minExtensionDays;
