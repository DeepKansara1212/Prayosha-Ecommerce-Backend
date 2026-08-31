import { z } from "zod";

export const createShipmentSchema = z.object({
  provider: z.string().min(1, "provider is required"),
});

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
