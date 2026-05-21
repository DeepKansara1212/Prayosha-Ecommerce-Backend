import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Cart } from "../models/cart.model";
import { Product } from "../models/product.model";
import { Coupon } from "../models/coupon.model";

// ─── Populate fields for product in cart ─────────────────────────────────────

const PRODUCT_FIELDS = "name price comparePrice images stock slug isActive";

// ─── GET /api/v1/cart ─────────────────────────────────────────────────────────

export const getCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;

    let cart = await Cart.findOne({ user: userId }).populate(
      "items.product",
      PRODUCT_FIELDS
    );

    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
    }

    // Annotate unavailable items and compute totals
    const annotatedItems = cart.items.map((item) => {
      const product = item.product as any;
      const unavailable = !product?.isActive || product?.stock === 0;
      return {
        _id: item._id,
        product,
        quantity: item.quantity,
        priceAtAdd: item.priceAtAdd,
        lineTotal: item.priceAtAdd * item.quantity,
        unavailable,
      };
    });

    const subtotal = annotatedItems.reduce((sum, i) => sum + i.lineTotal, 0);
    const itemCount = annotatedItems.reduce((sum, i) => sum + i.quantity, 0);

    res.status(200).json(
      new ApiResponse(
        200,
        {
          _id: cart._id,
          items: annotatedItems,
          couponApplied: cart.couponApplied,
          subtotal,
          itemCount,
        },
        "Cart fetched"
      )
    );
  }
);

// ─── POST /api/v1/cart/items ──────────────────────────────────────────────────

export const addItem = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { productId, quantity = 1 } = req.body as {
      productId: string;
      quantity?: number;
    };

    if (!productId) throw new ApiError(400, "productId is required");

    const product = await Product.findById(productId);
    if (!product) throw new ApiError(404, "Product not found");
    if (!product.isActive) throw new ApiError(400, "Product is not available");
    if (product.stock === 0) throw new ApiError(400, "Product is out of stock");

    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = await Cart.create({ user: userId, items: [] });

    const existingIdx = cart.items.findIndex(
      (i) => i.product.toString() === productId
    );

    if (existingIdx !== -1) {
      const newQty = cart.items[existingIdx].quantity + Number(quantity);
      cart.items[existingIdx].quantity = Math.min(newQty, product.stock);
    } else {
      cart.items.push({
        product: product._id,
        quantity: Math.min(Number(quantity), product.stock),
        priceAtAdd: product.price,
      } as any);
    }

    await cart.save();
    await cart.populate("items.product", PRODUCT_FIELDS);

    res.status(200).json(new ApiResponse(200, cart, "Item added to cart"));
  }
);

// ─── PATCH /api/v1/cart/items/:productId ─────────────────────────────────────

export const updateItemQuantity = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { productId } = req.params;
    const { quantity } = req.body as { quantity: number };

    if (!quantity || quantity < 1)
      throw new ApiError(400, "quantity must be at least 1");

    const product = await Product.findById(productId);
    if (!product) throw new ApiError(404, "Product not found");

    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new ApiError(404, "Cart not found");

    const item = cart.items.find((i) => i.product.toString() === productId);
    if (!item) throw new ApiError(404, "Item not in cart");

    item.quantity = Math.min(Number(quantity), product.stock);
    await cart.save();
    await cart.populate("items.product", PRODUCT_FIELDS);

    res.status(200).json(new ApiResponse(200, cart, "Quantity updated"));
  }
);

// ─── DELETE /api/v1/cart/items/:productId ────────────────────────────────────

export const removeItem = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new ApiError(404, "Cart not found");

    cart.items = cart.items.filter(
      (i) => i.product.toString() !== productId
    ) as typeof cart.items;

    await cart.save();
    await cart.populate("items.product", PRODUCT_FIELDS);

    res.status(200).json(new ApiResponse(200, cart, "Item removed from cart"));
  }
);

// ─── DELETE /api/v1/cart ──────────────────────────────────────────────────────

export const clearCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new ApiError(404, "Cart not found");

    cart.items = [] as unknown as typeof cart.items;
    cart.couponApplied = undefined;
    await cart.save();

    res.status(200).json(new ApiResponse(200, cart, "Cart cleared"));
  }
);

// ─── POST /api/v1/cart/coupon ─────────────────────────────────────────────────

export const applyCoupon = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { code } = req.body as { code: string };

    if (!code) throw new ApiError(400, "Coupon code is required");

    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new ApiError(404, "Cart not found");
    if (cart.items.length === 0) throw new ApiError(400, "Cart is empty");

    const subtotal = cart.items.reduce(
      (sum, i) => sum + i.priceAtAdd * i.quantity,
      0
    );

    // Validate coupon
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon) throw new ApiError(404, "Coupon not found");
    if (!coupon.isActive) throw new ApiError(400, "Coupon is inactive");

    const now = new Date();
    if (now < coupon.validFrom) throw new ApiError(400, "Coupon is not yet valid");
    if (now > coupon.validUntil) throw new ApiError(400, "Coupon has expired");
    if (coupon.usedCount >= coupon.maxUsage)
      throw new ApiError(400, "Coupon usage limit has been reached");
    if (subtotal < coupon.minOrderValue)
      throw new ApiError(
        400,
        `Minimum order value for this coupon is ₹${coupon.minOrderValue}`
      );

    const discountAmount =
      coupon.discountType === "flat"
        ? Math.min(coupon.discountValue, subtotal)
        : Math.round((subtotal * coupon.discountValue) / 100);

    cart.couponApplied = coupon.code;
    await cart.save();

    res.status(200).json(
      new ApiResponse(
        200,
        { couponCode: coupon.code, discountAmount, subtotal, payable: subtotal - discountAmount },
        "Coupon applied successfully"
      )
    );
  }
);

// ─── DELETE /api/v1/cart/coupon ───────────────────────────────────────────────

export const removeCoupon = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!._id;

    const cart = await Cart.findOne({ user: userId }).populate(
      "items.product",
      PRODUCT_FIELDS
    );
    if (!cart) throw new ApiError(404, "Cart not found");

    cart.couponApplied = undefined;
    await cart.save();

    res.status(200).json(new ApiResponse(200, cart, "Coupon removed"));
  }
);
