export const DEFAULT_BOOKING_BUFFER_HOURS = 3;
export const DEFAULT_CAR_CLEANING_BUFFER_HOURS = 1;

export function getBookingBufferHours() {
  const configuredHours = Number(process.env.BOOKING_BUFFER_HOURS);

  return Number.isFinite(configuredHours) && configuredHours >= 0
    ? configuredHours
    : DEFAULT_BOOKING_BUFFER_HOURS;
}

export function getBufferedAvailabilityRange(start: Date, end: Date) {
  const bufferMs = getBookingBufferHours() * 60 * 60 * 1000;

  return {
    bufferedStart: new Date(start.getTime() - bufferMs),
    bufferedEnd: new Date(end.getTime() + bufferMs),
  };
}

export function getCarCleaningBufferHours() {
  const configuredHours = Number(process.env.CAR_CLEANING_BUFFER_HOURS);

  return Number.isFinite(configuredHours) && configuredHours >= 0
    ? configuredHours
    : DEFAULT_CAR_CLEANING_BUFFER_HOURS;
}

export function getCarCleaningBufferMs() {
  return getCarCleaningBufferHours() * 60 * 60 * 1000;
}

export function getCarCleaningUnavailableUntil(completedAt: Date) {
  return new Date(completedAt.getTime() + getCarCleaningBufferMs());
}
