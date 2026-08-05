import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Purpose } from "../models/purpose.model";
import { CalculatorLead } from "../models/calculatorLead.model";
import { resolveMoonRashi } from "../services/astrology.service";
import {
  getBraceletsForRashi,
  getRudrakshaProductsForPurpose,
} from "../services/recommendation.service";

// ─── POST /api/v1/calculators/bracelet ────────────────────────────────────────

export const submitBraceletCalculator = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { name, dob, tob, birthLocation, mobile } = req.body;

    await CalculatorLead.create({
      name,
      mobile,
      dob,
      birthLocation,
      calculatorType: "bracelet",
    });

    const rashiResult = resolveMoonRashi(dob, tob ?? null, { timezone: birthLocation.timezone });

    if (!rashiResult.resolved) {
      res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { requiresBirthTime: true },
            "Birth time is required for an accurate recommendation."
          )
        );
      return;
    }

    const recommendedProducts = await getBraceletsForRashi(rashiResult.rashiCode);
    res
      .status(200)
      .json(new ApiResponse(200, { recommendedProducts }, "Products fetched"));
  }
);

// ─── POST /api/v1/calculators/rudraksha ───────────────────────────────────────

export const submitRudrakshaCalculator = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { name, dob, birthLocation, mobile, purpose } = req.body;

    const purposeDoc = await Purpose.findOne({ _id: purpose, active: true });
    if (!purposeDoc) throw new ApiError(404, "Purpose not found");

    await CalculatorLead.create({
      name,
      mobile,
      dob,
      birthLocation,
      calculatorType: "rudraksha",
      purpose: purposeDoc._id,
    });

    const recommendedProducts = await getRudrakshaProductsForPurpose(purposeDoc._id);
    res
      .status(200)
      .json(new ApiResponse(200, { recommendedProducts }, "Products fetched"));
  }
);
