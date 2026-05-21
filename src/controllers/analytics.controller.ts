import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { Order } from "../models/order.model";
import { Product } from "../models/product.model";
import { User } from "../models/user.model";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function periodFromQuery(period: string): { from: Date; groupBy: "day" | "month" } {
  const now = new Date();
  switch (period) {
    case "7d":
      return { from: new Date(now.getTime() - 7 * 86400000), groupBy: "day" };
    case "90d":
      return { from: new Date(now.getTime() - 90 * 86400000), groupBy: "day" };
    case "1yr":
      return { from: new Date(now.getTime() - 365 * 86400000), groupBy: "month" };
    default: // 30d
      return { from: new Date(now.getTime() - 30 * 86400000), groupBy: "day" };
  }
}

// ─── GET /api/v1/admin/analytics/overview ────────────────────────────────────

export const getOverview = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const todayStart = startOfDay();
    const monthStart = startOfMonth();

    const [
      revenueResult,
      totalOrders,
      ordersTodayResult,
      revenueTodayResult,
      newCustomersThisMonth,
      totalProducts,
      lowStockCount,
      topProducts,
    ] = await Promise.all([
      // Total revenue from paid orders
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),

      // Total orders (all statuses)
      Order.countDocuments(),

      // Orders placed today
      Order.countDocuments({ createdAt: { $gte: todayStart } }),

      // Revenue today (paid only)
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),

      // New customers this month
      User.countDocuments({
        role: "customer",
        createdAt: { $gte: monthStart },
      }),

      // Active products
      Product.countDocuments({ isActive: true }),

      // Low stock count
      Product.countDocuments({
        isActive: true,
        $expr: { $lte: ["$stock", "$lowStockThreshold"] },
      }),

      // Top 5 products by revenue
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product",
            name: { $first: "$items.name" },
            image: { $first: "$items.image" },
            revenue: {
              $sum: { $multiply: ["$items.price", "$items.quantity"] },
            },
            unitsSold: { $sum: "$items.quantity" },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
    ]);

    res.status(200).json(
      new ApiResponse(
        200,
        {
          totalRevenue: revenueResult[0]?.total ?? 0,
          totalOrders,
          ordersToday: ordersTodayResult,
          revenueToday: revenueTodayResult[0]?.total ?? 0,
          newCustomersThisMonth,
          totalProducts,
          lowStockCount,
          topProducts,
        },
        "Overview fetched"
      )
    );
  }
);

// ─── GET /api/v1/admin/analytics/sales?period=30d ────────────────────────────

export const getSalesOverTime = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { period = "30d" } = req.query as { period?: string };
    const validPeriods = ["7d", "30d", "90d", "1yr"];

    if (!validPeriods.includes(period))
      throw new ApiError(400, `period must be one of: ${validPeriods.join(", ")}`);

    const { from, groupBy } = periodFromQuery(period);

    const groupId =
      groupBy === "day"
        ? {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          }
        : {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          };

    const result = await Order.aggregate([
      { $match: { paymentStatus: "paid", createdAt: { $gte: from } } },
      {
        $group: {
          _id: groupId,
          revenue: { $sum: "$total" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    const data = (result as any[]).map((item) => ({
      date:
        groupBy === "day"
          ? `${item._id.year}-${String(item._id.month).padStart(2, "0")}-${String(item._id.day).padStart(2, "0")}`
          : `${item._id.year}-${String(item._id.month).padStart(2, "0")}`,
      revenue: item.revenue,
      orderCount: item.orderCount,
    }));

    res.status(200).json(
      new ApiResponse(200, { period, data }, "Sales data fetched")
    );
  }
);

// ─── GET /api/v1/admin/analytics/orders-by-status ────────────────────────────

export const getOrdersByStatus = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const result = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
    ]);

    res
      .status(200)
      .json(new ApiResponse(200, result, "Orders by status fetched"));
  }
);

// ─── GET /api/v1/admin/analytics/low-stock ────────────────────────────────────

export const getLowStockProducts = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const products = await Product.find({
      isActive: true,
      $expr: { $lte: ["$stock", "$lowStockThreshold"] },
    })
      .select("name sku stock lowStockThreshold")
      .populate("category", "name")
      .sort({ stock: 1 });

    res.status(200).json(
      new ApiResponse(
        200,
        { count: products.length, products },
        "Low stock products fetched"
      )
    );
  }
);
