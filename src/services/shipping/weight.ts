const UNIT_TO_KILOGRAMS: Record<string, number> = {
  kg: 1,
  kgs: 1,
  kilogram: 1,
  kilograms: 1,
  g: 0.001,
  gram: 0.001,
  grams: 0.001,
  mg: 0.000001,
  milligram: 0.000001,
  milligrams: 0.000001,
  lb: 0.45359237,
  lbs: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
  oz: 0.028349523125,
  ounce: 0.028349523125,
  ounces: 0.028349523125,
};

export function parseWeightInKilograms(
  value: string,
  allowUnitlessKilograms = false,
): number | undefined {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/i);
  if (!match) return undefined;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const unit = match[2]?.toLowerCase();
  if (!unit) return allowUnitlessKilograms ? amount : undefined;

  const multiplier = UNIT_TO_KILOGRAMS[unit];
  return multiplier ? amount * multiplier : undefined;
}
