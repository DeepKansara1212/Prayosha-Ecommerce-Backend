import mongoose from "mongoose";
import { env } from "../config/env";

async function createIndexes(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db!;

  // ── Product ──────────────────────────────────────────────────────────────────
  const products = db.collection("products");
  await products.createIndex({ slug: 1 }, { unique: true });
  await products.createIndex({ category: 1, isActive: 1 });
  await products.createIndex({ isFeatured: 1, isActive: 1 });
  await products.createIndex(
    { name: "text", description: "text", tags: "text" },
    { name: "product_text_search" }
  );
  console.log("✓ Product indexes");

  // ── Order ─────────────────────────────────────────────────────────────────────
  const orders = db.collection("orders");
  await orders.createIndex({ user: 1, createdAt: -1 });
  await orders.createIndex({ orderNumber: 1 }, { unique: true });
  await orders.createIndex({ status: 1 });
  await orders.createIndex({ paymentStatus: 1 });
  console.log("✓ Order indexes");

  // ── User ─────────────────────────────────────────────────────────────────────
  const users = db.collection("users");
  await users.createIndex({ email: 1 }, { unique: true, sparse: true });
  console.log("✓ User indexes");

  // ── Review ───────────────────────────────────────────────────────────────────
  const reviews = db.collection("reviews");
  await reviews.createIndex({ product: 1, isApproved: 1 });
  await reviews.createIndex({ product: 1, user: 1 }, { unique: true });
  console.log("✓ Review indexes");

  // ── Cart ─────────────────────────────────────────────────────────────────────
  const carts = db.collection("carts");
  await carts.createIndex({ user: 1 }, { unique: true });
  console.log("✓ Cart indexes");

  // ── Rewards ───────────────────────────────────────────────────────────────────
  const rewards = db.collection("rewards");
  await rewards.createIndex({ user: 1, createdAt: -1 });
  console.log("✓ Reward indexes");

  // ── Astrology Calculators ───────────────────────────────────────────────────
  const rashis = db.collection("rashis");
  await rashis.createIndex({ code: 1 }, { unique: true });
  console.log("✓ Rashi indexes");

  const purposes = db.collection("purposes");
  await purposes.createIndex({ active: 1 });
  console.log("✓ Purpose indexes");

  const rashiProductMappings = db.collection("rashiproductmappings");
  await rashiProductMappings.createIndex({ rashi: 1, active: 1 });
  console.log("✓ RashiProductMapping indexes");

  const purposeRudrakshaMappings = db.collection("purposerudrakshamappings");
  await purposeRudrakshaMappings.createIndex({ purpose: 1, active: 1 });
  console.log("✓ PurposeRudrakshaMapping indexes");

  const rudrakshaProductMappings = db.collection("rudrakshaproductmappings");
  await rudrakshaProductMappings.createIndex({ rudrakshaType: 1, active: 1 });
  console.log("✓ RudrakshaProductMapping indexes");

  const calculatorLeads = db.collection("calculatorleads");
  await calculatorLeads.createIndex({ createdAt: -1 });
  console.log("✓ CalculatorLead indexes");

  console.log("\nAll indexes created successfully.");
  await mongoose.disconnect();
}

createIndexes().catch((err) => {
  console.error("Failed to create indexes:", err);
  process.exit(1);
});
