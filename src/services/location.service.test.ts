import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { ApiError } from "../utils/ApiError";
import { searchLocations } from "./location.service";

vi.mock("axios");
const mockedGet = vi.mocked(axios.get);

describe("location.service", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("returns normalized results with a displayName for a multi-result response", async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        results: [
          {
            name: "Ahmedabad",
            admin1: "Gujarat",
            country: "India",
            country_code: "IN",
            latitude: 23.02579,
            longitude: 72.58727,
            timezone: "Asia/Kolkata",
          },
          {
            name: "Ahmedabad",
            admin1: "Khyber Pakhtunkhwa",
            country: "Pakistan",
            country_code: "PK",
            latitude: 34.22118,
            longitude: 73.0139,
            timezone: "Asia/Karachi",
          },
        ],
      },
    });

    const results = await searchLocations("Ahmedabad-unique-1");
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      displayName: "Ahmedabad, Gujarat, India",
      timezone: "Asia/Kolkata",
    });
    expect(results[1].displayName).toBe("Ahmedabad, Khyber Pakhtunkhwa, Pakistan");
  });

  it("returns an empty array (not an error) when Open-Meteo has no results key", async () => {
    mockedGet.mockResolvedValueOnce({ data: {} });
    const results = await searchLocations("zzznonexistent-unique-2");
    expect(results).toEqual([]);
  });

  it("throws a 503 ApiError on network/timeout failure", async () => {
    mockedGet.mockRejectedValueOnce(new Error("timeout of 5000ms exceeded"));
    await expect(searchLocations("Mumbai-unique-3")).rejects.toMatchObject(
      new ApiError(503, "Unable to search locations right now. Please try again.")
    );
  });

  it("serves a repeated query from cache without calling axios again", async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        results: [
          {
            name: "London",
            country: "United Kingdom",
            country_code: "GB",
            latitude: 51.50853,
            longitude: -0.12574,
            timezone: "Europe/London",
          },
        ],
      },
    });

    const first = await searchLocations("London-unique-4");
    const second = await searchLocations("London-unique-4");

    expect(first).toEqual(second);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });
});
