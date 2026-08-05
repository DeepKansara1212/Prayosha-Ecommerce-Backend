import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const createRudrakshaProductMappingSchema = z.object({
  rudrakshaType: objectId,
  product: objectId,
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const updateRudrakshaProductMappingSchema = createRudrakshaProductMappingSchema.partial();
