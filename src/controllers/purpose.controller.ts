import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Purpose } from "../models/purpose.model";
import { PurposeRudrakshaMapping } from "../models/purposeRudrakshaMapping.model";

// ─── GET /api/v1/purposes (public, active only) ───────────────────────────────

export const getActivePurposes = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const purposes = await Purpose.find({ active: true }).sort({ name: 1 });
    res.status(200).json(new ApiResponse(200, { purposes }, "Purposes fetched"));
  }
);

// ─── GET /api/v1/admin/purposes ────────────────────────────────────────────────

export const getPurposes = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const purposes = await Purpose.find().sort({ name: 1 }).lean();

    const counts = await PurposeRudrakshaMapping.aggregate([
      { $group: { _id: "$purpose", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const result = purposes.map((p) => ({
      ...p,
      mappedRudrakshaCount: countMap.get(p._id.toString()) ?? 0,
    }));

    res.status(200).json(new ApiResponse(200, { purposes: result }, "Purposes fetched"));
  }
);

// ─── POST /api/v1/admin/purposes ───────────────────────────────────────────────

export const createPurpose = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { name, active } = req.body;
    const purpose = await Purpose.create({ name, active });
    res.status(201).json(new ApiResponse(201, { purpose }, "Purpose created"));
  }
);

// ─── PATCH /api/v1/admin/purposes/:id ─────────────────────────────────────────

export const updatePurpose = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const purpose = await Purpose.findByIdAndUpdate(id, req.body, { new: true });
    if (!purpose) throw new ApiError(404, "Purpose not found");
    res.status(200).json(new ApiResponse(200, { purpose }, "Purpose updated"));
  }
);

// ─── DELETE /api/v1/admin/purposes/:id ────────────────────────────────────────

export const deletePurpose = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const purpose = await Purpose.findByIdAndDelete(id);
    if (!purpose) throw new ApiError(404, "Purpose not found");
    res.status(200).json(new ApiResponse(200, { purpose }, "Purpose deleted"));
  }
);
