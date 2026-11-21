import { CONFIG } from './config.js';
import { buildSearchResult } from './app/search.js';
import { StaticProvider } from './data/provider.js';
import { IrctcProvider } from './data/irctcProvider.js';
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
  const { provider, notFoundHint } = selectProvider();
  const results = createResultsView({ root: document.getElementById('results') });

  let inFlight = null;

  const form = new SearchForm({
    root: document.getElementById('search-form'),
    provider,
    today,
    partySizes: CONFIG.partySizes,
    chartRules: CONFIG.chartRules,
    notFoundHint,
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
      if (!train) throw new Error(`Train ${query.train} was not found.`);
      const chart = await provider.getChart({
        train,
        date: query.date,
        classes: query.cls === 'all' ? null : [query.cls],
        signal: controller.signal,
      });
      const result = buildSearchResult({ train, chart, query, chartRules: CONFIG.chartRules, engineOptions: CONFIG.engine });
      if (!controller.signal.aborted) results.render(result);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error(err);
      results.renderError(err?.message || 'Unexpected error while reading the chart.');
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
    else results.hide();
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
 * Live needs a local proxy (server.mjs) — it can't run on a static host like GitHub Pages
 * (no server, and IRCTC's CORS + Akamai block direct calls). So live is enabled only when:
 *   - an explicit ?proxy=<url> is given (use it anywhere), OR
 *   - the page is served from localhost (the dev server), where same-origin = the proxy.
 * On the deployed Pages site the simulated StaticProvider is always used, so it just works.
 */
function selectProvider() {
  const params = new URLSearchParams(location.search);
  const forceDemo = params.get('demo') === '1';
  const isLocal = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  const proxyParam = params.get('proxy');
  const base = proxyParam || CONFIG.live.base || (isLocal ? location.origin : '');
  const wantLive = !forceDemo && Boolean(proxyParam || CONFIG.live.enabled || params.get('live') === '1') && Boolean(base);

  if (wantLive) {
    return {
      provider: new IrctcProvider({ base, endpoints: CONFIG.live.endpoints, coachGapMs: CONFIG.live.coachGapMs }),
      notFoundHint: 'Check the train number.',
    };
  }
  if (!forceDemo && !base && (params.get('live') === '1' || CONFIG.live.enabled)) {
    console.info('Live mode needs a local proxy (?proxy=… or run server.mjs); using simulated data.');
  }
  return {
    provider: new StaticProvider({ baseUrl: CONFIG.dataBaseUrl, latencyMs: CONFIG.simulatedLatencyMs }),
    notFoundHint: 'Demo data has 19017, 12901 and 12933.',
  };
}

bootstrap().catch((err) => {
  console.error(err);
  const el = document.getElementById('form-error');
  if (el) {
    el.textContent = 'The app failed to start. Please reload the page.';
    el.hidden = false;
  }
});
