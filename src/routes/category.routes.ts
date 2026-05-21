import { Router } from "express";
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────

router.get("/", getAllCategories);

// ─── Admin ────────────────────────────────────────────────────────────────────

router.use(verifyJWT, verifyAdmin);

router.post("/", upload.single("image"), createCategory);
router.patch("/:id", upload.single("image"), updateCategory);
router.delete("/:id", deleteCategory);

export default router;
