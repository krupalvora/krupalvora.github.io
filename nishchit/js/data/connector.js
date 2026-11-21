/**
 * Page side of the Nishchit Connector browser extension (see /connector).
 *
 * Why an extension: a web page cannot read IRCTC's responses (IRCTC's CORS header only allows
 * its own origins) and cannot create or send IRCTC's Akamai cookies (_abck, bm_sz, …). An
 * extension can. It runs each request INSIDE an irctc.co.in tab, so it is a same-origin call
 * made by the user's own browser, from the user's own IP, with the session Akamai minted for
 * that user. Nothing passes through a server of ours, so there is no shared IP to get blocked.
 *
 * Protocol (window.postMessage, same window, relayed by the extension's content script):
 *   page -> { channel: 'nishchit', dir: 'to-connector', id, request: { method, path, body } }
 *   page <- { channel: 'nishchit', dir: 'from-connector', id, reply }
 *     reply = { ok: true, status, contentType, body } | { ok: false, code, message }
 * The content script marks <html data-nishchit-connector="<version>"> at document_start.
 */

const CHANNEL = 'nishchit';
const IRCTC_ORIGIN = 'https://www.irctc.co.in';

export const CONNECTOR_BASE = `${IRCTC_ORIGIN}/`;

/** Installed connector version, or null. Waits briefly in case the content script is late. */
export async function detectConnector(timeoutMs = 800) {
  const now = () => document.documentElement.dataset.nishchitConnector || null;
  if (now()) return now();
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(now());
    };
    const onMessage = (ev) => {
      if (ev.source === window && ev.data?.channel === CHANNEL && ev.data.dir === 'from-connector' && ev.data.ready) done();
    };
    const timer = setTimeout(done, timeoutMs);
    window.addEventListener('message', onMessage);
    window.postMessage({ channel: CHANNEL, dir: 'to-connector', ping: true }, location.origin);
  });
}

let seq = 0;

/**
 * fetch()-compatible function that sends the request through the extension. Only the path is
 * forwarded; the extension decides the origin (www.irctc.co.in) and allow-lists the paths.
 * Connector failures reject with an Error whose `code`/`connectorMessage` the provider reports.
 */
export function connectorFetch(input, init = {}) {
  const url = new URL(String(input));
  if (url.origin !== IRCTC_ORIGIN) return Promise.reject(new Error(`Connector only talks to ${IRCTC_ORIGIN}, not ${url.origin}`));
  const { signal } = init;
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

  const id = `n${Date.now().toString(36)}${(seq += 1)}`;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const onMessage = (ev) => {
      if (ev.source !== window || ev.data?.channel !== CHANNEL || ev.data.dir !== 'from-connector' || ev.data.id !== id) return;
      cleanup();
      const reply = ev.data.reply ?? {};
      if (!reply.ok) {
        const err = new Error(reply.message || 'The Nishchit Connector extension did not answer.');
        err.name = 'ConnectorError';
        err.code = reply.code || 'connector';
        reject(err);
        return;
      }
      resolve(
        new Response(reply.body ?? '', {
          status: reply.status,
          headers: { 'content-type': reply.contentType || 'text/plain' },
        }),
      );
    };
    // The extension opens an IRCTC tab and waits for Akamai on first use; allow for that.
    const timer = setTimeout(() => {
      cleanup();
      const err = new Error('No reply from the Nishchit Connector within 60 s. Is the extension enabled and is irctc.co.in loading?');
      err.name = 'ConnectorError';
      err.code = 'connector-timeout';
      reject(err);
    }, 60_000);

    window.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });
    window.postMessage(
      {
        channel: CHANNEL,
        dir: 'to-connector',
        id,
        request: { method: init.method || 'GET', path: url.pathname + url.search, body: typeof init.body === 'string' ? init.body : undefined },
      },
      location.origin,
    );
  });
}
