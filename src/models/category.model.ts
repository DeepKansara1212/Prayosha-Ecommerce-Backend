import { Schema, model, Document } from "mongoose";

export interface ICategoryShipping {
  weight: string;
  length?: string;
  breadth?: string;
  height?: string;
}

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  isActive: boolean;
  sortOrder: number;
  shipping: ICategoryShipping;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String },
    image: { type: String },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    shipping: {
      type: new Schema<ICategoryShipping>(
        {
          weight: { type: String, required: true, trim: true },
          length: { type: String, trim: true },
          breadth: { type: String, trim: true },
          height: { type: String, trim: true },
        },
        { _id: false }
      ),
      required: true,
    },
  },
  { timestamps: true }
);

categorySchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

export const Category = model<ICategory>("Category", categorySchema);
