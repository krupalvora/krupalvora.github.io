/**
 * Browser end-to-end check (no dependencies).
 *   node tests/e2e.mjs          (needs Google Chrome; override path with CHROME=...)
 *
 * Serves the site, loads real URLs in headless Chrome, reads the rendered DOM and compares
 * it with what the engine computes in Node for the same deterministic chart.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { normalizeRoute } from '../js/domain/route.js';
import { simulateChart } from '../js/data/simulator.js';
import { buildSearchResult } from '../js/app/search.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

function dumpDom(query) {
  return new Promise((resolve, reject) => {
    execFile(
      CHROME,
      ['--headless=new', '--disable-gpu', '--no-first-run', '--virtual-time-budget=6000', '--dump-dom', `${BASE}?${query}`],
      { maxBuffer: 20 * 1024 * 1024, timeout: 60_000 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

const trains = Object.fromEntries(
  ['19017', '12901', '12933'].map((n) => {
    const raw = JSON.parse(readFileSync(join(ROOT, `data/trains/${n}.json`)));
    return [n, { ...raw, route: normalizeRoute(raw.route) }];
  }),
);

function expected(q) {
  const train = trains[q.train];
  const chart = { berths: simulateChart(train, q.date), source: 'simulated', fetchedAt: new Date() };
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
  await check(`${name} — ${q.train} ${q.from}→${q.to} ${q.date} ${q.cls} x${q.party}`, async () => {
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
        : [exp.partial, exp.boardLater].filter(Boolean).map((x) => x.plan.legs.flatMap((l) => l.berths.map((b) => b.id)));
    assert.deepEqual(dom.plans, expPlans, `plan berths (status ${exp.status})`);
  });
}

await check('Unknown train shows a helpful message, no results', async () => {
  const dom = parse(await dumpDom('train=99999&date=2026-11-21&from=BVI&to=ANND'));
  assert.equal(dom.hidden, true);
  assert.match(dom.trainStatus, /not found/);
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
