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

export const uploadService = {
  uploadCarImage: async (file: File) => {
    const formData = new FormData();
    formData.append("image", file);

    const res = await api.post("/uploads/car-image", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return unwrap<{ image: UploadedCarImage }>(res).image;
  },
};
