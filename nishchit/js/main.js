import { CONFIG } from './config.js';
import { buildSearchResult } from './app/search.js';
import { createExtensionFetch, detectExtension, IRCTC_BASE, isNativeApp } from './data/extensionBridge.js';
import { IrctcProvider } from './data/irctcProvider.js';
import { NoSourceProvider, ProviderError } from './data/provider.js';
import { isMobileDevice } from './env.js';
import { toISODate } from './domain/time.js';
import { isComplete, queryFromParams, queryToParams } from './state/query.js';
import { h, hydrateIcons, icon } from './ui/dom.js';
import { hardRefresh } from './ui/hardRefresh.js';
import { createResultsView } from './ui/results.js';
import { SearchForm } from './ui/searchForm.js';

/**
 * Composition root.
 * Flow: form submit -> URL update -> search() -> provider.getChart -> engine -> render.
 */
async function bootstrap() {
  hydrateIcons();
  document.getElementById('hard-refresh')?.addEventListener('click', (e) => hardRefresh(e.currentTarget));

  const today = toISODate(new Date());
  const { provider, via } = await selectProvider();
  const results = createResultsView({ root: document.getElementById('results'), intro: document.getElementById('intro') });
  if (via) console.info(`[nishchit] IRCTC data via ${via}`);
  showExtensionState(via);

  let inFlight = null;

  const form = new SearchForm({
    root: document.getElementById('search-form'),
    provider,
    today,
    partySizes: CONFIG.partySizes,
    chartRules: CONFIG.chartRules,
    onError: (err, context) => {
      if (err?.code !== 'needs-extension') reportError(err, context);
      results.renderError(err); // full card: hint, IRCTC link, technical details
    },
    onSubmit: (query) => {
      pushQuery(query);
      search(query);
    },
  });

  async function search(query) {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    form.setBusy(true);
    results.renderLoading(query);
    try {
      const train = await provider.getTrain(query.train, { signal: controller.signal });
      if (!train) throw new ProviderError(`IRCTC has no train numbered ${query.train}.`, 'not-found', { via: provider.via, hint: 'Check the train number.' });
      const view = (chart) => buildSearchResult({ train, chart, query, chartRules: CONFIG.chartRules, engineOptions: CONFIG.engine });
      const chart = await provider.getChart({
        train,
        date: query.date,
        classes: query.cls === 'all' ? null : [query.cls],
        signal: controller.signal,
        // Render berths as each coach arrives, so a long all-classes fetch isn't a blank spinner.
        onProgress: ({ done, total, chart: partial }) => {
          if (controller.signal.aborted) return;
          if (partial?.berths?.length) results.renderPartial(view(partial), { done, total });
          else results.renderLoading(query, { done, total });
        },
      });
      if (!controller.signal.aborted) results.render(view(chart));
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (err?.code !== 'needs-extension') reportError(err, { query });
      results.renderError(err);
    } finally {
      if (inFlight === controller) {
        inFlight = null;
        form.setBusy(false);
      }
    }
  }

  async function applyUrl() {
    const query = queryFromParams(new URLSearchParams(location.search), today);
    const ready = await form.setQuery(query);
    if (ready && isComplete(query)) search(query);
    else if (!form.lookupError) results.hide(); // keep a lookup error card visible
  }

  function pushQuery(query) {
    const params = queryToParams(query).toString();
    const url = `${location.pathname}${params ? `?${params}` : ''}`;
    if (url !== `${location.pathname}${location.search}`) history.pushState(null, '', url);
  }

  window.addEventListener('popstate', applyUrl);
  await applyUrl();
}

/**
 * Pick the route to IRCTC. There is no demo fallback.
 *   1. ?proxy=<url> - explicit override (tests, trying another deployment).
 *   2. localhost with server.mjs running - the local dev proxy, using your own IRCTC session.
 *   3. the Nishchit browser extension, if installed - fetches from the user's own browser.
 *   4. on the real site without the extension: ask the user to install it (IRCTC blocks the
 *      Worker, so trying it would only produce an error).
 *   5. CONFIG.live.base - the deployed Worker, localhost only (dev without server.mjs).
 *   6. none - every search fails with a clear "not configured" error.
 */
async function selectProvider() {
  const params = new URLSearchParams(location.search);
  const live = CONFIG.live;
  const common = { endpoints: live.endpoints, coachGapMs: live.coachGapMs, chartsUrl: CONFIG.chartsUrl };

  const override = params.get('proxy') || ((await devProxyRunning()) ? location.origin : '');
  if (override) return { via: 'proxy', provider: new IrctcProvider({ ...common, base: override, via: 'proxy' }) };

  const version = await detectExtension();
  if (version && isNativeApp()) {
    document.body.classList.add('is-app');
    return {
      via: `app ${version}`,
      provider: new IrctcProvider({
        ...common,
        base: IRCTC_BASE,
        via: 'app',
        fetchFn: createExtensionFetch(),
        requestTimeoutMs: CONFIG.extension.requestTimeoutMs,
      }),
    };
  }
  if (version) {
    return {
      via: `extension ${version}`,
      provider: new IrctcProvider({
        ...common,
        base: IRCTC_BASE,
        via: 'extension',
        fetchFn: createExtensionFetch(),
        requestTimeoutMs: CONFIG.extension.requestTimeoutMs,
      }),
    };
  }

  // Phones and tablets can't run the extension, and IRCTC blocks the server route, so a search
  // there can only fail. Say why, plainly, instead of showing a server error.
  if (isMobileDevice()) {
    return {
      via: 'mobile',
      provider: new NoSourceProvider(
        new ProviderError('Nishchit needs a laptop or desktop to read the live chart.', 'needs-desktop', {
          hint: `It uses a free browser extension, which phones and tablets can't run. Open this page in Chrome, Edge or Brave on a computer. You can check the chart on IRCTC from your phone meanwhile: ${CONFIG.chartsUrl}`,
        }),
      ),
    };
  }

  // Desktop without the extension on the real site: IRCTC blocks the Worker, so a search would
  // only end in an error. Ask for the extension instead. (Localhost keeps the Worker for dev.)
  if (!isLocalHost()) {
    return {
      via: 'needs-extension',
      provider: new NoSourceProvider(
        new ProviderError('Install the free Nishchit extension to read the live chart.', 'needs-extension', {
          hint: 'It fetches the chart from IRCTC through your own browser. It takes about a minute to set up.',
        }),
      ),
    };
  }

  const base = live.base;
  if (base) return { via: 'proxy', provider: new IrctcProvider({ ...common, base, via: 'proxy', extensionUrl: CONFIG.extension.installUrl }) };

  return {
    via: null,
    provider: new NoSourceProvider(
      new ProviderError("Nishchit's data server is not configured, so it can't fetch charts from IRCTC.", 'no-source', {
        hint: `You can still check the chart directly on IRCTC: ${CONFIG.chartsUrl}`,
      }),
    ),
  };
}

/**
 * Tell the user where chart data comes from:
 *   - just installed (the extension opens ?welcome=1): a one-time "you're all set" banner;
 *   - extension present: a quiet "connected" line in the intro panel;
 *   - no extension on the production site: a prompt to install it (the Worker is blocked).
 */
function showExtensionState(via) {
  const params = new URLSearchParams(location.search);
  const notice = document.getElementById('extension-notice');
  const introLine = document.getElementById('intro-extension');
  const hasExtension = via?.startsWith('extension');

  if (params.has('welcome')) {
    params.delete('welcome');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
    if (hasExtension && notice) {
      notice.classList.add('extension-notice--ok');
      notice.replaceChildren(document.createTextNode("You're all set: the Nishchit extension is installed. Enter a train to see its live chart."));
      notice.hidden = false;
      return;
    }
  }

  if (via === 'mobile') {
    showMobileNotice(notice);
    return;
  }

  if (via?.startsWith('app') && introLine) {
    introLine.textContent = 'Charts load live from IRCTC on your phone.';
    introLine.hidden = false;
  } else if (hasExtension && introLine) {
    introLine.textContent = 'Extension connected: charts load live from your browser.';
    introLine.hidden = false;
  } else if (via === 'needs-extension') {
    notice?.removeAttribute('hidden');
  }
}

function isLocalHost() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

/** Phones/tablets: explain the extension needs a computer, and make it easy to move there. */
function showMobileNotice(notice) {
  if (!notice) return;
  document.body.classList.add('is-mobile-device');
  const link = location.href;
  const shareBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--sm btn--dark',
      onclick: async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title: 'Nishchit', text: 'Open Nishchit on my laptop', url: link });
            return;
          }
          await navigator.clipboard.writeText(link);
          shareBtn.lastChild.textContent = 'Link copied';
        } catch (err) {
          if (err?.name !== 'AbortError') shareBtn.lastChild.textContent = 'Copy the address bar link';
        }
      },
    },
    icon('external'),
    h('span', {}, navigator.share ? 'Send link to my computer' : 'Copy link'),
  );
  notice.classList.add('extension-notice--mobile');
  notice.replaceChildren(
    h('strong', { class: 'extension-notice__title' }, 'Open Nishchit on a laptop or desktop'),
    h(
      'span',
      {},
      'Nishchit reads the live chart through a free browser extension, and phones and tablets can’t run extensions. You can look around here; to search, open this page in Chrome, Edge or Brave on a computer.',
    ),
    h('span', { class: 'extension-notice__actions' }, shareBtn, h('a', { href: CONFIG.chartsUrl, target: '_blank', rel: 'noopener' }, 'Check the chart on IRCTC')),
  );
  notice.hidden = false;
}

/** server.mjs answers /__nishchit/health; a plain static server (or Pages) does not. */
async function devProxyRunning() {
  if (!isLocalHost()) return false;
  try {
    const res = await fetch(new URL('__nishchit/health', location.origin), { cache: 'no-store' });
    return res.ok && (await res.json())?.proxy === true;
  } catch {
    return false;
  }
}

/** Full diagnostics for us (console); the user sees the message + "Technical details". */
function reportError(err, context = {}) {
  console.groupCollapsed(`[nishchit] ${err?.code ?? 'error'}: ${err?.message}`);
  if (typeof err?.diagnostics === 'function') console.table(Object.fromEntries(err.diagnostics()));
  if (Object.keys(context).length) console.log('context', context);
  console.error(err);
  console.groupEnd();
}

bootstrap().catch((err) => {
  console.error(err);
  const el = document.getElementById('form-error');
  if (el) {
    el.textContent = `The app failed to start: ${err?.message ?? err}. Please reload the page.`;
    el.hidden = false;
  }
});
