/**
 * Rough fare estimate per leg. Each leg of a plan is a separate ticket with its own
 * reservation charge and minimum chargeable distance, so stitched plans cost more than a
 * through ticket. Figures are approximations for ranking and display only; the UI labels
 * them as estimates. Replace with the official fare table when one is licensed.
 */
const FARE_TABLE = Object.freeze({
  SL: { perKm: 0.45, reservation: 20, superfast: 30, minKm: 200 },
  '3A': { perKm: 1.25, reservation: 40, superfast: 45, minKm: 300 },
  '2A': { perKm: 1.8, reservation: 50, superfast: 45, minKm: 300 },
});

export function estimateFare(cls, km) {
  const row = FARE_TABLE[cls];
  if (!row) throw new Error(`No fare table for class ${cls}`);
  const chargeableKm = Math.max(km, row.minKm);
  const raw = chargeableKm * row.perKm + row.reservation + row.superfast;
  return Math.round(raw / 5) * 5;
}
