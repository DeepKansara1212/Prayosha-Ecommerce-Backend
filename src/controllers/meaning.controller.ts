import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Meaning } from "../models/meaning.model";
import { Product } from "../models/product.model";

export const getActiveMeanings = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const meanings = await Meaning.find({ active: true }).sort({ name: 1 });
    res.status(200).json(new ApiResponse(200, { meanings }, "Meanings fetched"));
  }
);

export const getMeanings = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const [meanings, counts] = await Promise.all([
      Meaning.find().sort({ name: 1 }).lean(),
      Product.aggregate([
        { $unwind: "$meaningTags" },
        { $group: { _id: "$meaningTags", count: { $sum: 1 } } },
      ]),
    ]);
    const countMap = new Map(counts.map((item) => [item._id.toString(), item.count]));
    const result = meanings.map((meaning) => ({
      ...meaning,
      mappedProductCount: countMap.get(meaning._id.toString()) ?? 0,
    }));

    res.status(200).json(new ApiResponse(200, { meanings: result }, "Meanings fetched"));
  }
);

export const createMeaning = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { name, active } = req.body;
    const meaning = await Meaning.create({ name, active });
    res.status(201).json(new ApiResponse(201, { meaning }, "Meaning created"));
  }
);

export const updateMeaning = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const meaning = await Meaning.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!meaning) throw new ApiError(404, "Meaning not found");
    res.status(200).json(new ApiResponse(200, { meaning }, "Meaning updated"));
  }
);

export const deleteMeaning = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const meaning = await Meaning.findById(req.params.id);
    if (!meaning) throw new ApiError(404, "Meaning not found");
    await Product.updateMany(
      { meaningTags: meaning._id },
      { $pull: { meaningTags: meaning._id } }
    );
    await meaning.deleteOne();
    res.status(200).json(new ApiResponse(200, { meaning }, "Meaning deleted"));
  }
);
