import { CLASSES } from '../domain/berths.js';
import { mapSchedule } from './irctc/mapSchedule.js';
import { assembleChart, parseCoachComposition, parseTrainComposition } from './irctc/mapChart.js';
import { ProviderError } from './provider.js';

/**
 * Live IRCTC data provider (getTrain / getChart).
 *
 * `base` is a proxy with IRCTC's paths: the Cloudflare Worker in worker/ (production) or
 * server.mjs on localhost (dev). A page cannot call IRCTC directly: IRCTC's CORS header only
 * allows its own origins. If IRCTC blocks the proxy, the proxy says so ({ blocked: true }) and
 * the user sees that, with a link to check the chart on IRCTC themselves.
 */
export class IrctcProvider {
  constructor({ base, endpoints, via = 'proxy', chartsUrl = 'https://www.irctc.co.in/online-charts/', coachGapMs = 0, maxRetries = 1, requestTimeoutMs = 12000, fetchFn = globalThis.fetch.bind(globalThis) }) {
    if (!base) throw new Error('IrctcProvider needs a base URL.');
    this.base = base.endsWith('/') ? base : `${base}/`;
    this.endpoints = endpoints;
    this.via = via;
    this.chartsUrl = chartsUrl;
    this.coachGapMs = coachGapMs;
    this.maxRetries = maxRetries;
    // Akamai's edge holds a doomed request ~60s before returning 504, so without a client
    // deadline one bad coach stalls the whole chart. Give up fast and mark that coach missing;
    // progressive rendering already shows the coaches that did come back.
    this.requestTimeoutMs = requestTimeoutMs;
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
    const irctcError = raw?.errorMessage || raw?.error;
    if (irctcError) {
      throw new ProviderError(`IRCTC: ${irctcError}`, 'upstream', { endpoint: url.pathname, via: this.via, detail: String(irctcError) });
    }
    let train;
    try {
      train = mapSchedule(raw);
    } catch (err) {
      throw new ProviderError(`IRCTC's schedule for train ${number} is in a format Nishchit doesn't understand.`, 'parse', {
        endpoint: url.pathname,
        via: this.via,
        detail: err.message,
        cause: err,
      });
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
  async getChart({ train, date, classes = null, signal, onProgress = null }) {
    const key = `${train.number}|${date}|${classes ? classes.join(',') : 'all'}`;
    if (this.chartCache.has(key)) return this.chartCache.get(key);

    const boarding = train.route[0].code;
    const compRaw = await this.post(
      this.endpoints.trainComposition,
      { trainNo: train.number, jDate: date, boardingStation: boarding },
      signal,
      `composition for ${train.number}`,
    );
    const compEndpoint = `POST /${this.endpoints.trainComposition}`;
    if (compRaw === null) {
      throw new ProviderError(`IRCTC has no chart for train ${train.number} on ${date}.`, 'no-chart', {
        status: 404,
        endpoint: compEndpoint,
        via: this.via,
        hint: 'Check the date: the train may not run that day.',
      });
    }
    if (compRaw?.error) {
      // IRCTC answers 200 with { error: "..." } for "chart not prepared", "train not running", etc.
      throw new ProviderError(`IRCTC: ${compRaw.error}`, 'no-chart', { endpoint: compEndpoint, via: this.via, detail: String(compRaw.error) });
    }
    let composition;
    try {
      composition = parseTrainComposition(compRaw);
    } catch (err) {
      throw new ProviderError(`IRCTC's chart for train ${train.number} is in a format Nishchit doesn't understand.`, 'parse', {
        endpoint: compEndpoint,
        via: this.via,
        detail: err.message,
        cause: err,
      });
    }
    if (!composition.prepared || !composition.coaches.length) {
      throw new ProviderError(`IRCTC has not prepared the reservation chart for train ${train.number} on ${date} yet.`, 'no-chart', {
        endpoint: compEndpoint,
        via: this.via,
        hint: 'The first chart is usually out about 4 hours before departure from the source station.',
      });
    }

    const source = composition.source ?? boarding;
    const remote = composition.remote ?? source;

    // Only fetch coaches of classes the planner models (SL / 3A / 2A), and, when the caller
    // named classes, only those — each coach is a separate IRCTC round-trip.
    const wanted = composition.coaches.filter((c) => CLASSES[c.cls] && (!classes || classes.includes(c.cls)));

    const coachCharts = new Map();
    const warnings = [];
    // Each coach is a separate IRCTC round-trip, so the whole chart takes a while. Emit a
    // partial chart after every coach so the UI can show berths as they arrive.
    onProgress?.({ done: 0, total: wanted.length, chart: null });
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
      // One coach failing should not sink the whole chart, but the user must know it's missing.
      if (raw === null || raw?.error) warnings.push(`Coach ${coach.coach}: ${raw?.error ?? 'IRCTC returned no data'} — its berths are not shown.`);
      coachCharts.set(coach.coach, parseCoachComposition(raw));
      if (onProgress && !signal?.aborted) {
        const partial = { ...assembleChart(composition, coachCharts, train.route), via: this.via, warnings: [...warnings], partial: i + 1 < wanted.length };
        onProgress({ done: i + 1, total: wanted.length, chart: partial });
      }
    }
    if (wanted.length && warnings.length === wanted.length) {
      throw new ProviderError(`IRCTC returned no berth data for any coach of train ${train.number}.`, 'upstream', {
        endpoint: `POST /${this.endpoints.coachComposition}`,
        via: this.via,
        detail: warnings.join('\n'),
      });
    }

    const chart = { ...assembleChart(composition, coachCharts, train.route), via: this.via, warnings };
    if (chart.composition.length) train.composition = chart.composition;
    if (chart.classes.length) train.classes = chart.classes;
    this.chartCache.set(key, chart);
    return chart;
  }

  url(template, params = {}) {
    const path = template.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(params[k] ?? ''));
    return new URL(path, this.base);
  }

  /**
   * A per-request deadline: returns an AbortSignal that fires if the caller aborts OR if
   * requestTimeoutMs elapses, plus `timedOut` to tell the two apart and `clear()` to tidy up.
   */
  armTimeout(signal) {
    const ctl = new AbortController();
    const state = { signal: ctl.signal, timedOut: false, clear: () => {} };
    if (!this.requestTimeoutMs) {
      // No deadline: pass the caller's signal straight through.
      return { signal: signal ?? ctl.signal, timedOut: false, clear: () => {} };
    }
    const timer = setTimeout(() => {
      state.timedOut = true;
      ctl.abort();
    }, this.requestTimeoutMs);
    const onAbort = () => ctl.abort();
    if (signal) {
      if (signal.aborted) ctl.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    state.clear = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    return state;
  }

  getJson(url, signal, what) {
    return this.send(url, { method: 'GET' }, signal, what);
  }

  post(template, body, signal, what) {
    return this.send(this.url(template), { method: 'POST', body: JSON.stringify(body) }, signal, what);
  }

  /**
   * One IRCTC call. Retries 502/503/504 (IRCTC is slow and its Akamai edge times out) a
   * couple of times; every other failure becomes a ProviderError carrying what really
   * happened — status, endpoint, IRCTC's own message / Akamai reference — never a guess.
   */
  async send(url, init, signal, what) {
    const RETRY_STATUS = new Set([502, 503, 504]);
    const endpoint = `${init.method} ${url.pathname}`;
    const via = this.via;
    const meta = (extra) => ({ endpoint, via, ...extra });
    let lastErr;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) await delay(400 * attempt, signal);
      let res;
      const deadline = this.armTimeout(signal);
      try {
        res = await this.fetchFn(url, {
          ...init,
          signal: deadline.signal,
          headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
          },
        });
      } catch (err) {
        // A user-initiated abort propagates; our own deadline becomes a retryable timeout.
        if (signal?.aborted) throw err;
        if (deadline.timedOut) {
          lastErr = new ProviderError(`IRCTC did not respond in time for ${what} (timed out after ${Math.round(this.requestTimeoutMs / 1000)}s).`, 'timeout', meta({
            hint: 'IRCTC is slow or blocking right now. The rest of the chart is still shown.',
          }));
          continue;
        }
        if (err?.name === 'AbortError') throw err;
        lastErr = new ProviderError(`Could not reach Nishchit's data server for ${what}.`, 'network', meta({
          hint: 'Check your internet connection and try again.',
          cause: err,
        }));
        continue;
      } finally {
        deadline.clear();
      }

      const text = await res.text().catch(() => '');
      const status = res.status;
      if (status === 404) return null;
      const blocked = parseBlocked(text);
      if (blocked) {
        throw new ProviderError("IRCTC is blocking Nishchit's server right now, so the live chart can't be fetched.", 'blocked', meta({
          status: blocked.upstreamStatus ?? status,
          detail: [
            blocked.reason ?? `IRCTC answered HTTP ${blocked.upstreamStatus ?? '?'}`,
            blocked.reference ? `Akamai reference #${blocked.reference}` : null,
            blocked.since ? `blocked since ${blocked.since}` : null,
          ].filter(Boolean).join(', '),
          hint: `Check the chart directly on IRCTC: ${this.chartsUrl}. You can try Nishchit again in about ${Math.round((blocked.retryAfterSeconds ?? 120) / 60)} min.`,
        }));
      }
      if (RETRY_STATUS.has(status)) {
        lastErr = new ProviderError(`IRCTC did not respond in time for ${what} (HTTP ${status}).`, 'timeout', meta({
          status,
          detail: describeBody(text),
          hint: 'IRCTC is overloaded right now. Wait a minute and search again.',
        }));
        continue;
      }
      if (status === 403 || status === 401) {
        throw new ProviderError(`IRCTC refused the request for ${what} (HTTP ${status}).`, 'forbidden', meta({
          status,
          detail: describeBody(text),
          hint: `Check the chart directly on IRCTC: ${this.chartsUrl}`,
        }));
      }
      if (status === 429) {
        throw new ProviderError(`IRCTC is rate-limiting requests for ${what} (HTTP 429).`, 'upstream', meta({
          status,
          detail: describeBody(text),
          hint: 'Wait a few minutes before searching again.',
        }));
      }
      if (status < 200 || status >= 300) {
        throw new ProviderError(`IRCTC returned an error for ${what} (HTTP ${status}).`, 'upstream', meta({ status, detail: describeBody(text) }));
      }
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new ProviderError(`IRCTC sent a response for ${what} that is not data (likely an error page).`, 'parse', meta({
          status,
          detail: describeBody(text),
          cause: err,
        }));
      }
    }
    throw lastErr;
  }
}

/** The Worker's { blocked: true, ... } answer, or null. */
function parseBlocked(text) {
  if (!text || !text.includes('"blocked"')) return null;
  try {
    const data = JSON.parse(text);
    return data?.blocked === true ? data : null;
  } catch {
    return null;
  }
}

/**
 * Best human-readable summary of an IRCTC response body: its JSON error field, the Akamai
 * edge reference (needed to quote to IRCTC), or a short excerpt of the text.
 */
export function describeBody(text) {
  if (!text) return '';
  try {
    const json = JSON.parse(text);
    const msg = json?.error || json?.errorMessage || json?.message || json?.errorMsg;
    if (msg) return String(msg);
  } catch {
    /* not JSON */
  }
  const decoded = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  const ref = /Reference\s*#\s*([\w.]+)/i.exec(decoded);
  const plain = decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (ref) return `Akamai edge error, reference #${ref[1]}${/access denied/i.test(plain) ? ' (Access Denied)' : ''}`;
  return plain.length > 240 ? `${plain.slice(0, 240)}…` : plain;
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
