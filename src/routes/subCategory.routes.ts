import { Router } from "express";
import {
  getSubCategories,
  getAllSubCategoriesAdmin,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
} from "../controllers/subCategory.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";

const router = Router();
router.get("/", getSubCategories);

export default router;

export const adminSubCategoryRouter = Router();
adminSubCategoryRouter.use(verifyJWT, verifyAdmin);
adminSubCategoryRouter.get("/", getAllSubCategoriesAdmin);
adminSubCategoryRouter.post("/", createSubCategory);
adminSubCategoryRouter.patch("/:id", updateSubCategory);
adminSubCategoryRouter.delete("/:id", deleteSubCategory);
