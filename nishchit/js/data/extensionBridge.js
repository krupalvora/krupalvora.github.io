/**
 * Talks to the Nishchit browser extension (extension/), which fetches IRCTC's chart from the
 * user's own browser. The extension's content script listens for window messages on this page.
 *
 *   detectExtension()      -> version string, or null when it isn't installed
 *   createExtensionFetch() -> a fetch-compatible function for IrctcProvider's fetchFn
 */

export const IRCTC_BASE = 'https://www.irctc.co.in/';

export function detectExtension({ win = globalThis.window, timeoutMs = 400 } = {}) {
  const marked = win?.document?.documentElement?.dataset?.nishchitExtension;
  if (marked) return Promise.resolve(marked);
  if (!win?.postMessage) return Promise.resolve(null);
  return new Promise((resolve) => {
    const onMessage = (event) => {
      if (event.source !== win || event.data?.type !== 'nishchit:ready') return;
      finish(String(event.data.version ?? 'unknown'));
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(version) {
      clearTimeout(timer);
      win.removeEventListener('message', onMessage);
      resolve(version);
    }
    win.addEventListener('message', onMessage);
    win.postMessage({ type: 'nishchit:ping' }, win.location.origin);
  });
}

/**
 * The Nishchit mobile app (mobile/) runs this page in a WebView and speaks the same protocol as
 * the extension, fetching from the phone. It marks the page so the UI can say "your phone".
 */
export function isNativeApp(win = globalThis.window) {
  return Boolean(win?.document?.documentElement?.dataset?.nishchitApp);
}

let counter = 0;

/**
 * fetch(url, init) over the extension. Resolves with a real Response carrying IRCTC's status and
 * body; rejects with TypeError when the extension itself fails (like a network error would).
 */
export function createExtensionFetch({ win = globalThis.window } = {}) {
  return (url, init = {}) =>
    new Promise((resolve, reject) => {
      const { signal } = init;
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const id = `n${Date.now().toString(36)}-${(counter += 1)}`;
      const cleanup = () => {
        win.removeEventListener('message', onMessage);
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const onMessage = (event) => {
        const msg = event.data;
        if (event.source !== win || msg?.type !== 'nishchit:response' || msg.id !== id) return;
        cleanup();
        if (msg.error) {
          reject(new TypeError(msg.error));
          return;
        }
        const status = Number(msg.status);
        if (!(status >= 200 && status <= 599)) {
          reject(new TypeError(`IRCTC gave no usable answer (status ${msg.status}).`));
          return;
        }
        resolve(new Response(status === 204 || status === 304 ? null : String(msg.text ?? ''), { status }));
      };
      win.addEventListener('message', onMessage);
      signal?.addEventListener('abort', onAbort, { once: true });
      const target = new URL(url);
      win.postMessage(
        { type: 'nishchit:fetch', id, request: { method: init.method ?? 'GET', path: target.pathname, body: init.body ?? undefined } },
        win.location.origin,
      );
    });
}
