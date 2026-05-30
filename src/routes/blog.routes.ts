import { Router } from "express";
import {
  getPublishedBlogs,
  getBlogBySlug,
  getAllBlogsAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
} from "../controllers/blog.controller";
import { verifyJWT, verifyAdmin } from "../middleware/auth";

// ─── Public ───────────────────────────────────────────────────────────────────

const router = Router();

router.get("/", getPublishedBlogs);
router.get("/:slug", getBlogBySlug);

export default router;

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminBlogRouter = Router();
adminBlogRouter.use(verifyJWT, verifyAdmin);
adminBlogRouter.get("/", getAllBlogsAdmin);
adminBlogRouter.post("/", createBlog);
adminBlogRouter.patch("/:id", updateBlog);
adminBlogRouter.delete("/:id", deleteBlog);
