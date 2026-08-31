import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { PurposeProductMapping } from "../models/purposeProductMapping.model";

// ─── GET /api/v1/admin/purpose-product-mappings?purpose=<id>&product=<id> ─────

export const getPurposeProductMappings = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { purpose, product } = req.query;
    const filter: Record<string, unknown> = {};
    if (purpose) filter.purpose = purpose;
    if (product) filter.product = product;

    const mappings = await PurposeProductMapping.find(filter)
      .sort({ priority: 1 })
      .populate("purpose", "name")
      .populate("product", "name images price isActive stock");

    res
      .status(200)
      .json(new ApiResponse(200, { mappings }, "Purpose-product mappings fetched"));
  }
);

// ─── POST /api/v1/admin/purpose-product-mappings ──────────────────────────────

export const createPurposeProductMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { purpose, product, priority, active } = req.body;
    const mapping = await PurposeProductMapping.create({ purpose, product, priority, active });
    res
      .status(201)
      .json(new ApiResponse(201, { mapping }, "Purpose-product mapping created"));
  }
);

// ─── PATCH /api/v1/admin/purpose-product-mappings/:id ─────────────────────────

export const updatePurposeProductMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const mapping = await PurposeProductMapping.findByIdAndUpdate(id, req.body, { new: true });
    if (!mapping) throw new ApiError(404, "Mapping not found");
    res
      .status(200)
      .json(new ApiResponse(200, { mapping }, "Purpose-product mapping updated"));
  }
);

// ─── DELETE /api/v1/admin/purpose-product-mappings/:id ────────────────────────

export const deletePurposeProductMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const mapping = await PurposeProductMapping.findByIdAndDelete(id);
    if (!mapping) throw new ApiError(404, "Mapping not found");
    res
      .status(200)
      .json(new ApiResponse(200, { mapping }, "Purpose-product mapping deleted"));
  }
);
