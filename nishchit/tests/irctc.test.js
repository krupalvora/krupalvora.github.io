import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoute } from '../js/domain/route.js';
import { mapSchedule } from '../js/data/irctc/mapSchedule.js';
import { assembleChart, buildBerths, parseCoachComposition, parseTrainComposition } from '../js/data/irctc/mapChart.js';
import { IrctcProvider, describeBody } from '../js/data/irctcProvider.js';

const jsonRes = (json, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(json), json: async () => json });
const textRes = (text, status) => ({ ok: status < 300, status, text: async () => text });
import { buildSearchResult } from '../js/app/search.js';

/**
 * These lock the STABLE layers: schedule -> Train, and intermediate coaches -> engine berths.
 * The IRCTC field-name adapter (extractCoaches) is intentionally tolerant and will be
 * confirmed against a captured response; the synthetic fixtures below use the documented
 * intermediate shape, not a claim about IRCTC's exact JSON.
 */

const scheduleFixture = {
  trainNumber: '19017',
  trainName: 'LOKSHAKTI EXP',
  stationList: [
    { stationCode: 'BDTS', stationName: 'BANDRA TERMINUS', arrivalTime: 'Source', departureTime: '19:40', dayCount: '1', distance: '0' },
    { stationCode: 'BVI', stationName: 'BORIVALI', arrivalTime: '20:13', departureTime: '20:15', dayCount: '1', distance: '22' },
    { stationCode: 'ST', stationName: 'SURAT', arrivalTime: '23:38', departureTime: '23:43', dayCount: '1', distance: '263' },
    { stationCode: 'ADI', stationName: 'AHMEDABAD JN', arrivalTime: '03:35', departureTime: '--', dayCount: '2', distance: '492' },
  ],
};

test('mapSchedule builds a usable Train with a normalized route', () => {
  const train = mapSchedule(scheduleFixture);
  assert.equal(train.number, '19017');
  assert.equal(train.name, 'LOKSHAKTI EXP');
  assert.equal(train.route.length, 4);
  assert.equal(train.route[0].code, 'BDTS');
  assert.equal(train.route[0].arrAbs, null); // "Source" -> null
  assert.equal(train.route[0].depAbs, 19 * 60 + 40);
  assert.equal(train.route.at(-1).depAbs, null); // "--" -> null
  assert.equal(train.route[2].km, 263);
  assert.equal(train.route[3].arrAbs, 1440 + 3 * 60 + 35); // day 2
});

test('mapSchedule tolerates alternate field names', () => {
  const train = mapSchedule({
    trainNo: '12345',
    trnName: 'TEST EXP',
    stnList: [
      { stnCode: 'aaa', stnName: 'Alpha', arr: '--', dep: '06:00', day: '1', dist: '0' },
      { stnCode: 'bbb', stnName: 'Beta', arr: '08:00', dep: '--', day: '1', dist: '120' },
    ],
  });
  assert.equal(train.number, '12345');
  assert.equal(train.route[0].code, 'AAA');
  assert.equal(train.route[1].km, 120);
});

test('mapSchedule rejects a response with no stations', () => {
  assert.throws(() => mapSchedule({ trainNumber: '1', stationList: [] }), /station list/);
});

const route4 = () =>
  normalizeRoute([
    { code: 'A', name: 'A', arr: null, dep: '08:00', day: 1, km: 0 },
    { code: 'B', name: 'B', arr: '09:00', dep: '09:05', day: 1, km: 50 },
    { code: 'C', name: 'C', arr: '10:00', dep: '10:05', day: 1, km: 100 },
    { code: 'D', name: 'D', arr: '11:00', dep: null, day: 1, km: 150 },
  ]);

test('buildBerths: free intervals come from vacant (occupied:false) segments', () => {
  const route = route4();
  const berths = buildBerths(
    [
      {
        coach: 'B1',
        cls: '3A',
        berths: [
          { number: 1, type: 'LB', segments: [{ from: 'A', to: 'D', occupied: false }] }, // whole trip vacant
          { number: 2, type: 'UB', segments: [{ from: 'A', to: 'C', occupied: false }, { from: 'C', to: 'D', occupied: true }] }, // partial
          { number: 3, type: 'MB', segments: [{ from: 'A', to: 'D', occupied: true }] }, // fully booked -> omitted
          { number: 4, type: 'SL', segments: [{ from: 'A', to: 'B', occupied: 'unknown' }] }, // unknown is not free -> omitted
          { number: 7, segments: [{ from: 'A', to: 'B', occupied: false }, { from: 'B', to: 'C', occupied: false }] }, // merges, type inferred
        ],
      },
    ],
    route,
  );
  const by = Object.fromEntries(berths.map((b) => [b.id, b]));
  assert.deepEqual(by['B1-1'].free, [{ from: 0, to: 3 }]);
  assert.deepEqual(by['B1-2'].free, [{ from: 0, to: 2 }]);
  assert.equal(by['B1-3'], undefined);
  assert.equal(by['B1-4'], undefined);
  assert.deepEqual(by['B1-7'].free, [{ from: 0, to: 2 }]); // merged A..C
  assert.equal(by['B1-7'].type, 'SL'); // 3A berth 7 is Side Lower
});

test('parseTrainComposition reads the real cdd / chartStatusResponseDto shape', () => {
  // Trimmed from a real capture (train 18609).
  const ok = parseTrainComposition({
    cdd: [
      { coachName: 'A1', classCode: '2A', positionFromEngine: 0, vacantBerths: 0 },
      { coachName: 'B1', classCode: '3A', positionFromEngine: 0, vacantBerths: 0 },
      { coachName: 'H1', classCode: '1A', positionFromEngine: 0, vacantBerths: 0 },
    ],
    trainNo: '18609', trainName: 'RNC LTT EXP', from: 'RNC', to: 'LTT', remote: 'RNC',
    chartOneDate: '2026-10-14 10:50:28', chartTwoDate: null, error: null,
    chartStatusResponseDto: { chartOneFlag: 3, chartTwoFlag: 0, messageType: 'S' },
  });
  assert.equal(ok.prepared, true);
  assert.equal(ok.stage, 'first');
  assert.equal(ok.source, 'RNC');
  assert.equal(ok.remote, 'RNC');
  assert.deepEqual(ok.coaches, [{ coach: 'A1', cls: '2A' }, { coach: 'B1', cls: '3A' }, { coach: 'H1', cls: '1A' }]);

  const notReady = parseTrainComposition({ cdd: [], chartOneDate: null, chartStatusResponseDto: { chartOneFlag: 0 } });
  assert.equal(notReady.prepared, false);
  assert.throws(() => parseTrainComposition({ error: 'Train not found' }), /Train not found/);
  assert.throws(() => parseTrainComposition({ foo: 1 }), /Capture one response/);
});

test('parseCoachComposition reads the real bdd / bsd shape', () => {
  // Trimmed from a real capture (coach H1).
  const berths = parseCoachComposition({
    coachName: 'H1', error: null,
    bdd: [
      {
        cabinCoupe: 'CB', cabinCoupeNameNo: 'A', berthCode: 'L', berthNo: 1, from: 'RNC', to: 'LTT', enable: true,
        bsd: [
          { splitNo: 1, from: 'RNC', to: 'BKSC', quota: 'GN', occupancy: false },
          { splitNo: 2, from: 'BKSC', to: 'PRYJ', quota: 'GN', occupancy: true },
        ],
      },
      { berthCode: 'U', berthNo: 2, enable: false, bsd: [{ from: 'RNC', to: 'LTT', occupancy: false }] }, // disabled -> dropped
    ],
  });
  assert.equal(berths.length, 1);
  assert.equal(berths[0].number, 1);
  assert.equal(berths[0].type, 'LB'); // berthCode "L" -> LB
  assert.equal(berths[0].segments[0].occupied, false);
  assert.equal(berths[0].segments[1].occupied, true);
  assert.deepEqual(parseCoachComposition({ error: 'x' }), []); // error -> empty, not a throw
  assert.deepEqual(parseCoachComposition({}), []);
});

test('assembleChart stitches the two endpoints into engine berths', () => {
  const route = route4();
  const composition = { prepared: true, coaches: [{ coach: 'B1', cls: '3A' }, { coach: 'S1', cls: 'SL' }] };
  const coachCharts = new Map([
    ['B1', [{ number: 1, type: 'LB', segments: [{ from: 'A', to: 'D', occupied: false }] }]],
    ['S1', [{ number: 5, type: 'MB', segments: [{ from: 'A', to: 'C', occupied: false }] }]],
  ]);
  const chart = assembleChart(composition, coachCharts, route);
  assert.deepEqual(chart.composition, ['B1', 'S1']);
  assert.deepEqual(chart.classes.sort(), ['3A', 'SL']);
  assert.equal(chart.source, 'live');
  assert.equal(chart.berths.length, 2);
  assert.deepEqual(chart.berths.find((b) => b.id === 'S1-5').free, [{ from: 0, to: 2 }]);
});

test('IrctcProvider runs the real two-call flow and skips unmodelled classes', async () => {
  const route = route4();
  const train = { number: '19017', route, composition: [], classes: [] };
  const calls = [];
  const bodies = [];
  const fetchFn = async (url, init) => {
    calls.push(String(url));
    if (init.body) bodies.push(JSON.parse(init.body));
    const json = String(url).endsWith('/trainComposition')
      ? {
          cdd: [
            { coachName: 'B1', classCode: '3A' },
            { coachName: 'H1', classCode: '1A' }, // unmodelled -> not fetched
          ],
          from: 'A', remote: 'A', chartOneDate: '2026-11-21 09:00:00', chartStatusResponseDto: { chartOneFlag: 3 },
        }
      : { coachName: 'B1', bdd: [{ berthNo: 1, berthCode: 'L', enable: true, bsd: [{ from: 'A', to: 'D', occupancy: false }] }] };
    return jsonRes(json);
  };
  const provider = new IrctcProvider({
    base: 'https://proxy.example/',
    endpoints: { trainComposition: 'online-charts/api/trainComposition', coachComposition: 'online-charts/api/coachComposition' },
    fetchFn,
  });
  const chart = await provider.getChart({ train, date: '2026-11-21' });
  assert.equal(chart.berths.length, 1);
  assert.equal(chart.berths[0].type, 'LB');
  assert.deepEqual(train.composition, ['B1', 'H1']); // full composition folded back
  assert.equal(calls.length, 2); // trainComposition + one coach (H1/1A skipped)
  assert.match(calls[0], /trainComposition$/);
  assert.match(calls[1], /coachComposition$/);
  // coachComposition body carries the confirmed keys
  assert.deepEqual(bodies[1], {
    trainNo: '19017', jDate: '2026-11-21', boardingStation: 'A',
    remoteStation: 'A', trainSourceStation: 'A', coach: 'B1', cls: '3A',
  });
});

test('IrctcProvider surfaces "not prepared" as a clear error', async () => {
  const provider = new IrctcProvider({
    base: 'https://proxy.example/',
    endpoints: { trainComposition: 't', coachComposition: 'c' },
    fetchFn: async () => jsonRes({ cdd: [], chartOneDate: null, chartStatusResponseDto: { chartOneFlag: 0 } }),
  });
  await assert.rejects(provider.getChart({ train: { number: '1', route: route4() }, date: '2026-11-21' }), /not prepared/i);
});

test('end-to-end live pipeline: schedule + chart endpoints -> a bookable plan', async () => {
  // Fake IRCTC upstream returning the confirmed real response shapes.
  const schedule = {
    trainNumber: '12345', trainName: 'TEST EXP',
    stationList: [
      { stationCode: 'AAA', stationName: 'ALPHA', arrivalTime: '--', departureTime: '08:00', dayCount: '1', distance: '0' },
      { stationCode: 'BBB', stationName: 'BETA', arrivalTime: '10:00', departureTime: '10:05', dayCount: '1', distance: '120' },
      { stationCode: 'CCC', stationName: 'GAMMA', arrivalTime: '12:00', departureTime: '12:05', dayCount: '1', distance: '240' },
      { stationCode: 'DDD', stationName: 'DELTA', arrivalTime: '14:00', departureTime: '--', dayCount: '1', distance: '360' },
    ],
  };
  const trainComp = {
    cdd: [{ coachName: 'B1', classCode: '3A' }],
    from: 'AAA', remote: 'AAA', chartOneDate: '2026-11-21 06:00:00', chartStatusResponseDto: { chartOneFlag: 3 },
  };
  const coachComp = {
    coachName: 'B1', error: null,
    bdd: [
      // berth 1: vacant the whole way AAA->DDD
      { berthNo: 1, berthCode: 'L', enable: true, bsd: [{ from: 'AAA', to: 'DDD', occupancy: false }] },
      // berth 2: vacant only AAA->BBB then booked
      { berthNo: 2, berthCode: 'U', enable: true, bsd: [{ from: 'AAA', to: 'BBB', occupancy: false }, { from: 'BBB', to: 'DDD', occupancy: true }] },
    ],
  };

  const fetchFn = async (url) => {
    const s = String(url);
    const json = s.includes('trnscheduleenquiry') ? schedule : s.endsWith('/trainComposition') ? trainComp : coachComp;
    return jsonRes(json);
  };
  const provider = new IrctcProvider({
    base: 'https://proxy.example/',
    endpoints: {
      schedule: 'eticketing/protected/mapps1/trnscheduleenquiry/{train}',
      trainComposition: 'online-charts/api/trainComposition',
      coachComposition: 'online-charts/api/coachComposition',
    },
    fetchFn,
  });

  const train = await provider.getTrain('12345');
  assert.equal(train.name, 'TEST EXP');
  assert.equal(train.route.length, 4);

  const chart = await provider.getChart({ train, date: '2026-11-21' });
  assert.equal(chart.source, 'live');

  const result = buildSearchResult({
    train, chart,
    query: { train: '12345', date: '2026-11-21', from: 'AAA', to: 'DDD', cls: '3A', party: 1 },
    now: new Date(2026, 10, 21, 7, 0),
  });
  assert.equal(result.status, 'full');
  assert.equal(result.plans[0].switches, 0);           // direct berth wins
  assert.equal(result.plans[0].legs[0].berths[0].id, 'B1-1');
  assert.equal(result.totals.full, 1);                 // B1-1 vacant whole trip
  assert.equal(result.totals.partial, 1);              // B1-2 vacant part of trip
});

/* ------------------------- authentic error reporting ------------------------- */

const provider = (fetchFn, via = 'proxy') =>
  new IrctcProvider({
    base: 'https://proxy.example/',
    via,
    maxRetries: 1,
    endpoints: { schedule: 'eticketing/protected/mapps1/trnscheduleenquiry/{train}', trainComposition: 'online-charts/api/trainComposition', coachComposition: 'online-charts/api/coachComposition' },
    fetchFn,
  });

const AKAMAI_504 = `<HTML><HEAD><TITLE>Error</TITLE></HEAD><BODY>
An error occurred while processing your request.<p>
Reference&#32;&#35;221&#46;36adce17&#46;1795278851&#46;e1cc8f5
</BODY></HTML>`;

test('describeBody extracts IRCTC messages and Akamai references', () => {
  assert.equal(describeBody('{"error":"Chart Not Prepared"}'), 'Chart Not Prepared');
  assert.equal(describeBody('{"errorMessage":"Invalid train"}'), 'Invalid train');
  assert.equal(describeBody(AKAMAI_504), 'Akamai edge error, reference #221.36adce17.1795278851.e1cc8f5');
  assert.equal(describeBody(''), '');
});

test('504 from Akamai is retried, then reported with status, endpoint and reference', async () => {
  let calls = 0;
  const p = provider(async () => (calls++, textRes(AKAMAI_504, 504)));
  const err = await p.getTrain('19017').catch((e) => e);
  assert.equal(calls, 2); // 1 + maxRetries
  assert.equal(err.code, 'timeout');
  assert.equal(err.status, 504);
  assert.equal(err.endpoint, 'GET /eticketing/protected/mapps1/trnscheduleenquiry/19017');
  assert.match(err.detail, /reference #221\.36adce17/);
  assert.match(err.message, /HTTP 504/);
});

test('a hung request is cut off by the per-request timeout, not left to stall', async () => {
  let calls = 0;
  // A fetch that never answers on its own; it resolves/rejects only when its signal aborts,
  // the way a real fetch does. Without a deadline this would hang forever.
  const hung = (url, init) =>
    new Promise((_resolve, reject) => {
      calls += 1;
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  const p = new IrctcProvider({
    base: 'https://proxy.example/',
    maxRetries: 1,
    requestTimeoutMs: 40, // fast deadline so the test is quick
    endpoints: { schedule: 'eticketing/protected/mapps1/trnscheduleenquiry/{train}', trainComposition: 'online-charts/api/trainComposition', coachComposition: 'online-charts/api/coachComposition' },
    fetchFn: hung,
  });
  const t0 = performance.now();
  const err = await p.getTrain('19017').catch((e) => e);
  const elapsed = performance.now() - t0;
  assert.equal(calls, 2); // tried once, retried once — then gave up
  assert.equal(err.code, 'timeout');
  assert.match(err.message, /timed out/);
  assert.ok(elapsed < 2000, `should fail fast, took ${Math.round(elapsed)}ms`);
});

test('a user abort during a request is not swallowed by the timeout machinery', async () => {
  const ctl = new AbortController();
  const hung = (url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  const p = new IrctcProvider({
    base: 'https://proxy.example/',
    maxRetries: 1,
    requestTimeoutMs: 5000,
    endpoints: { schedule: 'eticketing/protected/mapps1/trnscheduleenquiry/{train}', trainComposition: 'online-charts/api/trainComposition', coachComposition: 'online-charts/api/coachComposition' },
    fetchFn: hung,
  });
  setTimeout(() => ctl.abort(), 20);
  const err = await p.getTrain('19017', { signal: ctl.signal }).catch((e) => e);
  assert.equal(err.name, 'AbortError'); // propagated as a real cancellation, not a timeout
});

test('403 passed through from IRCTC points the user to the IRCTC chart page', async () => {
  const err = await provider(async () => textRes('Access Denied', 403)).getTrain('19017').catch((e) => e);
  assert.equal(err.code, 'forbidden');
  assert.match(err.hint, /irctc\.co\.in\/online-charts/);
});

test('proxy "blocked" answer becomes a blocked error, not retried', async () => {
  let calls = 0;
  const body = { blocked: true, error: 'x', upstreamStatus: 403, reference: '18.abc.123', since: '2026-11-22T10:00:00Z', retryAfterSeconds: 120 };
  const err = await provider(async () => (calls++, jsonRes(body, 503))).getTrain('19017').catch((e) => e);
  assert.equal(calls, 1);
  assert.equal(err.code, 'blocked');
  assert.match(err.message, /IRCTC is blocking Nishchit/);
  assert.match(err.detail, /HTTP 403, Akamai reference #18\.abc\.123/);
  assert.match(err.hint, /online-charts/);
});

test('IRCTC error field on trainComposition is shown verbatim', async () => {
  const p = provider(async () => jsonRes({ error: 'Train is not running on this date' }));
  const err = await p.getChart({ train: { number: '19017', route: route4() }, date: '2026-11-21' }).catch((e) => e);
  assert.equal(err.code, 'no-chart');
  assert.equal(err.message, 'IRCTC: Train is not running on this date');
});

test('HTML error page instead of JSON is a parse error with the page text', async () => {
  const err = await provider(async () => textRes('<html><body>Service Unavailable - maintenance</body></html>', 200)).getTrain('19017').catch((e) => e);
  assert.equal(err.code, 'parse');
  assert.match(err.detail, /maintenance/);
});

test('a coach IRCTC fails to return becomes a visible warning, not silent data loss', async () => {
  const p = provider(async (url, init) => {
    if (String(url).endsWith('/trainComposition')) {
      return jsonRes({ cdd: [{ coachName: 'B1', classCode: '3A' }, { coachName: 'B2', classCode: '3A' }], from: 'A', remote: 'A', chartOneDate: 'x' });
    }
    const coach = JSON.parse(init.body).coach;
    return coach === 'B2'
      ? jsonRes({ error: 'Coach data unavailable' })
      : jsonRes({ bdd: [{ berthNo: 1, berthCode: 'L', bsd: [{ from: 'A', to: 'D', occupancy: false }] }] });
  });
  p.coachGapMs = 0;
  const chart = await p.getChart({ train: { number: '19017', route: route4() }, date: '2026-11-21' });
  assert.equal(chart.berths.length, 1);
  assert.equal(chart.via, 'proxy');
  assert.deepEqual(chart.warnings, ['Coach B2: Coach data unavailable — its berths are not shown.']);
});

test('a coach that times out is dropped with a warning; the other coaches still render', async () => {
  const p = new IrctcProvider({
    base: 'https://proxy.example/',
    maxRetries: 1,
    requestTimeoutMs: 40, // fast deadline
    endpoints: { schedule: 'eticketing/protected/mapps1/trnscheduleenquiry/{train}', trainComposition: 'online-charts/api/trainComposition', coachComposition: 'online-charts/api/coachComposition' },
    fetchFn: (url, init) => {
      if (String(url).endsWith('/trainComposition')) {
        return Promise.resolve(jsonRes({ cdd: [{ coachName: 'B1', classCode: '3A' }, { coachName: 'B2', classCode: '3A' }], from: 'A', remote: 'A', chartOneDate: 'x' }));
      }
      const coach = JSON.parse(init.body).coach;
      if (coach === 'B2') {
        // Never answers until aborted — exactly the Akamai 504 hang the timeout guards against.
        return new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
      }
      return Promise.resolve(jsonRes({ coachName: coach, bdd: [{ berthNo: 1, berthCode: 'L', bsd: [{ from: 'A', to: 'D', occupancy: false }] }] }));
    },
  });
  p.coachGapMs = 0;
  const t0 = performance.now();
  const chart = await p.getChart({ train: { number: '19017', route: route4() }, date: '2026-11-21' });
  const elapsed = performance.now() - t0;
  assert.equal(chart.berths.length, 1); // B1 still rendered
  assert.equal(chart.warnings.length, 1);
  assert.match(chart.warnings[0], /^Coach B2:.*timed out/);
  assert.ok(elapsed < 2000, `one hung coach should not stall the chart (took ${Math.round(elapsed)}ms)`);
});

test('getChart emits a partial chart after each coach (progressive rendering)', async () => {
  const p = provider(async (url, init) => {
    if (String(url).endsWith('/trainComposition')) {
      return jsonRes({ cdd: [{ coachName: 'B1', classCode: '3A' }, { coachName: 'B2', classCode: '3A' }], from: 'A', remote: 'A', chartOneDate: 'x' });
    }
    const coach = JSON.parse(init.body).coach;
    return jsonRes({ coachName: coach, bdd: [{ berthNo: 1, berthCode: 'L', bsd: [{ from: 'A', to: 'D', occupancy: false }] }] });
  });
  p.coachGapMs = 0;
  const events = [];
  const chart = await p.getChart({ train: { number: '19017', route: route4() }, date: '2026-11-21', onProgress: (e) => events.push(e) });
  // initial (0, null) + one per coach
  assert.deepEqual(events.map((e) => e.done), [0, 1, 2]);
  assert.deepEqual(events.map((e) => e.total), [2, 2, 2]);
  assert.equal(events[0].chart, null);
  assert.equal(events[1].chart.berths.length, 1); // first coach's berth already visible
  assert.equal(events[1].chart.partial, true);
  assert.equal(events[2].chart.berths.length, 2);
  assert.equal(events[2].chart.partial, false); // last coach: not partial
  assert.equal(chart.berths.length, 2);
});
