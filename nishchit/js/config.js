import { DEFAULT_CHART_RULES } from './domain/chart.js';
import { DEFAULT_ENGINE_OPTIONS } from './domain/engine.js';

/**
 * Single place for tunables. Chart rules changed twice in 2025, so they live here,
 * not in code paths.
 */
export const CONFIG = Object.freeze({
  dataBaseUrl: new URL('../data/', import.meta.url),
  simulatedLatencyMs: 450,
  chartRules: DEFAULT_CHART_RULES,
  engine: DEFAULT_ENGINE_OPTIONS,
  partySizes: [1, 2, 3, 4],

  /**
   * Live IRCTC data.
   *
   * IRCTC's own endpoints cannot be called straight from a static page: their CORS header
   * only allows IRCTC's own origins, and every call needs a live Akamai Bot-Manager session
   * (the _abck / bm_* cookies and the greq / bmirak headers seen in the browser). So `base`
   * must point at a small proxy YOU run on your own origin, which refreshes those cookies,
   * calls IRCTC, and returns clean JSON. The page code never touches IRCTC directly.
   *
   * Turn it on with ?live=1 (and optionally &proxy=https://your-proxy) or by editing this.
   * Paths are relative to `base`.
   */
  live: {
    enabled: false,
    base: '', // e.g. 'https://nishchit-proxy.<you>.workers.dev'
    // The chart is two POST calls: trainComposition (coach list + chart status), then
    // coachComposition per coach (berths + per-segment occupancy). See js/data/irctc/.
    endpoints: {
      schedule: 'eticketing/protected/mapps1/trnscheduleenquiry/{train}',
      trainComposition: 'online-charts/api/trainComposition',
      coachComposition: 'online-charts/api/coachComposition',
    },
    coachGapMs: 500, // IRCTC throttling courtesy; one coachComposition at a time
  },
});
