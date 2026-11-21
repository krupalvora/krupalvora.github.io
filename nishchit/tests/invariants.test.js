/**
 * Exhaustive property checks: every train x date x station pair x class x party size.
 * Verifies the engine never returns a plan that is impossible on the chart, and that the
 * best plan always uses the minimum number of legs (checked against the TRD greedy cover).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planJourney } from '../js/domain/engine.js';
import { normalizeRoute } from '../js/domain/route.js';
import { simulateChart } from './fixtures/simulator.js';

const TRAINS = ['19017', '12901', '12933'];
const DATES = ['2026-11-20', '2026-11-21', '2026-11-22'];
const MAX_LEGS = 3;

function loadTrain(n) {
  const raw = JSON.parse(readFileSync(new URL(`./fixtures/trains/${n}.json`, import.meta.url)));
  return { ...raw, route: normalizeRoute(raw.route) };
}

/** TRD reference algorithm: greedy interval cover = proven minimum legs (party of 1). */
function greedyLegs(berths, o, d) {
  let c = o;
  let legs = 0;
  while (c < d) {
    let reach = c;
    for (const b of berths) for (const f of b.free) if (f.from <= c && f.to > reach) reach = f.to;
    if (reach <= c) return Infinity;
    legs += 1;
    c = reach;
  }
  return legs;
}

/** Furthest station reachable within maxLegs (party of 1). */
function greedyReach(berths, o, d, maxLegs) {
  let c = o;
  for (let i = 0; i < maxLegs && c < d; i += 1) {
    let reach = c;
    for (const b of berths) for (const f of b.free) if (f.from <= c && f.to > reach) reach = Math.min(f.to, d);
    if (reach <= c) break;
    c = reach;
  }
  return c;
}

function assertPlanValid(plan, { o, d, party, berthsById, label }) {
  assert.equal(plan.legs[0].from, o, `${label}: starts at origin`);
  assert.equal(plan.legs.at(-1).to, d, `${label}: ends at destination`);
  assert.ok(plan.legs.length <= MAX_LEGS, `${label}: at most 2 switches`);
  const used = new Set();
  plan.legs.forEach((leg, i) => {
    if (i > 0) assert.equal(leg.from, plan.legs[i - 1].to, `${label}: legs are contiguous`);
    assert.ok(leg.from < leg.to, `${label}: leg moves forward`);
    assert.equal(leg.berths.length, party, `${label}: one berth per traveller`);
    const ids = new Set(leg.berths.map((b) => b.id));
    assert.equal(ids.size, party, `${label}: no berth assigned twice in a leg`);
    for (const b of leg.berths) {
      const real = berthsById.get(b.id);
      assert.ok(real, `${label}: berth ${b.id} exists in chart`);
      assert.ok(
        real.free.some((f) => f.from <= leg.from && f.to >= leg.to),
        `${label}: ${b.id} is actually free ${leg.from}->${leg.to}`,
      );
      used.add(`${i}:${b.id}`);
    }
  });
}

for (const number of TRAINS) {
  test(`engine invariants on every query for train ${number}`, () => {
    const train = loadTrain(number);
    const n = train.route.length;
    let checked = 0;
    let full = 0;
    let partial = 0;
    let none = 0;

    for (const date of DATES) {
      const chart = simulateChart(train, date);
      for (const cls of train.classes) {
        const berths = chart.filter((b) => b.cls === cls);
        const berthsById = new Map(berths.map((b) => [b.id, b]));
        for (let o = 0; o < n - 1; o += 1) {
          for (let d = o + 1; d < n; d += 1) {
            for (const party of [1, 2, 3, 4]) {
              const label = `${number} ${date} ${cls} ${train.route[o].code}->${train.route[d].code} x${party}`;
              const r = planJourney({ route: train.route, berths, origin: o, destination: d, partySize: party, coachOrder: train.composition });
              checked += 1;

              for (const plan of r.plans) assertPlanValid(plan, { o, d, party, berthsById, label });
              assert.equal(new Set(r.plans.map((p) => p.signature)).size, r.plans.length, `${label}: plans distinct`);

              if (party === 1) {
                const minLegs = greedyLegs(berths, o, d);
                if (minLegs <= MAX_LEGS) {
                  assert.equal(r.status, 'full', `${label}: a full plan exists (greedy ${minLegs} legs)`);
                  assert.equal(r.plans[0].legs.length, minLegs, `${label}: best plan uses minimum legs`);
                } else {
                  assert.notEqual(r.status, 'full', `${label}: no full plan within 2 switches`);
                  const reach = greedyReach(berths, o, d, MAX_LEGS);
                  if (reach > o) assert.equal(r.partial?.reachedIndex, reach, `${label}: partial reaches furthest station`);
                }
              }

              if (r.partial) {
                const p = r.partial.plan;
                assert.equal(p.legs[0].from, o);
                assert.equal(p.legs.at(-1).to, r.partial.reachedIndex);
                assert.ok(r.partial.reachedIndex < d);
              }
              if (r.boardLater) {
                assert.equal(r.boardLater.plan.legs.at(-1).to, d);
                assert.ok(r.boardLater.boardIndex > o);
              }
              if (r.status === 'full') full += 1;
              else if (r.status === 'partial') partial += 1;
              else none += 1;
            }
          }
        }
      }
    }
    // Visible in `node --test` output so the coverage of each run is obvious.
    console.log(`train ${number}: ${checked} queries (full ${full}, partial ${partial}, none ${none})`);
  });
}
