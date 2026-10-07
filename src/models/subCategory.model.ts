import { Schema, model, Document, Types } from "mongoose";

export interface ISubCategory extends Document {
  name: string;
  slug: string;
  parentCategory: Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const subCategorySchema = new Schema<ISubCategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    parentCategory: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

subCategorySchema.index({ parentCategory: 1, slug: 1 }, { unique: true });
subCategorySchema.index({ parentCategory: 1, isActive: 1, sortOrder: 1 });

subCategorySchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

export const SubCategory = model<ISubCategory>("SubCategory", subCategorySchema);
