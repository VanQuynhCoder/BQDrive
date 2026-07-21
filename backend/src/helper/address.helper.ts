import { ErrorHelper } from "../base/error";

export type AddressLike = {
  pickupAddress?: unknown;
  pickupFormattedAddress?: unknown;
  pickupPlaceId?: unknown;
  pickupLat?: unknown;
  pickupLng?: unknown;
  pickupProvince?: unknown;
  pickupDistrict?: unknown;
  pickupWard?: unknown;
  pickupNote?: unknown;
  pickupLocationText?: unknown;
  address?: unknown;
  ward?: unknown;
  district?: unknown;
  city?: unknown;
  province?: unknown;
  locationNote?: unknown;
};

export function cleanAddressText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getCityOrProvince(address: AddressLike) {
  return (
    cleanAddressText(address.pickupProvince) ||
    cleanAddressText(address.city) ||
    cleanAddressText(address.province)
  );
}

export function formatAddress(address: AddressLike, includeNote = false) {
  const detail =
    cleanAddressText(address.pickupFormattedAddress) ||
    cleanAddressText(address.pickupAddress) ||
    cleanAddressText(address.address);
  const cityOrProvince = getCityOrProvince(address);
  const parts = [
    detail,
    cleanAddressText(address.pickupWard) || cleanAddressText(address.ward),
    cleanAddressText(address.pickupDistrict) ||
      cleanAddressText(address.district),
    cityOrProvince,
  ].filter(Boolean);
  const value = Array.from(new Set(parts)).join(", ");
  const note =
    cleanAddressText(address.pickupNote) || cleanAddressText(address.locationNote);

  if (includeNote && note) {
    return value ? `${value} (${note})` : note;
  }

  return value;
}

export function formatAddressArea(address: AddressLike) {
  return [
    cleanAddressText(address.pickupDistrict) ||
      cleanAddressText(address.district),
    getCityOrProvince(address),
  ].filter(Boolean).join(", ");
}

export function normalizeCarAddressFields(body: Record<string, unknown>) {
  const pickupFormattedAddress = cleanAddressText(body.pickupFormattedAddress);
  const pickupAddress =
    pickupFormattedAddress ||
    cleanAddressText(body.pickupAddress) || cleanAddressText(body.address);
  const pickupPlaceId = cleanAddressText(body.pickupPlaceId);
  const province =
    cleanAddressText(body.pickupProvince) ||
    cleanAddressText(body.province) ||
    cleanAddressText(body.city);
  const district =
    cleanAddressText(body.pickupDistrict) || cleanAddressText(body.district);
  const ward = cleanAddressText(body.pickupWard) || cleanAddressText(body.ward);
  const locationNote =
    cleanAddressText(body.pickupNote) || cleanAddressText(body.locationNote);
  const pickupLocationText = [
    pickupAddress,
    ward,
    district,
    province,
  ].filter(Boolean).join(", ");

  return {
    pickupAddress,
    pickupFormattedAddress: pickupFormattedAddress || pickupAddress,
    pickupPlaceId,
    address: cleanAddressText(body.address),
    city: cleanAddressText(body.city) || province,
    province,
    district,
    ward,
    locationNote,
    pickupProvince: province,
    pickupDistrict: district,
    pickupWard: ward,
    pickupNote: locationNote,
    pickupLocationText,
    ...normalizePickupCoordinates(body),
  };
}

function normalizeOptionalCoordinate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") return undefined;

  const coordinate = Number(value);

  if (!Number.isFinite(coordinate)) {
    throw ErrorHelper.requestDataInvalid(`${fieldName} không hợp lệ`);
  }

  return coordinate;
}

function normalizePickupCoordinates(body: Record<string, unknown>) {
  const pickupLat = normalizeOptionalCoordinate(body.pickupLat, "pickupLat");
  const pickupLng = normalizeOptionalCoordinate(body.pickupLng, "pickupLng");

  return {
    ...(pickupLat !== undefined ? { pickupLat, latitude: pickupLat } : {}),
    ...(pickupLng !== undefined ? { pickupLng, longitude: pickupLng } : {}),
  };
}
