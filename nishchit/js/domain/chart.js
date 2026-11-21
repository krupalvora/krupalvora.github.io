import { addDays, atMinutes, fromISODate } from './time.js';

/**
 * Chart timing rules (TRD, Nov 2026):
 *  - First chart: 10 hours before departure from the source station.
 *  - Trains leaving 05:01–14:00 get the first chart at 20:00 the previous day.
 *  - Second chart: ~30 minutes before departure.
 * Rules have changed twice in 2025, so the numbers live in config and are passed in.
 */
export const DEFAULT_CHART_RULES = Object.freeze({
  firstChartHoursBefore: 10,
  morningSlotStartMin: 5 * 60 + 1,
  morningSlotEndMin: 14 * 60,
  morningSlotChartAtMin: 20 * 60,
  secondChartMinutesBefore: 30,
});

export const CHART_STAGES = Object.freeze({
  NOT_PREPARED: 'not-prepared',
  FIRST: 'first',
  SECOND: 'second',
  DEPARTED: 'departed',
});

/**
 * @param {string} journeyDate "YYYY-MM-DD", the train's start date at its source station
 * @param {number} sourceDepMin source departure, minutes since midnight
 */
export function chartSchedule(journeyDate, sourceDepMin, rules = DEFAULT_CHART_RULES) {
  const day = fromISODate(journeyDate);
  const departure = atMinutes(day, sourceDepMin);
  const inMorningSlot =
    sourceDepMin >= rules.morningSlotStartMin && sourceDepMin <= rules.morningSlotEndMin;
  const firstChart = inMorningSlot
    ? atMinutes(addDays(day, -1), rules.morningSlotChartAtMin)
    : new Date(departure.getTime() - rules.firstChartHoursBefore * 3600_000);
  const secondChart = new Date(departure.getTime() - rules.secondChartMinutesBefore * 60_000);
  return { firstChart, secondChart, departure };
}

export function chartStage(schedule, now = new Date()) {
  if (now < schedule.firstChart) return CHART_STAGES.NOT_PREPARED;
  if (now < schedule.secondChart) return CHART_STAGES.FIRST;
  if (now < schedule.departure) return CHART_STAGES.SECOND;
  return CHART_STAGES.DEPARTED;
}
