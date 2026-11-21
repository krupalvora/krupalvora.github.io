import { BERTH_TYPES, CLASSES } from '../domain/berths.js';
import { formatClock } from '../domain/time.js';

const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const rupeeFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export const formatDay = (date) => dayFmt.format(date);
export const formatDateTime = (date) => dateTimeFmt.format(date);
export const rupees = (n) => rupeeFmt.format(n);

export const berthLabel = (type) => BERTH_TYPES[type]?.label ?? type;
export const classLabel = (cls) => CLASSES[cls]?.label ?? cls;

export const stopDep = (stop) => formatClock(stop.depAbs ?? stop.arrAbs);
export const stopArr = (stop) => formatClock(stop.arrAbs ?? stop.depAbs);

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
