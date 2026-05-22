import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Coupon } from "../models/coupon.model";

// ─── GET /api/v1/admin/coupons ────────────────────────────────────────────────

export const getCoupons = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.status(200).json(new ApiResponse(200, { coupons }, "Coupons fetched"));
  }
);

// ─── POST /api/v1/admin/coupons ───────────────────────────────────────────────

export const createCoupon = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      code,
      discountType,
      discountValue,
      minOrderValue,
      maxUsage,
      validFrom,
      validUntil,
    } = req.body;

    if (!code || !discountType || discountValue == null || !validFrom || !validUntil) {
      throw new ApiError(400, "code, discountType, discountValue, validFrom, validUntil are required");
    }

    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) throw new ApiError(409, "A coupon with this code already exists");

    const coupon = await Coupon.create({
      code,
      discountType,
      discountValue,
      minOrderValue: minOrderValue ?? 0,
      maxUsage: maxUsage ?? 1,
      validFrom,
      validUntil,
    });

    res.status(201).json(new ApiResponse(201, { coupon }, "Coupon created"));
  }
);

// ─── PATCH /api/v1/admin/coupons/:id ─────────────────────────────────────────

export const updateCoupon = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      throw new ApiError(400, "isActive (boolean) is required");
    }

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );
    if (!coupon) throw new ApiError(404, "Coupon not found");

    res.status(200).json(new ApiResponse(200, { coupon }, "Coupon updated"));
  }
);
