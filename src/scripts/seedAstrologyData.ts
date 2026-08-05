import mongoose from "mongoose";
import { env } from "../config/env";
import { Rashi } from "../models/rashi.model";
import { Purpose } from "../models/purpose.model";
import { RudrakshaType } from "../models/rudrakshaType.model";
import { PurposeRudrakshaMapping } from "../models/purposeRudrakshaMapping.model";

// The 12 Rashis are fixed astronomical reference data (30°-degree sidereal
// bands), not commercial mapping rules — seeded once, editable afterward.
const RASHIS: { name: string; code: string }[] = [
  { name: "Mesha / Aries", code: "MESHA" },
  { name: "Vrishabha / Taurus", code: "VRISHABHA" },
  { name: "Mithuna / Gemini", code: "MITHUNA" },
  { name: "Karka / Cancer", code: "KARKA" },
  { name: "Simha / Leo", code: "SIMHA" },
  { name: "Kanya / Virgo", code: "KANYA" },
  { name: "Tula / Libra", code: "TULA" },
  { name: "Vrischika / Scorpio", code: "VRISCHIKA" },
  { name: "Dhanu / Sagittarius", code: "DHANU" },
  { name: "Makara / Capricorn", code: "MAKARA" },
  { name: "Kumbha / Aquarius", code: "KUMBHA" },
  { name: "Meena / Pisces", code: "MEENA" },
];

// Real, client-supplied reference data (Rudraksha_Purpose_Guide.pdf).
const PURPOSES = [
  "Health",
  "Relationship & Family",
  "Career & Success",
  "Spirituality",
  "Protection",
  "Money & Business",
  "Study & Knowledge",
];

const MUKHI_TYPES = Array.from({ length: 25 }, (_, i) => `${i + 1} Mukhi`);
const SPECIAL_TYPES = ["Gauri Shankar", "Garbh Gauri", "Ganesh Mukhi"];
const RUDRAKSHA_TYPES = [...MUKHI_TYPES, ...SPECIAL_TYPES];

// Client-approved Purpose -> Rudraksha type rule table (order = display priority).
const PURPOSE_RUDRAKSHA_TABLE: Record<string, string[]> = {
  "Health": ["3 Mukhi", "5 Mukhi", "6 Mukhi", "16 Mukhi", "18 Mukhi", "23 Mukhi", "24 Mukhi"],
  "Relationship & Family": ["2 Mukhi", "6 Mukhi", "15 Mukhi", "20 Mukhi", "Gauri Shankar", "Garbh Gauri"],
  "Career & Success": ["1 Mukhi", "11 Mukhi", "12 Mukhi", "17 Mukhi", "22 Mukhi"],
  "Spirituality": ["1 Mukhi", "4 Mukhi", "5 Mukhi", "14 Mukhi", "24 Mukhi", "Gauri Shankar"],
  "Protection": ["8 Mukhi", "9 Mukhi", "10 Mukhi", "18 Mukhi", "25 Mukhi", "Ganesh Mukhi"],
  "Money & Business": ["7 Mukhi", "8 Mukhi", "13 Mukhi", "14 Mukhi", "19 Mukhi", "21 Mukhi", "Ganesh Mukhi"],
  "Study & Knowledge": ["4 Mukhi", "6 Mukhi", "11 Mukhi", "12 Mukhi", "17 Mukhi", "Ganesh Mukhi"],
};

// Superseded placeholder data from before real client data was supplied —
// removed on every run so re-seeding stays idempotent and the DB doesn't
// accumulate stale placeholder rows.
const OLD_PLACEHOLDER_PURPOSES = [
  "Career Growth — PLACEHOLDER",
  "Health & Wellness — PLACEHOLDER",
  "Relationships — PLACEHOLDER",
];
const OLD_PLACEHOLDER_RUDRAKSHA_TYPES = [
  "1 Mukhi — PLACEHOLDER",
  "5 Mukhi — PLACEHOLDER",
  "11 Mukhi — PLACEHOLDER",
];

async function seed(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB");

  // ── Remove superseded placeholder rows (and any mappings pointing at them) ──
  const stalePurposes = await Purpose.find({ name: { $in: OLD_PLACEHOLDER_PURPOSES } });
  const staleTypes = await RudrakshaType.find({ name: { $in: OLD_PLACEHOLDER_RUDRAKSHA_TYPES } });
  if (stalePurposes.length || staleTypes.length) {
    await PurposeRudrakshaMapping.deleteMany({
      $or: [
        { purpose: { $in: stalePurposes.map((p) => p._id) } },
        { rudrakshaType: { $in: staleTypes.map((t) => t._id) } },
      ],
    });
    await Purpose.deleteMany({ _id: { $in: stalePurposes.map((p) => p._id) } });
    await RudrakshaType.deleteMany({ _id: { $in: staleTypes.map((t) => t._id) } });
    console.log(`✓ Removed ${stalePurposes.length} placeholder Purposes and ${staleTypes.length} placeholder RudrakshaTypes`);
  }

  // ── Rashis (fixed reference data) ───────────────────────────────────────────
  for (const rashi of RASHIS) {
    await Rashi.findOneAndUpdate(
      { code: rashi.code },
      { $setOnInsert: rashi },
      { upsert: true, new: true }
    );
  }
  console.log(`✓ Seeded ${RASHIS.length} Rashis`);

  // ── Purposes ─────────────────────────────────────────────────────────────────
  for (const name of PURPOSES) {
    await Purpose.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, active: true } },
      { upsert: true, new: true }
    );
  }
  console.log(`✓ Seeded ${PURPOSES.length} Purposes`);

  // ── Rudraksha types ──────────────────────────────────────────────────────────
  for (const name of RUDRAKSHA_TYPES) {
    await RudrakshaType.findOneAndUpdate(
      { name },
      { $setOnInsert: { name } },
      { upsert: true, new: true }
    );
  }
  console.log(`✓ Seeded ${RUDRAKSHA_TYPES.length} RudrakshaTypes`);

  // ── Purpose -> Rudraksha type mappings (client-approved rule table) ────────
  let mappingCount = 0;
  for (const [purposeName, typeNames] of Object.entries(PURPOSE_RUDRAKSHA_TABLE)) {
    const purpose = await Purpose.findOne({ name: purposeName });
    if (!purpose) continue;

    for (let i = 0; i < typeNames.length; i++) {
      const rudrakshaType = await RudrakshaType.findOne({ name: typeNames[i] });
      if (!rudrakshaType) continue;

      await PurposeRudrakshaMapping.findOneAndUpdate(
        { purpose: purpose._id, rudrakshaType: rudrakshaType._id },
        { $setOnInsert: { priority: i, active: true } },
        { upsert: true, new: true }
      );
      mappingCount++;
    }
  }
  console.log(`✓ Seeded ${mappingCount} Purpose-RudrakshaType mappings`);

  console.log("\nAstrology reference data seeded successfully.");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Failed to seed astrology data:", err);
  process.exit(1);
});
