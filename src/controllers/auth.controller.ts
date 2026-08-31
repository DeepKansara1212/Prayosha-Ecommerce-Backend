import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response, CookieOptions } from "express";
import { User } from "../models/user.model";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { sendOtpSms } from "../utils/sms";
import { env } from "../config/env";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateOtp = (): string => crypto.randomInt(100000, 1000000).toString();

const REFRESH_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const CLEAR_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
};

// ─── register ─────────────────────────────────────────────────────────────────

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, email } = req.body as {
    name: string;
    phone: string;
    password: string;
    email?: string;
  };

  const phoneExists = await User.findOne({ phone });
  if (phoneExists) throw new ApiError(409, "Phone number already registered");

  if (email) {
    const emailExists = await User.findOne({ email });
    if (emailExists) throw new ApiError(409, "Email already registered");
  }

  const created = await User.create({ name, phone, password, email });

  // findById re-fetches without select:false fields
  const user = await User.findById(created._id);

  res
    .status(201)
    .json(new ApiResponse(201, user, "Account created successfully"));
});

// ─── sendOtp ──────────────────────────────────────────────────────────────────

export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, adminOnly = false } = req.body as {
    phone: string;
    purpose: "login" | "register";
    adminOnly?: boolean;
  };

  const user = await User.findOne({ phone });

  if (adminOnly) {
    if (!user || user.role !== "admin") {
      throw new ApiError(403, "This phone number is not registered as an admin account.");
    }
  }

  // For non-admin flows always respond the same way — never reveal whether the phone exists
  if (user) {
    const otp = generateOtp();
    user.otp = await bcrypt.hash(otp, 10);
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save({ validateBeforeSave: false });

    await sendOtpSms(phone, otp);
  }

  res
    .status(200)
    .json(new ApiResponse(200, {}, "OTP sent successfully"));
});

// ─── loginWithEmail ──────────────────────────────────────────────────────────

export const loginWithEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };

    const user = await User.findOne({ email }).select("+password");
    if (!user || user.role !== "admin") {
      throw new ApiError(401, "Invalid email or password");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) throw new ApiError(401, "Invalid email or password");

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    const safeUser = await User.findById(user._id);

    res
      .status(200)
      .cookie("refreshToken", refreshToken, REFRESH_COOKIE)
      .json(
        new ApiResponse(
          200,
          { user: safeUser, accessToken },
          "Logged in successfully"
        )
      );
  }
);

// ─── verifyOtpAndLogin ────────────────────────────────────────────────────────

export const verifyOtpAndLogin = asyncHandler(
  async (req: Request, res: Response) => {
    const { phone, otp, password, adminLogin = false } = req.body as {
      phone: string;
      otp: string;
      password: string;
      adminLogin?: boolean;
    };

    const user = await User.findOne({ phone }).select(
      "+password +otp +otpExpiry"
    );
    if (!user) throw new ApiError(400, "Invalid credentials");

    if (!user.otp || !user.otpExpiry) {
      throw new ApiError(400, "No OTP found. Please request a new one");
    }

    if (user.otpExpiry < new Date()) {
      throw new ApiError(400, "OTP has expired. Please request a new one");
    }

    const isOtpValid = await bcrypt.compare(otp, user.otp);
    if (!isOtpValid) throw new ApiError(400, "Invalid OTP");

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) throw new ApiError(400, "Invalid credentials");

    if (adminLogin && user.role !== "admin") {
      throw new ApiError(403, "Access denied. Admin account required.");
    }

    // Clear OTP fields
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.isVerified = true;

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });

    const safeUser = await User.findById(user._id);

    res
      .status(200)
      .cookie("refreshToken", refreshToken, REFRESH_COOKIE)
      .json(
        new ApiResponse(
          200,
          { user: safeUser, accessToken },
          "Logged in successfully"
        )
      );
  }
);

// ─── logout ───────────────────────────────────────────────────────────────────

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await User.findByIdAndUpdate(
    req.user!._id,
    { $unset: { refreshToken: 1 } },
    { new: true }
  );

  res
    .status(200)
    .clearCookie("refreshToken", CLEAR_COOKIE)
    .json(new ApiResponse(200, {}, "Logged out successfully"));
});

// ─── refreshAccessToken ───────────────────────────────────────────────────────

export const refreshAccessToken = asyncHandler(
  async (req: Request, res: Response) => {
    const incomingToken =
      (req.cookies as Record<string, string>)?.refreshToken ||
      (req.body as { refreshToken?: string })?.refreshToken;

    if (!incomingToken) throw new ApiError(401, "Refresh token not provided");

    let decoded: { _id: string };
    try {
      decoded = jwt.verify(
        incomingToken,
        env.REFRESH_TOKEN_SECRET
      ) as { _id: string };
    } catch {
      throw new ApiError(401, "Invalid or expired refresh token");
    }

    const user = await User.findById(decoded._id).select("+refreshToken");
    if (!user || user.refreshToken !== incomingToken) {
      throw new ApiError(401, "Refresh token is invalid or has been revoked");
    }

    const accessToken = user.generateAccessToken();

    res
      .status(200)
      .json(new ApiResponse(200, { accessToken }, "Token refreshed"));
  }
);

// ─── forgotPassword ───────────────────────────────────────────────────────────

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { phone } = req.body as { phone: string };

    const user = await User.findOne({ phone });

    if (user) {
      const otp = generateOtp();
      user.otp = await bcrypt.hash(otp, 10);
      user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await user.save({ validateBeforeSave: false });

      await sendOtpSms(phone, otp);
    }

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          "If this number is registered, a reset OTP has been sent"
        )
      );
  }
);

// ─── resetPassword ────────────────────────────────────────────────────────────

export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { phone, otp, newPassword } = req.body as {
      phone: string;
      otp: string;
      newPassword: string;
    };

    const user = await User.findOne({ phone }).select("+otp +otpExpiry");
    if (!user) throw new ApiError(400, "Invalid request");

    if (!user.otp || !user.otpExpiry) {
      throw new ApiError(400, "No OTP found. Please request a new one");
    }

    if (user.otpExpiry < new Date()) {
      throw new ApiError(400, "OTP has expired. Please request a new one");
    }

    const isOtpValid = await bcrypt.compare(otp, user.otp);
    if (!isOtpValid) throw new ApiError(400, "Invalid OTP");

    user.password = newPassword; // pre-save hook will hash it
    user.otp = undefined;
    user.otpExpiry = undefined;

    await user.save();

    res
      .status(200)
      .json(new ApiResponse(200, {}, "Password reset successfully"));
  }
);

// ─── changePassword ───────────────────────────────────────────────────────────

export const changePassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, "currentPassword and newPassword are required");
    }
    if (newPassword.length < 6) {
      throw new ApiError(400, "New password must be at least 6 characters");
    }

    const user = await User.findById(req.user!._id).select("+password");
    if (!user) throw new ApiError(404, "User not found");

    const isMatch = await user.isPasswordCorrect(currentPassword);
    if (!isMatch) throw new ApiError(400, "Current password is incorrect");

    user.password = newPassword;
    await user.save();

    res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"));
  }
);

// ─── getMe ────────────────────────────────────────────────────────────────────

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  // req.user is already fetched by verifyJWT (no sensitive fields)
  res.status(200).json(new ApiResponse(200, req.user, "Profile fetched"));
});

// ─── updateMe ─────────────────────────────────────────────────────────────────

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, avatar } = req.body as {
    name?: string;
    phone?: string;
    avatar?: string;
  };

  if (phone) {
    const taken = await User.findOne({ phone, _id: { $ne: req.user!._id } });
    if (taken) throw new ApiError(409, "Phone number already in use");
  }

  const user = await User.findByIdAndUpdate(
    req.user!._id,
    { $set: { ...(name && { name }), ...(phone && { phone }), ...(avatar && { avatar }) } },
    { new: true, runValidators: true }
  );

  res.status(200).json(new ApiResponse(200, user, "Profile updated"));
});

// ─── addAddress ───────────────────────────────────────────────────────────────

export const addAddress = asyncHandler(async (req: Request, res: Response) => {
  const addressData = req.body as {
    label: "home" | "work" | "other";
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    isDefault?: boolean;
  };

  const user = await User.findById(req.user!._id);
  if (!user) throw new ApiError(404, "User not found");

  if (addressData.isDefault) {
    user.addresses.forEach((addr) => {
      addr.isDefault = false;
    });
  }

  user.addresses.push(addressData);
  await user.save({ validateBeforeSave: false });

  res
    .status(201)
    .json(new ApiResponse(201, user.addresses, "Address added"));
});

// ─── updateAddress ────────────────────────────────────────────────────────────

export const updateAddress = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body as {
      label?: "home" | "work" | "other";
      fullName?: string;
      phone?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      pincode?: string;
      isDefault?: boolean;
    };

    const user = await User.findById(req.user!._id);
    if (!user) throw new ApiError(404, "User not found");

    const address = user.addresses.id(id);
    if (!address) throw new ApiError(404, "Address not found");

    if (updateData.isDefault) {
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    // Apply only the fields that were sent
    const fields = [
      "label", "fullName", "phone", "line1", "line2",
      "city", "state", "pincode", "isDefault",
    ] as const;

    for (const field of fields) {
      if (updateData[field] !== undefined) {
        (address as unknown as Record<string, unknown>)[field] = updateData[field];
      }
    }

    await user.save({ validateBeforeSave: false });

    res
      .status(200)
      .json(new ApiResponse(200, user.addresses, "Address updated"));
  }
);

// ─── deleteAddress ────────────────────────────────────────────────────────────

export const deleteAddress = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await User.findById(req.user!._id);
    if (!user) throw new ApiError(404, "User not found");

    const address = user.addresses.id(id);
    if (!address) throw new ApiError(404, "Address not found");

    address.deleteOne();
    await user.save({ validateBeforeSave: false });

    res
      .status(200)
      .json(new ApiResponse(200, user.addresses, "Address deleted"));
  }
);
