export type AddressLike = {
  pickupAddress?: string;
  pickupFormattedAddress?: string;
  pickupProvince?: string;
  pickupDistrict?: string;
  pickupWard?: string;
  pickupNote?: string;
  pickupLocationText?: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  ward?: string;
  locationNote?: string;
};

function clean(value?: string) {
  return typeof value === "string" ? value.trim() : "";
}

export function getCityOrProvince(address?: AddressLike | null) {
  if (!address) return "";
  return clean(address.pickupProvince) || clean(address.city) || clean(address.province);
}

export function formatAddressArea(
  address?: AddressLike | null,
  fallback = "Khu vực đang cập nhật",
) {
  if (!address) return fallback;
  const value = [
    clean(address.pickupDistrict) || clean(address.district),
    getCityOrProvince(address),
  ]
    .filter(Boolean)
    .join(", ");

  return value || fallback;
}

export function formatFullAddress(
  address?: AddressLike | null,
  fallback = "Địa chỉ đang cập nhật",
) {
  if (!address) return fallback;
  const detail =
    clean(address.pickupFormattedAddress) ||
    clean(address.pickupAddress) ||
    clean(address.address);
  const parts = [
    detail,
    clean(address.pickupWard) || clean(address.ward),
    clean(address.pickupDistrict) || clean(address.district),
    getCityOrProvince(address),
  ].filter(Boolean);
  const value = Array.from(new Set(parts)).join(", ");

  return value || fallback;
}

export function formatPickupAddress(
  address?: AddressLike | null,
  options: { includeDetail?: boolean; includeNote?: boolean; fallback?: string } = {},
) {
  const includeDetail = options.includeDetail ?? true;
  const fallback = options.fallback || "Địa điểm nhận xe đang cập nhật";
  const value = includeDetail
    ? formatFullAddress(address, "")
    : formatAddressArea(address, "");
  const note = clean(address?.pickupNote) || clean(address?.locationNote);

  if (options.includeNote && note && includeDetail) {
    return value ? `${value} (${note})` : note;
  }

  return value || fallback;
}

export function formatAddressSnapshot(
  snapshot?: string,
  fallbackAddress?: AddressLike | null,
  fallback = "Địa điểm nhận xe đang cập nhật",
) {
  return clean(snapshot) || formatPickupAddress(fallbackAddress, { fallback });
}
