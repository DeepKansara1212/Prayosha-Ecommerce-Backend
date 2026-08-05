import { z } from "zod";

export const createPurposeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  active: z.boolean().default(true),
});

export const updatePurposeSchema = createPurposeSchema.partial();
