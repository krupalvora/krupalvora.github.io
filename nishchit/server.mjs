/**
 * Local dev server for Nishchit live mode.
 *
 *   IRCTC_COOKIE='<paste your browser Cookie header>' npm run serve:live
 *   then open  http://localhost:5173/?live=1
 *
 * Why this exists (see README "Live IRCTC data"):
 *   - It serves the static site AND proxies IRCTC, so the page's API calls are SAME-ORIGIN
 *     and the browser's CORS block never applies.
 *   - It runs on your machine, so requests leave from your local IP. IRCTC answers local IPs
 *     but 403s datacenter IPs, so this cannot run on GitHub Pages / a cloud host.
 *   - It attaches the session cookie + headers IRCTC's Akamai layer requires. The cookie is
 *     read from the IRCTC_COOKIE env var or a local `.irctc-session` file (gitignored) — it is
 *     never written into the repo. Cookies expire; refresh them from your browser when calls
 *     start returning 403.
 *
 * The first response body of each IRCTC endpoint is saved under `.irctc-dumps/` (gitignored)
 * so the field names in js/data/irctc/mapChart.js can be confirmed against real data.
 *
 * This is a DEV tool, not the product. The deployed site stays static; live data needs a
 * proxy you host and the legal basis to use IRCTC's data.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startIrctcSession } from './lib/irctcSession.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 5173);
const AUTO = /^(1|true|yes)$/i.test(process.env.IRCTC_AUTO ?? '');
const UPSTREAM = 'https://www.irctc.co.in';
const PROXY_PREFIXES = ['/online-charts/', '/eticketing/'];
const DUMP_DIR = join(ROOT, '.irctc-dumps');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';


/**
 * A session gives the proxy a cookie and a way to refresh it.
 *  - AUTO: a local Chrome driven over CDP mints and reads the cookies (no copy-paste).
 *  - otherwise: a static cookie from IRCTC_COOKIE or the .irctc-session file.
 */
async function createSession() {
  if (AUTO) {
    console.log('  IRCTC_AUTO: opening Chrome to mint the IRCTC session (no copy-paste)…');
    const s = await startIrctcSession({ profileDir: join(ROOT, '.chrome-irctc') });
    console.log('  IRCTC session acquired from Chrome.');
    return s;
  }
  const readStatic = async () => {
    if (process.env.IRCTC_COOKIE) return process.env.IRCTC_COOKIE.trim();
    try {
      return (await readFile(join(ROOT, '.irctc-session'), 'utf8')).trim();
    } catch {
      return '';
    }
  };
  let cookie = await readStatic();
  return { get: () => cookie, refresh: async () => (cookie = await readStatic()), close() {} };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function proxy(req, res, session) {
  if (!session.get()) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: AUTO ? 'IRCTC session not ready — load the chart page in the opened Chrome window.' : 'No IRCTC session. Set IRCTC_COOKIE or create .irctc-session, then restart.' }));
    return;
  }
  const url = UPSTREAM + req.url;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);

  const call = (cookie) =>
    fetch(url, {
      method: req.method,
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json',
        bmirak: 'webbm',
        greq: String(Date.now()),
        referer: `${UPSTREAM}/online-charts`,
        'user-agent': UA,
        cookie,
      },
      body,
    });

  const started = Date.now();
  const endpoint = req.url.split('?')[0].split('/').filter(Boolean).pop() || '';
  // For coachComposition the coach + class are in the request body; surface them in the log.
  let detail = '';
  if (body) {
    try {
      const b = JSON.parse(body.toString());
      detail = b.coach ? ` coach ${b.coach} (${b.cls})` : b.trainNo ? ` train ${b.trainNo} ${b.jDate ?? ''}`.trimEnd() : '';
    } catch {
      /* ignore */
    }
  }
  const label = `${req.method} ${endpoint}${detail}`;
  let upstream;
  try {
    upstream = await call(session.get());
    // On 403 the Akamai session has rotated; refresh once (reloads the Chrome tab) and retry.
    if (upstream.status === 403) {
      console.warn(`  ${stamp()} 403 from IRCTC for ${label} — refreshing session…`);
      const fresh = await session.refresh();
      if (fresh) upstream = await call(fresh);
    }
  } catch (err) {
    console.warn(`  ${stamp()} ✖ ${label} — upstream fetch failed: ${err.message}`);
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Upstream fetch failed: ${err.message}` }));
    return;
  }

  const text = await upstream.text();
  const note = (() => {
    try {
      const j = JSON.parse(text);
      if (j.error) return `error: ${j.error}`;
      if (Array.isArray(j.cdd)) return `${j.cdd.length} coaches`;
      if (Array.isArray(j.bdd)) return `${j.bdd.length} berths`;
    } catch {
      /* not JSON */
    }
    return `${text.length} bytes`;
  })();
  console.log(`  ${stamp()} ${upstream.status === 200 ? '✔' : '•'} ${label} -> ${upstream.status} (${note}, ${Date.now() - started}ms)`);
  await dump(req.url, upstream.status, text);
  if (upstream.status === 403 && !AUTO) {
    console.warn('  Still 403 — the pasted cookie has expired; refresh .irctc-session.');
  }
  res.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
    'access-control-allow-origin': '*',
  });
  res.end(text);
}

const stamp = () => new Date().toLocaleTimeString();

/**
 * Save every response (overwriting the latest per endpoint+coach), so .irctc-dumps/ always
 * mirrors the most recent live search — a coach name in the query keeps coaches distinct.
 */
async function dump(reqUrl, status, text) {
  const base = reqUrl.split('?')[0].split('/').filter(Boolean).pop() || 'root';
  let coach = null;
  try {
    coach = JSON.parse(text)?.coachName ?? null; // coachComposition responses carry coachName
  } catch {
    /* not JSON */
  }
  const name = coach ? `${base}.${coach}` : base;
  try {
    await mkdir(DUMP_DIR, { recursive: true });
    await writeFile(join(DUMP_DIR, `${name}.${status}.json`), text);
  } catch (err) {
    console.warn(`  could not dump ${name}: ${err.message}`);
  }
}

async function serveStatic(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, path === '/' || path.endsWith('/') ? `${path}index.html` : path);
  try {
    await access(file);
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

let session = { get: () => '', refresh: async () => '', close() {} };

const server = createServer(async (req, res) => {
  // Lets the page tell server.mjs (a real proxy) apart from a plain static server.
  if (req.url === '/__nishchit/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ proxy: true, session: Boolean(session.get()) }));
    return;
  }
  if (PROXY_PREFIXES.some((p) => req.url.startsWith(p))) return proxy(req, res, session);
  return serveStatic(req, res);
});

server.listen(PORT, async () => {
  console.log(`Nishchit live server on http://localhost:${PORT}/?live=1`);
  try {
    session = await createSession();
    console.log(session.get() ? '  IRCTC session ready.' : '  No IRCTC session yet — set IRCTC_COOKIE, create .irctc-session, or use IRCTC_AUTO=1.');
  } catch (err) {
    console.error('  Session setup failed:', err.message);
  }
});

process.on('SIGINT', () => {
  session.close?.();
  process.exit(0);
});
