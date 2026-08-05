import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { RudrakshaType } from "../models/rudrakshaType.model";
import { RudrakshaProductMapping } from "../models/rudrakshaProductMapping.model";

// ─── GET /api/v1/admin/rudraksha-types ─────────────────────────────────────────

export const getRudrakshaTypes = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const rudrakshaTypes = await RudrakshaType.find().sort({ name: 1 }).lean();

    const counts = await RudrakshaProductMapping.aggregate([
      { $group: { _id: "$rudrakshaType", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const result = rudrakshaTypes.map((r) => ({
      ...r,
      mappedProductCount: countMap.get(r._id.toString()) ?? 0,
    }));

    res
      .status(200)
      .json(new ApiResponse(200, { rudrakshaTypes: result }, "Rudraksha types fetched"));
  }
);

// ─── POST /api/v1/admin/rudraksha-types ────────────────────────────────────────

export const createRudrakshaType = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { name, description } = req.body;
    const rudrakshaType = await RudrakshaType.create({ name, description });
    res
      .status(201)
      .json(new ApiResponse(201, { rudrakshaType }, "Rudraksha type created"));
  }
);

// ─── PATCH /api/v1/admin/rudraksha-types/:id ──────────────────────────────────

export const updateRudrakshaType = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const rudrakshaType = await RudrakshaType.findByIdAndUpdate(id, req.body, { new: true });
    if (!rudrakshaType) throw new ApiError(404, "Rudraksha type not found");
    res
      .status(200)
      .json(new ApiResponse(200, { rudrakshaType }, "Rudraksha type updated"));
  }
);

// ─── DELETE /api/v1/admin/rudraksha-types/:id ─────────────────────────────────

export const deleteRudrakshaType = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const rudrakshaType = await RudrakshaType.findByIdAndDelete(id);
    if (!rudrakshaType) throw new ApiError(404, "Rudraksha type not found");
    res
      .status(200)
      .json(new ApiResponse(200, { rudrakshaType }, "Rudraksha type deleted"));
  }
);
