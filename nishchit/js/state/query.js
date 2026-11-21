/**
 * The search query is the single source of truth for the form and lives in the URL,
 * so results are shareable and the back button works.
 *   ?train=19017&date=2026-11-21&from=BVI&to=ANND&cls=all&party=1
 */
import { fromISODate } from '../domain/time.js';

export const CLASS_FILTERS = ['all', 'SL', '3A', '2A'];

export function emptyQuery(today) {
  return { train: '', date: today, from: '', to: '', cls: 'all', party: 1 };
}

/** Parse untrusted URL params into a query; invalid values fall back to defaults. */
export function queryFromParams(params, today) {
  const q = emptyQuery(today);
  const train = params.get('train') ?? '';
  if (/^\d{5}$/.test(train)) q.train = train;

  const date = params.get('date');
  if (date) {
    try {
      fromISODate(date);
      q.date = date;
    } catch {
      /* keep default */
    }
  }

  const station = /^[A-Z]{1,5}$/;
  const from = (params.get('from') ?? '').toUpperCase();
  const to = (params.get('to') ?? '').toUpperCase();
  if (station.test(from)) q.from = from;
  if (station.test(to)) q.to = to;

  const cls = params.get('cls');
  if (CLASS_FILTERS.includes(cls)) q.cls = cls;

  const party = Number(params.get('party'));
  if (Number.isInteger(party) && party >= 1 && party <= 4) q.party = party;
  return q;
}

export function queryToParams(q) {
  const p = new URLSearchParams();
  if (q.train) p.set('train', q.train);
  if (q.date) p.set('date', q.date);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.cls !== 'all') p.set('cls', q.cls);
  if (q.party !== 1) p.set('party', String(q.party));
  return p;
}

export function isComplete(q) {
  return Boolean(q.train && q.date && q.from && q.to && q.from !== q.to);
}
