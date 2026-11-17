import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { SubCategory } from "../models/subCategory.model";
import { getProducts } from "./product.controller";

vi.mock("../models/product.model", () => ({
  Product: { find: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock("../models/category.model", () => ({
  Category: { findOne: vi.fn() },
}));
vi.mock("../models/subCategory.model", () => ({
  SubCategory: { findOne: vi.fn() },
}));
vi.mock("../models/meaning.model", () => ({
  Meaning: { findOne: vi.fn() },
}));
vi.mock("../models/rashiProductMapping.model", () => ({
  RashiProductMapping: { deleteMany: vi.fn(), insertMany: vi.fn() },
}));
vi.mock("../models/purposeProductMapping.model", () => ({
  PurposeProductMapping: { deleteMany: vi.fn(), insertMany: vi.fn() },
}));
vi.mock("../middleware/upload", () => ({
  deleteFromCloudinary: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("getProducts taxonomy filters", () => {
  it("filters a subcategory within its parent across legacy and assigned category data", async () => {
    const categoryId = new Types.ObjectId();
    const subCategoryId = new Types.ObjectId();
    vi.mocked(Category.findOne).mockResolvedValue({
      _id: categoryId,
      name: "Rudraksha",
    } as never);
    vi.mocked(SubCategory.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue({ name: "1 Mukhi" }),
    } as never);

    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(Product.find).mockReturnValue(query as never);
    vi.mocked(Product.countDocuments).mockResolvedValue(0 as never);

    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const result = new Promise<void>((resolve) => {
      vi.mocked(response.json).mockImplementation(() => {
        resolve();
        return response;
      });
    });

    getProducts(
      {
        query: {
          category: "rudraksh",
          subCategory: subCategoryId.toString(),
        },
      } as unknown as Request,
      response,
      vi.fn(),
    );
    await result;

    expect(Product.find).toHaveBeenCalledWith({
      isActive: true,
      $and: [
        {
          $or: [
            { categories: categoryId },
            { category: categoryId },
            { "categorySubCategories.category": categoryId },
          ],
        },
        {
          $or: [
            {
              categorySubCategories: {
                $elemMatch: {
                  category: categoryId,
                  subCategory: subCategoryId,
                },
              },
            },
            { category: categoryId, subCategory: subCategoryId },
            { categories: categoryId, subCategory: subCategoryId },
            { rudrakshaFaces: /^(?:1|1\s*mukhi)$/i },
          ],
        },
      ],
    });
  });

  it("matches the selected Rudraksha face exactly", async () => {
    const categoryId = new Types.ObjectId();
    vi.mocked(Category.findOne).mockResolvedValue({
      _id: categoryId,
      name: "Rudraksha",
    } as never);

    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(Product.find).mockReturnValue(query as never);
    vi.mocked(Product.countDocuments).mockResolvedValue(0 as never);

    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const result = new Promise<void>((resolve) => {
      vi.mocked(response.json).mockImplementation(() => {
        resolve();
        return response;
      });
    });

    getProducts(
      {
        query: { category: "rudraksh", rudrakshaFaces: "1 Mukhi" },
      } as unknown as Request,
      response,
      vi.fn(),
    );
    await result;

    expect(Product.find).toHaveBeenCalledWith({
      isActive: true,
      $and: [
        {
          $or: [
            { categories: categoryId },
            { category: categoryId },
            { "categorySubCategories.category": categoryId },
          ],
        },
      ],
      rudrakshaFaces: /^(?:1|1\s*mukhi)$/i,
    });
  });
});
