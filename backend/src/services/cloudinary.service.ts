import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import { ErrorHelper } from "../base/error";

const CAR_IMAGE_FOLDER = "bqdrive/cars";
const LOCAL_CAR_IMAGE_FOLDER = path.resolve(process.cwd(), "uploads", "cars");
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const CLOUDINARY_UPLOAD_RESOURCE_TYPE = "image";
const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type CloudinaryCarImageUpload = {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
};

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

function configureCloudinary() {
  if (!isCloudinaryConfigured()) {
    throw ErrorHelper.somethingWentWrong(
      "Chưa cấu hình Cloudinary cho upload ảnh xe",
    );
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME as string;
  const apiKey = process.env.CLOUDINARY_API_KEY as string;
  const apiSecret = process.env.CLOUDINARY_API_SECRET as string;

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

function getImageMimeFromSignature(buffer: Buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return "";
}

function assertSupportedImage(buffer: Buffer, mimeType?: string) {
  const declaredMimeType = String(mimeType || "").toLowerCase();
  const detectedMimeType = getImageMimeFromSignature(buffer);

  if (!SUPPORTED_IMAGE_MIME_TYPES.has(declaredMimeType)) {
    throw ErrorHelper.requestDataInvalid(
      "Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP",
    );
  }

  if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
    throw ErrorHelper.requestDataInvalid("File ảnh không hợp lệ");
  }
}

function uploadBuffer(buffer: Buffer, folder: string) {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: CLOUDINARY_UPLOAD_RESOURCE_TYPE,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Cloudinary upload failed"));
          return;
        }

        resolve(result);
      },
    );

    uploadStream.end(buffer);
  });
}

function getLocalUploadPublicBaseUrl() {
  return String(
    process.env.LOCAL_UPLOAD_PUBLIC_BASE_URL ||
      process.env.BACKEND_PUBLIC_URL ||
      process.env.BACKEND_URL ||
      "http://localhost:5000",
  ).replace(/\/$/, "");
}

async function uploadLocalCarImageBuffer(file: {
  buffer: Buffer;
  mimetype?: string;
}) {
  const mimeType = String(file.mimetype || "").toLowerCase();
  const extension = IMAGE_EXTENSION_BY_MIME_TYPE[mimeType] || "jpg";
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;

  await fs.mkdir(LOCAL_CAR_IMAGE_FOLDER, { recursive: true });
  await fs.writeFile(path.join(LOCAL_CAR_IMAGE_FOLDER, fileName), file.buffer);

  return {
    url: `${getLocalUploadPublicBaseUrl()}/api/uploads/static/cars/${fileName}`,
    publicId: `local/cars/${fileName}`,
    bytes: file.buffer.length,
    format: extension,
  } satisfies CloudinaryCarImageUpload;
}

export async function uploadCarImageBuffer(file: {
  buffer: Buffer;
  mimetype?: string;
}) {
  assertSupportedImage(file.buffer, file.mimetype);

  if (!isCloudinaryConfigured()) {
    return uploadLocalCarImageBuffer(file);
  }

  configureCloudinary();

  const result = await uploadBuffer(file.buffer, CAR_IMAGE_FOLDER);

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
  } satisfies CloudinaryCarImageUpload;
}

export function toCloudinaryCardThumbnailUrl(imageUrl?: string) {
  const value = String(imageUrl || "").trim();

  if (!value || value.startsWith("data:image/")) return value;
  if (!value.includes("res.cloudinary.com") || !value.includes("/image/upload/")) {
    return value;
  }

  return value.replace(
    "/image/upload/",
    "/image/upload/f_auto,q_auto,c_fill,w_600,h_400/",
  );
}
