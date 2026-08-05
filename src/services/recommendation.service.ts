import { Types } from "mongoose";
import { Rashi } from "../models/rashi.model";
import { RashiProductMapping } from "../models/rashiProductMapping.model";
import { PurposeRudrakshaMapping } from "../models/purposeRudrakshaMapping.model";
import { RudrakshaProductMapping } from "../models/rudrakshaProductMapping.model";
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
  const purposeMappings = await PurposeRudrakshaMapping.find({
    purpose: purposeId,
    active: true,
  }).sort({ priority: 1 });

  const rudrakshaTypeIds = purposeMappings.map((m) => m.rudrakshaType);
  if (rudrakshaTypeIds.length === 0) return [];

  const productMappings = await RudrakshaProductMapping.find({
    rudrakshaType: { $in: rudrakshaTypeIds },
    active: true,
  })
    .sort({ priority: 1 })
    .populate<{ product: IProduct }>("product");

  const seen = new Set<string>();
  const products: IProduct[] = [];
  for (const mapping of productMappings) {
    const product = mapping.product;
    if (!isAvailable(product)) continue;
    const id = product._id.toString();
    if (seen.has(id)) continue;
    seen.add(id);
    products.push(product);
  }
  return products;
}
