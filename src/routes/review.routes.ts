import { Router } from "express";
import {
  getAllReviews,
  submitReview,
  getProductReviews,
  approveReview,
  deleteReview,
} from "../controllers/review.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { submitReviewSchema } from "../validations/review.validation";

// ─── Product review routes — mounted at /api/v1/products/:slug/reviews ───────
// mergeParams: true gives access to :slug from the parent product router

export const reviewRouter = Router({ mergeParams: true });

reviewRouter.get("/", getProductReviews);
reviewRouter.post("/", verifyJWT, validate(submitReviewSchema), submitReview);

// ─── Admin review routes — mounted at /api/v1/admin/reviews ──────────────────

export const adminReviewRouter = Router();

adminReviewRouter.use(verifyJWT, verifyAdmin);

adminReviewRouter.get("/", getAllReviews);
adminReviewRouter.patch("/:id/approve", approveReview);
adminReviewRouter.delete("/:id", deleteReview);
