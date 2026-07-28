const vietnameseIntegerFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

export function parseNonNegativeIntegerInput(
  value: number | string | null | undefined,
) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  const digitsOnly = value.replace(/\D/g, "");

  if (!digitsOnly) {
    return null;
  }

  const numericValue = Number(digitsOnly);
  return Number.isSafeInteger(numericValue) ? numericValue : null;
}

export function formatNonNegativeIntegerInput(
  value: number | string | null | undefined,
) {
  const numericValue = parseNonNegativeIntegerInput(value);
  return numericValue === null
    ? ""
    : vietnameseIntegerFormatter.format(numericValue);
}
