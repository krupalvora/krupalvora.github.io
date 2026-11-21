import { normalizeRoute } from '../domain/route.js';
import { simulateChart } from './simulator.js';

/**
 * VacancyProvider contract — every data source implements these two methods, so the UI
 * and engine never know where data comes from.
 *
 *   getTrain(number, { signal }) -> Promise<Train|null>
 *     Train = { number, name, classes, composition, route (normalized) }
 *
 *   getChart({ train, date, signal }) -> Promise<Chart>
 *     Chart = { berths, source: 'simulated'|'live', fetchedAt: Date }
 *
 * V1 ships StaticProvider (GitHub Pages: static JSON timetables + simulated chart).
 * A future provider can call a licensed feed or a backend proxy with the same contract.
 */

export class ProviderError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

export class StaticProvider {
  /** @param {{ baseUrl: URL, latencyMs?: number, fetchFn?: typeof fetch }} opts */
  constructor({ baseUrl, latencyMs = 0, fetchFn = globalThis.fetch.bind(globalThis) }) {
    this.baseUrl = baseUrl;
    this.latencyMs = latencyMs;
    this.fetchFn = fetchFn;
    this.cache = new Map();
  }

  async getTrain(number, { signal } = {}) {
    if (!/^\d{5}$/.test(number)) return null;
    if (this.cache.has(number)) return this.cache.get(number);

    const res = await this.fetchFn(new URL(`trains/${number}.json`, this.baseUrl), { signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new ProviderError(`Could not load train ${number} (${res.status})`, 'network');

    const raw = await res.json();
    const train = Object.freeze({ ...raw, route: normalizeRoute(raw.route) });
    this.cache.set(number, train);
    return train;
  }

  async getChart({ train, date, signal }) {
    await delay(this.latencyMs, signal);
    return { berths: simulateChart(train, date), source: 'simulated', fetchedAt: new Date() };
  }
}

function delay(ms, signal) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
