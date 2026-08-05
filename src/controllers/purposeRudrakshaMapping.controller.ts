import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { PurposeRudrakshaMapping } from "../models/purposeRudrakshaMapping.model";

// ─── GET /api/v1/admin/purpose-rudraksha-mappings?purpose=<id> ────────────────

export const getPurposeRudrakshaMappings = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { purpose } = req.query;
    const filter = purpose ? { purpose } : {};

    const mappings = await PurposeRudrakshaMapping.find(filter)
      .sort({ priority: 1 })
      .populate("purpose", "name active")
      .populate("rudrakshaType", "name description");

    res
      .status(200)
      .json(new ApiResponse(200, { mappings }, "Purpose-Rudraksha mappings fetched"));
  }
);

// ─── POST /api/v1/admin/purpose-rudraksha-mappings ────────────────────────────

export const createPurposeRudrakshaMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { purpose, rudrakshaType, priority, active } = req.body;
    const mapping = await PurposeRudrakshaMapping.create({
      purpose,
      rudrakshaType,
      priority,
      active,
    });
    res
      .status(201)
      .json(new ApiResponse(201, { mapping }, "Purpose-Rudraksha mapping created"));
  }
);

// ─── PATCH /api/v1/admin/purpose-rudraksha-mappings/:id ───────────────────────

export const updatePurposeRudrakshaMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const mapping = await PurposeRudrakshaMapping.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!mapping) throw new ApiError(404, "Mapping not found");
    res
      .status(200)
      .json(new ApiResponse(200, { mapping }, "Purpose-Rudraksha mapping updated"));
  }
);

// ─── DELETE /api/v1/admin/purpose-rudraksha-mappings/:id ──────────────────────

export const deletePurposeRudrakshaMapping = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const mapping = await PurposeRudrakshaMapping.findByIdAndDelete(id);
    if (!mapping) throw new ApiError(404, "Mapping not found");
    res
      .status(200)
      .json(new ApiResponse(200, { mapping }, "Purpose-Rudraksha mapping deleted"));
  }
);
