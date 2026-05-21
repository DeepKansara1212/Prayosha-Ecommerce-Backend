import { Router, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { NewsletterSubscriber } from "../models/newsletter.model";

const router = Router();

// POST /api/v1/newsletter/subscribe
router.post(
  "/subscribe",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email || !email.trim())
      throw new ApiError(400, "A valid email address is required");

    // upsert: silently succeeds even if already subscribed
    await NewsletterSubscriber.updateOne(
      { email: email.toLowerCase().trim() },
      { $setOnInsert: { subscribedAt: new Date() } },
      { upsert: true }
    );

    res
      .status(200)
      .json(new ApiResponse(200, null, "Thank you for subscribing!"));
  })
);

export default router;
