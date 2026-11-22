/**
 * Nishchit extension - background service worker.
 *
 * The Nishchit page (via content.js) asks for one IRCTC chart call at a time. We make it from
 * this browser, with the user's own connection and IRCTC session - the same requests IRCTC's
 * chart page makes when the user looks up a chart themselves.
 *
 *   1. Direct: fetch from the extension (host permission for www.irctc.co.in).
 *   2. If IRCTC refuses that (its page session isn't set up in this browser yet), make the call
 *      from an IRCTC chart tab instead - reusing one the user has open, or opening one in the
 *      background and closing it again after a couple of idle minutes.
 *
 * Requests are serialised with a small gap, and only the three validated endpoints are allowed.
 */
import { CHARTS_PAGE, IRCTC, irctcHeaders, isAllowedSender, isRefusal, validateRequest } from './rules.js';

const REQUEST_GAP_MS = 300;
const REQUEST_TIMEOUT_MS = 20000;
const TAB_LOAD_TIMEOUT_MS = 30000;
const PREFER_TAB_FOR_MS = 10 * 60 * 1000;
const CLOSE_OWN_TAB_AFTER_MS = 2 * 60 * 1000;

const WELCOME_URL = 'https://krupalvora.github.io/nishchit/?welcome=1';

// First install: open Nishchit so the user sees it worked ("You're all set") without having
// to find their way back.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: WELCOME_URL }).catch(() => {});
});

let queue = Promise.resolve();
let lastRequestAt = 0;
let preferTabUntil = 0;
let ownTabId = null;
let closeTimer = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'nishchit:fetch') return false;
  if (!isAllowedSender(sender, chrome.runtime.id)) {
    sendResponse({ error: 'This page is not allowed to use the Nishchit extension.' });
    return false;
  }
  let req;
  try {
    req = validateRequest(msg.request);
  } catch (err) {
    sendResponse({ status: 400, text: JSON.stringify({ error: `Bad request: ${err.message}` }) });
    return false;
  }
  queue = queue.then(() => run(req)).then(sendResponse, (err) => sendResponse({ error: String(err?.message ?? err) }));
  return true; // async sendResponse
});

async function run(req) {
  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  if (Date.now() >= preferTabUntil) {
    try {
      const direct = await directFetch(req);
      if (!isRefusal(direct.status, direct.text)) return { ...direct, mode: 'direct' };
    } catch {
      /* fall through to the tab */
    }
    preferTabUntil = Date.now() + PREFER_TAB_FOR_MS;
  }
  const viaTab = await tabFetch(req);
  return { ...viaTab, mode: 'tab' };
}

async function directFetch(req) {
  const res = await fetch(IRCTC + req.path, {
    method: req.method,
    headers: irctcHeaders(),
    body: req.body,
    credentials: 'include',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return { status: res.status, text: await res.text() };
}

async function tabFetch(req) {
  const tabId = await irctcTab();
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: fetchInPage,
    args: [req.path, req.method, req.body ?? null, irctcHeaders(), REQUEST_TIMEOUT_MS],
  });
  scheduleClose();
  const out = injection?.result;
  if (!out) throw new Error('The IRCTC tab did not return a result.');
  if (out.error) throw new Error(out.error);
  return out;
}

/** Runs inside the IRCTC tab (same origin as the API). Must be self-contained. */
async function fetchInPage(path, method, body, headers, timeoutMs) {
  try {
    const res = await fetch(path, { method, headers, body: body ?? undefined, credentials: 'include', signal: AbortSignal.timeout(timeoutMs) });
    return { status: res.status, text: await res.text() };
  } catch (err) {
    return { error: `IRCTC request failed in the IRCTC tab: ${err?.message ?? err}` };
  }
}

async function irctcTab() {
  if (ownTabId !== null) {
    try {
      await chrome.tabs.get(ownTabId);
      await waitForLoad(ownTabId);
      return ownTabId;
    } catch {
      ownTabId = null;
    }
  }
  const open = await chrome.tabs.query({ url: `${IRCTC}/*` });
  const existing = open.find((t) => t.status === 'complete') ?? open[0];
  if (existing) {
    await waitForLoad(existing.id);
    return existing.id;
  }
  const tab = await chrome.tabs.create({ url: CHARTS_PAGE, active: false });
  ownTabId = tab.id;
  await waitForLoad(tab.id);
  await sleep(1500); // let IRCTC's page finish setting up its session
  return tab.id;
}

function waitForLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('IRCTC took too long to load.'));
    }, TAB_LOAD_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done(), () => {});
  });
}

/** Close the tab we opened ourselves once Nishchit has stopped using it. */
function scheduleClose() {
  if (ownTabId === null) return;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    const id = ownTabId;
    ownTabId = null;
    if (id !== null) chrome.tabs.remove(id).catch(() => {});
  }, CLOSE_OWN_TAB_AFTER_MS);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
