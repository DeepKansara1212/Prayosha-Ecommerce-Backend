import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { User } from "../models/user.model";
import { Product } from "../models/product.model";
import { Types } from "mongoose";

async function resolveProductId(idOrSlug: string): Promise<string> {
  if (Types.ObjectId.isValid(idOrSlug)) return idOrSlug;
  const product = await Product.findOne({ slug: idOrSlug }, "_id");
  if (!product) throw new ApiError(404, "Product not found");
  return product._id.toString();
}

// ─── Populate fields for wishlist products ────────────────────────────────────

const WISHLIST_FIELDS = "name price comparePrice images slug badge stock";

// ─── GET /api/v1/wishlist ─────────────────────────────────────────────────────

export const getWishlist = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await User.findById(req.user!._id).populate(
      "wishlist",
      WISHLIST_FIELDS
    );
    if (!user) throw new ApiError(404, "User not found");

    res
      .status(200)
      .json(new ApiResponse(200, { wishlist: user.wishlist }, "Wishlist fetched"));
  }
);

// ─── POST /api/v1/wishlist/:productId ────────────────────────────────────────

export const addToWishlist = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const resolvedId = await resolveProductId(req.params.productId);

    const user = await User.findById(req.user!._id);
    if (!user) throw new ApiError(404, "User not found");

    const alreadyAdded = user.wishlist.some(
      (id) => id.toString() === resolvedId
    );

    if (!alreadyAdded) {
      user.wishlist.push(new Types.ObjectId(resolvedId));
      await user.save();
    }

    await user.populate("wishlist", WISHLIST_FIELDS);

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { wishlist: user.wishlist },
          alreadyAdded ? "Already in wishlist" : "Added to wishlist"
        )
      );
  }
);

// ─── DELETE /api/v1/wishlist/:productId ──────────────────────────────────────

export const removeFromWishlist = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const resolvedId = await resolveProductId(req.params.productId);

    const user = await User.findById(req.user!._id);
    if (!user) throw new ApiError(404, "User not found");

    user.wishlist = user.wishlist.filter(
      (id) => id.toString() !== resolvedId
    ) as typeof user.wishlist;

    await user.save();
    await user.populate("wishlist", WISHLIST_FIELDS);

    res
      .status(200)
      .json(
        new ApiResponse(200, { wishlist: user.wishlist }, "Removed from wishlist")
      );
  }
);

// ─── DELETE /api/v1/wishlist ──────────────────────────────────────────────────

export const clearWishlist = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await User.findById(req.user!._id);
    if (!user) throw new ApiError(404, "User not found");

    user.wishlist = [] as unknown as typeof user.wishlist;
    await user.save();

    res
      .status(200)
      .json(new ApiResponse(200, { wishlist: [] }, "Wishlist cleared"));
  }
);
