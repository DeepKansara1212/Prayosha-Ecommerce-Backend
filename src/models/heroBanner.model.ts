import { Schema, model, Document } from "mongoose";

export interface IHeroBanner extends Document {
  imageUrl: string;
  imagePublicId: string;
  title?: string;
  subtitle?: string;
  ctaText?: string;
  ctaLink?: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const heroBannerSchema = new Schema<IHeroBanner>(
  {
    imageUrl: { type: String, required: true },
    imagePublicId: { type: String, required: true },
    title: { type: String, trim: true },
    subtitle: { type: String, trim: true },
    ctaText: { type: String, trim: true },
    ctaLink: { type: String, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

heroBannerSchema.index({ isActive: 1, order: 1 });

export const HeroBanner = model<IHeroBanner>("HeroBanner", heroBannerSchema);
