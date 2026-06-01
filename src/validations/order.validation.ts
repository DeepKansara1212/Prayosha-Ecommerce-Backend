import { z } from "zod";

export const createOrderSchema = z.object({
  addressId: z.string().min(1, "addressId is required"),
  couponCode: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const razorpayVerifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "placed",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ]),
  note: z.string().max(500).optional(),
  trackingNumber: z.string().optional(),
});
