import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { Product } from "../models/product.model";

// ─── GET /api/v1/search?q=rose+quartz&limit=10 ───────────────────────────────

export const search = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const q = (req.query.q as string)?.trim();
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

    if (!q) {
      res
        .status(200)
        .json(new ApiResponse(200, { products: [], total: 0 }, "Search results"));
      return;
    }

    const [products, total] = await Promise.all([
      Product.find(
        { $text: { $search: q }, isActive: true },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } } as any)
        .limit(limit)
        .select("name slug price images badge stock")
        .populate("category", "name"),
      Product.countDocuments({ $text: { $search: q }, isActive: true }),
    ]);

    res
      .status(200)
      .json(new ApiResponse(200, { products, total }, "Search results"));
  }
);
