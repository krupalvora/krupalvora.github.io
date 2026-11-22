/**
 * Browser end-to-end check (no dependencies).
 *   node tests/e2e.mjs          (needs Google Chrome; override path with CHROME=...)
 *
 * Serves the site plus a FAKE IRCTC upstream (test-only: same /eticketing and /online-charts
 * paths and response shapes as the real API, filled from tests/fixtures). The page runs its
 * real live code path (IrctcProvider over the same-origin dev proxy), and the rendered DOM is
 * compared with what the engine computes in Node for the same chart. The app itself has no
 * demo data; these fixtures exist only here.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { normalizeRoute } from '../js/domain/route.js';
import { simulateChart } from './fixtures/simulator.js';
import { buildSearchResult } from '../js/app/search.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const trainsByNo = () => trains; // defined below; hoisted access for the server

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/__nishchit/health') return json(200, { proxy: true, session: true });
  const sched = /^\/eticketing\/protected\/mapps1\/trnscheduleenquiry\/(\d+)$/.exec(url.pathname);
  if (sched) {
    const t = trainsByNo()[sched[1]];
    return t ? json(200, fakeSchedule(t)) : json(404, { errorMessage: 'Train not found' });
  }
  if (url.pathname.startsWith('/online-charts/api/')) {
    const body = JSON.parse((await readBodyText(req)) || '{}');
    const t = trainsByNo()[body.trainNo];
    if (!t) return json(200, { error: 'Train not found' });
    if (url.pathname.endsWith('/trainComposition')) return json(200, fakeComposition(t));
    if (url.pathname.endsWith('/coachComposition')) return json(200, fakeCoach(t, body.jDate, body.coach));
  }
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

async function readBodyText(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

/* ---- fixture train -> IRCTC response shapes (as confirmed in js/data/irctc/mapChart.js) ---- */

function fakeSchedule(t) {
  return {
    trainNumber: t.number,
    trainName: t.name,
    stationList: t.raw.route.map((s) => ({
      stationCode: s.code,
      stationName: s.name,
      arrivalTime: s.arr ?? '--',
      departureTime: s.dep ?? '--',
      dayCount: String(s.day),
      distance: String(s.km),
    })),
  };
}

function fakeComposition(t) {
  const berths = simulateChart(t, '2000-01-01'); // only for class lookup
  const clsOf = Object.fromEntries(berths.map((b) => [b.coach, b.cls]));
  return {
    cdd: t.composition.map((c) => ({ coachName: c, classCode: clsOf[c] })),
    from: t.route[0].code,
    remote: t.route[0].code,
    chartOneDate: '2026-11-20 10:00:00',
    chartStatusResponseDto: { chartOneFlag: 3, chartTwoFlag: 0 },
    error: null,
  };
}

const CODE = { LB: 'L', MB: 'M', UB: 'U', SL: 'SL', SU: 'SU' };
function fakeCoach(t, date, coach) {
  const route = t.route;
  return {
    coachName: coach,
    error: null,
    bdd: simulateChart(t, date)
      .filter((b) => b.coach === coach)
      .map((b) => ({
        berthNo: b.number,
        berthCode: CODE[b.type],
        enable: true,
        bsd: route.slice(0, -1).map((s, i) => ({
          from: s.code,
          to: route[i + 1].code,
          occupancy: !b.free.some((f) => f.from <= i && i + 1 <= f.to),
        })),
      })),
  };
}

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

function dumpDom(query) {
  return new Promise((resolve, reject) => {
    execFile(
      CHROME,
      ['--headless=new', '--disable-gpu', '--no-first-run', '--virtual-time-budget=20000', '--dump-dom', `${BASE}?${query}&proxy=${encodeURIComponent(BASE)}`],
      { maxBuffer: 20 * 1024 * 1024, timeout: 60_000 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

const trains = Object.fromEntries(
  ['19017', '12901', '12933'].map((n) => {
    const raw = JSON.parse(readFileSync(join(ROOT, `tests/fixtures/trains/${n}.json`)));
    return [n, { ...raw, raw, route: normalizeRoute(raw.route) }];
  }),
);

function expected(q) {
  const t = trains[q.train];
  // The live provider folds IRCTC's composition/classes back onto the train; mirror that.
  const classes = [...new Set(simulateChart(t, q.date).map((b) => b.cls))];
  const train = { ...t, classes };
  const chart = { berths: simulateChart(t, q.date), source: 'live', fetchedAt: new Date() };
  return buildSearchResult({ train, chart, query: q });
}

function parse(html) {
  const results = /<section id="results"[^>]*>([\s\S]*?)<\/section>/.exec(html);
  const hidden = /<section id="results"[^>]*\shidden/.test(html);
  const body = results?.[1] ?? '';
  const [plansHtml = '', seatsHtml = ''] = body.split(/vacant berths \(/i);
  return {
    hidden,
    trainStatus: /id="train-status"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1].replace(/<[^>]+>/g, '').trim(),
    stats: [...body.matchAll(/stat-tile__value">(\d+)</g)].map((m) => Number(m[1])),
    // Each leg's berths render as a "B1-1, B1-2" code span; flatten per plan article.
    plans: plansHtml
      .split('<article class="plan')
      .slice(1)
      .map((a) => [...a.matchAll(/class="leg__code">([^<]+)</g)].flatMap((m) => m[1].split(',').map((s) => s.trim()))),
    seatCount: Number(/vacant berths \((\d+)\)/i.exec(body)?.[1] ?? NaN),
    seatIds: [...seatsHtml.matchAll(/seat__id">([A-Z0-9]+-\d+)</g)].map((m) => m[1]),
    error: /state-card--error[\s\S]*?<p>([^<]*)/.exec(body)?.[1],
  };
}

const qs = (q) => new URLSearchParams({ ...q, party: String(q.party) }).toString();
const scenarios = [
  { name: 'Direct + stitched plans, all classes', q: { train: '19017', date: '2026-11-21', from: 'BVI', to: 'ANND', cls: 'all', party: 1 } },
  { name: 'Group of 2 in 3A', q: { train: '12901', date: '2026-11-22', from: 'DDR', to: 'ADI', cls: '3A', party: 2 } },
  { name: 'Group of 4 in SL, short trip', q: { train: '12933', date: '2026-11-20', from: 'BVI', to: 'ST', cls: 'SL', party: 4 } },
  { name: 'Intermediate to intermediate', q: { train: '19017', date: '2026-11-22', from: 'VAPI', to: 'BRC', cls: 'all', party: 1 } },
];

// Find a query whose best outcome is partial / none, so those UI paths are exercised too.
outer: for (const want of ['partial', 'none']) {
  for (const n of Object.keys(trains)) {
    const t = trains[n];
    for (const date of ['2026-11-20', '2026-11-21', '2026-11-22']) {
      for (const cls of t.classes) {
        for (let o = 0; o < t.route.length - 1; o += 1) {
          for (let d = o + 1; d < t.route.length; d += 1) {
            const q = { train: n, date, from: t.route[o].code, to: t.route[d].code, cls, party: 4 };
            if (expected(q).status === want) {
              scenarios.push({ name: `Fallback: ${want}`, q });
              continue outer;
            }
          }
        }
      }
    }
  }
}

/** Mirrors results.js: the stitched plan, then "to X" / "from Y" only when they switch less. */
function fallbackPlans(exp) {
  const best = exp.stitched;
  const seated = (legs) => legs.reduce((s, l) => s + l.km, 0);
  const keep = (p) => !best || (p.switches < best.switches && seated(p.legs) < best.seatedKm);
  const simpler = [exp.partial?.plan, exp.boardLater?.plan].filter((p) => p && keep(p));
  return [best, ...simpler].filter(Boolean).map((p) => p.legs.filter((l) => !l.gap));
}

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✖ ${name}\n      ${err.message.split('\n').join('\n      ')}`);
  }
}

console.log(`E2E against ${BASE}`);
for (const { name, q } of scenarios) {
  await check(`${name} - ${q.train} ${q.from}→${q.to} ${q.date} ${q.cls} x${q.party}`, async () => {
    const dom = parse(await dumpDom(qs(q)));
    const exp = expected(q);
    assert.equal(dom.hidden, false, 'results section visible');
    assert.equal(dom.trainStatus, trains[q.train].name, 'train name pill');
    assert.deepEqual(dom.stats, [exp.totals.full, exp.totals.partial], 'stat tiles');
    assert.equal(dom.seatCount, exp.seats.length, 'vacant berth count');
    assert.deepEqual(dom.seatIds, exp.seats.map((s) => s.berth.id), 'vacant berth list');

    const expPlans =
      exp.plans.length > 0
        ? exp.plans.map((p) => p.legs.flatMap((l) => l.berths.map((b) => b.id)))
        : fallbackPlans(exp).map((legs) => legs.flatMap((l) => l.berths.map((b) => b.id)));
    assert.deepEqual(dom.plans, expPlans, `plan berths (status ${exp.status})`);
  });
}

await check('Unknown train shows a helpful message, no results', async () => {
  const dom = parse(await dumpDom('train=99999&date=2026-11-21&from=BVI&to=ANND'));
  assert.equal(dom.hidden, true);
  assert.match(dom.trainStatus, /IRCTC has no train 99999/);
});

await check('Reversed stations from a URL do not search', async () => {
  const dom = parse(await dumpDom('train=19017&date=2026-11-21&from=ANND&to=BVI'));
  assert.equal(dom.hidden, true);
});

await check('Junk URL params are ignored safely', async () => {
  const html = await dumpDom('train=%3Cscript%3E&from=%3Cimg%20src%3Dx%3E&cls=1A&party=99');
  const dom = parse(html);
  assert.equal(dom.hidden, true);
  assert.doesNotMatch(html, /<img src="?x/);
});

server.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
