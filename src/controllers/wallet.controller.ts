import { Request, Response } from "express";
import { Types } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { WalletTransaction } from "../models/walletTransaction.model";
import { User } from "../models/user.model";
import { paginate } from "../utils/pagination";

export const getWalletBalance = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await User.findById(req.user!._id).select("cashbackBalance");

    res.status(200).json(
      new ApiResponse(
        200,
        { cashbackBalance: user?.cashbackBalance ?? 0 },
        "Wallet balance fetched"
      )
    );
  }
);

export const getWalletHistory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id as Types.ObjectId;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = { user: userId };
    const [transactions, total, user] = await Promise.all([
      WalletTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("order", "items.name items.quantity total createdAt"),
      WalletTransaction.countDocuments(filter),
      User.findById(userId).select("cashbackBalance"),
    ]);

    res.status(200).json(
      new ApiResponse(
        200,
        {
          transactions,
          cashbackBalance: user?.cashbackBalance ?? 0,
          pagination: paginate(page, limit, total),
        },
        "Wallet history fetched"
      )
    );
  }
);
