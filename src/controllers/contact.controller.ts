import { Request, Response } from "express";
import { env } from "../config/env";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { sendContactInquiryEmail } from "../utils/email";

export const submitContactMessage = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!env.CONTACT_EMAIL || !env.EMAIL_USER || !env.EMAIL_PASS) {
      throw new ApiError(
        503,
        "Contact email is not configured yet. Please contact us by phone or WhatsApp."
      );
    }

    await sendContactInquiryEmail(req.body);
    res.status(200).json(new ApiResponse(200, null, "Your message has been sent."));
  }
);
