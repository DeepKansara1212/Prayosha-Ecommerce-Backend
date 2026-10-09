import { describe, expect, it } from "vitest";
import { parseWeightInKilograms } from "./weight";

describe("parseWeightInKilograms", () => {
  it.each([
    ["250 g", 0.25],
    ["1.2 kg", 1.2],
    ["2 lb", 0.90718474],
    ["8 oz", 0.226796185],
    ["500 mg", 0.0005],
  ])("converts %s to kilograms", (value, expected) => {
    expect(parseWeightInKilograms(value)).toBeCloseTo(expected, 8);
  });

  it("requires an explicit unit unless parsing a legacy value", () => {
    expect(parseWeightInKilograms("120")).toBeUndefined();
    expect(parseWeightInKilograms("120", true)).toBe(120);
  });

  it.each(["", "abc", "0 g", "-1 kg", "5 stone"])(
    "rejects invalid weight %s",
    (value) => {
      expect(parseWeightInKilograms(value)).toBeUndefined();
    },
  );
});
