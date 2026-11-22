import { freeWithin, spanStatus } from '../domain/berths.js';
import { chartSchedule, chartStage } from '../domain/chart.js';
import { compareCost, planJourney } from '../domain/engine.js';
import { estimateFare } from '../domain/fare.js';
import { legKm, stationIndex } from '../domain/route.js';

/**
 * Application service: turns a validated query + chart into a view model.
 * Runs the engine once per class (fallback ladder rung 3: "same train, another class")
 * and merges the results. Pure given its inputs, which keeps it unit-testable.
 */
export function buildSearchResult({ train, chart, query, now = new Date(), chartRules, engineOptions }) {
  const origin = stationIndex(train.route, query.from);
  const destination = stationIndex(train.route, query.to);
  if (origin < 0 || destination < 0) throw new Error('Station is not on this train');
  if (origin >= destination) throw new Error('Boarding station must come before destination');

  const classes = query.cls === 'all' ? train.classes : [query.cls];
  const schedule = chartSchedule(query.date, train.route[0].depAbs, chartRules);
  const stage = chartStage(schedule, now);

  const perClass = classes.map((cls) => {
    const berths = chart.berths.filter((b) => b.cls === cls);
    const result = planJourney({
      route: train.route,
      berths,
      origin,
      destination,
      partySize: query.party,
      coachOrder: train.composition,
      options: engineOptions,
    });
    return { cls, ...result };
  });

  const plans = perClass
    .flatMap((r) => r.plans.map((p) => ({ ...p, cls: r.cls })))
    .sort((a, b) => compareCost(a.cost, b.cost));

  const partial = pickBest(perClass, 'partial', (x) => x.reachedIndex, true);
  const boardLater = pickBest(perClass, 'boardLater', (x) => x.boardIndex, false);
  const stitched = perClass
    .filter((r) => r.stitched)
    .map((r) => ({ ...r.stitched, cls: r.cls }))
    .sort((a, b) => compareCost(a.cost, b.cost))[0] ?? null;

  const inClasses = chart.berths.filter((b) => classes.includes(b.cls));
  const seats = inClasses
    .map((berth) => ({ berth, status: spanStatus(berth, origin, destination), spans: freeWithin(berth, origin, destination) }))
    .filter((s) => s.status !== 'booked')
    .sort((a, b) => rankStatus(a.status) - rankStatus(b.status) || coachCmp(train, a.berth, b.berth));

  const coaches = train.composition
    .filter((c) => inClasses.some((b) => b.coach === c))
    .map((coach) => {
      const berths = inClasses.filter((b) => b.coach === coach);
      const statuses = berths.map((b) => ({ berth: b, status: spanStatus(b, origin, destination) }));
      return {
        coach,
        cls: berths[0].cls,
        berths: statuses,
        full: statuses.filter((s) => s.status === 'full').length,
        partial: statuses.filter((s) => s.status === 'partial').length,
      };
    });

  const throughFares = Object.fromEntries(
    classes.map((cls) => [cls, estimateFare(cls, legKm(train.route, origin, destination)) * query.party]),
  );

  return {
    query,
    train,
    origin,
    destination,
    schedule,
    stage,
    source: chart.source,
    via: chart.via,
    warnings: chart.warnings ?? [],
    fetchedAt: chart.fetchedAt,
    status: plans.length ? 'full' : partial || boardLater || stitched ? 'partial' : 'none',
    plans: plans.slice(0, 5),
    partial,
    boardLater,
    stitched,
    seats,
    coaches,
    throughFares,
    totals: {
      full: seats.filter((s) => s.status === 'full').length,
      partial: seats.filter((s) => s.status === 'partial').length,
    },
  };
}

function pickBest(perClass, field, score, higherIsBetter) {
  let best = null;
  for (const r of perClass) {
    const item = r[field];
    if (!item) continue;
    const better = !best || (higherIsBetter ? score(item) > score(best) : score(item) < score(best));
    if (better) best = { ...item, cls: r.cls };
  }
  return best;
}

function rankStatus(status) {
  return status === 'full' ? 0 : 1;
}

function coachCmp(train, a, b) {
  const order = train.composition;
  return order.indexOf(a.coach) - order.indexOf(b.coach) || a.number - b.number;
}
