import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const createPurposeRudrakshaMappingSchema = z.object({
  purpose: objectId,
  rudrakshaType: objectId,
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const updatePurposeRudrakshaMappingSchema = createPurposeRudrakshaMappingSchema.partial();
