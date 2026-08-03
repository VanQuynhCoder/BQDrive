import { ErrorHelper } from "../base/error";

const PHONE_PATTERN = /^0\d{9}$/;
const TWELVE_DIGITS_PATTERN = /^\d{12}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const LICENSE_PLATE_PATTERN = /^\d{2}[A-Z]-?(\d{5}|\d{3}\.\d{2})$/;

const COMMON_EMAIL_DOMAIN_TYPOS: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmaill.com": "gmail.com",
  "hotmai.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outllook.com": "outlook.com",
  "outlook.co": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
};

export const PHONE_INVALID_MESSAGE =
  "Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng 0.";
export const CCCD_INVALID_MESSAGE = "CCCD phải gồm đúng 12 chữ số.";
export const DRIVER_LICENSE_INVALID_MESSAGE =
  "Số bằng lái xe phải gồm đúng 12 chữ số.";
export const PLATE_DUPLICATED_MESSAGE =
  "Biển số xe đã tồn tại trong hệ thống.";

export function onlyDigits(value: unknown, maxLength?: number) {
  const digits = String(value || "").replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

export function normalizePhone(value: unknown) {
  return onlyDigits(value, 10);
}

export function isValidVietnamPhone(value: unknown) {
  return PHONE_PATTERN.test(String(value || ""));
}

export function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function getEmailValidationError(value: unknown, label = "Email") {
  const email = normalizeEmail(value);

  if (!email) return `Vui lòng nhập ${label.toLowerCase()}`;

  if (
    email.length > 254 ||
    !EMAIL_PATTERN.test(email) ||
    email.startsWith(".") ||
    email.includes("..")
  ) {
    return `${label} không hợp lệ`;
  }

  const domain = email.slice(email.lastIndexOf("@") + 1);
  const suggestedDomain = COMMON_EMAIL_DOMAIN_TYPOS[domain];

  if (suggestedDomain) {
    return `${label} có thể bị nhập sai. Vui lòng kiểm tra lại domain ${suggestedDomain}`;
  }

  return "";
}

export function isValidEmail(value: unknown) {
  return !getEmailValidationError(value);
}

export function validateEmail(value: unknown, label = "Email") {
  const email = normalizeEmail(value);
  const error = getEmailValidationError(email, label);

  if (error) {
    throw ErrorHelper.requestDataInvalid(error);
  }

  return email;
}

export function validatePhone(value: unknown, required = true) {
  const phone = normalizePhone(value);

  if (!phone && !required) return "";

  if (!isValidVietnamPhone(phone)) {
    throw ErrorHelper.requestDataInvalid(PHONE_INVALID_MESSAGE);
  }

  return phone;
}

export function normalizeCccd(value: unknown) {
  return onlyDigits(value, 12);
}

export function isValidCccd(value: unknown) {
  return TWELVE_DIGITS_PATTERN.test(String(value || ""));
}

export function validateCccd(value: unknown, required = true) {
  const cccd = normalizeCccd(value);

  if (!cccd && !required) return "";

  if (!isValidCccd(cccd)) {
    throw ErrorHelper.requestDataInvalid(CCCD_INVALID_MESSAGE);
  }

  return cccd;
}

export function normalizeDriverLicense(value: unknown) {
  return onlyDigits(value, 12);
}

export function isValidDriverLicense(value: unknown) {
  return TWELVE_DIGITS_PATTERN.test(String(value || ""));
}

export function validateDriverLicense(value: unknown, required = true) {
  const driverLicense = normalizeDriverLicense(value);

  if (!driverLicense && !required) return "";

  if (!isValidDriverLicense(driverLicense)) {
    throw ErrorHelper.requestDataInvalid(DRIVER_LICENSE_INVALID_MESSAGE);
  }

  return driverLicense;
}

export function normalizePlateNumber(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
}

export function getPlateNumberKey(value: unknown) {
  return normalizePlateNumber(value).replace(/-/g, "").replace(/\./g, "");
}

export function validatePlateNumber(value: unknown, required = false) {
  const plateNumber = normalizePlateNumber(value);

  if (!plateNumber && !required) return "";

  if (!LICENSE_PLATE_PATTERN.test(plateNumber)) {
    throw ErrorHelper.requestDataInvalid(
      "Biển số ô tô không hợp lệ. Ví dụ đúng: 30A-123.45 hoặc 30A12345.",
    );
  }

  return plateNumber;
}
