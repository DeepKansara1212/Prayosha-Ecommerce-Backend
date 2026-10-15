import mongoose from "mongoose";
import { env } from "../config/env";

async function ensureIndex(
  collection: any,
  indexSpec: Record<string, number | string>,
  options: Record<string, unknown> = {},
): Promise<void> {
  const existingIndexes = await collection.listIndexes().toArray();

  const sameDefinition = (index: any) =>
    JSON.stringify(index.key ?? {}) === JSON.stringify(indexSpec);

  const matchingIndex = existingIndexes.find((index: any) =>
    sameDefinition(index) && (!options.name || index.name === options.name),
  );

  if (matchingIndex) return;

  const conflictingIndex = existingIndexes.find((index: any) =>
    sameDefinition(index) && index.name !== options.name,
  );

  if (conflictingIndex) {
    await collection.dropIndex(conflictingIndex.name);
  }

  await collection.createIndex(indexSpec, options);
}

async function createIndexes(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db!;

  // ── Product ──────────────────────────────────────────────────────────────────
  const products = db.collection("products");
  await ensureIndex(products, { slug: 1 }, { unique: true });
  await ensureIndex(products, { category: 1, isActive: 1 });
  await ensureIndex(products, { meaningTags: 1 });
  await ensureIndex(products, { isFeatured: 1, isActive: 1 });
  await ensureIndex(
    products,
    { name: "text", description: "text", tags: "text" },
    { name: "product_text_search" },
  );
  console.log("✓ Product indexes");

  // ── Order ─────────────────────────────────────────────────────────────────────
  const orders = db.collection("orders");
  await ensureIndex(orders, { user: 1, createdAt: -1 });
  await ensureIndex(orders, { orderNumber: 1 }, { unique: true });
  await ensureIndex(orders, { status: 1 });
  await ensureIndex(orders, { paymentStatus: 1 });
  console.log("✓ Order indexes");

  // ── User ─────────────────────────────────────────────────────────────────────
  const users = db.collection("users");
  const userIndexes = await users.listIndexes().toArray();
  const phoneIndex = userIndexes.find((index) => index.name === "phone_1");
  if (phoneIndex && phoneIndex.sparse !== true) {
    await users.dropIndex(phoneIndex.name);
  }
  await users.updateMany({ phone: null }, { $unset: { phone: "" } });
  await ensureIndex(users, { phone: 1 }, {
    unique: true,
    sparse: true,
  });
  await ensureIndex(users, { email: 1 }, { unique: true, sparse: true });
  await ensureIndex(users, { googleId: 1 }, { unique: true, sparse: true });
  console.log("✓ User indexes");

  // ── Review ───────────────────────────────────────────────────────────────────
  const reviews = db.collection("reviews");
  await ensureIndex(reviews, { product: 1, isApproved: 1 });
  await ensureIndex(reviews, { product: 1, user: 1 }, { unique: true });
  console.log("✓ Review indexes");

  // ── Cart ─────────────────────────────────────────────────────────────────────
  const carts = db.collection("carts");
  await ensureIndex(carts, { user: 1 }, { unique: true });
  console.log("✓ Cart indexes");

  // ── Rewards ───────────────────────────────────────────────────────────────────
  const rewards = db.collection("rewards");
  await ensureIndex(rewards, { user: 1, createdAt: -1 });
  console.log("✓ Reward indexes");

  // ── Astrology Calculators ───────────────────────────────────────────────────
  const rashis = db.collection("rashis");
  await ensureIndex(rashis, { code: 1 }, { unique: true });
  console.log("✓ Rashi indexes");

  const purposes = db.collection("purposes");
  await ensureIndex(purposes, { active: 1 });
  console.log("✓ Purpose indexes");

  const rashiProductMappings = db.collection("rashiproductmappings");
  await ensureIndex(rashiProductMappings, { rashi: 1, active: 1 });
  console.log("✓ RashiProductMapping indexes");

  const purposeRudrakshaMappings = db.collection("purposerudrakshamappings");
  await ensureIndex(purposeRudrakshaMappings, { purpose: 1, active: 1 });
  console.log("✓ PurposeRudrakshaMapping indexes");

  const rudrakshaProductMappings = db.collection("rudrakshaproductmappings");
  await ensureIndex(rudrakshaProductMappings, { rudrakshaType: 1, active: 1 });
  console.log("✓ RudrakshaProductMapping indexes");

  const calculatorLeads = db.collection("calculatorleads");
  await ensureIndex(calculatorLeads, { createdAt: -1 });
  console.log("✓ CalculatorLead indexes");

  console.log("\nAll indexes created successfully.");
  await mongoose.disconnect();
}

createIndexes().catch((err) => {
  console.error("Failed to create indexes:", err);
  process.exit(1);
});
