import { generateSequentialCode } from "./sequence-code.helper";

const BOOKING_CODE_SEQUENCE_KEY = "BOOKING_CODE";
const BOOKING_CODE_PREFIX = "BQD-BK-";
const BOOKING_CODE_DIGITS = 6;

export async function generateBookingCode() {
  return generateSequentialCode({
    key: BOOKING_CODE_SEQUENCE_KEY,
    prefix: BOOKING_CODE_PREFIX,
    digits: BOOKING_CODE_DIGITS,
  });
}

export function getBookingDisplayCode(booking: unknown) {
  const source = (booking || {}) as {
    _id?: unknown;
    bookingCode?: unknown;
  };
  const bookingCode = String(source.bookingCode || "").trim().toUpperCase();

  if (bookingCode) return bookingCode;

  const id = String(source._id || booking || "").trim();
  return id ? id.slice(-8).toUpperCase() : "--";
}
