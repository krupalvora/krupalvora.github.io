import { CLASSES } from '../domain/berths.js';
import { chartSchedule, chartStage, CHART_STAGES } from '../domain/chart.js';
import { addDays, fromISODate, toISODate } from '../domain/time.js';
import { CLASS_FILTERS } from '../state/query.js';
import { h, icon, replaceChildren } from './dom.js';
import { formatDateTime, formatDay, plural } from './format.js';

/**
 * Search form controller. Owns the form DOM only; talks to the outside world through
 * the provider (train lookup) and the onSubmit callback.
 */
export class SearchForm {
  constructor({ root, provider, today, partySizes, chartRules, onError = () => {}, onSubmit }) {
    this.root = root;
    this.provider = provider;
    this.today = today;
    this.chartRules = chartRules;
    this.onError = onError;
    this.onSubmit = onSubmit;
    this.train = null;
    this.lookup = null; // AbortController for the in-flight train lookup

    const $ = (sel) => root.querySelector(sel);
    this.els = {
      train: $('#train-input'),
      trainStatus: $('#train-status'),
      dates: $('#date-options'),
      from: $('#from-select'),
      to: $('#to-select'),
      classes: $('#class-options'),
      party: $('#party-select'),
      hint: $('#chart-hint .hint__text'),
      error: $('#form-error'),
      submit: root.querySelector('button[type="submit"]'),
    };

    this.renderStaticOptions(partySizes);
    this.bind();
  }

  /* ---------------------------- rendering ---------------------------- */

  renderStaticOptions(partySizes) {
    const base = fromISODate(this.today);
    const days = [
      ['Yesterday', addDays(base, -1)],
      ['Today', base],
      ['Tomorrow', addDays(base, 1)],
    ];
    replaceChildren(
      this.els.dates,
      days.map(([label, date]) =>
        radio('date', toISODate(date), toISODate(date) === this.today, [label, h('small', {}, formatDay(date))]),
      ),
    );

    replaceChildren(
      this.els.classes,
      CLASS_FILTERS.map((cls) => radio('cls', cls, cls === 'all', cls === 'all' ? 'All' : cls, CLASSES[cls]?.label)),
    );

    replaceChildren(
      this.els.party,
      partySizes.map((n) => h('option', { value: String(n) }, plural(n, 'traveller'))),
    );
  }

  renderStations() {
    const route = this.train?.route ?? [];
    const keepFrom = this.els.from.value;
    const fromOptions = route.slice(0, -1).map((s) => stationOption(s));
    replaceChildren(this.els.from, h('option', { value: '' }, 'Select boarding station'), fromOptions);
    if (route.some((s, i) => s.code === keepFrom && i < route.length - 1)) this.els.from.value = keepFrom;
    this.els.from.disabled = route.length === 0;
    this.renderDestinations();
  }

  renderDestinations() {
    const route = this.train?.route ?? [];
    const fromIdx = route.findIndex((s) => s.code === this.els.from.value);
    const keepTo = this.els.to.value;
    const options = fromIdx < 0 ? [] : route.slice(fromIdx + 1).map((s) => stationOption(s));
    replaceChildren(this.els.to, h('option', { value: '' }, 'Select destination station'), options);
    if (options.some((o) => o.value === keepTo)) this.els.to.value = keepTo;
    this.els.to.disabled = options.length === 0;
  }

  renderClasses() {
    const available = this.train?.classes ?? Object.keys(CLASSES);
    for (const input of this.els.classes.querySelectorAll('input')) {
      input.disabled = input.value !== 'all' && !available.includes(input.value);
      if (input.disabled && input.checked) this.check('cls', 'all');
    }
  }

  renderHint() {
    if (!this.train) {
      this.els.hint.textContent = 'The first chart is ready about 10 hours before departure (20:00 the day before for trains leaving 05:01–14:00).';
      return;
    }
    const date = this.value('date');
    const schedule = chartSchedule(date, this.train.route[0].depAbs, this.chartRules);
    const stage = chartStage(schedule);
    const first = formatDateTime(schedule.firstChart);
    const second = formatDateTime(schedule.secondChart);
    const text = {
      [CHART_STAGES.NOT_PREPARED]: `First chart expected ${first}. Second chart ${second}.`,
      [CHART_STAGES.FIRST]: `First chart is out (since ${first}). Book before the second chart at ${second}.`,
      [CHART_STAGES.SECOND]: `Second chart is out. The train leaves its source at ${formatDateTime(schedule.departure)}.`,
      [CHART_STAGES.DEPARTED]: 'Train has left its source. Remaining berths are allotted on board by the TTE.',
    }[stage];
    this.els.hint.textContent = text;
  }

  setTrainStatus(kind, text) {
    const el = this.els.trainStatus;
    if (!kind) {
      replaceChildren(el);
      return;
    }
    const cls = { ok: 'pill pill--lime', loading: 'pill pill--muted', error: 'pill pill--warn' }[kind];
    replaceChildren(el, h('span', { class: cls }, kind === 'ok' ? icon('check') : null, text));
    this.els.train.setAttribute('aria-invalid', kind === 'error' ? 'true' : 'false');
  }

  showError(message) {
    this.els.error.textContent = message ?? '';
    this.els.error.hidden = !message;
  }

  setBusy(busy) {
    this.els.submit.disabled = busy;
  }

  /* ----------------------------- behaviour ---------------------------- */

  bind() {
    this.els.train.addEventListener('input', () => {
      const digits = this.els.train.value.replace(/\D/g, '').slice(0, 5);
      if (digits !== this.els.train.value) this.els.train.value = digits;
      this.showError(null);
      this.loadTrain(digits);
    });
    this.els.from.addEventListener('change', () => {
      this.renderDestinations();
      this.showError(null);
    });
    this.els.to.addEventListener('change', () => this.showError(null));
    this.els.dates.addEventListener('change', () => this.renderHint());
    this.root.addEventListener('submit', (event) => {
      event.preventDefault();
      const error = this.validate();
      this.showError(error);
      if (error) return;
      this.onSubmit(this.getQuery());
    });
  }

  /** Look up a train; ignores stale responses when the user keeps typing. */
  async loadTrain(number) {
    this.lookup?.abort();
    if (number.length < 5) {
      this.train = null;
      this.setTrainStatus(null);
      this.els.train.removeAttribute('aria-invalid');
      this.refreshTrainDependent();
      return null;
    }
    if (this.train?.number === number) return this.train;

    const controller = new AbortController();
    this.lookup = controller;
    this.setTrainStatus('loading', 'Looking up train…');
    this.lookupError = null;
    try {
      const train = await this.provider.getTrain(number, { signal: controller.signal });
      if (controller.signal.aborted) return null;
      this.train = train;
      if (train) {
        this.setTrainStatus('ok', train.name);
      } else {
        this.setTrainStatus('error', `IRCTC has no train ${number}. Check the number.`);
      }
    } catch (err) {
      if (err.name === 'AbortError') return null;
      this.train = null;
      this.lookupError = err;
      this.onError(err, { trainLookup: number });
      // "Needs a computer" isn't something the user typed wrong: no red field for it.
      this.setTrainStatus(err?.code === 'needs-desktop' ? 'loading' : 'error', err?.message || String(err));
    }
    this.refreshTrainDependent();
    return this.train;
  }

  refreshTrainDependent() {
    this.renderStations();
    this.renderClasses();
    this.renderHint();
  }

  validate() {
    if (!/^\d{5}$/.test(this.els.train.value)) return 'Enter a 5-digit train number.';
    if (!this.train) return 'Pick a train from the list to continue.';
    if (!this.els.from.value) return 'Select your boarding station.';
    if (!this.els.to.value) return 'Select your destination station.';
    return null;
  }

  getQuery() {
    return {
      train: this.els.train.value,
      date: this.value('date'),
      from: this.els.from.value,
      to: this.els.to.value,
      cls: this.value('cls'),
      party: Number(this.els.party.value),
    };
  }

  /** Fill the form from a query (URL, recent search). Resolves once stations are loaded. */
  async setQuery(q) {
    this.els.train.value = q.train;
    this.ensureDateOption(q.date);
    this.check('date', q.date);
    this.check('cls', q.cls);
    this.els.party.value = String(q.party);
    this.showError(null);
    this.train = this.train?.number === q.train ? this.train : null;
    await this.loadTrain(q.train);
    this.els.from.value = q.from;
    this.renderDestinations();
    this.els.to.value = q.to;
    this.renderClasses();
    this.renderHint();
    return Boolean(this.train && this.els.from.value === q.from && this.els.to.value === q.to);
  }

  /** A shared link may carry a date outside Yesterday/Today/Tomorrow; show it as a 4th option. */
  ensureDateOption(date) {
    if (this.els.dates.querySelector(`input[value="${CSS.escape(date)}"]`)) return;
    this.els.dates.querySelector('[data-extra]')?.remove();
    const option = radio('date', date, false, ['Shared', h('small', {}, formatDay(fromISODate(date)))]);
    option.dataset.extra = '';
    this.els.dates.append(option);
    this.els.dates.classList.remove('segmented--3');
  }

  value(name) {
    return this.root.querySelector(`input[name="${name}"]:checked`)?.value;
  }

  check(name, value) {
    const input = this.root.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
    if (input && !input.disabled) input.checked = true;
  }
}

function radio(name, value, checked, label, title) {
  return h(
    'label',
    { class: 'segmented__opt', title },
    h('input', { type: 'radio', name, value, checked }),
    h('span', {}, label),
  );
}

function stationOption(stop) {
  return h('option', { value: stop.code }, `${stop.code} — ${stop.name}`);
}
