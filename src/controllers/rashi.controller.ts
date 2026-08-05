import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Rashi } from "../models/rashi.model";
import { RashiProductMapping } from "../models/rashiProductMapping.model";

// ─── GET /api/v1/admin/rashis ──────────────────────────────────────────────────

export const getRashis = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const rashis = await Rashi.find().sort({ name: 1 }).lean();

    const counts = await RashiProductMapping.aggregate([
      { $group: { _id: "$rashi", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const result = rashis.map((r) => ({
      ...r,
      mappedProductCount: countMap.get(r._id.toString()) ?? 0,
    }));

    res.status(200).json(new ApiResponse(200, { rashis: result }, "Rashis fetched"));
  }
);

// ─── POST /api/v1/admin/rashis ─────────────────────────────────────────────────

export const createRashi = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { name, code } = req.body;

    const existing = await Rashi.findOne({ code });
    if (existing) throw new ApiError(409, "A Rashi with this code already exists");

    const rashi = await Rashi.create({ name, code });
    res.status(201).json(new ApiResponse(201, { rashi }, "Rashi created"));
  }
);

// ─── PATCH /api/v1/admin/rashis/:id ───────────────────────────────────────────

export const updateRashi = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const rashi = await Rashi.findByIdAndUpdate(id, req.body, { new: true });
    if (!rashi) throw new ApiError(404, "Rashi not found");
    res.status(200).json(new ApiResponse(200, { rashi }, "Rashi updated"));
  }
);

// ─── DELETE /api/v1/admin/rashis/:id ──────────────────────────────────────────

export const deleteRashi = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const rashi = await Rashi.findByIdAndDelete(id);
    if (!rashi) throw new ApiError(404, "Rashi not found");
    res.status(200).json(new ApiResponse(200, { rashi }, "Rashi deleted"));
  }
);
