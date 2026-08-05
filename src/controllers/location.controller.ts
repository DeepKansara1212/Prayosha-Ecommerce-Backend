import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { searchLocations } from "../services/location.service";

// ─── GET /api/v1/location/search?place=<query> ────────────────────────────────

export const searchLocationsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { place } = req.query as { place: string };
    const locations = await searchLocations(place);
    res.status(200).json(new ApiResponse(200, { locations }, "Locations found"));
  }
);
