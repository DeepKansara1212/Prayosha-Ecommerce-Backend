import { Schema, model, Document } from "mongoose";

export interface IRashi extends Document {
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

const rashiSchema = new Schema<IRashi>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  },
  { timestamps: true }
);

export const Rashi = model<IRashi>("Rashi", rashiSchema);
