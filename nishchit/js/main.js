import { CONFIG } from './config.js';
import { buildSearchResult } from './app/search.js';
import { IrctcProvider } from './data/irctcProvider.js';
import { NoSourceProvider, ProviderError } from './data/provider.js';
import { toISODate } from './domain/time.js';
import { isComplete, queryFromParams, queryToParams } from './state/query.js';
import { hydrateIcons } from './ui/dom.js';
import { createResultsView } from './ui/results.js';
import { SearchForm } from './ui/searchForm.js';

/**
 * Composition root.
 * Flow: form submit -> URL update -> search() -> provider.getChart -> engine -> render.
 */
async function bootstrap() {
  hydrateIcons();

  const today = toISODate(new Date());
  const { provider, via } = await selectProvider();
  const results = createResultsView({ root: document.getElementById('results') });
  if (via) console.info(`[nishchit] IRCTC data via ${via}`);

  let inFlight = null;

  const form = new SearchForm({
    root: document.getElementById('search-form'),
    provider,
    today,
    partySizes: CONFIG.partySizes,
    chartRules: CONFIG.chartRules,
    onError: (err, context) => {
      reportError(err, context);
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
      reportError(err, { query });
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
 * Pick the proxy that reaches IRCTC. There is no demo fallback.
 *   1. ?proxy=<url> — explicit override (tests, trying another deployment).
 *   2. localhost with server.mjs running — the local dev proxy wins over the deployed Worker,
 *      so local runs use your own IRCTC session.
 *   3. CONFIG.live.base — the deployed Worker (production / Pages).
 *   4. none — every search fails with a clear "not configured" error.
 */
async function selectProvider() {
  const params = new URLSearchParams(location.search);
  const live = CONFIG.live;
  const common = { endpoints: live.endpoints, coachGapMs: live.coachGapMs, chartsUrl: CONFIG.chartsUrl };

  const base = params.get('proxy') || ((await devProxyRunning()) ? location.origin : '') || live.base;
  if (base) return { via: 'proxy', provider: new IrctcProvider({ ...common, base, via: 'proxy' }) };

  return {
    via: null,
    provider: new NoSourceProvider(
      new ProviderError("Nishchit's data server is not configured, so it can't fetch charts from IRCTC.", 'no-source', {
        hint: `You can still check the chart directly on IRCTC: ${CONFIG.chartsUrl}`,
      }),
    ),
  };
}

/** server.mjs answers /__nishchit/health; a plain static server (or Pages) does not. */
async function devProxyRunning() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return false;
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
