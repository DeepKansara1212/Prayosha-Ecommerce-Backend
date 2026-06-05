import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { Reward } from "../models/reward.model";
import { User } from "../models/user.model";
import { paginate } from "../utils/pagination";
import { Types } from "mongoose";

// ─── GET /api/v1/rewards/balance ──────────────────────────────────────────────

export const getRewardsBalance = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await User.findById(req.user!._id).select("rewardPoints");

    res.status(200).json(
      new ApiResponse(
        200,
        { rewardPoints: user?.rewardPoints ?? 0 },
        "Rewards balance fetched"
      )
    );
  }
);

// ─── GET /api/v1/rewards/history ─────────────────────────────────────────────

export const getRewardsHistory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id as Types.ObjectId;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = { user: userId };

    const [transactions, total, user] = await Promise.all([
      Reward.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("order", "orderNumber total createdAt"),
      Reward.countDocuments(filter),
      User.findById(userId).select("rewardPoints"),
    ]);

    res.status(200).json(
      new ApiResponse(
        200,
        {
          transactions,
          totalPoints: user?.rewardPoints ?? 0,
          pagination: paginate(page, limit, total),
        },
        "Rewards history fetched"
      )
    );
  }
);
