import { z } from "zod";

const shippingSchema = z.object({
  weight: z.string().optional(),
  totalWeight: z.string().optional(),
  length: z.string().optional(),
  breadth: z.string().optional(),
  height: z.string().optional(),
});

const productDetailsSchema = z.object({
  weight: z.string().optional(),
  length: z.string().optional(),
  breadth: z.string().optional(),
  height: z.string().optional(),
  dimensions: z.string().optional(),
  size: z.string().optional(),
});

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  sku: z.string().min(1, "SKU is required").max(50).toUpperCase(),
  description: z.string().min(1, "Description is required"),
  shortDescription: z.string().max(200).optional(),
  price: z.number().min(0).nullable().optional(),
  comparePrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  video: z.string().url().optional(),
  category: z.string().min(1, "Category is required"),
  subCategory: objectId.nullable().optional(),
  tags: z.array(z.string()).default([]),
  chakra: z.string().optional(),
  shape: z.string().trim().max(100).optional(),
  color: z.string().trim().max(100).optional(),
  purposeTags: z.array(objectId).optional(),
  rudrakshaFaces: z.string().trim().max(50).optional(),
  beadSize: z.string().trim().max(50).optional(),
  noOfSticks: z.number().int().min(1).optional(),
  badge: z.enum(["BESTSELLER", "NEW", "LIMITED", "RARE", "GIFT SET"]).optional(),
  stock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  useCategoryShipping: z.boolean().optional().default(true),
  shipping: shippingSchema.optional(),
  productDetails: productDetailsSchema.optional(),
  careInstructions: z.string().optional(),
  howToUse: z.string().optional(),
  metaphysicalProperties: z.string().optional(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  hasFreeGift: z.boolean().optional(),
  rashiIds: z.array(objectId).optional(),
  purposeIds: z.array(objectId).optional(),
});

export const updateProductSchema = createProductSchema.partial();
