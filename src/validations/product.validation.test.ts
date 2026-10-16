import { describe, expect, it } from "vitest";
import { createProductSchema, updateProductSchema } from "./product.validation";

const validProduct = {
  name: "Amethyst",
  sku: "AM-001",
  description: "Natural amethyst crystal",
  category: "507f1f77bcf86cd799439011",
};

describe("product validation", () => {
  it("preserves product measurements when creating a product", () => {
    const result = createProductSchema.safeParse({
      ...validProduct,
      productDetails: { weight: "120 g", length: "8 cm", dimensions: "8 x 4 x 2 cm", size: "M", ingredients: "Amethyst, silver" },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productDetails).toEqual({ weight: "120 g", length: "8 cm", dimensions: "8 x 4 x 2 cm", size: "M", ingredients: "Amethyst, silver" });
    }
  });

  it("preserves product measurements when updating a product", () => {
    const result = updateProductSchema.safeParse({
      productDetails: { weight: "250 g", dimensions: "10 x 5 x 3 cm", size: "L", ingredients: "Rose quartz" },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productDetails).toEqual({ weight: "250 g", dimensions: "10 x 5 x 3 cm", size: "L", ingredients: "Rose quartz" });
    }
  });

  it("accepts a shipping total weight", () => {
    const result = updateProductSchema.safeParse({
      shipping: { totalWeight: "1.2 kg" },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shipping?.totalWeight).toBe("1.2 kg");
    }
  });

  it("allows omitting the price for inquiry-only products", () => {
    expect(createProductSchema.safeParse(validProduct).success).toBe(true);
  });

  it("accepts null price when clearing a product price", () => {
    const result = updateProductSchema.safeParse({ price: null });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBeNull();
    }
  });

  it("accepts multiple purpose collection assignments", () => {
    const result = createProductSchema.safeParse({
      ...validProduct,
      purposeTags: [
        "507f1f77bcf86cd799439011",
        "507f191e810c19729de860ea",
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.purposeTags).toEqual([
        "507f1f77bcf86cd799439011",
        "507f191e810c19729de860ea",
      ]);
    }
  });

  it("accepts multiple meaning assignments", () => {
    const result = createProductSchema.safeParse({
      ...validProduct,
      meaningTags: [
        "507f1f77bcf86cd799439011",
        "507f191e810c19729de860ea",
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.meaningTags).toEqual([
        "507f1f77bcf86cd799439011",
        "507f191e810c19729de860ea",
      ]);
    }
  });
});
