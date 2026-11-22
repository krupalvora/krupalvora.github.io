/**
 * Runs on Nishchit pages only. Relays the page's chart requests to the extension's background
 * worker and posts the answers back. The page talks to it with window.postMessage:
 *   page -> { type: 'nishchit:ping' }                          -> { type: 'nishchit:ready', version }
 *   page -> { type: 'nishchit:fetch', id, request }            -> { type: 'nishchit:response', id, status, text | error }
 */
(() => {
  const version = chrome.runtime.getManifest().version;
  const origin = location.origin;
  const post = (msg) => window.postMessage(msg, origin);

  document.documentElement.dataset.nishchitExtension = version;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== origin) return;
    const msg = event.data;
    if (msg?.type === 'nishchit:ping') {
      post({ type: 'nishchit:ready', version });
      return;
    }
    if (msg?.type !== 'nishchit:fetch' || typeof msg.id !== 'string') return;
    chrome.runtime.sendMessage({ type: 'nishchit:fetch', request: msg.request }).then(
      (reply) => post({ type: 'nishchit:response', id: msg.id, ...(reply ?? { error: 'No reply from the Nishchit extension.' }) }),
      (err) => post({ type: 'nishchit:response', id: msg.id, error: `Nishchit extension error: ${err?.message ?? err}` }),
    );
  });

  post({ type: 'nishchit:ready', version });
})();
