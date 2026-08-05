import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Category, ICategoryShipping } from "../models/category.model";
import { Product } from "../models/product.model";

// Multipart form fields arrive as strings — parse a shipping sub-object out of the
// flat shippingWeight/shippingLength/shippingBreadth/shippingHeight body fields.
function parseShippingFields(body: Record<string, unknown>): Partial<ICategoryShipping> {
  const toNumber = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const shipping: Partial<ICategoryShipping> = {};
  const weight = toNumber(body.shippingWeight);
  const length = toNumber(body.shippingLength);
  const breadth = toNumber(body.shippingBreadth);
  const height = toNumber(body.shippingHeight);

  if (weight !== undefined) shipping.weight = weight;
  if (length !== undefined) shipping.length = length;
  if (breadth !== undefined) shipping.breadth = breadth;
  if (height !== undefined) shipping.height = height;

  return shipping;
}

// ─── GET /api/v1/admin/categories ────────────────────────────────────────────

export const getAllCategoriesAdmin = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const categories = await Category.find().sort({ sortOrder: 1, name: 1 });
    res.status(200).json(new ApiResponse(200, { categories }, "Categories fetched"));
  }
);

// ─── GET /api/v1/categories ───────────────────────────────────────────────────

export const getAllCategories = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const categories = await Category.find({ isActive: true }).sort({
      sortOrder: 1,
      name: 1,
    });

    res
      .status(200)
      .json(new ApiResponse(200, { categories }, "Categories fetched"));
  }
);

// ─── POST /api/v1/admin/categories ───────────────────────────────────────────

export const createCategory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { name, slug, description, isActive, sortOrder } = req.body as {
      name: string;
      slug?: string;
      description?: string;
      isActive?: boolean;
      sortOrder?: number;
    };

    if (!name) throw new ApiError(400, "Category name is required");

    const shipping = parseShippingFields(req.body as Record<string, unknown>);
    if (shipping.weight === undefined || shipping.weight <= 0) {
      throw new ApiError(400, "Shipping weight is required and must be greater than 0");
    }
    for (const [field, value] of Object.entries(shipping)) {
      if (field !== "weight" && value !== undefined && value <= 0) {
        throw new ApiError(400, `Shipping ${field} must be greater than 0`);
      }
    }

    const imageUrl = (req.file as Express.Multer.File & { path: string })?.path;

    const category = await Category.create({
      name,
      slug,
      description,
      image: imageUrl,
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
      shipping,
    });

    res
      .status(201)
      .json(new ApiResponse(201, { category }, "Category created"));
  }
);

// ─── PATCH /api/v1/admin/categories/:id ──────────────────────────────────────

export const updateCategory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) throw new ApiError(404, "Category not found");

    const { name, slug, description, isActive, sortOrder } = req.body as {
      name?: string;
      slug?: string;
      description?: string;
      isActive?: boolean;
      sortOrder?: number;
    };

    const imageUrl = (req.file as Express.Multer.File & { path: string })?.path;

    if (name !== undefined) category.name = name;
    if (slug !== undefined) category.slug = slug;
    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (imageUrl) category.image = imageUrl;

    const shipping = parseShippingFields(req.body as Record<string, unknown>);
    if (shipping.weight !== undefined && shipping.weight <= 0) {
      throw new ApiError(400, "Shipping weight must be greater than 0");
    }
    for (const [field, value] of Object.entries(shipping)) {
      if (field !== "weight" && value !== undefined && value <= 0) {
        throw new ApiError(400, `Shipping ${field} must be greater than 0`);
      }
    }
    if (shipping.weight !== undefined) category.shipping.weight = shipping.weight;
    if (shipping.length !== undefined) category.shipping.length = shipping.length;
    if (shipping.breadth !== undefined) category.shipping.breadth = shipping.breadth;
    if (shipping.height !== undefined) category.shipping.height = shipping.height;

    await category.save();

    res
      .status(200)
      .json(new ApiResponse(200, { category }, "Category updated"));
  }
);

// ─── DELETE /api/v1/admin/categories/:id ─────────────────────────────────────

export const deleteCategory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) throw new ApiError(404, "Category not found");

    await Product.updateMany({ category: id }, { $unset: { category: "" } });

    await category.deleteOne();

    res
      .status(200)
      .json(new ApiResponse(200, {}, "Category deleted"));
  }
);
