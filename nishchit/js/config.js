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
   * A page can't call IRCTC itself (IRCTC's CORS only allows its own origins), so requests go
   * to a proxy with the same paths:
   *   - `base` below: the deployed Cloudflare Worker (worker/index.js). Production.
   *   - ?proxy=<url> overrides it (testing another deployment).
   *   - on localhost with server.mjs running, the page's own origin (dev).
   */
  live: {
    base: 'https://nishchit-proxy.krupal.workers.dev', // deployed Worker (worker/); ?proxy=<url> overrides
    // The chart is two POST calls: trainComposition (coach list + chart status), then
    // coachComposition per coach (berths + per-segment occupancy). See js/data/irctc/.
    endpoints: {
      schedule: 'eticketing/protected/mapps1/trnscheduleenquiry/{train}',
      trainComposition: 'online-charts/api/trainComposition',
      coachComposition: 'online-charts/api/coachComposition',
    },
    coachGapMs: 500, // IRCTC throttling courtesy; one coachComposition at a time
  },

  chartsUrl: 'https://www.irctc.co.in/online-charts/',
});
