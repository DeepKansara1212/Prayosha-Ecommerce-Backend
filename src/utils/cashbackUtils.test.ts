import { describe, expect, it } from "vitest";
import {
  calculateCashback,
  calculateCashbackRedemption,
} from "./cashbackUtils";

describe("cashback calculations", () => {
  it("earns 2% proportionally from eligible spend", () => {
    expect(calculateCashback(250)).toBe(5);
    expect(calculateCashback(999.99)).toBe(20);
  });

  it("redeems half the smaller of wallet balance and eligible subtotal", () => {
    expect(calculateCashbackRedemption(200, 300)).toBe(100);
    expect(calculateCashbackRedemption(100, 200)).toBe(50);
    expect(calculateCashbackRedemption(200, 100)).toBe(50);
    expect(calculateCashbackRedemption(33.33, 100)).toBe(16.67);
    expect(calculateCashbackRedemption(0, 200)).toBe(0);
    expect(calculateCashbackRedemption(200, 0)).toBe(0);
  });
});
