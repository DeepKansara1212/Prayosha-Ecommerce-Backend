import { z } from "zod";

const dimensionsSchema = z.object({
  l: z.number().min(0),
  w: z.number().min(0),
  h: z.number().min(0),
});

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  sku: z.string().min(1, "SKU is required").max(50).toUpperCase(),
  description: z.string().min(1, "Description is required"),
  shortDescription: z.string().max(200).optional(),
  price: z.number({ required_error: "Price is required" }).min(0),
  comparePrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  category: z.string().min(1, "Category is required"),
  tags: z.array(z.string()).default([]),
  chakra: z.string().optional(),
  badge: z.enum(["BESTSELLER", "NEW", "LIMITED", "RARE", "GIFT SET"]).optional(),
  stock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  weight: z.number().min(0).optional(),
  dimensions: dimensionsSchema.optional(),
  careInstructions: z.string().optional(),
  metaphysicalProperties: z.string().optional(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();
