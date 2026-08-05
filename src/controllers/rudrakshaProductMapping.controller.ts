import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { RudrakshaProductMapping } from "../models/rudrakshaProductMapping.model";

// ─── GET /api/v1/admin/rudraksha-product-mappings?rudrakshaType=<id> ─────────

export const getRudrakshaProductMappings = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { rudrakshaType } = req.query;
    const filter = rudrakshaType ? { rudrakshaType } : {};

    const mappings = await RudrakshaProductMapping.find(filter)
      .sort({ priority: 1 })
      .populate("rudrakshaType", "name description")
      .populate("product", "name images price isActive stock");

    res
      .status(200)
      .json(new ApiResponse(200, { mappings }, "Rudraksha-product mappings fetched"));
  }
);

// ─── POST /api/v1/admin/rudraksha-product-mappings ────────────────────────────

export const createRudrakshaProductMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { rudrakshaType, product, priority, active } = req.body;
    const mapping = await RudrakshaProductMapping.create({
      rudrakshaType,
      product,
      priority,
      active,
    });
    res
      .status(201)
      .json(new ApiResponse(201, { mapping }, "Rudraksha-product mapping created"));
  }
);

// ─── PATCH /api/v1/admin/rudraksha-product-mappings/:id ───────────────────────

export const updateRudrakshaProductMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const mapping = await RudrakshaProductMapping.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!mapping) throw new ApiError(404, "Mapping not found");
    res
      .status(200)
      .json(new ApiResponse(200, { mapping }, "Rudraksha-product mapping updated"));
  }
);

// ─── DELETE /api/v1/admin/rudraksha-product-mappings/:id ──────────────────────

export const deleteRudrakshaProductMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const mapping = await RudrakshaProductMapping.findByIdAndDelete(id);
    if (!mapping) throw new ApiError(404, "Mapping not found");
    res
      .status(200)
      .json(new ApiResponse(200, { mapping }, "Rudraksha-product mapping deleted"));
  }
);
