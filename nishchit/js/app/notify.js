/**
 * Tells the Nishchit mobile app (mobile/) when a search starts and ends, so it can notify the
 * user if they switched away while the chart was loading. A no-op in a normal browser.
 *
 *   page -> { type: 'nishchit:search-started' }
 *   page -> { type: 'nishchit:search-done', title, body }
 */
import { isNativeApp } from '../data/extensionBridge.js';

export function notifySearchStarted(win = globalThis.window) {
  if (isNativeApp(win)) win.postMessage({ type: 'nishchit:search-started' }, win.location.origin);
}

export function notifySearchDone(message, win = globalThis.window) {
  if (isNativeApp(win)) win.postMessage({ type: 'nishchit:search-done', ...message }, win.location.origin);
}

/** One-line outcome of a finished search, for a phone notification. */
export function summarizeResult(view) {
  const { query, train, plans = [], totals = {} } = view;
  const route = `${train?.number ?? query.train} · ${query.from} → ${query.to}`;
  if (plans.length) {
    const fewest = Math.min(...plans.map((p) => p.switches ?? 0));
    const how = fewest === 0 ? 'one berth for the whole trip' : `${fewest} switch${fewest > 1 ? 'es' : ''}`;
    return { title: 'Seat found', body: `${route}: ${plans.length} plan${plans.length > 1 ? 's' : ''}, best with ${how}.` };
  }
  if (view.status === 'partial') {
    return { title: 'Seats for part of the trip', body: `${route}: ${totals.partial ?? 0} berths free for part of the way. Tap to see the plan.` };
  }
  return { title: 'No vacant berths', body: `${route}: the chart has no free berths on your route right now.` };
}

export function summarizeError(err, query) {
  return { title: 'Could not load the chart', body: `${query.train} · ${query.from} → ${query.to}: ${err?.message ?? 'Something went wrong.'}` };
}
