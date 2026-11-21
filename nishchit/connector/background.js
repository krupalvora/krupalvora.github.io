/**
 * Nishchit Connector — service worker.
 *
 * Runs Nishchit's IRCTC requests from inside a www.irctc.co.in tab in the user's own browser:
 *   - Akamai's own script on that page mints the _abck / bm_* cookies for this user.
 *   - fetch() runs in the page's MAIN world, so it is a same-origin request: no CORS, the
 *     browser attaches the user's cookies, and it leaves from the user's IP.
 * No server of ours is involved, so there is no shared IP or CDN for IRCTC to block.
 *
 * Only the three paths Nishchit needs are allowed (see ALLOWED). The page never chooses the
 * origin, so this can't be used to make arbitrary requests.
 */

const ORIGIN = 'https://www.irctc.co.in';
const CHARTS_URL = `${ORIGIN}/online-charts/`;
const ALLOWED = [
  { method: 'GET', path: /^\/eticketing\/protected\/mapps1\/trnscheduleenquiry\/\d{4,5}$/ },
  { method: 'POST', path: /^\/online-charts\/api\/trainComposition$/ },
  { method: 'POST', path: /^\/online-charts\/api\/coachComposition$/ },
];
const SESSION_COOKIES = ['_abck', 'bm_sz']; // Akamai markers: present = session minted
const TAB_IDLE_CLOSE_MIN = 10; // close the tab WE opened after this long without requests
const ALARM = 'nishchit-close-idle-tab';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'nishchit:request') return false;
  handle(msg.request)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, code: err.code || 'connector', message: err.message || String(err) }));
  return true; // async reply
});

async function handle(req) {
  const method = String(req?.method || 'GET').toUpperCase();
  const path = String(req?.path || '');
  if (!ALLOWED.some((a) => a.method === method && a.path.test(path))) {
    throw codeErr('not-allowed', `Connector refused ${method} ${path}: not one of the IRCTC requests Nishchit uses.`);
  }

  let tabId = await irctcTab();
  let res = await runInTab(tabId, method, path, req.body);

  // 403 = Akamai session missing/stale. Reload the IRCTC tab so Akamai re-mints it, retry once.
  if (res.ok && res.status === 403) {
    tabId = await irctcTab({ reload: true });
    res = await runInTab(tabId, method, path, req.body);
  }
  await touch();
  return res;
}

/** Make the request from inside the IRCTC page (MAIN world = same-origin, user's cookies). */
async function runInTab(tabId, method, path, body) {
  let injected;
  try {
    injected = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [method, path, body ?? null],
      func: async (m, p, b) => {
        try {
          const r = await fetch(p, {
            method: m,
            credentials: 'include',
            headers: {
              accept: 'application/json, text/plain, */*',
              'content-type': 'application/json',
              bmirak: 'webbm',
              greq: String(Date.now()),
            },
            body: m === 'GET' ? undefined : b,
          });
          return { ok: true, status: r.status, contentType: r.headers.get('content-type'), body: await r.text() };
        } catch (e) {
          return { ok: false, code: 'network', message: `fetch from irctc.co.in failed: ${e && e.message ? e.message : e}` };
        }
      },
    });
  } catch (err) {
    throw codeErr('tab', `Could not run the request in the IRCTC tab: ${err.message}`);
  }
  const result = injected?.[0]?.result;
  if (!result) throw codeErr('tab', 'The IRCTC tab returned nothing (it may have navigated away or been closed).');
  return result;
}

/**
 * An irctc.co.in tab with a minted Akamai session: reuse one the user already has open, else
 * open online-charts in a background tab and remember it so we can close it when idle.
 */
async function irctcTab({ reload = false } = {}) {
  const { ownTabId } = await chrome.storage.session.get('ownTabId');
  const tabs = await chrome.tabs.query({ url: `${ORIGIN}/*` });
  let tab = tabs.find((t) => t.id === ownTabId) || tabs.find((t) => t.status === 'complete' && !t.discarded) || tabs[0];

  if (!tab) {
    tab = await chrome.tabs.create({ url: CHARTS_URL, active: false });
    await chrome.storage.session.set({ ownTabId: tab.id });
    await waitForLoad(tab.id);
  } else if (reload || tab.discarded) {
    await chrome.tabs.reload(tab.id);
    await waitForLoad(tab.id);
  } else if (tab.status !== 'complete') {
    await waitForLoad(tab.id);
  }
  await waitForSession();
  return tab.id;
}

function waitForLoad(tabId, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(codeErr('tab-timeout', `irctc.co.in did not finish loading within ${timeoutMs / 1000} s.`));
    }, timeoutMs);
    const onUpdated = (id, info) => {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && onUpdated(tabId, { status: 'complete' }), () => {});
  });
}

async function waitForSession(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const names = new Set((await chrome.cookies.getAll({ url: ORIGIN })).map((c) => c.name));
    if (SESSION_COOKIES.every((n) => names.has(n))) return;
    await new Promise((r) => setTimeout(r, 700));
  }
  throw codeErr(
    'no-session',
    'IRCTC did not start a session in this browser (Akamai cookies missing). Open https://www.irctc.co.in/online-charts, complete any check it shows, then retry.',
  );
}

/* ----------------------- close our tab when idle ----------------------- */

async function touch() {
  await chrome.alarms.create(ALARM, { delayInMinutes: TAB_IDLE_CLOSE_MIN });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const { ownTabId } = await chrome.storage.session.get('ownTabId');
  if (!ownTabId) return;
  await chrome.storage.session.remove('ownTabId');
  try {
    const tab = await chrome.tabs.get(ownTabId);
    if (!tab.active) await chrome.tabs.remove(ownTabId); // never close it under the user's eyes
  } catch {
    /* already closed */
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { ownTabId } = await chrome.storage.session.get('ownTabId');
  if (tabId === ownTabId) await chrome.storage.session.remove('ownTabId');
});

function codeErr(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
