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
  // Webhook secret configured separately in the Razorpay dashboard, used to
  // reconcile payments that succeed on Razorpay's side but never reach
  // /razorpay/verify (e.g. the client closes the browser mid-checkout).
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Email (optional — order confirmation emails silently skipped without it)
  EMAIL_USER: z.string().email().optional(),
  EMAIL_PASS: z.string().optional(),

  // MSG91 Flow API credentials for production OTP delivery
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),

  // Shipping — provider business credentials (ShipRocket email/password,
  // AfterShip API key, pickup location, etc.) now live encrypted in the
  // shipping_providers collection, configured from Admin → Shipping.
  // Only deployment-level webhook secrets stay in env, since they're shared
  // with each provider's own dashboard config, not per-provider credentials.
  ENCRYPTION_KEY: z
    .string({ required_error: "ENCRYPTION_KEY is required" })
    .min(32, "ENCRYPTION_KEY must be at least 32 characters"),
  SHIPROCKET_WEBHOOK_TOKEN: z.string().optional(),
  AFTERSHIP_WEBHOOK_SECRET: z.string().optional(),

  // Location search for astrology calculators — free, unauthenticated
  // Open-Meteo geocoding endpoint; overridable if a self-hosted mirror is
  // ever needed, but no API key is required.
  OPEN_METEO_GEOCODING_URL: z
    .string()
    .url()
    .default("https://geocoding-api.open-meteo.com/v1/search"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌  Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
