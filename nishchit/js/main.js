import { CONFIG } from './config.js';
import { buildSearchResult } from './app/search.js';
import { CONNECTOR_BASE, connectorFetch, detectConnector } from './data/connector.js';
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
  if (!via) results.renderSetup(CONFIG.connector);
  else console.info(`[nishchit] IRCTC data via ${via}`);

  let inFlight = null;

  const form = new SearchForm({
    root: document.getElementById('search-form'),
    provider,
    today,
    partySizes: CONFIG.partySizes,
    chartRules: CONFIG.chartRules,
    onError: reportError,
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
      reportError(err, { query });
      if (err?.code === 'no-source') results.renderSetup(CONFIG.connector);
      else results.renderError(err);
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
    else if (via) results.hide(); // keep the setup card visible when there's no route to IRCTC
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
 * Pick how requests reach IRCTC. There is no demo fallback.
 *   1. ?proxy=<url> (or CONFIG.live.base) — explicit proxy.
 *   2. Nishchit Connector extension — requests run in the user's own browser. Production.
 *   3. localhost with server.mjs running — same-origin dev proxy.
 *   4. none — every call fails with setup instructions.
 */
async function selectProvider() {
  const params = new URLSearchParams(location.search);
  const live = CONFIG.live;
  const common = { endpoints: live.endpoints, coachGapMs: live.coachGapMs };

  const explicitProxy = params.get('proxy') || live.base;
  if (explicitProxy) return { via: 'proxy', provider: new IrctcProvider({ ...common, base: explicitProxy, via: 'proxy' }) };

  const version = await detectConnector();
  if (version) {
    return { via: `connector v${version}`, provider: new IrctcProvider({ ...common, base: CONNECTOR_BASE, via: 'connector', fetchFn: connectorFetch }) };
  }

  if (await devProxyRunning()) return { via: 'proxy', provider: new IrctcProvider({ ...common, base: location.origin, via: 'proxy' }) };

  return {
    via: null,
    provider: new NoSourceProvider(
      new ProviderError('Nishchit reads the chart from IRCTC through your own browser, and the Nishchit Connector extension is not installed.', 'no-source', {
        hint: 'Install the connector (see the card below), reload this page, then search again.',
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
