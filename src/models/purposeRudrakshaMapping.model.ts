import { Schema, model, Document, Types } from "mongoose";

export interface IPurposeRudrakshaMapping extends Document {
  purpose: Types.ObjectId;
  rudrakshaType: Types.ObjectId;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const purposeRudrakshaMappingSchema = new Schema<IPurposeRudrakshaMapping>(
  {
    purpose: { type: Schema.Types.ObjectId, ref: "Purpose", required: true },
    rudrakshaType: { type: Schema.Types.ObjectId, ref: "RudrakshaType", required: true },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

purposeRudrakshaMappingSchema.index({ purpose: 1, active: 1 });

export const PurposeRudrakshaMapping = model<IPurposeRudrakshaMapping>(
  "PurposeRudrakshaMapping",
  purposeRudrakshaMappingSchema
);
