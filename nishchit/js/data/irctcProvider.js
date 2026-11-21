import { CLASSES } from '../domain/berths.js';
import { mapSchedule } from './irctc/mapSchedule.js';
import { assembleChart, parseCoachComposition, parseTrainComposition } from './irctc/mapChart.js';
import { ProviderError } from './provider.js';

/**
 * Live IRCTC data provider. Same contract as StaticProvider (getTrain / getChart).
 *
 * IMPORTANT: `base` must be a proxy YOU control, not www.irctc.co.in directly. A browser on a
 * different origin cannot read IRCTC's responses (its CORS header allows only IRCTC's own
 * origins), and every IRCTC call needs a live Akamai session (the _abck / bm_* cookies and
 * greq / bmirak headers). The proxy holds that session and re-exposes clean JSON on your
 * origin. See README for a minimal proxy.
 */
export class IrctcProvider {
  constructor({ base, endpoints, coachGapMs = 0, maxRetries = 2, fetchFn = globalThis.fetch.bind(globalThis) }) {
    if (!base) throw new Error('IrctcProvider needs a proxy base URL (CONFIG.live.base).');
    this.base = base.endsWith('/') ? base : `${base}/`;
    this.endpoints = endpoints;
    this.coachGapMs = coachGapMs;
    this.maxRetries = maxRetries;
    this.fetchFn = fetchFn;
    this.trainCache = new Map();
    this.chartCache = new Map();
  }

  async getTrain(number, { signal } = {}) {
    if (!/^\d{4,5}$/.test(number)) return null;
    if (this.trainCache.has(number)) return this.trainCache.get(number);

    const url = this.url(this.endpoints.schedule, { train: number });
    const raw = await this.getJson(url, signal, `train ${number}`);
    if (raw === null) return null; // 404 = unknown train
    let train;
    try {
      train = mapSchedule(raw);
    } catch (err) {
      throw new ProviderError(`IRCTC schedule for ${number} could not be read: ${err.message}`, 'parse');
    }
    this.trainCache.set(number, train);
    return train;
  }

  /**
   * Two-call flow: trainComposition -> coach list + chart status, then coachComposition for
   * each coach (sequentially, with a courtesy gap). bsd[] segments carry per-segment
   * occupancy; buildBerths turns the vacant ones into free intervals.
   */
  /**
   * @param {object} p
   * @param {string[]} [p.classes] limit the coachComposition fetches to these classes (e.g.
   *   just the class the user searched). Each coach call is a separate IRCTC round-trip, so
   *   fetching one class instead of all three is markedly faster. Omit for every class.
   */
  async getChart({ train, date, classes = null, signal }) {
    const key = `${train.number}|${date}|${classes ? classes.join(',') : 'all'}`;
    if (this.chartCache.has(key)) return this.chartCache.get(key);

    const boarding = train.route[0].code;
    const compRaw = await this.post(
      this.endpoints.trainComposition,
      { trainNo: train.number, jDate: date, boardingStation: boarding },
      signal,
      `composition for ${train.number}`,
    );
    let composition;
    try {
      composition = parseTrainComposition(compRaw);
    } catch (err) {
      throw new ProviderError(err.message, 'parse');
    }
    if (!composition.prepared || !composition.coaches.length) {
      throw new ProviderError('Chart not prepared yet for this train and date.', 'no-chart');
    }

    const source = composition.source ?? boarding;
    const remote = composition.remote ?? source;

    // Only fetch coaches of classes the planner models (SL / 3A / 2A), and, when the caller
    // named classes, only those — each coach is a separate IRCTC round-trip.
    const wanted = composition.coaches.filter((c) => CLASSES[c.cls] && (!classes || classes.includes(c.cls)));

    const coachCharts = new Map();
    for (const [i, coach] of wanted.entries()) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (i > 0 && this.coachGapMs) await delay(this.coachGapMs, signal);
      const raw = await this.post(
        this.endpoints.coachComposition,
        {
          trainNo: train.number,
          jDate: date,
          boardingStation: boarding,
          remoteStation: remote,
          trainSourceStation: source,
          coach: coach.coach,
          cls: coach.cls,
        },
        signal,
        `coach ${coach.coach}`,
      );
      coachCharts.set(coach.coach, parseCoachComposition(raw));
    }

    const chart = assembleChart(composition, coachCharts, train.route);
    if (chart.composition.length) train.composition = chart.composition;
    if (chart.classes.length) train.classes = chart.classes;
    this.chartCache.set(key, chart);
    return chart;
  }

  url(template, params = {}) {
    const path = template.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(params[k] ?? ''));
    return new URL(path, this.base);
  }

  getJson(url, signal, what) {
    return this.send(url, { method: 'GET' }, signal, what);
  }

  post(template, body, signal, what) {
    return this.send(this.url(template), { method: 'POST', body: JSON.stringify(body) }, signal, what);
  }

  async send(url, init, signal, what) {
    // IRCTC's endpoints are slow and occasionally return 502/503/504; retry those a couple of
    // times with a short backoff before giving up.
    const RETRY_STATUS = new Set([502, 503, 504]);
    let lastErr;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) await delay(400 * attempt, signal);
      let res;
      try {
        res = await this.fetchFn(url, {
          ...init,
          signal,
          credentials: 'include',
          headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
            bmirak: 'webbm',
            greq: String(Date.now()),
          },
        });
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        lastErr = new ProviderError(`Could not reach the data proxy for ${what}. Is CONFIG.live.base correct and running?`, 'network');
        continue;
      }
      if (res.status === 404) return null;
      if (res.status === 403) throw new ProviderError('IRCTC refused the request (session expired on the proxy).', 'forbidden');
      if (RETRY_STATUS.has(res.status)) {
        lastErr = new ProviderError(`IRCTC timed out (${res.status}) for ${what}.`, 'timeout');
        continue;
      }
      if (!res.ok) throw new ProviderError(`Proxy returned ${res.status} for ${what}.`, 'network');
      try {
        return await res.json();
      } catch {
        throw new ProviderError(`Proxy did not return JSON for ${what}.`, 'parse');
      }
    }
    throw lastErr;
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
