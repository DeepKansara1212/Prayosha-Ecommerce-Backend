import { Router } from "express";
import {
  getProducts,
  getFeaturedProducts,
  getCategorySummary,
  getProductBySlug,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
  deleteProductImage,
  uploadProductVideo,
  deleteProductVideo,
} from "../controllers/product.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { upload, uploadVideo } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { uploadLimiter } from "../middleware/rateLimiter";
import { createProductSchema, updateProductSchema } from "../validations/product.validation";
import { reviewRouter } from "./review.routes";

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────

router.get("/", getProducts);
router.get("/featured", getFeaturedProducts);
router.get("/category-summary", getCategorySummary);
router.get("/:slug", getProductBySlug);
router.get("/:slug/related", getRelatedProducts);

// ─── Reviews (nested under product slug) ─────────────────────────────────────

router.use("/:slug/reviews", reviewRouter);

// ─── Admin ────────────────────────────────────────────────────────────────────

router.use(verifyJWT, verifyAdmin);

router.post("/", validate(createProductSchema), createProduct);
router.patch("/:id", validate(updateProductSchema), updateProduct);
router.delete("/:id", deleteProduct);
router.post("/:id/images", uploadLimiter, upload.array("images", 6), uploadProductImages);
router.delete("/:id/images", deleteProductImage);
router.post("/:id/video", uploadLimiter, uploadVideo.single("video"), uploadProductVideo);
router.delete("/:id/video", deleteProductVideo);

export default router;
