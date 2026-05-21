import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("8000"),
  MONGODB_URI: z.string({ required_error: "MONGODB_URI is required" }).min(1),
  JWT_SECRET: z.string({ required_error: "JWT_SECRET is required" }).min(1),
  JWT_EXPIRY: z.string().default("7d"),
  REFRESH_TOKEN_SECRET: z
    .string({ required_error: "REFRESH_TOKEN_SECRET is required" })
    .min(1),
  REFRESH_TOKEN_EXPIRY: z.string().default("7d"),
  CLOUDINARY_CLOUD_NAME: z
    .string({ required_error: "CLOUDINARY_CLOUD_NAME is required" })
    .min(1),
  CLOUDINARY_API_KEY: z
    .string({ required_error: "CLOUDINARY_API_KEY is required" })
    .min(1),
  CLOUDINARY_API_SECRET: z
    .string({ required_error: "CLOUDINARY_API_SECRET is required" })
    .min(1),
  FRONTEND_URL: z.string().default("http://localhost:5174"),
  ADMIN_URL: z.string().default("http://localhost:5173"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
