import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("8000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Database
  MONGODB_URI: z.string({ required_error: "MONGODB_URI is required" }).min(1),

  // JWT
  JWT_SECRET: z.string({ required_error: "JWT_SECRET is required" }).min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_SECRET: z
    .string({ required_error: "REFRESH_TOKEN_SECRET is required" })
    .min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
  REFRESH_TOKEN_EXPIRY: z.string().default("7d"),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z
    .string({ required_error: "CLOUDINARY_CLOUD_NAME is required" })
    .min(1),
  CLOUDINARY_API_KEY: z
    .string({ required_error: "CLOUDINARY_API_KEY is required" })
    .min(1),
  CLOUDINARY_API_SECRET: z
    .string({ required_error: "CLOUDINARY_API_SECRET is required" })
    .min(1),

  // CORS origins
  FRONTEND_URL: z.string().url().default("http://localhost:5174"),
  ADMIN_URL: z.string().url().default("http://localhost:5173"),

  // Razorpay (optional — app degrades gracefully without it)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  // Email (optional — order confirmation emails silently skipped without it)
  EMAIL_USER: z.string().email().optional(),
  EMAIL_PASS: z.string().optional(),

  // ShipRocket (optional — shipping endpoints return 503 without it)
  SHIPROCKET_EMAIL: z.string().email().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  SHIPROCKET_CHANNEL_ID: z.string().optional(),
  SHIPROCKET_PICKUP_LOCATION: z.string().optional(),
  SHIPROCKET_DEFAULT_LENGTH: z.string().optional(),
  SHIPROCKET_DEFAULT_BREADTH: z.string().optional(),
  SHIPROCKET_DEFAULT_HEIGHT: z.string().optional(),
  SHIPROCKET_DEFAULT_WEIGHT: z.string().optional(),
  SHIPROCKET_WEBHOOK_TOKEN: z.string().optional(),

  // AfterShip (optional — registration skipped silently without it)
  AFTERSHIP_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌  Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
