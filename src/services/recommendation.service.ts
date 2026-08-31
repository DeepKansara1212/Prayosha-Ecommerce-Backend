import { Types } from "mongoose";
import { Rashi } from "../models/rashi.model";
import { RashiProductMapping } from "../models/rashiProductMapping.model";
import { PurposeProductMapping } from "../models/purposeProductMapping.model";
import { IProduct } from "../models/product.model";

function isAvailable(product: unknown): product is IProduct {
  const p = product as IProduct | null;
  return !!p && p.isActive && p.stock > 0;
}

export async function getBraceletsForRashi(rashiCode: string): Promise<IProduct[]> {
  const rashi = await Rashi.findOne({ code: rashiCode });
  if (!rashi) return [];

  const mappings = await RashiProductMapping.find({ rashi: rashi._id, active: true })
    .sort({ priority: 1 })
    .populate<{ product: IProduct }>("product");

  return mappings
    .map((m) => m.product)
    .filter(isAvailable);
}

export async function getRudrakshaProductsForPurpose(
  purposeId: string | Types.ObjectId
): Promise<IProduct[]> {
  const mappings = await PurposeProductMapping.find({ purpose: purposeId, active: true })
    .sort({ priority: 1 })
    .populate<{ product: IProduct }>("product");

  return mappings
    .map((m) => m.product)
    .filter(isAvailable);
}
