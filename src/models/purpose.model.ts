import { Schema, model, Document } from "mongoose";

export interface IPurpose extends Document {
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const purposeSchema = new Schema<IPurpose>(
  {
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Purpose = model<IPurpose>("Purpose", purposeSchema);
