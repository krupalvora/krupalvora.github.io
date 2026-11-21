import { parseClock, MINUTES_PER_DAY } from './time.js';

/**
 * A route is an ordered list of stops S0..Sn.
 * Raw stop shape (from data/trains/*.json):
 *   { code, name, arr: "HH:MM"|null, dep: "HH:MM"|null, day: 1-based day of arrival, km }
 *
 * normalizeRoute() adds absolute times so the rest of the app never re-derives them:
 *   arrAbs / depAbs: minutes since 00:00 of day 1 (null at the ends)
 *   haltMin: minutes stopped (0 at the ends)
 */
export function normalizeRoute(stops) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error('A route needs at least two stops');
  }
  let lastAbs = -Infinity;
  return stops.map((stop, index) => {
    const arr = parseClock(stop.arr);
    const dep = parseClock(stop.dep);
    const dayOffset = (stop.day - 1) * MINUTES_PER_DAY;
    const arrAbs = arr === null ? null : dayOffset + arr;
    const haltMin = arr !== null && dep !== null ? (dep - arr + MINUTES_PER_DAY) % MINUTES_PER_DAY : 0;
    const depAbs = dep === null ? null : arrAbs === null ? dayOffset + dep : arrAbs + haltMin;

    const firstAbs = arrAbs ?? depAbs;
    if (firstAbs === null) throw new Error(`Stop ${stop.code} has neither arr nor dep`);
    if (firstAbs < lastAbs) throw new Error(`Stop ${stop.code} is earlier than the previous stop`);
    lastAbs = depAbs ?? arrAbs;

    return Object.freeze({ ...stop, index, arrAbs, depAbs, haltMin });
  });
}

export function stationIndex(route, code) {
  return route.findIndex((s) => s.code === code);
}

/** Travel minutes from leaving stop a to arriving at stop b. */
export function legMinutes(route, a, b) {
  return route[b].arrAbs - route[a].depAbs;
}

export function legKm(route, a, b) {
  return route[b].km - route[a].km;
}
