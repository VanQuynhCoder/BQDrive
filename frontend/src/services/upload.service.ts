// Shared upload API: car/profile/evidence images used across role-specific forms.
import api from "./api";

export type UploadedCarImage = {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
};

type ApiData<T> = {
  data: T;
};

function unwrap<T>(response: { data: ApiData<T> }) {
  return response.data.data;
}

function resolveUploadedImageUrl(url: string) {
  if (!url || /^(?:https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  const apiBaseUrl = String(api.defaults.baseURL || "/api");
  const absoluteApiBaseUrl = new URL(apiBaseUrl, window.location.origin);
  return new URL(url, absoluteApiBaseUrl.origin).toString();
}

export const uploadService = {
  uploadCarImage: async (file: File) => {
    const formData = new FormData();
    formData.append("image", file);

    const res = await api.post("/uploads/car-image", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    const image = unwrap<{ image: UploadedCarImage }>(res).image;
    return {
      ...image,
      url: resolveUploadedImageUrl(image.url),
    };
  },
};
