/**
 * Auto-acquire the IRCTC session cookie by driving a local Chrome via the DevTools Protocol -
 * so the user never copy-pastes a Cookie header.
 *
 * How it works:
 *   1. Launch Chrome (visible, with a dedicated, persistent profile) pointed at the IRCTC
 *      online-charts page. Akamai's JS runs in that real browser and mints the _abck / bm_*
 *      session cookies, exactly as it would for a human.
 *   2. Connect over CDP (Node's built-in WebSocket - no npm deps) and read the cookies for
 *      www.irctc.co.in with Network.getCookies.
 *   3. Hand the assembled "name=value; ..." string to the proxy, and re-read it on demand
 *      (e.g. after a 403), which reloads the tab to refresh the session.
 *
 * Local only: it controls a browser on the user's machine. It cannot run on GitHub Pages.
 * The persistent profile means the first run may need a one-time page load / any bot check,
 * and later runs usually come up already authenticated.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHARTS_URL = 'https://www.irctc.co.in/online-charts';
const COOKIE_HOST = 'https://www.irctc.co.in';
const REQUIRED = ['_abck', 'bm_sz']; // Akamai markers that mean the session is minted
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function startIrctcSession({
  chromePath = process.env.CHROME || DEFAULT_CHROME,
  port = 9222,
  profileDir,
  timeoutMs = 90_000,
} = {}) {
  if (profileDir) mkdirSync(profileDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    profileDir ? `--user-data-dir=${profileDir}` : null,
    CHARTS_URL,
  ].filter(Boolean);

  const chrome = spawn(chromePath, args, { stdio: 'ignore' });
  chrome.on('error', (e) => console.error('  Could not launch Chrome:', e.message));

  const target = await waitForTarget(port, timeoutMs);
  const cdp = await connectCDP(target.webSocketDebuggerUrl);
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');

  async function readCookies() {
    const { cookies } = await cdp.send('Network.getCookies', { urls: [COOKIE_HOST, CHARTS_URL] });
    return cookies ?? [];
  }

  async function waitForSession() {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const cookies = await readCookies();
      const names = new Set(cookies.map((c) => c.name));
      if (REQUIRED.every((n) => names.has(n))) return toHeader(cookies);
      await sleep(1500);
    }
    throw new Error('Timed out waiting for the IRCTC session. Load the chart page in the opened Chrome window, then retry.');
  }

  let cookie = await waitForSession();

  return {
    get: () => cookie,
    async refresh() {
      try {
        await cdp.send('Page.navigate', { url: CHARTS_URL });
        await sleep(2500);
        cookie = await waitForSession();
      } catch (e) {
        console.warn('  Session refresh failed:', e.message);
      }
      return cookie;
    },
    close() {
      try {
        cdp.close();
      } catch {
        /* ignore */
      }
      try {
        chrome.kill();
      } catch {
        /* ignore */
      }
    },
  };
}

function toHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function waitForTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && /irctc\.co\.in/.test(t.url)) || list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch (e) {
      lastErr = e;
    }
    await sleep(800);
  }
  throw new Error(`Could not reach Chrome DevTools on port ${port}${lastErr ? `: ${lastErr.message}` : ''}`);
}

function connectCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          const msgId = ++id;
          ws.send(JSON.stringify({ id: msgId, method, params }));
          return new Promise((res, rej) => pending.set(msgId, { res, rej }));
        },
        close: () => ws.close(),
      }),
    );
    ws.addEventListener('error', () => reject(new Error('CDP websocket error')));
    ws.addEventListener('message', (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id && pending.has(d.id)) {
        const { res, rej } = pending.get(d.id);
        pending.delete(d.id);
        d.error ? rej(new Error(d.error.message)) : res(d.result);
      }
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
