import { z } from "zod";

export const createRudrakshaTypeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().max(1000).optional(),
});

export const updateRudrakshaTypeSchema = createRudrakshaTypeSchema.partial();
