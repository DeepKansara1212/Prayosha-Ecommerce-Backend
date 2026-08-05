import { z } from "zod";

const name = z.string().min(2, "Name must be at least 2 characters").max(100);
const dob = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be in YYYY-MM-DD format");
const tob = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "tob must be in HH:MM (24-hour) format")
  .optional();
const mobile = z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid mobile number");
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

// A fully-resolved location the user picked from /api/v1/location/search —
// never raw free text. lat/lng/timezone come from the geocoding provider,
// not the user, so they're trusted numeric/string values here.
const birthLocation = z.object({
  displayName: z.string().min(1, "Place of birth is required"),
  name: z.string().min(1),
  state: z.string().optional(),
  country: z.string().min(1),
  countryCode: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().min(1),
});

export const braceletCalculatorSchema = z.object({
  name,
  dob,
  tob,
  birthLocation,
  mobile,
});

export const rudrakshaCalculatorSchema = z.object({
  name,
  dob,
  tob,
  birthLocation,
  mobile,
  purpose: objectId,
});
