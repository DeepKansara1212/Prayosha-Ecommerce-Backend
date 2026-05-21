import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Product, IProduct } from "../models/product.model";
import { Category } from "../models/category.model";
import { paginate } from "../utils/pagination";
import { deleteFromCloudinary } from "../middleware/upload";
import { FilterQuery } from "mongoose";

// ─── GET /api/v1/products ─────────────────────────────────────────────────────

export const getProducts = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      category,
      search,
      sort = "newest",
      minPrice,
      maxPrice,
      badge,
      chakra,
      inStock,
      page = "1",
      limit = "12",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(48, Math.max(1, parseInt(limit, 10) || 12));

    const filter: FilterQuery<IProduct> = { isActive: true };

    // Category filter — accepts slug
    if (category) {
      const cat = await Category.findOne({ slug: category, isActive: true });
      if (!cat) throw new ApiError(404, "Category not found");
      filter.category = cat._id;
    }

    // Full-text search
    if (search) {
      filter.$text = { $search: search };
    }

    // Price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Badge
    if (badge) filter.badge = badge.toUpperCase();

    // Chakra
    if (chakra) filter.chakra = { $regex: new RegExp(`^${chakra}$`, "i") };

    // In-stock only
    if (inStock === "true") filter.stock = { $gt: 0 };

    // Sort options
    const sortMap: Record<string, Record<string, 1 | -1>> = {
      featured: { isFeatured: -1, createdAt: -1 },
      newest: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      name_asc: { name: 1 },
    };
    const sortQuery = sortMap[sort] ?? sortMap.newest;

    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortQuery)
        .skip(skip)
        .limit(limitNum)
        .populate("category", "name slug")
        .select("-costPrice"),
      Product.countDocuments(filter),
    ]);

    res.status(200).json(
      new ApiResponse(
        200,
        { products, pagination: paginate(pageNum, limitNum, total) },
        "Products fetched"
      )
    );
  }
);

// ─── GET /api/v1/products/featured ───────────────────────────────────────────

export const getFeaturedProducts = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const products = await Product.find({ isActive: true, isFeatured: true })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate("category", "name slug")
      .select("-costPrice");

    res
      .status(200)
      .json(new ApiResponse(200, { products }, "Featured products fetched"));
  }
);

// ─── GET /api/v1/products/:slug ───────────────────────────────────────────────

export const getProductBySlug = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const product = await Product.findOne({
      slug: req.params.slug,
      isActive: true,
    })
      .populate("category", "name slug")
      .select("-costPrice");

    if (!product) throw new ApiError(404, "Product not found");

    const lowStock =
      product.stock > 0 && product.stock <= product.lowStockThreshold;

    res.status(200).json(
      new ApiResponse(
        200,
        { product, lowStockWarning: lowStock },
        "Product fetched"
      )
    );
  }
);

// ─── GET /api/v1/products/:slug/related ──────────────────────────────────────

export const getRelatedProducts = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const product = await Product.findOne({
      slug: req.params.slug,
      isActive: true,
    }).select("_id category");

    if (!product) throw new ApiError(404, "Product not found");

    const related = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isActive: true,
    })
      .limit(4)
      .populate("category", "name slug")
      .select("-costPrice");

    res
      .status(200)
      .json(new ApiResponse(200, { products: related }, "Related products fetched"));
  }
);

// ─── POST /api/v1/admin/products ─────────────────────────────────────────────

export const createProduct = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      name,
      slug,
      sku,
      description,
      shortDescription,
      price,
      comparePrice,
      costPrice,
      category,
      tags,
      chakra,
      badge,
      stock,
      lowStockThreshold,
      weight,
      dimensions,
      careInstructions,
      metaphysicalProperties,
      isFeatured,
      isActive,
    } = req.body as Record<string, unknown>;

    if (!name || !sku || !description || !price || !category) {
      throw new ApiError(
        400,
        "name, sku, description, price, and category are required"
      );
    }

    const cat = await Category.findById(category);
    if (!cat) throw new ApiError(404, "Category not found");

    const product = await Product.create({
      name,
      slug,
      sku,
      description,
      shortDescription,
      price,
      comparePrice,
      costPrice,
      category,
      tags: tags ?? [],
      chakra,
      badge,
      stock: stock ?? 0,
      lowStockThreshold: lowStockThreshold ?? 5,
      weight,
      dimensions,
      careInstructions,
      metaphysicalProperties,
      isFeatured: isFeatured ?? false,
      isActive: isActive ?? true,
    });

    res
      .status(201)
      .json(new ApiResponse(201, { product }, "Product created"));
  }
);

// ─── PATCH /api/v1/admin/products/:id ────────────────────────────────────────

export const updateProduct = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");

    const allowed: (keyof IProduct)[] = [
      "name",
      "slug",
      "sku",
      "description",
      "shortDescription",
      "price",
      "comparePrice",
      "costPrice",
      "category",
      "tags",
      "chakra",
      "badge",
      "stock",
      "lowStockThreshold",
      "weight",
      "dimensions",
      "careInstructions",
      "metaphysicalProperties",
      "isFeatured",
      "isActive",
      "ratings",
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (product as any)[key] = req.body[key];
      }
    }

    await product.save();

    res
      .status(200)
      .json(new ApiResponse(200, { product }, "Product updated"));
  }
);

// ─── DELETE /api/v1/admin/products/:id ───────────────────────────────────────

export const deleteProduct = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");

    product.isActive = false;
    await product.save();

    res
      .status(200)
      .json(new ApiResponse(200, {}, "Product deactivated (soft delete)"));
  }
);

// ─── POST /api/v1/admin/products/:id/images ──────────────────────────────────

export const uploadProductImages = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");

    const files = req.files as (Express.Multer.File & { path: string })[];
    if (!files || files.length === 0) {
      throw new ApiError(400, "At least one image is required");
    }

    const availableSlots = 6 - product.images.length;
    if (availableSlots <= 0) {
      throw new ApiError(400, "Product already has the maximum of 6 images");
    }

    const toAdd = files.slice(0, availableSlots).map((f) => f.path);
    product.images.push(...toAdd);
    await product.save();

    res.status(200).json(
      new ApiResponse(
        200,
        { images: product.images },
        `${toAdd.length} image(s) uploaded`
      )
    );
  }
);

// ─── DELETE /api/v1/admin/products/:id/images ────────────────────────────────

export const deleteProductImage = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { imageUrl } = req.body as { imageUrl?: string };
    if (!imageUrl) throw new ApiError(400, "imageUrl is required");

    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");

    if (!product.images.includes(imageUrl)) {
      throw new ApiError(404, "Image not found on this product");
    }

    // Extract Cloudinary public_id from the secure URL
    // URL pattern: https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<folder>/<public_id>.<ext>
    const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
    if (match?.[1]) {
      await deleteFromCloudinary(match[1]);
    }

    product.images = product.images.filter((img) => img !== imageUrl);
    await product.save();

    res
      .status(200)
      .json(new ApiResponse(200, { images: product.images }, "Image deleted"));
  }
);
