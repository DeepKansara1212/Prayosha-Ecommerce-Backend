import mongoose from "mongoose";
import { env } from "../config/env";

async function migrateProductShipping(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db!;
  const categories = db.collection("categories");
  const products = db.collection("products");

  // Category.shipping.weight is now required — backfill any category that predates
  // this feature so it doesn't fail validation on its next save.
  const categoriesMissingShipping = await categories.countDocuments({
    shipping: { $exists: false },
  });
  if (categoriesMissingShipping > 0) {
    await categories.updateMany(
      { shipping: { $exists: false } },
      { $set: { shipping: { weight: 100 } } }
    );
    console.log(
      `✓ Backfilled default shipping.weight=100 on ${categoriesMissingShipping} categories — review and adjust in the admin panel`
    );
  }

  // Fold the old flat weight/dimensions{l,w,h} fields into the new nested shipping{}
  // shape. Existing values were hand-entered per product, so mark them as custom
  // overrides (useCategoryShipping: false) rather than silently switching behavior.
  const cursor = products.find({
    $or: [{ weight: { $exists: true } }, { dimensions: { $exists: true } }],
  });

  let migrated = 0;
  for await (const product of cursor) {
    const shipping: Record<string, number> = {};
    if (typeof product.weight === "number") shipping.weight = product.weight;
    if (typeof product.dimensions?.l === "number") shipping.length = product.dimensions.l;
    if (typeof product.dimensions?.w === "number") shipping.breadth = product.dimensions.w;
    if (typeof product.dimensions?.h === "number") shipping.height = product.dimensions.h;

    await products.updateOne(
      { _id: product._id },
      {
        $set: { shipping, useCategoryShipping: false },
        $unset: { weight: "", dimensions: "" },
      }
    );
    migrated++;
  }

  console.log(
    `✓ Migrated ${migrated} products from weight/dimensions to nested shipping{} (useCategoryShipping set to false to preserve existing custom values)`
  );

  await mongoose.disconnect();
}

migrateProductShipping().catch((err) => {
  console.error("Failed to migrate product shipping:", err);
  process.exit(1);
});
