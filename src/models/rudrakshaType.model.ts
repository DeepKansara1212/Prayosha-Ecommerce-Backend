import { Schema, model, Document } from "mongoose";

export interface IRudrakshaType extends Document {
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const rudrakshaTypeSchema = new Schema<IRudrakshaType>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
  },
  { timestamps: true }
);

export const RudrakshaType = model<IRudrakshaType>("RudrakshaType", rudrakshaTypeSchema);
