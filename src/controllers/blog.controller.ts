import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Blog } from "../models/blog.model";

// ─── GET /api/v1/blogs ────────────────────────────────────────────────────────

export const getPublishedBlogs = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const blogs = await Blog.find({ isPublished: true }).sort({ createdAt: -1 });
    res.status(200).json(new ApiResponse(200, { blogs }, "Blogs fetched"));
  }
);

// ─── GET /api/v1/blogs/:slug ──────────────────────────────────────────────────

export const getBlogBySlug = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const blog = await Blog.findOne({ slug: req.params.slug, isPublished: true });
    if (!blog) throw new ApiError(404, "Blog post not found");
    res.status(200).json(new ApiResponse(200, { blog }, "Blog fetched"));
  }
);

// ─── GET /api/v1/admin/blogs ──────────────────────────────────────────────────

export const getAllBlogsAdmin = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.status(200).json(new ApiResponse(200, { blogs }, "Blogs fetched"));
  }
);

// ─── POST /api/v1/admin/blogs ─────────────────────────────────────────────────

export const createBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      slug,
      title,
      subtitle,
      excerpt,
      category,
      readTime,
      date,
      emoji,
      gradient,
      featured,
      isPublished,
      content,
    } = req.body as {
      slug?: string;
      title: string;
      subtitle?: string;
      excerpt: string;
      category: string;
      readTime: string;
      date: string;
      emoji: string;
      gradient: string;
      featured?: boolean;
      isPublished?: boolean;
      content?: Array<{ type: string; text?: string; items?: string[] }>;
    };

    if (!title) throw new ApiError(400, "Title is required");
    if (!excerpt) throw new ApiError(400, "Excerpt is required");
    if (!category) throw new ApiError(400, "Category is required");
    if (!readTime) throw new ApiError(400, "Read time is required");
    if (!date) throw new ApiError(400, "Date is required");
    if (!emoji) throw new ApiError(400, "Emoji is required");
    if (!gradient) throw new ApiError(400, "Gradient is required");

    const blog = await Blog.create({
      slug,
      title,
      subtitle,
      excerpt,
      category,
      readTime,
      date,
      emoji,
      gradient,
      featured: featured ?? false,
      isPublished: isPublished ?? true,
      content: content ?? [],
    });

    res.status(201).json(new ApiResponse(201, { blog }, "Blog created"));
  }
);

// ─── PATCH /api/v1/admin/blogs/:id ───────────────────────────────────────────

export const updateBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) throw new ApiError(404, "Blog post not found");

    const fields = [
      "slug", "title", "subtitle", "excerpt", "category",
      "readTime", "date", "emoji", "gradient", "featured",
      "isPublished", "content",
    ] as const;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (blog as any)[field] = req.body[field];
      }
    }

    await blog.save();

    res.status(200).json(new ApiResponse(200, { blog }, "Blog updated"));
  }
);

// ─── DELETE /api/v1/admin/blogs/:id ──────────────────────────────────────────

export const deleteBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) throw new ApiError(404, "Blog post not found");

    await blog.deleteOne();

    res.status(200).json(new ApiResponse(200, {}, "Blog deleted"));
  }
);
