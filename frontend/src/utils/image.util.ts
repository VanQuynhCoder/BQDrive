//Hàm hỗ trợ chuẩn hóa đường dẫn hình ảnh trong frontend.
export const defaultCarImage =
  "https://images.unsplash.com/photo-1549924231-f129b911e442?q=80&w=1200";

function getApiOrigin() {
  const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();

  if (!configuredApiUrl) return "http://localhost:5000";

  try {
    return new URL(configuredApiUrl, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

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
    return `${getApiOrigin()}${value}`;
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



