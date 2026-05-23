import { z } from "zod";

const phone = z
  .string()
  .regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number");

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  phone,
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Enter a valid email").optional(),
});

export const loginSchema = z.object({
  phone,
  password: z.string().min(1, "Password is required"),
});

export const resetPasswordSchema = z.object({
  phone,
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});
