export const DEFAULT_BOOKING_BUFFER_HOURS = 3;

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
