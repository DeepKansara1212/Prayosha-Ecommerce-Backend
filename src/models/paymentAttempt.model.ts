import { Schema, model, Document, Types } from "mongoose";
import type { IOrderItem, IShippingAddress } from "./order.model";

export interface IPaymentAttempt extends Document {
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  user: Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  subtotal: number;
  discount: number;
  couponCode?: string;
  shippingCharge: number;
  tax: number;
  total: number;
  pointsRedeemed: number;
  pointsDiscount: number;
  status: "pending" | "failed" | "paid";
  notes?: string;
}

const paymentAttemptSchema = new Schema<IPaymentAttempt>(
  {
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: {
      type: [
        new Schema<IOrderItem>(
          {
            product: { type: Schema.Types.ObjectId, ref: "Product" },
            name: { type: String, required: true },
            image: { type: String, default: "" },
            sku: { type: String, required: true },
            price: { type: Number, required: true },
            quantity: { type: Number, required: true, min: 1 },
          },
          { _id: false }
        ),
      ],
      required: true,
    },
    shippingAddress: {
      type: new Schema<IShippingAddress>(
        {
          fullName: { type: String, required: true },
          phone: { type: String, required: true },
          line1: { type: String, required: true },
          line2: { type: String },
          city: { type: String, required: true },
          state: { type: String, required: true },
          pincode: { type: String, required: true },
        },
        { _id: false }
      ),
      required: true,
    },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    couponCode: { type: String },
    shippingCharge: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
    pointsRedeemed: { type: Number, default: 0 },
    pointsDiscount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "failed", "paid"],
      default: "pending",
    },
    notes: { type: String },
  },
  { timestamps: true }
);

export const PaymentAttempt = model<IPaymentAttempt>(
  "PaymentAttempt",
  paymentAttemptSchema
);
