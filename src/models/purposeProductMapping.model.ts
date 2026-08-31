import { Schema, model, Document, Types } from "mongoose";

export interface IPurposeProductMapping extends Document {
  purpose: Types.ObjectId;
  product: Types.ObjectId;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const purposeProductMappingSchema = new Schema<IPurposeProductMapping>(
  {
    purpose: { type: Schema.Types.ObjectId, ref: "Purpose", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

purposeProductMappingSchema.index({ purpose: 1, active: 1 });
purposeProductMappingSchema.index({ product: 1 });

export const PurposeProductMapping = model<IPurposeProductMapping>(
  "PurposeProductMapping",
  purposeProductMappingSchema
);
