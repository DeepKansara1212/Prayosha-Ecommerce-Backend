import { Schema, model, Document, Types } from "mongoose";

interface IOrderItem {
  product: Types.ObjectId;
  name: string;
  image: string;
  sku: string;
  price: number;
  quantity: number;
}

interface IShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

interface IStatusHistoryEntry {
  status: string;
  note: string;
  timestamp: Date;
}

interface ITrackingCheckpoint {
  time: Date;
  message: string;
  location: string;
}

export interface IOrder extends Document {
  orderNumber: string;
  user: Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  subtotal: number;
  discount: number;
  couponCode?: string;
  shippingCharge: number;
  tax: number;
  total: number;
  paymentMethod: "razorpay" | "cod";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  status:
    | "placed"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "refunded";
  trackingNumber?: string;
  shippingProvider?: string;
  shipmentId?: string;
  awbNumber?: string;
  carrier?: string;
  shippingStatus?: string;
  labelUrl?: string;
  invoiceUrl?: string;
  shipmentCreatedAt?: Date;
  shippingMeta?: Record<string, unknown>;
  trackingUrl?: string;
  trackingCheckpoints?: ITrackingCheckpoint[];
  statusHistory: IStatusHistoryEntry[];
  notes?: string;
  pointsEarned: number;
  hasFreeGift: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    sku: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const shippingAddressSchema = new Schema<IShippingAddress>(
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
);

const statusHistorySchema = new Schema<IStatusHistoryEntry>(
  {
    status: { type: String, required: true },
    note: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const trackingCheckpointSchema = new Schema<ITrackingCheckpoint>(
  {
    time: { type: Date, required: true },
    message: { type: String, default: "" },
    location: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [orderItemSchema], required: true },
    shippingAddress: { type: shippingAddressSchema, required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    couponCode: { type: String },
    shippingCharge: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: { type: String, enum: ["razorpay", "cod"], required: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    status: {
      type: String,
      enum: [
        "placed",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "placed",
    },
    trackingNumber: { type: String },
    shippingProvider: { type: String },
    shipmentId: { type: String },
    awbNumber: { type: String },
    carrier: { type: String },
    shippingStatus: { type: String },
    labelUrl: { type: String },
    invoiceUrl: { type: String },
    shipmentCreatedAt: { type: Date },
    shippingMeta: { type: Schema.Types.Mixed, select: false },
    trackingUrl: { type: String },
    trackingCheckpoints: { type: [trackingCheckpointSchema], default: undefined },
    statusHistory: { type: [statusHistorySchema], default: [] },
    notes: { type: String },
    pointsEarned: { type: Number, default: 0 },
    hasFreeGift: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ razorpayOrderId: 1 }, { sparse: true });

export const Order = model<IOrder>("Order", orderSchema);
