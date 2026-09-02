import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

// ─── Cloudinary config ────────────────────────────────────────────────────────

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ─── Cloudinary multer storage ────────────────────────────────────────────────

// params cast: KnownKeys<UploadApiOptions> collapses to never due to index
// signature on the cloudinary type, making all known keys unrecognised.
const storage = new CloudinaryStorage({
  cloudinary,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: {
    folder: "prayosha-products",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [
      { width: 1200, height: 1200, crop: "limit", quality: "auto" },
    ],
  } as any,
});

const videoStorage = new CloudinaryStorage({
  cloudinary,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: {
    folder: "prayosha-products/videos",
    resource_type: "video",
    allowed_formats: ["mp4", "webm", "mov", "m4v"],
  } as any,
});

// ─── File filter ──────────────────────────────────────────────────────────────

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, "Only JPG, PNG, and WebP images are allowed"));
  }
};

const videoFileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowed = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, "Only MP4, WebM, and MOV videos are allowed"));
  }
};

// ─── Multer instance ──────────────────────────────────────────────────────────

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
  },
});

export const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ─── Manual upload from buffer ────────────────────────────────────────────────

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export const uploadToCloudinary = (
  buffer: Buffer,
  folder = "prayosha-products"
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        transformation: [
          { width: 1200, height: 1200, crop: "limit", quality: "auto" },
        ],
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new ApiError(500, "Cloudinary upload failed"));
          return;
        }
        resolve({
          public_id: result.public_id,
          secure_url: result.secure_url,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );
    stream.end(buffer);
  });
};

// ─── Delete by public_id ──────────────────────────────────────────────────────

export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: "image" | "video" = "image"
): Promise<{ result: string }> => {
  const response = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  if (response.result !== "ok" && response.result !== "not found") {
    throw new ApiError(500, `Cloudinary delete failed: ${response.result}`);
  }
  return { result: response.result as string };
};
