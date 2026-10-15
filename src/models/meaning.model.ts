import { Schema, model, Document } from "mongoose";

export interface IMeaning extends Document {
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const meaningSchema = new Schema<IMeaning>(
  {
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Meaning = model<IMeaning>("Meaning", meaningSchema);
