import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { RashiProductMapping } from "../models/rashiProductMapping.model";

// ─── GET /api/v1/admin/rashi-product-mappings?rashi=<id> ──────────────────────

export const getRashiProductMappings = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { rashi } = req.query;
    const filter = rashi ? { rashi } : {};

    const mappings = await RashiProductMapping.find(filter)
      .sort({ priority: 1 })
      .populate("rashi", "name code")
      .populate("product", "name images price isActive stock");

    res
      .status(200)
      .json(new ApiResponse(200, { mappings }, "Rashi-product mappings fetched"));
  }
);

// ─── POST /api/v1/admin/rashi-product-mappings ────────────────────────────────

export const createRashiProductMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { rashi, product, priority, active } = req.body;
    const mapping = await RashiProductMapping.create({ rashi, product, priority, active });
    res
      .status(201)
      .json(new ApiResponse(201, { mapping }, "Rashi-product mapping created"));
  }
);

// ─── PATCH /api/v1/admin/rashi-product-mappings/:id ───────────────────────────

export const updateRashiProductMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const mapping = await RashiProductMapping.findByIdAndUpdate(id, req.body, { new: true });
    if (!mapping) throw new ApiError(404, "Mapping not found");
    res
      .status(200)
      .json(new ApiResponse(200, { mapping }, "Rashi-product mapping updated"));
  }
);

// ─── DELETE /api/v1/admin/rashi-product-mappings/:id ──────────────────────────

export const deleteRashiProductMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const mapping = await RashiProductMapping.findByIdAndDelete(id);
    if (!mapping) throw new ApiError(404, "Mapping not found");
    res
      .status(200)
      .json(new ApiResponse(200, { mapping }, "Rashi-product mapping deleted"));
  }
);
