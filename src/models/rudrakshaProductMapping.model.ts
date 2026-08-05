import { Schema, model, Document, Types } from "mongoose";

export interface IRudrakshaProductMapping extends Document {
  rudrakshaType: Types.ObjectId;
  product: Types.ObjectId;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const rudrakshaProductMappingSchema = new Schema<IRudrakshaProductMapping>(
  {
    rudrakshaType: { type: Schema.Types.ObjectId, ref: "RudrakshaType", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

rudrakshaProductMappingSchema.index({ rudrakshaType: 1, active: 1 });

export const RudrakshaProductMapping = model<IRudrakshaProductMapping>(
  "RudrakshaProductMapping",
  rudrakshaProductMappingSchema
);
