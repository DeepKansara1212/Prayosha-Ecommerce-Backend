import { describe, it, expect } from "vitest";
import { longitudeToRashi, resolveMoonRashi } from "./astrology.service";

describe("longitudeToRashi", () => {
  it("maps 0deg to the first band (Mesha)", () => {
    expect(longitudeToRashi(0).code).toBe("MESHA");
  });

  it("maps 29.999deg to the first band (Mesha)", () => {
    expect(longitudeToRashi(29.999).code).toBe("MESHA");
  });

  it("maps exactly 30deg to the second band (Vrishabha)", () => {
    expect(longitudeToRashi(30).code).toBe("VRISHABHA");
  });

  it("maps 359.999deg to the last band (Meena)", () => {
    expect(longitudeToRashi(359.999).code).toBe("MEENA");
  });

  it("wraps longitudes >= 360deg", () => {
    expect(longitudeToRashi(360).code).toBe("MESHA");
    expect(longitudeToRashi(390).code).toBe("VRISHABHA");
  });

  it("handles negative longitudes by normalizing into 0-360", () => {
    expect(longitudeToRashi(-1).code).toBe("MEENA");
  });
});

describe("resolveMoonRashi", () => {
  // Fixtures found by scanning real sweph/Moshier output for Asia/Kolkata —
  // 2024-01-01 has a stable Rashi across the whole local day, 2024-01-02 is a
  // real day where the Moon crosses into a new Rashi (birth time required).
  const STABLE_DOB = "2024-01-01";
  const AMBIGUOUS_DOB = "2024-01-02";
  const TIMEZONE = "Asia/Kolkata";

  it("resolves directly when time of birth is supplied", () => {
    const result = resolveMoonRashi(STABLE_DOB, "12:00", { timezone: TIMEZONE });
    expect(result.resolved).toBe(true);
  });

  it("resolves without birth time when the Moon stays in one Rashi all day", () => {
    const result = resolveMoonRashi(STABLE_DOB, null, { timezone: TIMEZONE });
    expect(result).toEqual({ resolved: true, rashiCode: "SIMHA" });
  });

  it("requires birth time (never guesses) when the Moon changes Rashi during the day", () => {
    const result = resolveMoonRashi(AMBIGUOUS_DOB, null, { timezone: TIMEZONE });
    expect(result).toEqual({ resolved: false });
  });

  it("resolves the ambiguous day once a time of birth disambiguates it", () => {
    const result = resolveMoonRashi(AMBIGUOUS_DOB, "00:01", { timezone: TIMEZONE });
    expect(result.resolved).toBe(true);
  });
});
