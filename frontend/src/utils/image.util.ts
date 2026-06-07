export const defaultCarImage =
  "https://images.unsplash.com/photo-1549924231-f129b911e442?q=80&w=1200";

const apiOrigin = "http://localhost:5000";

export function normalizeImageUrl(image?: string) {
  const value = image?.trim();

  if (!value) return "";

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  if (value.startsWith("//")) {
    return `${window.location.protocol}${value}`;
  }

  if (value.startsWith("/")) {
    return `${apiOrigin}${value}`;
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length > 100) {
    return `data:image/jpeg;base64,${value}`;
  }

  return value;
}

export function getFirstCarImage(images?: string[], fallback = defaultCarImage) {
  const image = Array.isArray(images)
    ? images.find((item) => typeof item === "string" && item.trim())
    : "";

  return normalizeImageUrl(image) || fallback;
}
