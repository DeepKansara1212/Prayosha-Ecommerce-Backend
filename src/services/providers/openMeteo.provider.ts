import axios from "axios";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";

export interface NormalizedLocation {
  name: string;
  state?: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface OpenMeteoResult {
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface OpenMeteoResponse {
  results?: OpenMeteoResult[];
}

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Open-Meteo's free geocoding endpoint returns lat/lng/timezone in a single
 * call (no separate timezone lookup, no API key). A query with zero matches
 * comes back as HTTP 200 with no `results` key at all.
 */
export async function searchOpenMeteo(place: string): Promise<NormalizedLocation[]> {
  let response;
  try {
    response = await axios.get<OpenMeteoResponse>(env.OPEN_METEO_GEOCODING_URL, {
      params: { name: place, count: 5, language: "en", format: "json" },
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (err) {
    console.error("Open-Meteo geocoding request failed:", err);
    throw new ApiError(503, "Unable to search locations right now. Please try again.");
  }

  const results = response.data.results;
  if (!results || results.length === 0) return [];

  return results
    .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number" && !!r.timezone)
    .map((r) => ({
      name: r.name,
      state: r.admin1,
      country: r.country ?? "",
      countryCode: r.country_code ?? "",
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
    }));
}
