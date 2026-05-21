import { Schema, model, Document, Model, Types, CallbackError } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

// ─── Address sub-document ─────────────────────────────────────────────────────

export interface IAddress {
  _id: Types.ObjectId;
  label: "home" | "work" | "other";
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

const addressSchema = new Schema<IAddress>(
  {
    label: { type: String, enum: ["home", "work", "other"], required: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: {
      type: String,
      required: true,
      match: [/^\d{6}$/, "Pincode must be exactly 6 digits"],
    },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

// ─── User document interface ──────────────────────────────────────────────────

export interface IUser extends Document {
  name: string;
  email?: string;        // optional — phone is the primary identifier
  phone: string;         // required, unique
  password: string;      // select: false
  role: "customer" | "admin";
  avatar?: string;
  isVerified: boolean;
  refreshToken?: string; // select: false
  otp?: string;          // hashed, select: false
  otpExpiry?: Date;      // select: false
  addresses: Types.DocumentArray<IAddress>;
  wishlist: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;

  isPasswordCorrect(password: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
}

export type IUserModel = Model<IUser>;

// ─── User schema ──────────────────────────────────────────────────────────────

const userSchema = new Schema<IUser, IUserModel>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true, // allows multiple documents with no email
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true, unique: true, trim: true },
    password: {
      type: String,
      required: true,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    avatar: { type: String },
    isVerified: { type: Boolean, default: false },
    refreshToken: { type: String, select: false },
    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    addresses: { type: [addressSchema], default: [] },
    wishlist: [{ type: Schema.Types.ObjectId, ref: "Product" }],
  },
  { timestamps: true }
);

// ─── Pre-save: hash password only when modified ───────────────────────────────

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err as CallbackError);
  }
});

// ─── Instance methods ─────────────────────────────────────────────────────────

userSchema.methods.isPasswordCorrect = async function (
  this: IUser,
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function (this: IUser): string {
  return jwt.sign(
    { _id: this._id, email: this.email, name: this.name, role: this.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRY as jwt.SignOptions["expiresIn"] }
  );
};

userSchema.methods.generateRefreshToken = function (this: IUser): string {
  return jwt.sign(
    { _id: this._id },
    env.REFRESH_TOKEN_SECRET,
    { expiresIn: env.REFRESH_TOKEN_EXPIRY as jwt.SignOptions["expiresIn"] }
  );
};

export const User = model<IUser, IUserModel>("User", userSchema);
