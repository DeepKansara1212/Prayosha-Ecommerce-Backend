import { Response, NextFunction, Request } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { IUser, User } from "../models/user.model";

// ─── Extend Express Request ───────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

// ─── verifyJWT ────────────────────────────────────────────────────────────────
// Reads token from cookie or Authorization header, verifies it, fetches the
// full user document from DB (excluding sensitive fields), and attaches it to
// req.user. Sensitive fields (password, refreshToken, otp, otpExpiry) are
// never exposed to route handlers through this middleware.

export const verifyJWT = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token =
      (req.cookies as Record<string, string>)?.accessToken ??
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) throw new ApiError(401, "Unauthorized: No token provided");

    let decoded: { _id: string };
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as { _id: string };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new ApiError(401, "Access token expired");
      }
      throw new ApiError(401, "Invalid access token");
    }

    const user = await User.findById(decoded._id).select(
      "-password -refreshToken -otp -otpExpiry"
    );
    if (!user) throw new ApiError(401, "User not found or token is stale");

    req.user = user;
    next();
  }
);

// ─── verifyAdmin ──────────────────────────────────────────────────────────────

export const verifyAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== "admin") {
    next(new ApiError(403, "Forbidden: Admin access required"));
    return;
  }
  next();
};
