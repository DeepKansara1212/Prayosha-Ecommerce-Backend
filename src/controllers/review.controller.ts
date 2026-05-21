import { Request, Response } from "express";
import { Types } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Review } from "../models/review.model";
import { Product } from "../models/product.model";
import { Order } from "../models/order.model";
import { paginate } from "../utils/pagination";

// ─── Shared helper: recalculate ratings after approve / delete ────────────────

async function recalculateRatings(productId: Types.ObjectId): Promise<void> {
  const result = await Review.aggregate([
    { $match: { product: productId, isApproved: true } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  const average =
    result.length > 0 ? Math.round(result[0].average * 10) / 10 : 0;
  const count = result.length > 0 ? result[0].count : 0;

  await Product.findByIdAndUpdate(productId, {
    "ratings.average": average,
    "ratings.count": count,
  });
}

// ─── POST /api/v1/products/:slug/reviews ─────────────────────────────────────

export const submitReview = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params;
    const userId = req.user!._id as Types.ObjectId;
    const { rating, title, body } = req.body as {
      rating: number;
      title: string;
      body: string;
    };

    if (!rating || !title || !body)
      throw new ApiError(400, "rating, title, and body are required");

    const product = await Product.findOne({ slug });
    if (!product) throw new ApiError(404, "Product not found");
    if (!product.isActive) throw new ApiError(400, "Product is not available");

    // One review per user per product (the unique index also enforces this, but
    // a friendly error here is better than a raw duplicate-key crash)
    const existing = await Review.findOne({
      product: product._id,
      user: userId,
    });
    if (existing) throw new ApiError(409, "You have already reviewed this product");

    // Verified purchase check
    const deliveredOrder = await Order.findOne({
      user: userId,
      status: "delivered",
      "items.product": product._id,
    });

    const review = await Review.create({
      product: product._id,
      user: userId,
      rating: Number(rating),
      title,
      body,
      isVerifiedPurchase: !!deliveredOrder,
      isApproved: false,
    });

    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          review,
          "Review submitted and is pending admin approval"
        )
      );
  }
);

// ─── GET /api/v1/products/:slug/reviews ──────────────────────────────────────

export const getProductReviews = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const product = await Product.findOne({ slug }).select("_id ratings");
    if (!product) throw new ApiError(404, "Product not found");

    const filter = { product: product._id, isApproved: true };

    const [reviews, total, distribution] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name avatar"),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: filter },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
      ]),
    ]);

    // Build { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } distribution map
    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    (distribution as { _id: number; count: number }[]).forEach((d) => {
      ratingDistribution[d._id] = d.count;
    });

    res.status(200).json(
      new ApiResponse(
        200,
        {
          reviews,
          averageRating: product.ratings.average,
          totalReviews: product.ratings.count,
          ratingDistribution,
          pagination: paginate(page, limit, total),
        },
        "Reviews fetched"
      )
    );
  }
);

// ─── PATCH /api/v1/admin/reviews/:id/approve ─────────────────────────────────

export const approveReview = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const review = await Review.findById(req.params.id);
    if (!review) throw new ApiError(404, "Review not found");

    if (review.isApproved)
      throw new ApiError(400, "Review is already approved");

    review.isApproved = true;
    await review.save();

    await recalculateRatings(review.product as Types.ObjectId);

    res
      .status(200)
      .json(new ApiResponse(200, review, "Review approved and ratings updated"));
  }
);

// ─── DELETE /api/v1/admin/reviews/:id ────────────────────────────────────────

export const deleteReview = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const review = await Review.findById(req.params.id);
    if (!review) throw new ApiError(404, "Review not found");

    const productId = review.product as Types.ObjectId;
    await review.deleteOne();

    // Only recalculate if the deleted review was published (approved)
    if (review.isApproved) {
      await recalculateRatings(productId);
    }

    res
      .status(200)
      .json(new ApiResponse(200, null, "Review deleted and ratings updated"));
  }
);
