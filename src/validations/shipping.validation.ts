import { z } from "zod";

export const createShipmentSchema = z.object({
  provider: z.string().min(1, "provider is required"),
  carrierName: z.string().trim().min(1).max(120).optional(),
  courierSlug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/i).optional(),
  trackingNumber: z.string().trim().min(1).max(120).optional(),
}).superRefine((value, ctx) => {
  if (value.provider !== "aftership") return;
  if (!value.carrierName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["carrierName"],
      message: "Courier name is required for AfterShip tracking",
    });
  }
  if (!value.trackingNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["trackingNumber"],
      message: "Tracking number is required for AfterShip tracking",
    });
  }
});

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
