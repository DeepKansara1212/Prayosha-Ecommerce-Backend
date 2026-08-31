import { Schema, model, Document, Model } from "mongoose";
import { encrypt, decrypt } from "../utils/crypto";

export interface IShippingProvider extends Document {
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  isActive: boolean;
  isDefault: boolean;
  credentialsEncrypted?: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  encryptCredentials(plain: Record<string, unknown>): void;
  decryptCredentials(): Record<string, unknown> | null;
}

type ShippingProviderModel = Model<IShippingProvider>;

const shippingProviderSchema = new Schema<IShippingProvider, ShippingProviderModel>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    logo: { type: String },
    isActive: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    credentialsEncrypted: { type: String, select: false },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

shippingProviderSchema.pre("save", async function (next) {
  if (this.isModified("isDefault") && this.isDefault) {
    await (this.constructor as ShippingProviderModel).updateMany(
      { _id: { $ne: this._id } },
      { $set: { isDefault: false } }
    );
  }
  next();
});

shippingProviderSchema.methods.encryptCredentials = function (
  this: IShippingProvider,
  plain: Record<string, unknown>
): void {
  this.credentialsEncrypted = encrypt(JSON.stringify(plain));
};

shippingProviderSchema.methods.decryptCredentials = function (
  this: IShippingProvider
): Record<string, unknown> | null {
  if (!this.credentialsEncrypted) return null;
  return JSON.parse(decrypt(this.credentialsEncrypted)) as Record<string, unknown>;
};

export const ShippingProvider = model<IShippingProvider, ShippingProviderModel>(
  "ShippingProvider",
  shippingProviderSchema,
  "shipping_providers"
);
