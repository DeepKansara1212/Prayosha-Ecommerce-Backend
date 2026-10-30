import { Schema, model, Document, Types } from "mongoose";

export interface IWalletTransaction extends Document {
  user: Types.ObjectId;
  order: Types.ObjectId;
  cashbackAmount: number;
  orderTotal: number;
  type: "earned" | "redeemed";
  createdAt: Date;
  updatedAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    cashbackAmount: { type: Number, required: true, min: 0 },
    orderTotal: { type: Number, required: true },
    type: { type: String, enum: ["earned", "redeemed"], default: "earned" },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });

export const WalletTransaction = model<IWalletTransaction>(
  "WalletTransaction",
  walletTransactionSchema
);
