/**
 * Clock and calendar helpers. Pure functions, no DOM.
 * All "absolute minutes" are minutes since 00:00 of day 1 of the train's run.
 */

export const MINUTES_PER_DAY = 1440;

/** "HH:MM" -> minutes since midnight. Returns null for empty input. */
export function parseClock(hhmm) {
  if (!hhmm) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`Invalid clock time: ${hhmm}`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) throw new Error(`Invalid clock time: ${hhmm}`);
  return h * 60 + m;
}

/** minutes since midnight (any integer) -> "HH:MM" on a 24h clock. */
export function formatClock(minutes) {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Duration in minutes -> "5h 20m" / "45m". */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Local Date -> "YYYY-MM-DD" (local calendar, not UTC). */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" -> local Date at 00:00. Throws on malformed input. */
export function fromISODate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) throw new Error(`Invalid ISO date: ${iso}`);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (toISODate(date) !== iso) throw new Error(`Invalid ISO date: ${iso}`);
  return date;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Local Date at 00:00 of the given day + absolute minutes offset. */
export function atMinutes(dayStart, minutes) {
  const d = new Date(dayStart);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}
