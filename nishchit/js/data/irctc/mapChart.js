import { CLASSES, berthType } from '../../domain/berths.js';

/**
 * Map IRCTC online-charts responses to our chart shape.
 *
 * Field names below are confirmed against real captured responses (IRCTC train 18609,
 * Oct 2026). The chart is TWO endpoints:
 *
 *   1. POST /online-charts/api/trainComposition
 *        req:  { trainNo, jDate: "YYYY-MM-DD", boardingStation }
 *        resp: { cdd: [ { coachName, classCode, positionFromEngine, vacantBerths } ],
 *                trainNo, trainName, from, to, remote, nextRemote,
 *                chartOneDate, chartTwoDate, error,
 *                chartStatusResponseDto: { chartOneFlag, chartTwoFlag, ... } }
 *
 *   2. POST /online-charts/api/coachComposition
 *        req:  { trainNo, jDate, boardingStation, remoteStation, trainSourceStation, coach, cls }
 *        resp: { coachName, error,
 *                bdd: [ { berthNo, berthCode, cabinCoupe, from, to, enable,
 *                         bsd: [ { splitNo, from, to, quota, occupancy } ] } ] }
 *        bsd from/to are STATION CODES; occupancy false = vacant, true = occupied.
 *
 * Layers:
 *   - buildBerths / assembleChart: STABLE core (tested). Free intervals come from the bsd
 *     segments where occupancy === false, with station codes resolved against the route.
 *   - parseTrainComposition / parseCoachComposition: IRCTC adapters, now matched to the real
 *     fields (tolerant of a few alternate names in case IRCTC shifts them).
 */

/* ------------------------------ stable core ------------------------------ */

export function buildBerths(coaches, route) {
  const berths = [];
  for (const coach of coaches) {
    if (!CLASSES[coach.cls]) continue; // V1 plans SL / 3A / 2A; other classes are skipped
    for (const b of coach.berths) {
      const free = mergeIntervals(
        (b.segments ?? [])
          .filter((s) => s.occupied === false) // only vacant segments; true/unknown are not free
          .map((s) => ({ from: rangeIndex(s.from, route, 0), to: rangeIndex(s.to, route, route.length - 1) }))
          .filter((s) => s.from !== null && s.to !== null && s.from < s.to),
      );
      if (!free.length) continue;
      berths.push({
        id: `${coach.coach}-${b.number}`,
        coach: coach.coach,
        number: b.number,
        cls: coach.cls,
        type: b.type || berthType(coach.cls, b.number),
        free,
      });
    }
  }
  return berths;
}

export function assembleChart(composition, coachCharts, route) {
  const coaches = composition.coaches.map((c) => ({ ...c, berths: coachCharts.get(c.coach) ?? [] }));
  const berths = buildBerths(coaches, route);
  return {
    berths,
    composition: composition.coaches.map((c) => c.coach),
    classes: [...new Set(composition.coaches.map((c) => c.cls))].filter((c) => CLASSES[c]),
    source: 'live',
    fetchedAt: new Date(),
    stage: composition.stage,
  };
}

function rangeIndex(value, route, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const code = String(value).trim().toUpperCase();
  const idx = route.findIndex((s) => s.code === code);
  return idx >= 0 ? idx : null;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.from - b.from || a.to - b.to);
  const out = [sorted[0]];
  for (const cur of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (cur.from <= last.to) last.to = Math.max(last.to, cur.to);
    else out.push(cur);
  }
  return out;
}

/* --------------------------- IRCTC adapters --------------------------- */

export function parseTrainComposition(raw) {
  if (raw?.error) throw new Error(`IRCTC: ${raw.error}`);
  const list = pick(raw, ['cdd', 'coaches', 'coachData']);
  if (!Array.isArray(list)) {
    throw new Error('Unrecognised trainComposition shape: no cdd/coach list. Capture one response and update mapChart.js.');
  }
  const coaches = list
    .map((c) => ({
      coach: String(pick(c, ['coachName', 'coachId', 'coach']) ?? '').trim().toUpperCase(),
      cls: normaliseClass(pick(c, ['classCode', 'coachClass', 'cls'])),
    }))
    .filter((c) => c.coach && c.cls);

  const dto = pick(raw, ['chartStatusResponseDto']) ?? {};
  const chartOneDate = pick(raw, ['chartOneDate']);
  const chartTwoDate = pick(raw, ['chartTwoDate']);
  const prepared = coaches.length > 0 && (Boolean(chartOneDate) || Number(dto.chartOneFlag) > 0);
  const stage = chartTwoDate || Number(dto.chartTwoFlag) > 0 ? 'second' : prepared ? 'first' : 'not-prepared';

  return {
    prepared,
    stage,
    coaches,
    source: String(pick(raw, ['from', 'trainSourceStation']) ?? '').trim().toUpperCase() || null,
    remote: String(pick(raw, ['remote', 'remoteStation']) ?? '').trim().toUpperCase() || null,
  };
}

export function parseCoachComposition(raw) {
  if (raw?.error) return []; // a single coach failing should not sink the whole chart
  const list = pick(raw, ['bdd', 'berths', 'berthDetails']);
  if (!Array.isArray(list)) return [];
  return list
    .filter((b) => pick(b, ['enable']) !== false)
    .map((b) => ({
      number: toInt(pick(b, ['berthNo', 'berthNumber', 'seatNo'])),
      type: mapBerthCode(pick(b, ['berthCode', 'berthType', 'type'])),
      segments: parseSegments(pick(b, ['bsd', 'segments'])),
    }))
    .filter((b) => b.number > 0);
}

function parseSegments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ({
      from: pick(s, ['from', 'fromStn', 'fromStnCode']),
      to: pick(s, ['to', 'toStn', 'toStnCode']),
      occupied: asOccupied(pick(s, ['occupancy', 'occupied', 'status'])),
    }))
    .filter((s) => s.from != null || s.to != null);
}

/** IRCTC: true = occupied, false = vacant, anything else = unknown (treated as not free). */
function asOccupied(value) {
  if (value === true || value === false) return value;
  const str = String(value ?? '').trim().toLowerCase();
  if (str === 'true' || str === 'occupied' || str === '1') return true;
  if (str === 'false' || str === 'vacant' || str === '0') return false;
  return 'unknown';
}

/** IRCTC berthCode: L/M/U + SL/SU (and a few spellings) -> our LB/MB/UB/SL/SU. */
function mapBerthCode(value) {
  const str = String(value ?? '').trim().toUpperCase();
  return BERTH_CODE_MAP[str] ?? '';
}
const BERTH_CODE_MAP = {
  L: 'LB', M: 'MB', U: 'UB', SL: 'SL', SU: 'SU',
  LB: 'LB', MB: 'MB', UB: 'UB', SLB: 'SL', SUB: 'SU', SB: 'SL',
};

function normaliseClass(value) {
  const str = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const alias = { SLEEPER: 'SL', '3AC': '3A', '2AC': '2A', '1AC': '1A', AC3: '3A', AC2: '2A' };
  return alias[str] ?? str;
}

function toInt(value) {
  const n = parseInt(String(value ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  return undefined;
}
