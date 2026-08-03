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

export function onlyDigits(value: string, maxLength?: number) {
  const digits = value.replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

export function normalizePhone(value: string) {
  return onlyDigits(value, 10);
}

export function isValidVietnamPhone(value: string) {
  return PHONE_PATTERN.test(value);
}

export function normalizeCccd(value: string) {
  return onlyDigits(value, 12);
}

export function isValidCccd(value: string) {
  return TWELVE_DIGITS_PATTERN.test(value);
}

export function normalizeDriverLicense(value: string) {
  return onlyDigits(value, 12);
}

export function isValidDriverLicense(value: string) {
  return TWELVE_DIGITS_PATTERN.test(value);
}

export function normalizePlateNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/[–—]/g, "-");
}

export function isValidPlateNumber(value: string) {
  return LICENSE_PLATE_PATTERN.test(normalizePlateNumber(value));
}

export function sanitizePlateNumberInput(value: string) {
  const normalizedValue = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^0-9A-Z.-]/g, "");
  let result = "";

  for (const char of normalizedValue) {
    if (result.length < 2) {
      if (/\d/.test(char)) result += char;
      continue;
    }

    if (result.length === 2) {
      if (/[A-Z]/.test(char)) result += char;
      continue;
    }

    const suffix = result.slice(3);
    const suffixDigitCount = suffix.replace(/\D/g, "").length;

    if (char === "-" && result.length === 3 && !suffix.includes("-")) {
      result += char;
      continue;
    }

    if (
      char === "." &&
      suffixDigitCount === 3 &&
      !suffix.includes(".")
    ) {
      result += char;
      continue;
    }

    if (/\d/.test(char) && suffixDigitCount < 5) {
      result += char;
    }
  }

  return result;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getEmailValidationError(value: string, label = "Email") {
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

export function isValidEmail(value: string) {
  return !getEmailValidationError(value);
}
