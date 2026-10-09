import { Request, Response } from "express";
import { Types } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { SubCategory } from "../models/subCategory.model";
import { parseWeightInKilograms } from "../services/shipping/weight";

const SHIPPING_KEYS = ["weight", "length", "breadth", "height"] as const;

function parseShipping(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Shipping details must be an object");
  }

  const input = value as Record<string, unknown>;
  const shipping: Record<string, string> = {};
  for (const key of SHIPPING_KEYS) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const field = String(raw).trim();
    if (!field) continue;
    if (key === "weight" && parseWeightInKilograms(field, true) === undefined) {
      throw new ApiError(
        400,
        "Shipping weight must be a positive number, optionally followed by g, kg, mg, lb, or oz"
      );
    }
    shipping[key] = field;
  }
  return shipping;
}

// ─── GET /api/v1/subcategories ────────────────────────────────────────────────

export const getSubCategories = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { category } = req.query as { category?: string };
    const filter: { isActive: boolean; parentCategory?: Types.ObjectId } = { isActive: true };

    if (category) {
      const parentCategory = await Category.findOne({ slug: category, isActive: true }).select("_id");
      if (!parentCategory) {
        res.status(200).json(new ApiResponse(200, { subcategories: [] }, "Subcategories fetched"));
        return;
      }
      filter.parentCategory = parentCategory._id;
    }

    const subcategories = await SubCategory.find(filter).sort({ sortOrder: 1, name: 1 });
    res.status(200).json(new ApiResponse(200, { subcategories }, "Subcategories fetched"));
  }
);

// ─── GET /api/v1/admin/subcategories ──────────────────────────────────────────

export const getAllSubCategoriesAdmin = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const subcategories = await SubCategory.find()
      .populate("parentCategory", "name slug")
      .sort({ sortOrder: 1, name: 1 });
    res.status(200).json(new ApiResponse(200, { subcategories }, "Subcategories fetched"));
  }
);

// ─── POST /api/v1/admin/subcategories ─────────────────────────────────────────

export const createSubCategory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { name, slug, parentCategory, isActive, sortOrder } = req.body as {
      name?: string;
      slug?: string;
      parentCategory?: string;
      isActive?: boolean;
      sortOrder?: number;
    };

    if (!name) throw new ApiError(400, "Subcategory name is required");
    if (!parentCategory || !Types.ObjectId.isValid(parentCategory)) {
      throw new ApiError(400, "A valid parent category is required");
    }

    const category = await Category.findById(parentCategory).select("_id");
    if (!category) throw new ApiError(404, "Parent category not found");
    const shipping = parseShipping(req.body.shipping);

    const subcategory = await SubCategory.create({
      name,
      slug,
      parentCategory,
      ...(shipping && Object.keys(shipping).length > 0 && { shipping }),
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
    });

    res.status(201).json(new ApiResponse(201, { subcategory }, "Subcategory created"));
  }
);

// ─── PATCH /api/v1/admin/subcategories/:id ────────────────────────────────────

export const updateSubCategory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const subcategory = await SubCategory.findById(req.params.id);
    if (!subcategory) throw new ApiError(404, "Subcategory not found");

    const { name, slug, parentCategory, isActive, sortOrder } = req.body as {
      name?: string;
      slug?: string;
      parentCategory?: string;
      isActive?: boolean;
      sortOrder?: number;
    };

    if (name !== undefined) subcategory.name = name;
    if (slug !== undefined) subcategory.slug = slug;
    if (isActive !== undefined) subcategory.isActive = isActive;
    if (sortOrder !== undefined) subcategory.sortOrder = sortOrder;
    const shipping = parseShipping(req.body.shipping);
    if (shipping !== undefined) {
      subcategory.shipping = Object.keys(shipping).length > 0 ? shipping : undefined;
    }

    if (parentCategory !== undefined) {
      if (!Types.ObjectId.isValid(parentCategory)) {
        throw new ApiError(400, "A valid parent category is required");
      }
      const category = await Category.findById(parentCategory).select("_id");
      if (!category) throw new ApiError(404, "Parent category not found");
      subcategory.parentCategory = new Types.ObjectId(parentCategory);
    }

    await subcategory.save();
    res.status(200).json(new ApiResponse(200, { subcategory }, "Subcategory updated"));
  }
);

// ─── DELETE /api/v1/admin/subcategories/:id ───────────────────────────────────

export const deleteSubCategory = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const subcategory = await SubCategory.findById(req.params.id);
    if (!subcategory) throw new ApiError(404, "Subcategory not found");

    await Product.updateMany({ subCategory: subcategory._id }, { $unset: { subCategory: "" } });
    await subcategory.deleteOne();

    res.status(200).json(new ApiResponse(200, {}, "Subcategory deleted"));
  }
);
