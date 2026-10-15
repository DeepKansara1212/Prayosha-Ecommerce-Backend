import { z } from "zod";

export const createMeaningSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  active: z.boolean().default(true),
});

export const updateMeaningSchema = createMeaningSchema.partial();
