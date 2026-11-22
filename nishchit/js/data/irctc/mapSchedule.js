import { normalizeRoute } from '../../domain/route.js';
import { CLASSES } from '../../domain/berths.js';

/**
 * Map an IRCTC `trnscheduleenquiry/{train}` response to our Train shape.
 *
 * The mapper is deliberately tolerant of field-name variants, because IRCTC's JSON is not a
 * documented contract and has shifted over time. Each field is read through a small list of
 * candidate keys; if the real response uses a name not listed here, add it to the list - the
 * rest of the app does not change.
 *
 * Our Train shape:
 *   { number, name, classes, composition, route: normalizeRoute([{code,name,arr,dep,day,km}]) }
 *
 * `classes` and `composition` are NOT in the schedule response - they come from the chart
 * response at search time. We seed sensible defaults so the train is usable before a chart
 * is fetched; the chart later supplies the real coaches.
 */
export function mapSchedule(raw) {
  const number = String(pick(raw, ['trainNumber', 'trainNo', 'trainNum']) ?? '').trim();
  const name = String(pick(raw, ['trainName', 'trnName', 'name']) ?? '').trim();
  const list = pick(raw, ['stationList', 'stnList', 'schedule', 'stations']);
  if (!Array.isArray(list) || list.length < 2) {
    throw new Error('IRCTC schedule had no station list');
  }

  const rawStops = list.map((s) => ({
    code: String(pick(s, ['stationCode', 'stnCode', 'code']) ?? '').trim().toUpperCase(),
    name: titleCase(String(pick(s, ['stationName', 'stnName', 'name']) ?? '').trim()),
    arr: clock(pick(s, ['arrivalTime', 'arrival', 'arrTime', 'arr'])),
    dep: clock(pick(s, ['departureTime', 'departure', 'depTime', 'dep'])),
    day: toInt(pick(s, ['dayCount', 'dayCnt', 'day']), 1),
    km: toInt(pick(s, ['distance', 'dist', 'km']), 0),
  }));

  // Drop rows we can't place on the timeline (no code, or an intermediate stop with no times).
  const stops = rawStops.filter((s, i, all) => {
    if (!s.code) return false;
    const isEnd = i === 0 || i === all.length - 1;
    return isEnd || s.arr !== null || s.dep !== null;
  });
  if (stops.length < 2) throw new Error('IRCTC schedule had fewer than two usable stops');
  fixDays(stops);

  // Not frozen: getChart folds the real composition and classes back on once the chart loads.
  return {
    number,
    name: name || `Train ${number}`,
    classes: Object.keys(CLASSES), // placeholder until the chart is fetched
    composition: [], // filled from the chart
    route: normalizeRoute(stops),
  };
}

/**
 * Recompute each stop's `day` from the clock times instead of trusting IRCTC's dayCount.
 *
 * dayCount is not consistent across trains: on some (e.g. long multi-day runs like 22503) a halt
 * that crosses midnight is labelled with its departure day, which makes the next stop look
 * earlier than this one. No leg between consecutive stops runs 24h, so placing each stop at the
 * first occurrence of its time at or after the previous departure is unambiguous.
 */
function fixDays(stops) {
  let lastAbs = null;
  for (const stop of stops) {
    const first = toMinutes(stop.arr ?? stop.dep);
    if (first === null) continue; // only possible at the ends; normalizeRoute reports it
    if (lastAbs === null) {
      stop.day = 1;
    } else {
      const day = Math.max(0, Math.ceil((lastAbs - first) / 1440));
      stop.day = day + 1;
    }
    const arrAbs = (stop.day - 1) * 1440 + first;
    const dep = toMinutes(stop.dep);
    const halt = stop.arr !== null && dep !== null ? (dep - toMinutes(stop.arr) + 1440) % 1440 : 0;
    lastAbs = arrAbs + halt;
  }
}

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** IRCTC marks the ends with "--", "Source", "Destination" or blank; treat those as null. */
function clock(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str || str === '--' || /^source$|^destination$|^dest$|^start$|^end$/i.test(str)) return null;
  const m = /^(\d{1,2})[:.](\d{2})/.exec(str);
  if (!m) return null;
  const h = Number(m[1]) % 24; // IRCTC occasionally writes midnight as 24:00
  const min = Number(m[2]);
  if (min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function toInt(value, fallback) {
  const n = parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  return undefined;
}

function titleCase(str) {
  if (!str || str !== str.toUpperCase()) return str;
  return str
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/\bJn\b/g, 'JN');
}
