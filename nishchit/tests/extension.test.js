import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedSender, isRefusal, validateRequest } from '../extension/rules.js';
import { createExtensionFetch, detectExtension, IRCTC_BASE } from '../js/data/extensionBridge.js';
import { IrctcProvider } from '../js/data/irctcProvider.js';
import { CONFIG } from '../js/config.js';

/* ------------------------------ rules.js ------------------------------ */

test('validateRequest allows only the three chart endpoints', () => {
  assert.deepEqual(validateRequest({ method: 'GET', path: '/eticketing/protected/mapps1/trnscheduleenquiry/19017' }), {
    name: 'schedule',
    method: 'GET',
    path: '/eticketing/protected/mapps1/trnscheduleenquiry/19017',
    body: undefined,
  });
  assert.throws(() => validateRequest({ method: 'GET', path: '/eticketing/protected/mapps1/userdetails' }), /unknown endpoint/);
  assert.throws(() => validateRequest({ method: 'POST', path: '/eticketing/protected/mapps1/trnscheduleenquiry/19017' }), /use GET/);
  assert.throws(() => validateRequest({ method: 'GET', path: '/online-charts/api/trainComposition' }), /use POST/);
  assert.throws(() => validateRequest({ method: 'GET', path: 'https://evil.example/online-charts/api/trainComposition' }), /unknown endpoint/);
});

test('validateRequest rebuilds POST bodies with only known, normalised fields', () => {
  const req = validateRequest({
    method: 'POST',
    path: '/online-charts/api/coachComposition',
    body: JSON.stringify({ trainNo: '19017', jDate: '2026-11-22', boardingStation: 'bdts', remoteStation: 'BDTS', trainSourceStation: 'BDTS', coach: 's1', cls: 'sl', extra: 'x' }),
  });
  assert.deepEqual(JSON.parse(req.body), { trainNo: '19017', jDate: '2026-11-22', boardingStation: 'BDTS', remoteStation: 'BDTS', trainSourceStation: 'BDTS', coach: 'S1', cls: 'SL' });
  assert.throws(() => validateRequest({ method: 'POST', path: '/online-charts/api/trainComposition', body: '{"trainNo":"1","jDate":"2026-11-22","boardingStation":"BDTS"}' }), /invalid trainNo/);
  assert.throws(() => validateRequest({ method: 'POST', path: '/online-charts/api/trainComposition', body: 'nope' }), /JSON body/);
});

test('isRefusal spots IRCTC turning the request away', () => {
  for (const s of [401, 403, 429, 520]) assert.equal(isRefusal(s, ''), true);
  assert.equal(isRefusal(200, '<html><title>Access Denied</title>'), true);
  assert.equal(isRefusal(200, '{"cdd":[]}'), false);
  assert.equal(isRefusal(404, ''), false);
});

test('isAllowedSender accepts only our content script on Nishchit pages', () => {
  assert.equal(isAllowedSender({ id: 'me', origin: 'https://krupalvora.github.io' }, 'me'), true);
  assert.equal(isAllowedSender({ id: 'me', url: 'http://localhost:5173/?train=19017' }, 'me'), true);
  assert.equal(isAllowedSender({ id: 'other', origin: 'https://krupalvora.github.io' }, 'me'), false);
  assert.equal(isAllowedSender({ id: 'me', origin: 'https://evil.example' }, 'me'), false);
});

test('manifest content-script matches agree with rules.PAGE_ORIGINS', () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const origins = manifest.content_scripts[0].matches.map((m) => new URL(m.replace('*', '')).origin);
  for (const o of origins) assert.ok(isAllowedSender({ id: 'x', origin: o }, 'x'), o);
  assert.deepEqual(manifest.host_permissions, ['https://www.irctc.co.in/*']);
});

/* --------------------------- extensionBridge.js --------------------------- */

/** A window stand-in with a fake content script that answers from `respond(request)`. */
function fakeWindow({ installed = true, marked = false, respond = () => ({ status: 200, text: '{}' }) } = {}) {
  const listeners = new Set();
  const win = {
    location: { origin: 'https://krupalvora.github.io' },
    document: { documentElement: { dataset: marked ? { nishchitExtension: '1.0.0' } : {} } },
    sent: [],
    addEventListener: (type, fn) => type === 'message' && listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    postMessage(data) {
      const emit = (d) => queueMicrotask(() => [...listeners].forEach((fn) => fn({ source: win, origin: win.location.origin, data: d })));
      emit(data);
      if (!installed) return;
      if (data?.type === 'nishchit:ping') emit({ type: 'nishchit:ready', version: '1.0.0' });
      if (data?.type === 'nishchit:fetch') {
        win.sent.push(data.request);
        Promise.resolve(respond(data.request)).then((reply) => emit({ type: 'nishchit:response', id: data.id, ...reply }));
      }
    },
  };
  return win;
}

test('detectExtension: marker, ping/ready, and absent', async () => {
  assert.equal(await detectExtension({ win: fakeWindow({ marked: true }) }), '1.0.0');
  assert.equal(await detectExtension({ win: fakeWindow() }), '1.0.0');
  assert.equal(await detectExtension({ win: fakeWindow({ installed: false }), timeoutMs: 20 }), null);
});

test('extension fetch returns IRCTC status and body as a Response', async () => {
  const win = fakeWindow({ respond: () => ({ status: 200, text: '{"ok":1}' }) });
  const f = createExtensionFetch({ win });
  const res = await f(new URL('online-charts/api/trainComposition', IRCTC_BASE), { method: 'POST', body: '{"a":1}' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: 1 });
  assert.deepEqual(win.sent[0], { method: 'POST', path: '/online-charts/api/trainComposition', body: '{"a":1}' });
});

test('extension fetch: errors become TypeError, aborts become AbortError', async () => {
  const failing = createExtensionFetch({ win: fakeWindow({ respond: () => ({ error: 'boom' }) }) });
  await assert.rejects(failing(new URL('x', IRCTC_BASE)), (e) => e instanceof TypeError && e.message === 'boom');

  const hanging = createExtensionFetch({ win: fakeWindow({ respond: () => new Promise(() => {}) }) });
  const ctl = new AbortController();
  const p = hanging(new URL('x', IRCTC_BASE), { signal: ctl.signal });
  ctl.abort();
  await assert.rejects(p, { name: 'AbortError' });
});

test('IrctcProvider over the extension: 403 tells the user to open IRCTC in this browser', async () => {
  const provider = new IrctcProvider({
    base: IRCTC_BASE,
    endpoints: CONFIG.live.endpoints,
    via: 'extension',
    fetchFn: createExtensionFetch({ win: fakeWindow({ respond: () => ({ status: 403, text: '<title>Access Denied</title>' }) }) }),
  });
  await assert.rejects(provider.getTrain('19017'), (e) => e.code === 'forbidden' && e.via === 'extension' && /in this browser/.test(e.hint));
});

test('IrctcProvider over the Worker: a block suggests installing the extension', async () => {
  const provider = new IrctcProvider({
    base: 'https://proxy.example/',
    endpoints: CONFIG.live.endpoints,
    extensionUrl: 'https://install.example',
    fetchFn: async () => new Response(JSON.stringify({ blocked: true, upstreamStatus: 520 }), { status: 503 }),
  });
  await assert.rejects(provider.getTrain('19017'), (e) => e.code === 'blocked' && e.hint.includes('https://install.example'));
});

/* ------------------------------ install.js ------------------------------ */

test('install page picks the right instructions for each device', async () => {
  const { detectEnvironment, platformFor, compareVersions } = await import('../js/install.js');
  const env = (userAgent, extra = {}) => detectEnvironment({ userAgent, maxTouchPoints: 0, ...extra });
  const cases = [
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', {}, 'mac', 'chrome', 'chromium'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0', {}, 'windows', 'edge', 'chromium'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', { brave: {} }, 'linux', 'brave', 'chromium'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', {}, 'chromeos', 'chrome', 'chromium'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', {}, 'windows', 'firefox', 'firefox'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36', {}, 'android', 'chrome', 'android'],
    ['Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0', {}, 'android', 'firefox', 'firefox'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', {}, 'ios', 'safari', 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', { maxTouchPoints: 5 }, 'ios', 'safari', 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', {}, 'mac', 'safari', 'safari'],
  ];
  for (const [ua, extra, os, browser, platform] of cases) {
    const e = env(ua, extra);
    assert.deepEqual(e, { os, browser }, ua);
    assert.equal(platformFor(e), platform, ua);
  }
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
  assert.equal(compareVersions('1.2', '1.10'), -1);
  assert.equal(compareVersions('2.0.0', '2.0'), 0);
});

test('phones and tablets are told Nishchit needs a computer; desktops are not', async () => {
  const { detectEnvironment, isMobileDevice } = await import('../js/env.js');
  const mobile = (userAgent, extra = {}) => isMobileDevice(detectEnvironment({ userAgent, maxTouchPoints: 0, ...extra }));
  assert.equal(mobile('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36'), true);
  assert.equal(mobile('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36'), true); // Android tablet
  assert.equal(mobile('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), true);
  assert.equal(mobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', { maxTouchPoints: 5 }), true); // iPad
  assert.equal(mobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36'), false);
  assert.equal(mobile('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0'), false);
  assert.equal(mobile('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36'), false);
});
