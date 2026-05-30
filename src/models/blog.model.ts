import { Schema, model, Document } from "mongoose";

type BlogSectionType = "paragraph" | "heading" | "subheading" | "quote" | "list";

interface IBlogSection {
  type: BlogSectionType;
  text?: string;
  items?: string[];
}

export interface IBlog extends Document {
  slug: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  category: "Crystal Guides" | "Rituals" | "Wellness" | "Gemstone Spotlight" | "Spiritual Practice";
  readTime: string;
  date: string;
  emoji: string;
  gradient: string;
  featured: boolean;
  isPublished: boolean;
  content: IBlogSection[];
  createdAt: Date;
  updatedAt: Date;
}

const blogSectionSchema = new Schema<IBlogSection>(
  {
    type: {
      type: String,
      enum: ["paragraph", "heading", "subheading", "quote", "list"],
      required: true,
    },
    text: { type: String },
    items: { type: [String] },
  },
  { _id: false }
);

const blogSchema = new Schema<IBlog>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String },
    excerpt: { type: String, required: true },
    category: {
      type: String,
      enum: ["Crystal Guides", "Rituals", "Wellness", "Gemstone Spotlight", "Spiritual Practice"],
      required: true,
    },
    readTime: { type: String, required: true },
    date: { type: String, required: true },
    emoji: { type: String, required: true },
    gradient: { type: String, required: true },
    featured: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    content: { type: [blogSectionSchema], default: [] },
  },
  { timestamps: true }
);

blogSchema.index({ category: 1, isPublished: 1 });
blogSchema.index({ featured: 1, isPublished: 1 });

blogSchema.pre("validate", function (next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

export const Blog = model<IBlog>("Blog", blogSchema);
