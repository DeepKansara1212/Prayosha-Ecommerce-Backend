import { Router } from "express";
import multer from "multer";
import {
  getActiveBanners,
  getAllBannersAdmin,
  createBanner,
  updateBanner,
  toggleBanner,
  reorderBanners,
  deleteBanner,
} from "../controllers/heroBanner.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { ApiError } from "../utils/ApiError";

// ─── Memory-storage multer for banner images ──────────────────────────────────

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, "Only JPG, PNG, and WebP images are allowed"));
  }
};

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ─── Public ───────────────────────────────────────────────────────────────────

const router = Router();
router.get("/", getActiveBanners);
export default router;

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminHeroBannerRouter = Router();
adminHeroBannerRouter.use(verifyJWT, verifyAdmin);

adminHeroBannerRouter.get("/", getAllBannersAdmin);
adminHeroBannerRouter.post("/", bannerUpload.single("image"), createBanner);
adminHeroBannerRouter.patch("/reorder", reorderBanners);
adminHeroBannerRouter.patch("/:id/toggle", toggleBanner);
adminHeroBannerRouter.patch("/:id", bannerUpload.single("image"), updateBanner);
adminHeroBannerRouter.delete("/:id", deleteBanner);
