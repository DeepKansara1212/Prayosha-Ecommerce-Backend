import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/ApiError";
import { Request, Response } from "express";

const handler = (message: string) => (_req: Request, res: Response) => {
  const err = new ApiError(429, message);
  res.status(429).json({ success: false, statusCode: 429, message: err.message });
};

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many requests. Please try again after 15 minutes."),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Too many auth attempts. Please try again after 15 minutes."),
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Upload limit reached. Please try again after 15 minutes."),
});
