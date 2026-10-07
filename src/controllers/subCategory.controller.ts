import { Request, Response } from "express";
import { Types } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { SubCategory } from "../models/subCategory.model";

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

    const subcategory = await SubCategory.create({
      name,
      slug,
      parentCategory,
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
