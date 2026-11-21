/**
 * Coach classes and berth layouts.
 *
 * A berth's vacancy is a list of free station intervals { from, to } (station indices,
 * from < to): the berth is empty from stop `from` until stop `to`.
 */

export const BERTH_TYPES = Object.freeze({
  LB: { code: 'LB', label: 'Lower', side: false, rank: 0 },
  MB: { code: 'MB', label: 'Middle', side: false, rank: 2 },
  UB: { code: 'UB', label: 'Upper', side: false, rank: 3 },
  SL: { code: 'SL', label: 'Side Lower', side: true, rank: 1 },
  SU: { code: 'SU', label: 'Side Upper', side: true, rank: 4 },
});

/** Bay layouts repeat every N berths. */
const LAYOUT_8 = ['LB', 'MB', 'UB', 'LB', 'MB', 'UB', 'SL', 'SU'];
const LAYOUT_6 = ['LB', 'UB', 'LB', 'UB', 'SL', 'SU'];

export const CLASSES = Object.freeze({
  SL: { code: 'SL', label: 'Sleeper', berths: 72, layout: LAYOUT_8, coachPrefix: 'S' },
  '3A': { code: '3A', label: 'AC 3 Tier', berths: 72, layout: LAYOUT_8, coachPrefix: 'B' },
  '2A': { code: '2A', label: 'AC 2 Tier', berths: 48, layout: LAYOUT_6, coachPrefix: 'A' },
});

export function berthType(cls, number) {
  const layout = CLASSES[cls]?.layout;
  if (!layout) throw new Error(`Unknown class: ${cls}`);
  return layout[(number - 1) % layout.length];
}

export function berthId(coach, number) {
  return `${coach}-${number}`;
}

/** True when one free interval covers the whole span [a, b]. */
export function coversSpan(berth, a, b) {
  return berth.free.some((f) => f.from <= a && f.to >= b);
}

/** Free intervals clipped to [a, b]; empty array when the berth is booked throughout. */
export function freeWithin(berth, a, b) {
  const out = [];
  for (const f of berth.free) {
    const from = Math.max(f.from, a);
    const to = Math.min(f.to, b);
    if (from < to) out.push({ from, to });
  }
  return out;
}

/** 'full' | 'partial' | 'booked' for the passenger's span [a, b]. */
export function spanStatus(berth, a, b) {
  if (coversSpan(berth, a, b)) return 'full';
  return freeWithin(berth, a, b).length > 0 ? 'partial' : 'booked';
}
