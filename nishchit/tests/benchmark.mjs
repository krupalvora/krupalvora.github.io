/**
 * Live end-to-end benchmark (LOCAL ONLY).
 *
 * Drives the REAL IrctcProvider through your running local proxy (server.mjs) for several
 * trains, and captures per-call response times, per-coach timings, totals, and berth counts.
 *
 *   npm run serve:auto           # in one terminal (must show "IRCTC session ready")
 *   node tests/benchmark.mjs                       # default train list, today
 *   node tests/benchmark.mjs 19017 12951 22209     # specific trains
 *   node tests/benchmark.mjs --date 2026-11-21 19017
 *   BASE=http://localhost:5173 node tests/benchmark.mjs
 *
 * It hits IRCTC through YOUR browser session/IP via the proxy - same path as the app. It does
 * not bypass anything; if the chart isn't prepared, that train is reported as such.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IrctcProvider } from '../js/data/irctcProvider.js';
import { CONFIG } from '../js/config.js';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const LOG = fileURLToPath(new URL('./.benchmark.log', import.meta.url));
// Write every line to a file too, so progress is visible live even while stdout is buffered.
const log = (s = '') => {
  try {
    appendFileSync(LOG, s + '\n');
  } catch {
    /* ignore */
  }
  process.stdout.write(s + '\n');
};
const args = process.argv.slice(2);
let date = toISO(new Date());
const trains = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--date') date = args[++i];
  else trains.push(args[i]);
}
if (!trains.length) trains.push('19017', '12951', '12933', '12901');

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const ms = (n) => `${Math.round(n)}ms`;
const stat = (xs) => (xs.length ? { min: Math.min(...xs), max: Math.max(...xs), avg: xs.reduce((a, b) => a + b, 0) / xs.length } : { min: 0, max: 0, avg: 0 });

async function preflight() {
  try {
    const res = await fetch(new URL('/__nishchit/health', BASE), { cache: 'no-store' });
    const j = await res.json();
    if (!j.proxy) throw new Error('not a proxy');
    if (!j.session) log('⚠️  Proxy is up but has no IRCTC session yet - results may be 503. Load the chart page in the opened Chrome window.');
    return true;
  } catch (err) {
    log(`✖ Cannot reach the local proxy at ${BASE} (${err.message}).`);
    log('  Start it first:  npm run serve:auto   (and wait for "IRCTC session ready")');
    return false;
  }
}

async function benchmarkTrain(number) {
  // A fresh provider per train so caches don't hide real network time. Record every HTTP call.
  const calls = [];
  const timingFetch = async (url, init) => {
    const t0 = performance.now();
    const res = await fetch(url, init);
    const text = await res.text();
    const dt = performance.now() - t0;
    const path = new URL(String(url)).pathname.split('/').filter(Boolean).pop();
    calls.push({ path, ms: dt, status: res.status, bytes: text.length });
    // Re-wrap so the provider can still read the body it expects.
    return new Response(text, { status: res.status, headers: res.headers });
  };
  const provider = new IrctcProvider({
    base: BASE,
    via: 'proxy',
    endpoints: CONFIG.live.endpoints,
    coachGapMs: CONFIG.live.coachGapMs,
    fetchFn: timingFetch,
  });

  const row = { train: number, date };
  const wall0 = performance.now();
  try {
    const tTrain = performance.now();
    const train = await provider.getTrain(number);
    row.scheduleMs = performance.now() - tTrain;
    if (!train) return { ...row, status: 'not-found' };
    row.name = train.name;

    const coachTimes = [];
    let last = performance.now();
    const chart = await provider.getChart({
      train,
      date,
      onProgress: ({ done, total }) => {
        if (done > 0) {
          const dt = performance.now() - last;
          coachTimes.push(dt);
          log(`    ${number}: coach ${done}/${total} (${ms(dt)})`); // live progress
          last = performance.now();
        } else {
          last = performance.now(); // composition done; start timing coaches
        }
      },
    });
    row.status = 'ok';
    row.totalMs = performance.now() - wall0;
    row.coaches = coachTimes.length;
    row.berths = chart.berths.length;
    row.warnings = chart.warnings?.length ?? 0;
    row.coachStat = stat(coachTimes);
    row.calls = calls;
    const comp = calls.find((c) => c.path === 'trainComposition');
    row.compositionMs = comp?.ms ?? null;
    row.netMs = calls.reduce((a, c) => a + c.ms, 0); // sum of HTTP time, excludes the courtesy gaps
    return row;
  } catch (err) {
    return { ...row, status: err.code || 'error', message: err.message, totalMs: performance.now() - wall0, calls };
  }
}

function printRow(r) {
  if (r.status === 'ok') {
    log(
      `✔ ${r.train} ${r.name ?? ''}\n` +
        `    schedule ${ms(r.scheduleMs)} | composition ${ms(r.compositionMs ?? 0)} | ` +
        `coaches ${r.coaches} (avg ${ms(r.coachStat.avg)}, min ${ms(r.coachStat.min)}, max ${ms(r.coachStat.max)})\n` +
        `    berths ${r.berths}${r.warnings ? ` | ${r.warnings} coach warning(s)` : ''}\n` +
        `    network time ${ms(r.netMs)} | wall-clock total ${ms(r.totalMs)} (incl. ${CONFIG.live.coachGapMs}ms gaps)`,
    );
  } else {
    log(`• ${r.train} - ${r.status}${r.message ? `: ${r.message}` : ''} (after ${ms(r.totalMs ?? 0)})`);
  }
}

(async () => {
  try {
    writeFileSync(LOG, '');
  } catch {
    /* ignore */
  }
  log(`\nNishchit live benchmark - ${trains.length} train(s), date ${date}, via ${BASE}\n`);
  if (!(await preflight())) process.exit(1);

  const rows = [];
  for (const t of trains) {
    const r = await benchmarkTrain(t);
    printRow(r);
    rows.push(r);
    log('');
  }

  const ok = rows.filter((r) => r.status === 'ok');
  log('─'.repeat(64));
  if (ok.length) {
    const allCoaches = ok.flatMap((r) => (r.calls ?? []).filter((c) => c.path === 'coachComposition').map((c) => c.ms));
    const cs = stat(allCoaches);
    log(
      `Summary of ${ok.length}/${rows.length} trains with a prepared chart:\n` +
        `  coachComposition calls: ${allCoaches.length} | per-call avg ${ms(cs.avg)}, min ${ms(cs.min)}, max ${ms(cs.max)}\n` +
        `  schedule avg ${ms(stat(ok.map((r) => r.scheduleMs)).avg)} | composition avg ${ms(stat(ok.map((r) => r.compositionMs)).avg)}\n` +
        `  wall-clock per train avg ${ms(stat(ok.map((r) => r.totalMs)).avg)}`,
    );
  } else {
    log('No train had a prepared chart right now - nothing to benchmark. Try trains leaving within a few hours.');
  }
  if (process.env.JSON) log('\nJSON:\n' + JSON.stringify(rows, null, 2));
})();
