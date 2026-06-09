import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { Settings } from "../models/settings.model";
import { settingsUpdateSchema } from "../validations/settings.validation";

// ─── GET /api/v1/settings ─────────────────────────────────────────────────────

export const getPublicSettings = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const settings = await Settings.getSettings();

    res.status(200).json(
      new ApiResponse(
        200,
        {
          freeGiftEnabled: settings.freeGiftEnabled,
          whatsappNumber: settings.whatsappNumber,
          whatsappDefaultMessage: settings.whatsappDefaultMessage,
        },
        "Settings fetched"
      )
    );
  }
);

// ─── GET /api/v1/admin/settings ───────────────────────────────────────────────

export const getAdminSettings = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const settings = await Settings.getSettings();

    res.status(200).json(
      new ApiResponse(200, { settings }, "Settings fetched")
    );
  }
);

// ─── PATCH /api/v1/admin/settings ────────────────────────────────────────────

export const updateAdminSettings = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const body = settingsUpdateSchema.parse(req.body);

    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: body },
      { upsert: true, new: true }
    );

    res.status(200).json(
      new ApiResponse(200, { settings }, "Settings updated successfully")
    );
  }
);
