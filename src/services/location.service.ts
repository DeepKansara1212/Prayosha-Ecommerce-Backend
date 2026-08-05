import { searchOpenMeteo, NormalizedLocation } from "./providers/openMeteo.provider";

export interface LocationResult extends NormalizedLocation {
  displayName: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — common searches (Mumbai, Delhi, ...) shouldn't re-hit the provider every keystroke burst
const cache = new Map<string, { expiresAt: number; results: LocationResult[] }>();

function toDisplayName(location: NormalizedLocation): string {
  return [location.name, location.state, location.country].filter(Boolean).join(", ");
}

function getCached(key: string): LocationResult[] | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.results;
}

/**
 * Provider-agnostic location search — the rest of the app calls this, never
 * the Open-Meteo provider directly, so the provider can be swapped later
 * without touching callers.
 */
export async function searchLocations(place: string): Promise<LocationResult[]> {
  const key = place.trim().toLowerCase();

  const cached = getCached(key);
  if (cached) return cached;

  const normalized = await searchOpenMeteo(place);
  const results = normalized.map((location) => ({ ...location, displayName: toDisplayName(location) }));

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
  return results;
}
