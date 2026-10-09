import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Product, IProduct } from "../models/product.model";
import { Category } from "../models/category.model";
import { SubCategory } from "../models/subCategory.model";
import { RashiProductMapping } from "../models/rashiProductMapping.model";
import { PurposeProductMapping } from "../models/purposeProductMapping.model";
import { paginate } from "../utils/pagination";
import { deleteFromCloudinary } from "../middleware/upload";
import { FilterQuery, Types } from "mongoose";
import { parseWeightInKilograms } from "../services/shipping/weight";

function validateShippingWeights(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const shipping = value as Record<string, unknown>;

  if (
    shipping.weight != null &&
    String(shipping.weight).trim() &&
    parseWeightInKilograms(String(shipping.weight), true) === undefined
  ) {
    throw new ApiError(400, "Shipping weight must be a positive weight with a supported unit");
  }

  if (
    shipping.totalWeight != null &&
    String(shipping.totalWeight).trim() &&
    parseWeightInKilograms(String(shipping.totalWeight)) === undefined
  ) {
    throw new ApiError(
      400,
      "Total shipping weight must include a supported unit, such as 250 g or 1.2 kg"
    );
  }
}

// Replaces this product's Rashi/Purpose mappings wholesale with the given
// id lists (order = priority). Only touches whichever list is provided, so
// omitting a field on update leaves that taxonomy's mappings untouched.
async function syncTaxonomyMappings(
  productId: Types.ObjectId | string,
  rashiIds?: string[],
  purposeIds?: string[]
): Promise<void> {
  if (rashiIds !== undefined) {
    await RashiProductMapping.deleteMany({ product: productId });
    if (rashiIds.length > 0) {
      await RashiProductMapping.insertMany(
        rashiIds.map((rashi, index) => ({ rashi, product: productId, priority: index, active: true }))
      );
    }
  }

  if (purposeIds !== undefined) {
    await PurposeProductMapping.deleteMany({ product: productId });
    if (purposeIds.length > 0) {
      await PurposeProductMapping.insertMany(
        purposeIds.map((purpose, index) => ({ purpose, product: productId, priority: index, active: true }))
      );
    }
  }
}

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
      purpose,
      subCategory,
      inStock,
      page = "1",
      limit = "12",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(48, Math.max(1, parseInt(limit, 10) || 12));

    const filter: FilterQuery<IProduct> = { isActive: true };

    // Category filter — accepts slug. Storefront nav links to categories that
    // may not be created yet, so an unknown slug is a legitimate empty result,
    // not an error.
    if (category) {
      const cat = await Category.findOne({ slug: category, isActive: true });
      if (!cat) {
        res.status(200).json(
          new ApiResponse(
            200,
            { products: [], pagination: paginate(pageNum, limitNum, 0) },
            "Products fetched"
          )
        );
        return;
      }
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

    // Purpose filter — matches products manually tagged with the purpose id.
    if (purpose) {
      if (!Types.ObjectId.isValid(purpose)) {
        res.status(200).json(
          new ApiResponse(
            200,
            { products: [], pagination: paginate(pageNum, limitNum, 0) },
            "Products fetched"
          )
        );
        return;
      }
      filter.purposeTags = new Types.ObjectId(purpose);
    }

    // Sub-category filter — accepts a SubCategory id.
    if (subCategory) {
      if (!Types.ObjectId.isValid(subCategory)) {
        res.status(200).json(
          new ApiResponse(
            200,
            { products: [], pagination: paginate(pageNum, limitNum, 0) },
            "Products fetched"
          )
        );
        return;
      }
      filter.subCategory = new Types.ObjectId(subCategory);
    }

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
        .populate("category", "name slug shipping")
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
      .populate("category", "name slug shipping")
      .select("-costPrice");

    res
      .status(200)
      .json(new ApiResponse(200, { products }, "Featured products fetched"));
  }
);

// ─── GET /api/v1/products/category-summary ───────────────────────────────────

export const getCategorySummary = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const summary = await Product.aggregate([
      { $match: { isActive: true } },
      { $sort: { isFeatured: -1, createdAt: -1 } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          image: { $first: { $arrayElemAt: ["$images", 0] } },
        },
      },
    ]);

    res
      .status(200)
      .json(new ApiResponse(200, { summary }, "Category summary fetched"));
  }
);

// ─── GET /api/v1/products/:slug ───────────────────────────────────────────────

export const getProductBySlug = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const product = await Product.findOne({
      slug: req.params.slug,
      isActive: true,
    })
      .populate("category", "name slug shipping")
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
      .populate("category", "name slug shipping")
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
      video,
      category,
      subCategory,
      tags,
      chakra,
      shape,
      color,
      purposeTags,
      rudrakshaFaces,
      badge,
      beadSize,
      noOfSticks,
      stock,
      lowStockThreshold,
      useCategoryShipping,
      shipping,
      productDetails,
      hasFreeGift,
      careInstructions,
      howToUse,
      metaphysicalProperties,
      isFeatured,
      isActive,
      rashiIds,
      purposeIds,
    } = req.body as Record<string, unknown>;

    if (!name || !sku || !description || !category) {
      throw new ApiError(
        400,
        "name, sku, description, and category are required"
      );
    }

    const normalizedPrice = price === "" || price === null ? undefined : price;
    if (
      normalizedPrice !== undefined &&
      (!Number.isFinite(Number(normalizedPrice)) || Number(normalizedPrice) < 0)
    ) {
      throw new ApiError(400, "Price must be a non-negative number");
    }
    validateShippingWeights(shipping);

    const cat = await Category.findById(category);
    if (!cat) throw new ApiError(404, "Category not found");

    if (subCategory !== undefined && subCategory !== null) {
      if (typeof subCategory !== "string" || !Types.ObjectId.isValid(subCategory)) {
        throw new ApiError(400, "Invalid subcategory");
      }
      const childCategory = await SubCategory.findOne({ _id: subCategory, parentCategory: category });
      if (!childCategory) throw new ApiError(400, "Subcategory does not belong to the selected category");
    }

    const product = await Product.create({
      name,
      slug,
      sku,
      description,
      shortDescription,
      price: normalizedPrice,
      comparePrice,
      costPrice,
      video,
      category,
      subCategory: subCategory ?? undefined,
      tags: tags ?? [],
      chakra,
      shape,
      color,
      purposeTags: purposeTags ?? [],
      rudrakshaFaces,
      beadSize,
      noOfSticks,
      badge,
      stock: stock ?? 0,
      lowStockThreshold: lowStockThreshold ?? 5,
      useCategoryShipping: useCategoryShipping ?? true,
      shipping,
      productDetails,
      careInstructions,
      howToUse,
      metaphysicalProperties,
      isFeatured: isFeatured ?? false,
      isActive: isActive ?? true,
      hasFreeGift: hasFreeGift ?? false,
    });

    await syncTaxonomyMappings(
      product._id as Types.ObjectId,
      rashiIds as string[] | undefined,
      purposeIds as string[] | undefined
    );

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

    if (req.body.subCategory !== undefined && req.body.subCategory !== null) {
      if (typeof req.body.subCategory !== "string" || !Types.ObjectId.isValid(req.body.subCategory)) {
        throw new ApiError(400, "Invalid subcategory");
      }
      const category = req.body.category ?? product.category;
      const childCategory = await SubCategory.findOne({
        _id: req.body.subCategory,
        parentCategory: category,
      });
      if (!childCategory) throw new ApiError(400, "Subcategory does not belong to the selected category");
    }

    validateShippingWeights(req.body.shipping);

    const allowed: (keyof IProduct)[] = [
      "name",
      "slug",
      "sku",
      "description",
      "shortDescription",
      "price",
      "comparePrice",
      "costPrice",
      "video",
      "category",
      "subCategory",
      "tags",
      "chakra",
      "shape",
      "color",
      "purposeTags",
      "rudrakshaFaces",
      "beadSize",
      "noOfSticks",
      "badge",
      "stock",
      "lowStockThreshold",
      "useCategoryShipping",
      "shipping",
      "productDetails",
      "hasFreeGift",
      "careInstructions",
      "howToUse",
      "metaphysicalProperties",
      "isFeatured",
      "isActive",
      "ratings",
    ];

    for (const key of allowed) {
      if (key === "price") continue;
      if (key === "subCategory" && req.body[key] === null) {
        product.subCategory = undefined;
        continue;
      }

      if (req.body[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (product as any)[key] = req.body[key];
      }
    }

    if (req.body.price !== undefined) {
      if (req.body.price === null || req.body.price === "") {
        product.price = undefined;
      } else if (
        !Number.isFinite(Number(req.body.price)) ||
        Number(req.body.price) < 0
      ) {
        throw new ApiError(400, "Price must be a non-negative number");
      } else {
        product.price = Number(req.body.price);
      }
    }

    await product.save();

    await syncTaxonomyMappings(
      product._id as Types.ObjectId,
      req.body.rashiIds as string[] | undefined,
      req.body.purposeIds as string[] | undefined
    );

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

    // Ordered list of existing image URLs to keep (sent as JSON string)
    let existingImages: string[] = [];
    if (req.body.existingImages) {
      try {
        const parsed = JSON.parse(req.body.existingImages as string);
        if (Array.isArray(parsed)) {
          existingImages = parsed.filter((u) => typeof u === "string");
        }
      } catch {
        // ignore parse error — treat as empty
      }
    }

    // Newly uploaded files
    const files = req.files as (Express.Multer.File & { path: string })[];
    const newUrls = files ? files.map((f) => f.path) : [];

    if (existingImages.length === 0 && newUrls.length === 0) {
      throw new ApiError(400, "No images provided");
    }

    // Delete from Cloudinary any images removed by the user
    const toDelete = product.images.filter((img) => !existingImages.includes(img));
    for (const imageUrl of toDelete) {
      const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
      if (match?.[1]) {
        await deleteFromCloudinary(match[1]);
      }
    }

    // Preserve order: existing (in new order) followed by fresh uploads, capped at 6
    product.images = [...existingImages, ...newUrls].slice(0, 6);
    await product.save();

    res.status(200).json(
      new ApiResponse(200, { images: product.images }, "Images updated")
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

// ─── POST /api/v1/admin/products/:id/video ───────────────────────────────────

export const uploadProductVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");

    const file = req.file as (Express.Multer.File & { path: string }) | undefined;
    if (!file?.path) throw new ApiError(400, "No video provided");

    if (product.video) {
      const match = product.video.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
      if (match?.[1]) await deleteFromCloudinary(match[1], "video");
    }

    product.video = file.path;
    await product.save();
    res.status(200).json(new ApiResponse(200, { video: product.video }, "Video updated"));
  }
);

// ─── DELETE /api/v1/admin/products/:id/video ─────────────────────────────────

export const deleteProductVideo = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");

    if (product.video) {
      const match = product.video.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
      if (match?.[1]) await deleteFromCloudinary(match[1], "video");
      product.video = undefined;
      await product.save();
    }

    res.status(200).json(new ApiResponse(200, {}, "Video deleted"));
  }
);
