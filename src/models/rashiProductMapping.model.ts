import { Schema, model, Document, Types } from "mongoose";

export interface IRashiProductMapping extends Document {
  rashi: Types.ObjectId;
  product: Types.ObjectId;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const rashiProductMappingSchema = new Schema<IRashiProductMapping>(
  {
    rashi: { type: Schema.Types.ObjectId, ref: "Rashi", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

rashiProductMappingSchema.index({ rashi: 1, active: 1 });
rashiProductMappingSchema.index({ product: 1 });

export const RashiProductMapping = model<IRashiProductMapping>(
  "RashiProductMapping",
  rashiProductMappingSchema
);
