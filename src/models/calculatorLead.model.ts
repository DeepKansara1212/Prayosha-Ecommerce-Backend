import { Schema, model, Document, Types } from "mongoose";

export interface IBirthLocation {
  displayName: string;
  name: string;
  state?: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface ICalculatorLead extends Document {
  name: string;
  mobile: string;
  dob: string;
  birthLocation: IBirthLocation;
  calculatorType: "bracelet" | "rudraksha";
  purpose?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const birthLocationSchema = new Schema<IBirthLocation>(
  {
    displayName: { type: String, required: true },
    name: { type: String, required: true },
    state: { type: String },
    country: { type: String, required: true },
    countryCode: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timezone: { type: String, required: true },
  },
  { _id: false }
);

const calculatorLeadSchema = new Schema<ICalculatorLead>(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    dob: { type: String, required: true },
    birthLocation: { type: birthLocationSchema, required: true },
    calculatorType: { type: String, enum: ["bracelet", "rudraksha"], required: true },
    purpose: { type: Schema.Types.ObjectId, ref: "Purpose" },
  },
  { timestamps: true }
);

calculatorLeadSchema.index({ createdAt: -1 });

export const CalculatorLead = model<ICalculatorLead>("CalculatorLead", calculatorLeadSchema);
