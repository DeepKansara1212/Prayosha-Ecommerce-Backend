import sweph from "sweph";
import { DateTime } from "luxon";

// Sidereal mode must be set explicitly — Lahiri is the standard ayanamsa for
// Vedic Rashi calculation. This is a one-time global setting on the native lib.
sweph.set_sid_mode(sweph.constants.SE_SIDM_LAHIRI, 0, 0);

const SIDEREAL_MOSEPH_FLAGS =
  sweph.constants.SEFLG_SIDEREAL | sweph.constants.SEFLG_MOSEPH;

export interface RashiInfo {
  code: string;
  name: string;
}

// Fixed 30°-band definitions — astronomical fact, not a commercial mapping.
const RASHIS: RashiInfo[] = [
  { code: "MESHA", name: "Mesha / Aries" },
  { code: "VRISHABHA", name: "Vrishabha / Taurus" },
  { code: "MITHUNA", name: "Mithuna / Gemini" },
  { code: "KARKA", name: "Karka / Cancer" },
  { code: "SIMHA", name: "Simha / Leo" },
  { code: "KANYA", name: "Kanya / Virgo" },
  { code: "TULA", name: "Tula / Libra" },
  { code: "VRISCHIKA", name: "Vrischika / Scorpio" },
  { code: "DHANU", name: "Dhanu / Sagittarius" },
  { code: "MAKARA", name: "Makara / Capricorn" },
  { code: "KUMBHA", name: "Kumbha / Aquarius" },
  { code: "MEENA", name: "Meena / Pisces" },
];

export function computeSiderealMoonLongitude(utcDateTime: Date): number {
  const dt = DateTime.fromJSDate(utcDateTime, { zone: "utc" });
  const hour = dt.hour + dt.minute / 60 + dt.second / 3600;
  const jd = sweph.julday(dt.year, dt.month, dt.day, hour, sweph.constants.SE_GREG_CAL);
  const result = sweph.calc_ut(jd, sweph.constants.SE_MOON, SIDEREAL_MOSEPH_FLAGS);
  if (result.flag < 0) {
    throw new Error(`Swiss Ephemeris calculation failed: ${result.error}`);
  }
  return result.data[0];
}

export function longitudeToRashi(longitude: number): RashiInfo {
  const normalized = ((longitude % 360) + 360) % 360;
  const index = Math.floor(normalized / 30) % 12;
  return RASHIS[index];
}

export interface BirthPlace {
  timezone: string;
}

export type MoonRashiResult =
  | { resolved: true; rashiCode: string }
  | { resolved: false };

/**
 * Implements the birth-time decision logic exactly:
 * - tob supplied -> exact local datetime -> UTC -> single calculation.
 * - tob missing -> local calendar day start/end, each converted to UTC
 *   individually (luxon resolves historical IANA offsets correctly) -> if
 *   the Moon is in different Rashis at the two boundaries, birth time is
 *   required and we never guess.
 */
export function resolveMoonRashi(
  dob: string,
  tob: string | null,
  place: BirthPlace
): MoonRashiResult {
  if (tob) {
    const local = DateTime.fromISO(`${dob}T${tob}`, { zone: place.timezone });
    if (!local.isValid) {
      throw new Error(`Invalid date/time/timezone combination: ${local.invalidExplanation}`);
    }
    const longitude = computeSiderealMoonLongitude(local.toUTC().toJSDate());
    return { resolved: true, rashiCode: longitudeToRashi(longitude).code };
  }

  const dayStart = DateTime.fromISO(dob, { zone: place.timezone }).startOf("day");
  const dayEnd = DateTime.fromISO(dob, { zone: place.timezone }).endOf("day");
  if (!dayStart.isValid || !dayEnd.isValid) {
    throw new Error(`Invalid date/timezone combination: ${dayStart.invalidExplanation}`);
  }

  const startRashi = longitudeToRashi(computeSiderealMoonLongitude(dayStart.toUTC().toJSDate()));
  const endRashi = longitudeToRashi(computeSiderealMoonLongitude(dayEnd.toUTC().toJSDate()));

  if (startRashi.code === endRashi.code) {
    return { resolved: true, rashiCode: startRashi.code };
  }
  return { resolved: false };
}
