import { z } from "zod";

export const createRashiSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  code: z
    .string()
    .min(2, "Code must be at least 2 characters")
    .max(20)
    .transform((v) => v.toUpperCase()),
});

export const updateRashiSchema = createRashiSchema.partial();
