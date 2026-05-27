import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { verifyJWT } from "../middleware/auth";
import {
  register,
  sendOtp,
  verifyOtpAndLogin,
  logout,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  updateMe,
  addAddress,
  updateAddress,
  deleteAddress,
} from "../controllers/auth.controller";

const router = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Enter a valid email").optional(),
});

const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"),
  purpose: z.enum(["login", "register"]).default("login"),
  adminOnly: z.boolean().optional().default(false),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"),
});

const resetPasswordSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

const updateMeSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
  avatar: z.string().url("Avatar must be a valid URL").optional(),
});

const addressSchema = z.object({
  label: z.enum(["home", "work", "other"]),
  fullName: z.string().min(1, "Full name is required"),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"),
  line1: z.string().min(1, "Address line 1 is required"),
  line2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  pincode: z.string().regex(/^\d{6}$/, "Pincode must be exactly 6 digits"),
  isDefault: z.boolean().optional().default(false),
});

const updateAddressSchema = addressSchema.partial();

// ─── Public routes ────────────────────────────────────────────────────────────

router.post("/register",         validate(registerSchema),       register);
router.post("/send-otp",         validate(sendOtpSchema),        sendOtp);
router.post("/verify-otp",       validate(verifyOtpSchema),      verifyOtpAndLogin);
router.post("/refresh-token",                                     refreshAccessToken);
router.post("/forgot-password",  validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password",   validate(resetPasswordSchema),  resetPassword);

// ─── Protected routes ─────────────────────────────────────────────────────────

router.post("/logout",              verifyJWT, logout);
router.get("/me",                   verifyJWT, getMe);
router.patch("/change-password",    verifyJWT, changePassword);
router.patch("/me",              verifyJWT, validate(updateMeSchema),        updateMe);
router.post("/me/addresses",     verifyJWT, validate(addressSchema),         addAddress);
router.patch("/me/addresses/:id",verifyJWT, validate(updateAddressSchema),   updateAddress);
router.delete("/me/addresses/:id",verifyJWT,                                 deleteAddress);

export default router;
