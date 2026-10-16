import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createLead, resolveMoonRashi, getBraceletsForRashi } = vi.hoisted(() => ({
  createLead: vi.fn(),
  resolveMoonRashi: vi.fn(),
  getBraceletsForRashi: vi.fn(),
}));

vi.mock("../models/calculatorLead.model", () => ({
  CalculatorLead: { create: createLead },
}));

vi.mock("../services/astrology.service", () => ({
  resolveMoonRashi,
}));

vi.mock("../services/recommendation.service", () => ({
  getBraceletsForRashi,
  getRudrakshaProductsForPurpose: vi.fn(),
}));

import { submitBraceletCalculator } from "./calculator.controller";

function submit(body: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(() => resolve()),
    } as unknown as Response;
    const next: NextFunction = (error) => reject(error);

    submitBraceletCalculator({ body } as Request, response, next);
  });
}

describe("submitBraceletCalculator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLead.mockResolvedValue({});
    getBraceletsForRashi.mockResolvedValue([]);
  });

  it("does not save a lead while waiting for required birth time", async () => {
    resolveMoonRashi.mockReturnValue({ resolved: false });

    await submit({
      name: "Test User",
      dob: "2024-01-02",
      birthLocation: { timezone: "Asia/Kolkata" },
      mobile: "1234567890",
    });

    expect(createLead).not.toHaveBeenCalled();
  });

  it("saves one lead when the birth-time follow-up resolves the recommendation", async () => {
    resolveMoonRashi.mockReturnValue({ resolved: true, rashiCode: "SIMHA" });

    await submit({
      name: "Test User",
      dob: "2024-01-02",
      tob: "00:01",
      birthLocation: { timezone: "Asia/Kolkata" },
      mobile: "1234567890",
    });

    expect(createLead).toHaveBeenCalledTimes(1);
    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test User",
        calculatorType: "bracelet",
      }),
    );
  });
});
