import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { HeroBanner } from "../models/heroBanner.model";
import { uploadToCloudinary, deleteFromCloudinary } from "../middleware/upload";

// ─── GET /api/v1/hero-banners ─────────────────────────────────────────────────

export const getActiveBanners = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const banners = await HeroBanner.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    res.status(200).json(new ApiResponse(200, { banners }, "Banners fetched"));
  }
);

// ─── GET /api/v1/admin/hero-banners ──────────────────────────────────────────

export const getAllBannersAdmin = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const banners = await HeroBanner.find().sort({ order: 1, createdAt: 1 });
    res.status(200).json(new ApiResponse(200, { banners }, "All banners fetched"));
  }
);

// ─── POST /api/v1/admin/hero-banners ─────────────────────────────────────────

export const createBanner = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) throw new ApiError(400, "Banner image is required");

    const { title, subtitle, ctaText, ctaLink, order, isActive } = req.body as {
      title?: string;
      subtitle?: string;
      ctaText?: string;
      ctaLink?: string;
      order?: string;
      isActive?: string;
    };

    const uploaded = await uploadToCloudinary(req.file.buffer, "prayosha-banners");

    const banner = await HeroBanner.create({
      imageUrl: uploaded.secure_url,
      imagePublicId: uploaded.public_id,
      title: title?.trim() || undefined,
      subtitle: subtitle?.trim() || undefined,
      ctaText: ctaText?.trim() || undefined,
      ctaLink: ctaLink?.trim() || undefined,
      order: order ? parseInt(order, 10) : 0,
      isActive: isActive !== undefined ? isActive === "true" : true,
    });

    res.status(201).json(new ApiResponse(201, { banner }, "Banner created"));
  }
);

// ─── PATCH /api/v1/admin/hero-banners/:id ────────────────────────────────────

export const updateBanner = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const banner = await HeroBanner.findById(id);
    if (!banner) throw new ApiError(404, "Banner not found");

    // Replace image if a new file was uploaded
    if (req.file) {
      await deleteFromCloudinary(banner.imagePublicId);
      const uploaded = await uploadToCloudinary(req.file.buffer, "prayosha-banners");
      banner.imageUrl = uploaded.secure_url;
      banner.imagePublicId = uploaded.public_id;
    }

    const { title, subtitle, ctaText, ctaLink, order, isActive } = req.body as {
      title?: string;
      subtitle?: string;
      ctaText?: string;
      ctaLink?: string;
      order?: string;
      isActive?: string;
    };

    if (title !== undefined) banner.title = title.trim() || undefined;
    if (subtitle !== undefined) banner.subtitle = subtitle.trim() || undefined;
    if (ctaText !== undefined) banner.ctaText = ctaText.trim() || undefined;
    if (ctaLink !== undefined) banner.ctaLink = ctaLink.trim() || undefined;
    if (order !== undefined) banner.order = parseInt(order, 10);
    if (isActive !== undefined) banner.isActive = isActive === "true";

    await banner.save();

    res.status(200).json(new ApiResponse(200, { banner }, "Banner updated"));
  }
);

// ─── PATCH /api/v1/admin/hero-banners/:id/toggle ─────────────────────────────

export const toggleBanner = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const banner = await HeroBanner.findById(id);
    if (!banner) throw new ApiError(404, "Banner not found");

    banner.isActive = !banner.isActive;
    await banner.save();

    res.status(200).json(new ApiResponse(200, { banner }, `Banner ${banner.isActive ? "activated" : "deactivated"}`));
  }
);

// ─── PATCH /api/v1/admin/hero-banners/reorder ────────────────────────────────

export const reorderBanners = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { items } = req.body as { items: Array<{ id: string; order: number }> };

    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, "items array is required");
    }

    await Promise.all(
      items.map(({ id, order }) => HeroBanner.findByIdAndUpdate(id, { order }))
    );

    const banners = await HeroBanner.find().sort({ order: 1, createdAt: 1 });
    res.status(200).json(new ApiResponse(200, { banners }, "Banners reordered"));
  }
);

// ─── DELETE /api/v1/admin/hero-banners/:id ───────────────────────────────────

export const deleteBanner = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const banner = await HeroBanner.findById(id);
    if (!banner) throw new ApiError(404, "Banner not found");

    await deleteFromCloudinary(banner.imagePublicId);
    await banner.deleteOne();

    res.status(200).json(new ApiResponse(200, {}, "Banner deleted"));
  }
);
