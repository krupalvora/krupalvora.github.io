/**
 * VacancyProvider contract - every data source implements these two methods, so the UI
 * and engine never know where data comes from.
 *
 *   getTrain(number, { signal }) -> Promise<Train|null>
 *     Train = { number, name, classes, composition, route (normalized) }
 *
 *   getChart({ train, date, classes, signal }) -> Promise<Chart>
 *     Chart = { berths, source: 'live', via, fetchedAt: Date, warnings: string[] }
 *
 * The only implementation is IrctcProvider (real IRCTC data). There is no simulated or demo
 * fallback: if IRCTC can't be reached, the user sees exactly why.
 */

/**
 * An error the user should see as-is. `message` is written for the traveller; the other
 * fields are the technical facts a developer needs to debug it (shown under "Technical
 * details" and logged to the console).
 */
export class ProviderError extends Error {
  /**
   * @param {string} message plain-language explanation for the user
   * @param {string} code    stable machine code: no-source | network | blocked | forbidden |
   *                         timeout | upstream | parse | no-chart | not-found
   * @param {object} [info]
   * @param {string} [info.hint]     what the user can do about it
   * @param {number} [info.status]   HTTP status from IRCTC / the proxy
   * @param {string} [info.endpoint] request path that failed
   * @param {string} [info.via]      transport, e.g. 'proxy'
   * @param {string} [info.detail]   raw upstream text (IRCTC message, Akamai reference, body excerpt)
   * @param {unknown} [info.cause]
   */
  constructor(message, code, { hint, status, endpoint, via, detail, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ProviderError';
    this.code = code;
    this.hint = hint;
    this.status = status;
    this.endpoint = endpoint;
    this.via = via;
    this.detail = detail;
    this.at = new Date().toISOString();
  }

  /** Key/value pairs for the "Technical details" panel and bug reports. */
  diagnostics() {
    return [
      ['Error code', this.code],
      ['HTTP status', this.status],
      ['Request', this.endpoint],
      ['Route', this.via],
      ['IRCTC said', this.detail],
      ['Underlying error', this.cause instanceof Error ? `${this.cause.name}: ${this.cause.message}` : undefined],
      ['Time', this.at],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  }
}

/**
 * Used when no route to IRCTC exists (no proxy configured). Every call fails with the
 * setup instructions instead of silently falling back to made-up data.
 */
export class NoSourceProvider {
  constructor(error) {
    this.error = error;
  }

  async getTrain() {
    throw this.error;
  }

  async getChart() {
    throw this.error;
  }
}
