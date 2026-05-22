import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";

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

    const imageUrl = (req.file as Express.Multer.File & { path: string })?.path;

    const category = await Category.create({
      name,
      slug,
      description,
      image: imageUrl,
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
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

    const productCount = await Product.countDocuments({ category: id });
    if (productCount > 0) {
      throw new ApiError(
        409,
        `Cannot delete: ${productCount} product(s) are linked to this category`
      );
    }

    await category.deleteOne();

    res
      .status(200)
      .json(new ApiResponse(200, {}, "Category deleted"));
  }
);
