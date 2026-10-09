import { Router } from "express";
import { z } from "zod";
import { submitContactMessage } from "../controllers/contact.controller";
import { contactLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";

const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  subject: z.enum([
    "Product enquiry",
    "Order / shipping",
    "Returns & refunds",
    "Crystal guidance",
    "Wholesale / bulk",
    "Press & media",
    "Other",
  ]),
  message: z.string().trim().min(20).max(500),
  productUrl: z.string().url().max(2048).optional(),
});

const router = Router();

router.post(
  "/",
  contactLimiter,
  validate(contactMessageSchema),
  submitContactMessage
);

export default router;
