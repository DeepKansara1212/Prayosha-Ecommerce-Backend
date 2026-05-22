import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { User } from "../models/user.model";
import { Order } from "../models/order.model";
import { paginate } from "../utils/pagination";
import { FilterQuery } from "mongoose";
import { IUser } from "../models/user.model";

// ─── GET /api/v1/admin/customers ──────────────────────────────────────────────

export const getCustomers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const search = (req.query.search as string)?.trim();

    const filter: FilterQuery<IUser> = { role: "customer" };
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select("name email phone createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Aggregate order stats for this page of users
    const userIds = users.map(u => u._id);
    const stats = await Order.aggregate([
      { $match: { user: { $in: userIds } } },
      {
        $group: {
          _id: "$user",
          totalOrders: { $sum: 1 },
          totalSpent:  { $sum: "$total" },
        },
      },
    ]);

    const statsMap = new Map(
      stats.map(s => [s._id.toString(), { totalOrders: s.totalOrders, totalSpent: s.totalSpent }])
    );

    const customers = users.map(u => ({
      _id:         u._id,
      name:        u.name,
      email:       u.email,
      phone:       u.phone,
      createdAt:   u.createdAt,
      totalOrders: statsMap.get(u._id.toString())?.totalOrders ?? 0,
      totalSpent:  statsMap.get(u._id.toString())?.totalSpent  ?? 0,
    }));

    res.status(200).json(
      new ApiResponse(
        200,
        { customers, pagination: paginate(page, limit, total) },
        "Customers fetched"
      )
    );
  }
);
