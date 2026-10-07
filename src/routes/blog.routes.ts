import { Router } from "express";
import {
  getPublishedBlogs,
  getBlogBySlug,
  getAllBlogsAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  uploadBlogImages,
} from "../controllers/blog.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";
import { uploadBlogImages as uploadBlogImagesMiddleware } from "../middleware/upload";

// ─── Public ───────────────────────────────────────────────────────────────────

const router = Router();

router.get("/", getPublishedBlogs);
router.get("/:slug", getBlogBySlug);

export default router;

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminBlogRouter = Router();
adminBlogRouter.use(verifyJWT, verifyAdmin);
adminBlogRouter.get("/", getAllBlogsAdmin);
adminBlogRouter.post(
  "/upload-images",
  uploadBlogImagesMiddleware.array("images", 6),
  uploadBlogImages,
);
adminBlogRouter.post("/", createBlog);
adminBlogRouter.patch("/:id", updateBlog);
adminBlogRouter.delete("/:id", deleteBlog);
