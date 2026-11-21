import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chartSchedule, chartStage } from '../js/domain/chart.js';
import { normalizeRoute } from '../js/domain/route.js';
import { berthType, spanStatus } from '../js/domain/berths.js';
import { estimateFare } from '../js/domain/fare.js';
import { fromISODate, toISODate } from '../js/domain/time.js';
import { simulateChart } from './fixtures/simulator.js';
import { buildSearchResult } from '../js/app/search.js';
import { queryFromParams, queryToParams } from '../js/state/query.js';

const loadTrain = (n) => {
  const raw = JSON.parse(readFileSync(new URL(`./fixtures/trains/${n}.json`, import.meta.url)));
  return { ...raw, route: normalizeRoute(raw.route) };
};

test('evening train: first chart 10h before departure', () => {
  const s = chartSchedule('2026-11-21', 19 * 60 + 40);
  assert.equal(s.firstChart.getHours(), 9);
  assert.equal(s.firstChart.getMinutes(), 40);
  assert.equal(s.secondChart.getHours(), 19);
  assert.equal(s.secondChart.getMinutes(), 10);
});

test('morning slot train: first chart at 20:00 the previous day', () => {
  const s = chartSchedule('2026-11-21', 6 * 60 + 20);
  assert.equal(toISODate(s.firstChart), '2026-11-20');
  assert.equal(s.firstChart.getHours(), 20);
});

test('chart stages progress with time', () => {
  const s = chartSchedule('2026-11-21', 19 * 60 + 40);
  assert.equal(chartStage(s, new Date(2026, 10, 21, 8, 0)), 'not-prepared');
  assert.equal(chartStage(s, new Date(2026, 10, 21, 12, 0)), 'first');
  assert.equal(chartStage(s, new Date(2026, 10, 21, 19, 20)), 'second');
  assert.equal(chartStage(s, new Date(2026, 10, 21, 20, 0)), 'departed');
});

test('normalizeRoute handles midnight crossing', () => {
  const r = loadTrain('19017').route;
  const bh = r.find((s) => s.code === 'BH');
  assert.equal(bh.arrAbs, 1440 + 33);
  assert.equal(bh.haltMin, 2);
  assert.throws(() => normalizeRoute([{ code: 'X', arr: null, dep: '10:00', day: 1, km: 0 }]));
});

test('berth layouts', () => {
  assert.equal(berthType('SL', 1), 'LB');
  assert.equal(berthType('SL', 7), 'SL');
  assert.equal(berthType('3A', 16), 'SU');
  assert.equal(berthType('2A', 5), 'SL');
});

test('spanStatus', () => {
  const b = { free: [{ from: 1, to: 3 }] };
  assert.equal(spanStatus(b, 1, 3), 'full');
  assert.equal(spanStatus(b, 0, 3), 'partial');
  assert.equal(spanStatus(b, 3, 5), 'booked');
});

test('fare applies minimum distance', () => {
  assert.equal(estimateFare('SL', 10), estimateFare('SL', 200));
  assert.ok(estimateFare('3A', 400) > estimateFare('SL', 400));
});

test('ISO date validation', () => {
  assert.throws(() => fromISODate('2026-02-30'));
  assert.equal(toISODate(fromISODate('2026-11-21')), '2026-11-21');
});

test('simulator is deterministic and well-formed', () => {
  const train = loadTrain('19017');
  const a = simulateChart(train, '2026-11-21');
  const b = simulateChart(train, '2026-11-21');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, simulateChart(train, '2026-11-22'));
  assert.equal(a.length, 2 * 48 + 4 * 72 + 6 * 72);
  for (const berth of a) {
    for (const f of berth.free) {
      assert.ok(f.from < f.to && f.from >= 0 && f.to <= train.route.length - 1);
    }
  }
});

test('search result on a full simulated train stays fast', () => {
  const train = loadTrain('19017');
  const chart = { berths: simulateChart(train, '2026-11-21'), source: 'simulated', fetchedAt: new Date() };
  const query = { train: '19017', date: '2026-11-21', from: 'BVI', to: 'ADI', cls: 'all', party: 2 };
  const t0 = performance.now();
  const r = buildSearchResult({ train, chart, query, now: new Date(2026, 10, 21, 12) });
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `took ${ms}ms`);
  assert.equal(r.stage, 'first');
  assert.ok(['full', 'partial', 'none'].includes(r.status));
  for (const p of r.plans) {
    assert.equal(p.legs[0].from, r.origin);
    assert.equal(p.legs.at(-1).to, r.destination);
    for (let i = 1; i < p.legs.length; i += 1) assert.equal(p.legs[i].from, p.legs[i - 1].to);
    for (const leg of p.legs) assert.equal(leg.berths.length, 2);
  }
});

test('query round-trips through URL params and rejects junk', () => {
  const q = { train: '19017', date: '2026-11-21', from: 'BVI', to: 'ANND', cls: '3A', party: 2 };
  assert.deepEqual(queryFromParams(queryToParams(q), '2026-11-21'), q);
  const junk = queryFromParams(new URLSearchParams('train=abc&date=x&from=<script>&cls=1A&party=9'), '2026-11-21');
  assert.deepEqual(junk, { train: '', date: '2026-11-21', from: '', to: '', cls: 'all', party: 1 });
});
