import { Schema, model, Document, Types } from "mongoose";

export interface IReward extends Document {
  user: Types.ObjectId;
  order: Types.ObjectId;
  pointsEarned: number;
  orderTotal: number;
  type: "earned" | "redeemed";
  createdAt: Date;
  updatedAt: Date;
}

const rewardSchema = new Schema<IReward>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    pointsEarned: { type: Number, required: true, min: 0 },
    orderTotal: { type: Number, required: true },
    type: { type: String, enum: ["earned", "redeemed"], default: "earned" },
  },
  { timestamps: true }
);

rewardSchema.index({ user: 1, createdAt: -1 });

export const Reward = model<IReward>("Reward", rewardSchema);
