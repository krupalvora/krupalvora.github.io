/**
 * Content script on the Nishchit page. Relays window.postMessage requests from the page to the
 * extension's service worker and posts the reply back. It holds no logic of its own: the
 * service worker allow-lists what may be requested.
 */
(() => {
  const CHANNEL = 'nishchit';
  const version = chrome.runtime.getManifest().version;
  document.documentElement.dataset.nishchitConnector = version;

  const reply = (msg) => window.postMessage({ channel: CHANNEL, dir: 'from-connector', ...msg }, location.origin);

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const data = ev.data;
    if (data?.channel !== CHANNEL || data.dir !== 'to-connector') return;
    if (data.ping) {
      reply({ ready: true, version });
      return;
    }
    if (!data.id || !data.request) return;
    chrome.runtime
      .sendMessage({ type: 'nishchit:request', request: data.request })
      .then((res) => reply({ id: data.id, reply: res ?? { ok: false, code: 'connector', message: 'Empty reply from the connector.' } }))
      .catch((err) =>
        reply({
          id: data.id,
          reply: {
            ok: false,
            code: 'connector',
            // Most often: the extension was reloaded/updated and this page still has the old bridge.
            message: `${err?.message ?? err}. If you just installed or updated the connector, reload this page.`,
          },
        }),
      );
  });

  reply({ ready: true, version });
})();
