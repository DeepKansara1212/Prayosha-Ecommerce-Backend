import { Request, Response } from "express";
import { FilterQuery } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { CalculatorLead, ICalculatorLead } from "../models/calculatorLead.model";
import { paginate } from "../utils/pagination";

// ─── GET /api/v1/admin/calculator-leads ────────────────────────────────────────

export const getCalculatorLeads = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const search = (req.query.search as string)?.trim();

    const filter: FilterQuery<ICalculatorLead> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
      ];
    }

    const total = await CalculatorLead.countDocuments(filter);
    const leads = await CalculatorLead.find(filter)
      .populate("purpose", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json(
      new ApiResponse(
        200,
        { leads, pagination: paginate(page, limit, total) },
        "Calculator leads fetched"
      )
    );
  }
);
