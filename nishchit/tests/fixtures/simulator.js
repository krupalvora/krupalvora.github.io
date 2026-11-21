import { CLASSES, berthId, berthType } from '../../js/domain/berths.js';
import { hashString, seededRandom } from './random.js';

/**
 * TEST FIXTURE ONLY — simulated reservation chart for engine and e2e tests. Never used by the app.
 *
 * Walks each berth segment by segment: most passengers ride far, a few board or alight
 * mid-route, and occasionally a stretch is left empty. Deterministic for a given
 * train + date, so a refresh or a shared link shows the same chart.
 */
const EMPTY_PROBABILITY = Object.freeze({ SL: 0.1, '3A': 0.09, '2A': 0.16 });
const FULLY_EMPTY_PROBABILITY = 0.006;

export function simulateChart(train, journeyDate) {
  const segments = train.route.length - 1;
  const berths = [];

  for (const coach of train.composition) {
    const cls = classOfCoach(coach, train.classes);
    const spec = CLASSES[cls];
    const rand = seededRandom(hashString(`${train.number}|${journeyDate}|${coach}`));

    for (let number = 1; number <= spec.berths; number += 1) {
      berths.push({
        id: berthId(coach, number),
        coach,
        number,
        cls,
        type: berthType(cls, number),
        free: simulateBerth(rand, segments, EMPTY_PROBABILITY[cls]),
      });
    }
  }
  return berths;
}

function simulateBerth(rand, segments, pEmpty) {
  if (rand() < FULLY_EMPTY_PROBABILITY) return [{ from: 0, to: segments }];

  const free = [];
  let i = 0;
  while (i < segments) {
    const remaining = segments - i;
    if (rand() < pEmpty) {
      const len = Math.min(remaining, 1 + Math.floor(rand() * 3));
      const last = free[free.length - 1];
      if (last && last.to === i) last.to = i + len;
      else free.push({ from: i, to: i + len });
      i += len;
    } else {
      // Booked passenger: usually rides to the end, sometimes a shorter hop.
      const len = rand() < 0.55 ? remaining : 1 + Math.floor(rand() * remaining);
      i += len;
    }
  }
  return free;
}

function classOfCoach(coach, classes) {
  const cls = classes.find((c) => coach.startsWith(CLASSES[c].coachPrefix));
  if (!cls) throw new Error(`Coach ${coach} does not match any class in ${classes.join(',')}`);
  return cls;
}
