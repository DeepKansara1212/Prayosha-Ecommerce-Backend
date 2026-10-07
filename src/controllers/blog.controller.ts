import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { Blog } from "../models/blog.model";

// ─── GET /api/v1/blogs ────────────────────────────────────────────────────────

export const getPublishedBlogs = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const blogs = await Blog.find({ isPublished: true }).sort({
      createdAt: -1,
    });
    res.status(200).json(new ApiResponse(200, { blogs }, "Blogs fetched"));
  },
);

// ─── GET /api/v1/blogs/:slug ──────────────────────────────────────────────────

export const getBlogBySlug = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const blog = await Blog.findOne({
      slug: req.params.slug,
      isPublished: true,
    });
    if (!blog) throw new ApiError(404, "Blog post not found");
    res.status(200).json(new ApiResponse(200, { blog }, "Blog fetched"));
  },
);

// ─── GET /api/v1/admin/blogs ──────────────────────────────────────────────────

export const getAllBlogsAdmin = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.status(200).json(new ApiResponse(200, { blogs }, "Blogs fetched"));
  },
);

// ─── POST /api/v1/admin/blogs/upload-images ──────────────────────────────────
// Expects multipart/form-data with one or more files under the "images" field
// (see blog.routes.ts, which runs uploadBlogImages.array("images", 6) first).
// multer-storage-cloudinary already uploads each file to Cloudinary and
// attaches the resulting secure_url to file.path.

export const uploadBlogImages = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      throw new ApiError(400, "At least one image is required");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const images = files.map((file) => (file as any).path as string);

    res.status(200).json(new ApiResponse(200, { images }, "Images uploaded"));
  },
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
      images,
      featured,
      isPublished,
      content,
    } = req.body as {
      slug?: string;
      title: string;
      subtitle?: string;
      excerpt: string;
      category: string;
      images?: string[];
      featured?: boolean;
      isPublished?: boolean;
      content?: Array<{ title: string; description: string }>;
    };

    if (!title) throw new ApiError(400, "Title is required");
    if (!excerpt) throw new ApiError(400, "Excerpt is required");
    if (!category) throw new ApiError(400, "Category is required");

    const blog = await Blog.create({
      slug,
      title,
      subtitle,
      excerpt,
      category,
      images: images ?? [],
      featured: featured ?? false,
      isPublished: isPublished ?? true,
      content: content ?? [],
    });

    res.status(201).json(new ApiResponse(201, { blog }, "Blog created"));
  },
);

// ─── PATCH /api/v1/admin/blogs/:id ───────────────────────────────────────────

export const updateBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) throw new ApiError(404, "Blog post not found");

    const fields = [
      "slug",
      "title",
      "subtitle",
      "excerpt",
      "category",
      "images",
      "featured",
      "isPublished",
      "content",
    ] as const;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (blog as any)[field] = req.body[field];
      }
    }

    await blog.save();

    res.status(200).json(new ApiResponse(200, { blog }, "Blog updated"));
  },
);

// ─── DELETE /api/v1/admin/blogs/:id ──────────────────────────────────────────

export const deleteBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) throw new ApiError(404, "Blog post not found");

    await blog.deleteOne();

    res.status(200).json(new ApiResponse(200, {}, "Blog deleted"));
  },
);
