import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planJourney, switchRisk } from '../js/domain/engine.js';
import { normalizeRoute } from '../js/domain/route.js';

// Daytime route so switches are "safe" unless a test makes them otherwise.
const route = normalizeRoute([
  { code: 'A', name: 'A', arr: null, dep: '08:00', day: 1, km: 0 },
  { code: 'B', name: 'B', arr: '09:00', dep: '09:10', day: 1, km: 60 },
  { code: 'C', name: 'C', arr: '10:00', dep: '10:10', day: 1, km: 120 },
  { code: 'D', name: 'D', arr: '11:00', dep: '11:02', day: 1, km: 180 },
  { code: 'E', name: 'E', arr: '12:00', dep: null, day: 1, km: 240 },
]);
const coachOrder = ['S1', 'S2', 'S3', 'S4'];
const flatFare = () => 100;

let seq = 0;
function berth(coach, type, ...free) {
  seq += 1;
  return { id: `${coach}-${seq}`, coach, number: seq, cls: 'SL', type, free: free.map(([from, to]) => ({ from, to })) };
}

function plan(berths, origin = 0, destination = 4, extra = {}) {
  return planJourney({ route, berths, origin, destination, coachOrder, fareFn: flatFare, ...extra });
}

test('direct berth wins when one covers the whole journey', () => {
  const direct = berth('S1', 'UB', [0, 4]);
  const r = plan([berth('S1', 'LB', [0, 2]), berth('S1', 'LB', [2, 4]), direct]);
  assert.equal(r.status, 'full');
  assert.equal(r.plans[0].switches, 0);
  assert.equal(r.plans[0].legs[0].berths[0].id, direct.id);
});

test('fewest switches beats better berth types', () => {
  const r = plan([berth('S1', 'UB', [0, 2]), berth('S1', 'UB', [2, 4]), berth('S1', 'LB', [0, 1]), berth('S1', 'LB', [1, 3]), berth('S1', 'LB', [3, 4])]);
  assert.equal(r.plans[0].switches, 1);
});

test('greedy interval cover: furthest reach is used', () => {
  const r = plan([berth('S1', 'LB', [0, 1]), berth('S1', 'LB', [0, 3]), berth('S2', 'LB', [1, 4]), berth('S1', 'LB', [3, 4])]);
  assert.equal(r.plans[0].switches, 1);
  const [first, second] = r.plans[0].legs;
  assert.equal(first.from, 0);
  assert.equal(second.to, 4);
});

test('prefers safe switch over a short halt', () => {
  // Switching at D (2 min halt) is unsafe; switching at C (10 min) is safe.
  const r = plan([berth('S1', 'LB', [0, 3]), berth('S1', 'LB', [3, 4]), berth('S2', 'UB', [0, 2]), berth('S2', 'UB', [2, 4])]);
  assert.equal(r.plans[0].legs[1].from, 2);
  assert.equal(r.plans[0].legs[1].switchRisk, null);
});

test('prefers same coach at the switch', () => {
  const a = berth('S1', 'LB', [0, 2]);
  const sameCoach = berth('S1', 'UB', [2, 4]);
  const farCoach = berth('S4', 'LB', [2, 4]);
  const r = plan([a, farCoach, sameCoach]);
  assert.equal(r.plans[0].legs[1].berths[0].id, sameCoach.id);
});

test('respects maxSwitches and falls back to a partial plan', () => {
  const berths = [berth('S1', 'LB', [0, 1]), berth('S1', 'LB', [1, 2]), berth('S1', 'LB', [2, 3]), berth('S1', 'LB', [3, 4])];
  const r = plan(berths, 0, 4, { options: { maxSwitches: 2 } });
  assert.equal(r.status, 'partial');
  assert.equal(r.partial.reachedIndex, 3);
  assert.equal(r.partial.uncoveredKm, 60);
  assert.equal(plan(berths, 0, 4, { options: { maxSwitches: 3 } }).plans[0].switches, 3);
});

test('partial plan and board-later hint when a gap exists', () => {
  const r = plan([berth('S1', 'LB', [0, 2]), berth('S2', 'LB', [3, 4])]);
  assert.equal(r.status, 'partial');
  assert.equal(r.partial.reachedIndex, 2);
  assert.equal(r.boardLater.boardIndex, 3);
});

test('none when nothing is free', () => {
  const r = plan([berth('S1', 'LB')]);
  assert.equal(r.status, 'none');
  assert.equal(r.plans.length, 0);
});

test('group of 2 needs 2 berths per leg and prefers one coach', () => {
  const r = plan(
    [berth('S1', 'LB', [0, 4]), berth('S2', 'LB', [0, 4]), berth('S3', 'LB', [0, 4]), berth('S3', 'UB', [0, 4])],
    0,
    4,
    { partySize: 2 },
  );
  const leg = r.plans[0].legs[0];
  assert.equal(leg.berths.length, 2);
  assert.ok(leg.berths.every((b) => b.coach === 'S3'));
  assert.equal(leg.split, 0);
});

test('group splits across coaches only when no coach fits everyone', () => {
  const r = plan([berth('S1', 'LB', [0, 4]), berth('S2', 'LB', [0, 4])], 0, 4, { partySize: 2 });
  assert.equal(r.plans[0].legs[0].split, 1);
  assert.equal(plan([berth('S1', 'LB', [0, 4])], 0, 4, { partySize: 2 }).status, 'none');
});

test('alternatives are distinct and sorted', () => {
  const r = plan([berth('S1', 'LB', [0, 4]), berth('S1', 'MB', [0, 4]), berth('S1', 'UB', [0, 4]), berth('S1', 'SU', [0, 4])]);
  assert.equal(r.plans.length, 3);
  assert.deepEqual(r.plans.map((p) => p.legs[0].berths[0].type), ['LB', 'MB', 'UB']);
  assert.equal(new Set(r.plans.map((p) => p.signature)).size, 3);
});

test('intermediate origin and destination', () => {
  const r = plan([berth('S1', 'LB', [1, 3])], 1, 3);
  assert.equal(r.plans[0].legs[0].from, 1);
  assert.equal(r.plans[0].legs[0].to, 3);
});

test('booking order puts the scarcest leg first', () => {
  const r = plan([berth('S1', 'LB', [0, 2]), berth('S1', 'MB', [0, 2]), berth('S1', 'LB', [2, 4])]);
  assert.deepEqual(r.plans[0].bookingOrder, [1, 0]);
});

test('rejects invalid input', () => {
  assert.throws(() => plan([], 3, 1));
  assert.throws(() => plan([], 0, 4, { partySize: 0 }));
});

test('switchRisk flags night and short halts', () => {
  const night = normalizeRoute([
    { code: 'X', name: 'X', arr: null, dep: '22:00', day: 1, km: 0 },
    { code: 'Y', name: 'Y', arr: '01:00', dep: '01:20', day: 2, km: 50 },
    { code: 'Z', name: 'Z', arr: '03:00', dep: null, day: 2, km: 90 },
  ]);
  assert.deepEqual(switchRisk(night[1]), ['night']);
  assert.deepEqual(switchRisk(route[3]), ['short-halt']);
  assert.equal(switchRisk(route[2]), null);
});
