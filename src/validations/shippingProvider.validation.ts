import { z } from "zod";

export const updateShippingProviderSchema = z.object({
  isActive: z.boolean().optional(),
  credentials: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type UpdateShippingProviderInput = z.infer<typeof updateShippingProviderSchema>;
