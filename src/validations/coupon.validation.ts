import { z } from "zod";

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .min(3, "Code must be at least 3 characters")
      .max(20, "Code must be at most 20 characters")
      .transform((v) => v.toUpperCase()),
    discountType:  z.enum(["flat", "percent"]),
    discountValue: z.number().positive("Discount value must be positive"),
    minOrderValue: z.number().min(0).default(0),
    maxUsage:      z.number().int().positive("maxUsage must be a positive integer").default(1),
    validFrom:     z.string().datetime("validFrom must be a valid ISO datetime"),
    validUntil:    z.string().datetime("validUntil must be a valid ISO datetime"),
    isActive:      z.boolean().default(true),
  })
  .refine((d) => new Date(d.validUntil) > new Date(d.validFrom), {
    message: "validUntil must be after validFrom",
    path: ["validUntil"],
  });

export const updateCouponSchema = z
  .object({
    code: z
      .string()
      .min(3, "Code must be at least 3 characters")
      .max(20, "Code must be at most 20 characters")
      .transform((v) => v.toUpperCase()),
    discountType:  z.enum(["flat", "percent"]),
    discountValue: z.number().positive("Discount value must be positive"),
    minOrderValue: z.number().min(0),
    maxUsage:      z.number().int().positive("maxUsage must be a positive integer"),
    validFrom:     z.string().datetime("validFrom must be a valid ISO datetime"),
    validUntil:    z.string().datetime("validUntil must be a valid ISO datetime"),
    isActive:      z.boolean(),
  })
  .partial()
  .refine(
    (d) => {
      if (d.validFrom && d.validUntil) {
        return new Date(d.validUntil) > new Date(d.validFrom);
      }
      return true;
    },
    {
      message: "validUntil must be after validFrom",
      path: ["validUntil"],
    }
  );
