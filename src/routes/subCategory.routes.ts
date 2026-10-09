import { Router } from "express";
import {
  getSubCategories,
  getAllSubCategoriesAdmin,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
} from "../controllers/subCategory.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();
router.get("/", getSubCategories);

export default router;

export const adminSubCategoryRouter = Router();
adminSubCategoryRouter.use(verifyJWT, verifyAdmin);
adminSubCategoryRouter.get("/", getAllSubCategoriesAdmin);
adminSubCategoryRouter.post("/", upload.single("image"), createSubCategory);
adminSubCategoryRouter.patch("/:id", upload.single("image"), updateSubCategory);
adminSubCategoryRouter.delete("/:id", deleteSubCategory);
