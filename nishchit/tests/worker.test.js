import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const ORIGIN = 'https://krupalvora.github.io';
const W = 'https://nishchit-proxy.example';
const compBody = { trainNo: '19017', jDate: '2026-11-22', boardingStation: 'BDTS' };

function memKV() {
  const m = new Map();
  return { get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), m };
}
const req = (path, body, method = body ? 'POST' : 'GET') =>
  new Request(W + path, { method, headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const upstream = (status, text, calls) => async (url, init) => {
  calls?.push({ url, init });
  return new Response(text, { status, headers: { 'content-type': 'application/json' } });
};

test('worker: preflight allows the site origin', async () => {
  const res = await worker.fetch(new Request(W + '/online-charts/api/trainComposition', { method: 'OPTIONS', headers: { origin: ORIGIN } }), {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
});

test('worker: forwards to IRCTC with an honest UA, then serves from cache', async () => {
  const calls = [];
  const env = { CACHE: memKV(), UPSTREAM_FETCH: upstream(200, JSON.stringify({ cdd: [{ coachName: 'B1', classCode: '3A' }] }), calls) };
  const a = await worker.fetch(req('/online-charts/api/trainComposition', compBody), env);
  const b = await worker.fetch(req('/online-charts/api/trainComposition', compBody), env);
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('x-nishchit-cache'), 'miss');
  assert.equal(b.headers.get('x-nishchit-cache'), 'hit');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.irctc.co.in/online-charts/api/trainComposition');
  assert.match(calls[0].init.headers['user-agent'], /^Nishchit\//);
  assert.deepEqual(JSON.parse(await b.text()).cdd[0].coachName, 'B1');
});

test('worker: IRCTC 403 -> blocked answer, and backs off without calling IRCTC again', async () => {
  const calls = [];
  const env = { CACHE: memKV(), UPSTREAM_FETCH: upstream(403, '<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>Reference&#32;&#35;18&#46;abc&#46;123</BODY></HTML>', calls) };
  const a = await worker.fetch(req('/online-charts/api/trainComposition', compBody), env);
  const body = await a.json();
  assert.equal(a.status, 503);
  assert.equal(body.blocked, true);
  assert.equal(body.upstreamStatus, 403);
  assert.equal(body.reference, '18.abc.123');
  const b = await worker.fetch(req('/eticketing/protected/mapps1/trnscheduleenquiry/12901'), env);
  assert.equal((await b.json()).fromBackoff, true);
  assert.equal(calls.length, 1);
});

test('worker: IRCTC errors pass through uncached', async () => {
  const calls = [];
  const env = { CACHE: memKV(), UPSTREAM_FETCH: upstream(200, JSON.stringify({ error: 'Chart not prepared' }), calls) };
  await worker.fetch(req('/online-charts/api/trainComposition', compBody), env);
  const res = await worker.fetch(req('/online-charts/api/trainComposition', compBody), env);
  assert.equal(JSON.parse(await res.text()).error, 'Chart not prepared');
  assert.equal(calls.length, 2);
});

test('worker: rejects unknown paths and bad input without calling IRCTC', async () => {
  const calls = [];
  const env = { UPSTREAM_FETCH: upstream(200, '{}', calls) };
  assert.equal((await worker.fetch(req('/eticketing/login'), env)).status, 404);
  assert.equal((await worker.fetch(req('/online-charts/api/trainComposition', { ...compBody, trainNo: '1; DROP' }), env)).status, 400);
  assert.equal((await worker.fetch(req('/online-charts/api/trainComposition', null, 'GET'), env)).status, 405);
  assert.equal(calls.length, 0);
});
