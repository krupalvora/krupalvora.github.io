import { BERTH_TYPES } from './berths.js';
import { estimateFare } from './fare.js';
import { legKm, legMinutes } from './route.js';

/**
 * Plan engine (TRD "Recommendation engine").
 *
 * Each berth is a set of free station intervals. We search for the cheapest way from the
 * origin to the destination where every leg rides one berth (or k berths for a party of k)
 * between two stops. The search is Dijkstra over states (station, coach), so the coach the
 * party is standing in is known at each switch and walking distance can be scored.
 *
 * Costs are compared lexicographically, which encodes the ranking priority from the TRD:
 *   1. fewer legs (= fewer switches)
 *   2. fewer unsafe switches (halt < 5 min, or between 23:00 and 06:00)
 *   3. party kept together (groups only)
 *   4. short walks (same or adjacent coach)
 *   5. lower total fare
 *   6. better berth types (lower > side lower > middle > upper > side upper; side berths
 *      penalised on long legs)
 * Lexicographic order is preserved under component-wise addition of non-negative vectors,
 * so Dijkstra stays correct.
 *
 * The module is pure: no DOM, no I/O. Inputs are never mutated.
 */

export const DEFAULT_ENGINE_OPTIONS = Object.freeze({
  maxSwitches: 2,
  minSafeHaltMin: 5,
  nightStartMin: 23 * 60,
  nightEndMin: 6 * 60,
  sideBerthLongLegMin: 6 * 60,
  sideBerthLongLegPenalty: 5,
  maxPlans: 3,
});

const COST_SIZE = 6;
const ZERO_COST = Object.freeze(new Array(COST_SIZE).fill(0));

export function compareCost(a, b) {
  for (let i = 0; i < COST_SIZE; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function addCost(a, b) {
  return a.map((v, i) => v + b[i]);
}

/**
 * @param {object} input
 * @param {Array}  input.route        normalized route (see route.js)
 * @param {Array}  input.berths       [{ id, coach, number, type, cls, free: [{from, to}] }]
 * @param {number} input.origin       boarding station index
 * @param {number} input.destination  alighting station index
 * @param {number} [input.partySize=1]
 * @param {Array<string>} [input.coachOrder] coach ids in train composition order
 * @param {Function} [input.fareFn]  (cls, km) -> rupees
 * @param {object} [input.options]   overrides for DEFAULT_ENGINE_OPTIONS
 * @returns {{status: 'full'|'partial'|'none', plans: Array, partial: object|null, boardLater: object|null}}
 */
export function planJourney(input) {
  const ctx = createContext(input);
  const { origin, destination } = ctx;

  const run = search(ctx, origin, new Set());
  const best = run.planTo(destination);
  if (best) {
    return { status: 'full', plans: alternatives(ctx, best), partial: null, boardLater: null };
  }

  // Fallback ladder, last rung: get as far as possible, and say where seats resume.
  let partial = null;
  for (let s = destination - 1; s > origin; s -= 1) {
    const plan = run.planTo(s);
    if (plan) {
      partial = { plan, reachedIndex: s, uncoveredKm: legKm(ctx.route, s, destination) };
      break;
    }
  }

  let boardLater = null;
  for (let s = origin + 1; s < destination; s += 1) {
    const plan = search(ctx, s, new Set()).planTo(destination);
    if (plan) {
      boardLater = { plan, boardIndex: s, skippedKm: legKm(ctx.route, origin, s) };
      break;
    }
  }

  return { status: partial || boardLater ? 'partial' : 'none', plans: [], partial, boardLater };
}

function createContext({
  route,
  berths,
  origin,
  destination,
  partySize = 1,
  coachOrder = [],
  fareFn = estimateFare,
  options = {},
}) {
  if (!Array.isArray(route) || route.length < 2) throw new Error('route is required');
  if (!Number.isInteger(origin) || !Number.isInteger(destination)) {
    throw new Error('origin and destination must be station indices');
  }
  if (origin < 0 || destination >= route.length || origin >= destination) {
    throw new Error('origin must come before destination on the route');
  }
  if (!Number.isInteger(partySize) || partySize < 1) throw new Error('partySize must be >= 1');

  const opts = { ...DEFAULT_ENGINE_OPTIONS, ...options };
  const coachPos = new Map(coachOrder.map((c, i) => [c, i]));
  return {
    route,
    berths,
    origin,
    destination,
    partySize,
    fareFn,
    opts,
    coachPos,
    maxLegs: opts.maxSwitches + 1,
  };
}

/* ----------------------------- scoring ------------------------------ */

function berthPenalty(ctx, berth, minutes) {
  const t = BERTH_TYPES[berth.type];
  if (!t) return BERTH_TYPES.SU.rank;
  const longSide = t.side && minutes > ctx.opts.sideBerthLongLegMin;
  return t.rank + (longSide ? ctx.opts.sideBerthLongLegPenalty : 0);
}

/** Why a switch at this stop is risky, or null when it is safe. */
export function switchRisk(stop, opts = DEFAULT_ENGINE_OPTIONS) {
  const reasons = [];
  if (stop.haltMin < opts.minSafeHaltMin) reasons.push('short-halt');
  const clock = ((stop.depAbs ?? stop.arrAbs) % 1440 + 1440) % 1440;
  if (clock >= opts.nightStartMin || clock < opts.nightEndMin) reasons.push('night');
  return reasons.length ? reasons : null;
}

function walkCost(ctx, fromCoach, toCoach) {
  if (fromCoach === toCoach) return 0;
  const a = ctx.coachPos.get(fromCoach);
  const b = ctx.coachPos.get(toCoach);
  if (a === undefined || b === undefined) return 2;
  return Math.abs(a - b) === 1 ? 1 : 2;
}

/* ------------------------- edge candidates -------------------------- */

/**
 * For every span [a, b] with start <= a < b <= destination, the best set of k berths per
 * coach that are free for the whole span. For parties, a "mixed coach" option is added so
 * the party can still travel together on one train when no single coach has k berths.
 * Result: cands[a][b] = [{ coach, berths, split, penalty }]
 */
function buildCandidates(ctx, start, banned) {
  const { route, destination, partySize } = ctx;
  const covering = new Map(); // "a:b" -> berth[]
  for (const berth of ctx.berths) {
    if (banned.has(berth.id)) continue;
    for (const f of berth.free) {
      const lo = Math.max(f.from, start);
      const hi = Math.min(f.to, destination);
      for (let a = lo; a < hi; a += 1) {
        for (let b = a + 1; b <= hi; b += 1) {
          const key = `${a}:${b}`;
          let list = covering.get(key);
          if (!list) covering.set(key, (list = []));
          list.push(berth);
        }
      }
    }
  }

  const cands = [];
  for (const [key, list] of covering) {
    if (list.length < partySize) continue;
    const [a, b] = key.split(':').map(Number);
    const minutes = legMinutes(route, a, b);
    const scored = list
      .map((berth) => ({ berth, p: berthPenalty(ctx, berth, minutes) }))
      .sort((x, y) => x.p - y.p || x.berth.number - y.berth.number);

    const byCoach = new Map();
    for (const item of scored) {
      let arr = byCoach.get(item.berth.coach);
      if (!arr) byCoach.set(item.berth.coach, (arr = []));
      arr.push(item);
    }

    const options = [];
    for (const [coach, items] of byCoach) {
      if (items.length < partySize) continue;
      const chosen = items.slice(0, partySize);
      options.push({
        coach,
        berths: chosen.map((x) => x.berth),
        split: 0,
        penalty: chosen.reduce((s, x) => s + x.p, 0),
      });
    }
    if (partySize > 1 && byCoach.size > 1) {
      const chosen = scored.slice(0, partySize);
      const coaches = new Set(chosen.map((x) => x.berth.coach));
      if (coaches.size > 1) {
        options.push({
          coach: chosen[0].berth.coach,
          berths: chosen.map((x) => x.berth),
          split: coaches.size - 1,
          penalty: chosen.reduce((s, x) => s + x.p, 0),
        });
      }
    }
    if (options.length) {
      (cands[a] ??= [])[b] = options;
    }
  }
  return { cands, supply: covering };
}

/* ------------------------------ search ------------------------------ */

function stateKey(station, coach) {
  return `${station}|${coach ?? ''}`;
}

function search(ctx, start, banned) {
  const { cands, supply } = buildCandidates(ctx, start, banned);
  const { route, destination, maxLegs } = ctx;

  const startKey = stateKey(start, null);
  const nodes = new Map([[startKey, { station: start, coach: null, cost: ZERO_COST, prev: null, leg: null }]]);
  const done = new Set();
  const open = [startKey];

  while (open.length) {
    // Linear extraction is fine: at most (stations x coaches) states, ~150 for a full train.
    let bestIdx = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (compareCost(nodes.get(open[i]).cost, nodes.get(open[bestIdx]).cost) < 0) bestIdx = i;
    }
    const key = open.splice(bestIdx, 1)[0];
    if (done.has(key)) continue;
    done.add(key);

    const node = nodes.get(key);
    const a = node.station;
    if (a === destination || node.cost[0] >= maxLegs) continue;

    const isSwitch = node.coach !== null;
    const risky = isSwitch && switchRisk(route[a], ctx.opts) ? 1 : 0;
    const row = cands[a] ?? [];

    for (let b = a + 1; b <= destination; b += 1) {
      for (const option of row[b] ?? []) {
        const km = legKm(route, a, b);
        const fare = option.berths.reduce((s, x) => s + ctx.fareFn(x.cls, km), 0);
        const step = [
          1,
          risky,
          option.split,
          isSwitch ? walkCost(ctx, node.coach, option.coach) : 0,
          fare,
          option.penalty,
        ];
        const cost = addCost(node.cost, step);
        const nextKey = stateKey(b, option.coach);
        const existing = nodes.get(nextKey);
        if (!existing || compareCost(cost, existing.cost) < 0) {
          nodes.set(nextKey, {
            station: b,
            coach: option.coach,
            cost,
            prev: key,
            leg: { from: a, to: b, coach: option.coach, berths: option.berths, fare, split: option.split },
          });
          open.push(nextKey);
        }
      }
    }
  }

  return {
    planTo(station) {
      let bestNode = null;
      for (const n of nodes.values()) {
        if (n.station !== station || n.prev === null) continue;
        if (!bestNode || compareCost(n.cost, bestNode.cost) < 0) bestNode = n;
      }
      return bestNode ? buildPlan(ctx, nodes, bestNode, supply) : null;
    },
  };
}

function buildPlan(ctx, nodes, endNode, supply) {
  const legs = [];
  for (let n = endNode; n.prev !== null; n = nodes.get(n.prev)) legs.unshift(n.leg);

  const { route } = ctx;
  const enriched = legs.map((leg, i) => {
    const switchAt = i === 0 ? null : route[leg.from];
    return {
      ...leg,
      km: legKm(route, leg.from, leg.to),
      minutes: legMinutes(route, leg.from, leg.to),
      // How many berths could serve this exact span. Lowest supply = book first.
      supply: supply.get(`${leg.from}:${leg.to}`)?.length ?? 0,
      switchRisk: switchAt ? switchRisk(switchAt, ctx.opts) : null,
    };
  });

  const bookingOrder = enriched
    .map((leg, i) => ({ i, supply: leg.supply }))
    .sort((x, y) => x.supply - y.supply || x.i - y.i)
    .map((x) => x.i);

  return {
    legs: enriched,
    switches: enriched.length - 1,
    fare: enriched.reduce((s, l) => s + l.fare, 0),
    cost: endNode.cost,
    bookingOrder,
    signature: signature(enriched),
  };
}

function signature(legs) {
  return legs.map((l) => `${l.from}-${l.to}:${l.berths.map((b) => b.id).join(',')}`).join('|');
}

/**
 * Top N distinct plans. Two cheap passes feed one pool:
 *  - variants: best plan with each of its berths banned in turn (swap one leg's berth);
 *  - disjoint: repeatedly ban every berth already used, so the user has backups that do
 *    not share a berth with the first plan if someone else books it first.
 */
function alternatives(ctx, best) {
  const pool = new Map([[best.signature, best]]);
  const add = (plan) => plan && !pool.has(plan.signature) && pool.set(plan.signature, plan);
  const berthIds = (plan) => plan.legs.flatMap((l) => l.berths.map((b) => b.id));

  for (const id of berthIds(best)) {
    add(search(ctx, ctx.origin, new Set([id])).planTo(ctx.destination));
  }

  const banned = new Set(berthIds(best));
  for (let i = 1; i < ctx.opts.maxPlans; i += 1) {
    const next = search(ctx, ctx.origin, banned).planTo(ctx.destination);
    if (!next) break;
    add(next);
    berthIds(next).forEach((id) => banned.add(id));
  }

  return [...pool.values()].sort((a, b) => compareCost(a.cost, b.cost)).slice(0, ctx.opts.maxPlans);
}
