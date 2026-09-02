import { Schema, model, Document, Types } from "mongoose";

export interface IProductShipping {
  weight?: number;
  length?: number;
  breadth?: number;
  height?: number;
}

interface IRatings {
  average: number;
  count: number;
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription?: string;
  price: number;
  comparePrice?: number;
  costPrice?: number;
  images: string[];
  video?: string;
  category: Types.ObjectId;
  tags: string[];
  chakra?: string;
  badge?: "BESTSELLER" | "NEW" | "LIMITED" | "RARE" | "GIFT SET";
  stock: number;
  lowStockThreshold: number;
  useCategoryShipping: boolean;
  shipping?: IProductShipping;
  careInstructions?: string;
  metaphysicalProperties?: string;
  isFeatured: boolean;
  isActive: boolean;
  hasFreeGift: boolean;
  ratings: IRatings;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    sku: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String, required: true },
    shortDescription: { type: String, maxlength: 200 },
    price: { type: Number, required: true, min: 0 },
    comparePrice: { type: Number },
    costPrice: { type: Number, select: false },
    images: { type: [String], validate: [(v: string[]) => v.length <= 6, "Max 6 images allowed"] },
    video: { type: String, trim: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    tags: { type: [String], default: [] },
    chakra: { type: String },
    badge: { type: String, enum: ["BESTSELLER", "NEW", "LIMITED", "RARE", "GIFT SET"] },
    stock: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    useCategoryShipping: { type: Boolean, default: true },
    shipping: {
      type: new Schema<IProductShipping>(
        {
          weight: { type: Number, min: 0 },
          length: { type: Number, min: 0 },
          breadth: { type: Number, min: 0 },
          height: { type: Number, min: 0 },
        },
        { _id: false }
      ),
    },
    careInstructions: { type: String },
    metaphysicalProperties: { type: String },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    hasFreeGift: { type: Boolean, default: false },
    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ category: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ name: "text", description: "text", tags: "text" });

// ─── Pre-save: auto-generate slug from name ───────────────────────────────────

productSchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

export const Product = model<IProduct>("Product", productSchema);
