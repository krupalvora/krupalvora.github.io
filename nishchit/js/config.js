import { DEFAULT_CHART_RULES } from './domain/chart.js';
import { DEFAULT_ENGINE_OPTIONS } from './domain/engine.js';

/**
 * Single place for tunables. Chart rules changed twice in 2025, so they live here,
 * not in code paths.
 */
export const CONFIG = Object.freeze({
  chartRules: DEFAULT_CHART_RULES,
  engine: DEFAULT_ENGINE_OPTIONS,
  partySizes: [1, 2, 3, 4],

  /**
   * IRCTC data. There is no simulated/demo data: every search hits IRCTC.
   *
   * A page can't call IRCTC itself (CORS + Akamai session), so requests go through either:
   *   1. the Nishchit Connector extension (/connector) — runs them inside an irctc.co.in tab
   *      in the user's own browser, with their cookies and IP. Used whenever it's installed.
   *   2. a proxy: ?proxy=<url>, `base` below, or the page's own origin on localhost
   *      (server.mjs). Dev only — a hosted proxy shares one IP and gets blocked.
   * Endpoint paths are relative to the IRCTC origin / proxy base.
   */
  live: {
    base: '', // optional proxy base; leave empty to rely on the extension
    // The chart is two POST calls: trainComposition (coach list + chart status), then
    // coachComposition per coach (berths + per-segment occupancy). See js/data/irctc/.
    endpoints: {
      schedule: 'eticketing/protected/mapps1/trnscheduleenquiry/{train}',
      trainComposition: 'online-charts/api/trainComposition',
      coachComposition: 'online-charts/api/coachComposition',
    },
    coachGapMs: 500, // IRCTC throttling courtesy; one coachComposition at a time
  },

  connector: {
    // Built by `npm run pack:connector`; linked from the setup card.
    downloadUrl: new URL('../assets/nishchit-connector.zip', import.meta.url).href,
    chartsUrl: 'https://www.irctc.co.in/online-charts',
  },
});
