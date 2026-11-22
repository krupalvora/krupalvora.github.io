/**
 * Nishchit proxy - Cloudflare Worker.
 *
 * The page can't call IRCTC itself (IRCTC's CORS only allows its own origins), so this Worker
 * calls the three public online-charts endpoints on the page's behalf and adds a CORS header.
 *
 * Deliberately polite and honest:
 *   - Only three endpoints, strictly validated inputs.
 *   - Identifies itself in User-Agent. No cookie/fingerprint/sensor tricks to get past
 *     IRCTC's bot protection: if IRCTC blocks us, we report that to the user and back off.
 *   - Caches successful answers (KV if bound, else per-isolate memory) so many users searching
 *     the same train/date cost IRCTC one call per TTL.
 *   - After a block, stops calling IRCTC for BLOCK_BACKOFF_S and answers "blocked" from memory.
 *
 * Paths mirror IRCTC's, so the page's IrctcProvider works unchanged with base = this Worker.
 */

const UPSTREAM = 'https://www.irctc.co.in';
const USER_AGENT = 'Nishchit/1.0 (+https://krupalvora.github.io/nishchit/)';
const BLOCK_BACKOFF_S = 120;
const TTL = { schedule: 24 * 3600, chartNotReady: 5 * 60, chart: 10 * 60, coach: 10 * 60 };

const ROUTES = [
  { name: 'schedule', method: 'GET', re: /^\/eticketing\/protected\/mapps1\/trnscheduleenquiry\/(\d{5})$/ },
  { name: 'trainComposition', method: 'POST', re: /^\/online-charts\/api\/trainComposition$/ },
  { name: 'coachComposition', method: 'POST', re: /^\/online-charts\/api\/coachComposition$/ },
];

const memory = new Map(); // fallback cache: key -> { value, expires }

export default {
  async fetch(request, env = {}, ctx = {}) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const route = ROUTES.find((r) => r.re.test(url.pathname));
    if (!route) return json(404, { error: 'Unknown endpoint.' }, cors);
    if (request.method !== route.method) return json(405, { error: `Use ${route.method}.` }, cors);

    let body = null;
    if (route.method === 'POST') {
      try {
        body = validate(route.name, await request.json());
      } catch (err) {
        return json(400, { error: `Bad request: ${err.message}` }, cors);
      }
    }

    const cache = makeCache(env);
    const key = `v1:${route.name}:${url.pathname}:${body ? JSON.stringify(body) : ''}`;
    const hit = await cache.get(key);
    if (hit) return new Response(hit.body, { status: 200, headers: { ...cors, 'content-type': 'application/json', 'x-nishchit-cache': 'hit', 'x-nishchit-fetched-at': hit.at } });

    const blocked = await cache.get('v1:blocked');
    if (blocked) return blockedResponse(blocked, cors, true);

    let upstream;
    try {
      upstream = await (env.UPSTREAM_FETCH ?? fetch)(UPSTREAM + url.pathname, {
        method: route.method,
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
          referer: `${UPSTREAM}/online-charts/`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      return json(502, { error: `Nishchit's server could not reach IRCTC: ${err.message}` }, cors);
    }

    const text = await upstream.text();
    const status = upstream.status;

    const blockReason = whyBlocked(status, text);
    if (blockReason) {
      const info = { status, reason: blockReason, reference: akamaiReference(text), at: new Date().toISOString() };
      const write = cache.put('v1:blocked', info, BLOCK_BACKOFF_S);
      ctx.waitUntil ? ctx.waitUntil(write) : await write;
      return blockedResponse(info, cors, false);
    }

    if (status >= 200 && status < 300) {
      const ttl = ttlFor(route.name, text);
      if (ttl) {
        const write = cache.put(key, { body: text, at: new Date().toISOString() }, ttl);
        ctx.waitUntil ? ctx.waitUntil(write) : await write;
      }
    }

    // Pass everything else through unchanged (404 unknown train, 5xx timeouts, IRCTC's own
    // { error } bodies) so the page can show IRCTC's real message.
    return new Response(text, {
      status,
      headers: { ...cors, 'content-type': upstream.headers.get('content-type') ?? 'text/plain', 'x-nishchit-cache': 'miss' },
    });
  },
};

/* ------------------------------- helpers ------------------------------- */

function validate(name, b) {
  if (!b || typeof b !== 'object') throw new Error('JSON body required');
  const train = /^\d{5}$/;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const stn = /^[A-Z]{1,5}$/;
  const check = (field, re) => {
    const v = String(b[field] ?? '').trim().toUpperCase();
    if (!re.test(v)) throw new Error(`invalid ${field}`);
    return v;
  };
  const out = { trainNo: check('trainNo', train), jDate: check('jDate', date), boardingStation: check('boardingStation', stn) };
  if (name === 'coachComposition') {
    out.remoteStation = check('remoteStation', stn);
    out.trainSourceStation = check('trainSourceStation', stn);
    out.coach = check('coach', /^[A-Z0-9]{1,4}$/);
    out.cls = check('cls', /^(SL|3A|2A|1A|3E|CC|EC|2S)$/);
  }
  return out;
}

/**
 * Why IRCTC is refusing this server, or null. 520 is Cloudflare's code for "the origin closed
 * the connection without a valid reply" - how IRCTC's Akamai edge silently drops servers.
 */
function whyBlocked(status, text) {
  if (status === 401 || status === 403) return `IRCTC refused the request (HTTP ${status})`;
  if (status === 429) return 'IRCTC is rate-limiting this server (HTTP 429)';
  if (status === 520) return 'IRCTC closed the connection without answering (Cloudflare 520), which is how its bot protection refuses servers';
  if (/<title>\s*Access Denied/i.test(text)) return `IRCTC returned its "Access Denied" page (HTTP ${status})`;
  return null;
}

function akamaiReference(text) {
  const decoded = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return /Reference\s*#\s*([\w.]+)/i.exec(decoded)?.[1] ?? null;
}

function blockedResponse(info, cors, fromBackoff) {
  return json(
    503,
    {
      blocked: true,
      error: 'IRCTC is blocking requests from Nishchit\'s server right now.',
      upstreamStatus: info.status,
      reason: info.reason,
      reference: info.reference,
      since: info.at,
      retryAfterSeconds: BLOCK_BACKOFF_S,
      fromBackoff,
    },
    { ...cors, 'retry-after': String(BLOCK_BACKOFF_S) },
  );
}

function ttlFor(name, text) {
  if (name === 'schedule') return TTL.schedule;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return 0; // not JSON: don't cache
  }
  if (data?.error) return 0; // IRCTC error bodies are not cached
  if (name === 'coachComposition') return TTL.coach;
  const prepared = Array.isArray(data?.cdd) && data.cdd.length > 0;
  return prepared ? TTL.chart : TTL.chartNotReady;
}

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS ?? 'https://krupalvora.github.io,http://localhost:5173')
    .split(',')
    .map((s) => s.trim());
  const origin = request.headers.get('origin');
  return {
    'access-control-allow-origin': origin && allowed.includes(origin) ? origin : allowed[0],
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, accept, bmirak, greq',
    'access-control-expose-headers': 'x-nishchit-cache, x-nishchit-fetched-at, retry-after',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(status, data, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'content-type': 'application/json' } });
}

/** KV (env.CACHE) when bound - shared across all Cloudflare locations - else in-memory. */
function makeCache(env) {
  const kv = env.CACHE;
  if (kv) {
    return {
      get: async (k) => kv.get(k, 'json'),
      put: (k, v, ttl) => kv.put(k, JSON.stringify(v), { expirationTtl: Math.max(60, ttl) }),
    };
  }
  return {
    get: async (k) => {
      const e = memory.get(k);
      if (!e) return null;
      if (e.expires < Date.now()) {
        memory.delete(k);
        return null;
      }
      return e.value;
    },
    put: async (k, v, ttl) => {
      memory.set(k, { value: v, expires: Date.now() + ttl * 1000 });
      if (memory.size > 2000) memory.delete(memory.keys().next().value);
    },
  };
}
