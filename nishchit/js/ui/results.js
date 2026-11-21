import { CHART_STAGES } from '../domain/chart.js';
import { fromISODate, formatDuration } from '../domain/time.js';
import { h, icon, replaceChildren } from './dom.js';
import { berthLabel, classLabel, formatDateTime, formatDay, plural, rupees, stopArr, stopDep } from './format.js';

const STAGE_LABEL = {
  [CHART_STAGES.NOT_PREPARED]: 'Chart not prepared',
  [CHART_STAGES.FIRST]: 'First chart',
  [CHART_STAGES.SECOND]: 'Second chart',
  [CHART_STAGES.DEPARTED]: 'Train departed',
};

const ERROR_TITLE = {
  'no-source': 'Not connected to IRCTC',
  blocked: 'IRCTC is blocking Nishchit',
  'not-found': 'Train not found',
  'no-chart': 'No chart yet',
  forbidden: 'IRCTC blocked the request',
  timeout: 'IRCTC is not responding',
  network: 'Network problem',
  parse: 'Unexpected response from IRCTC',
  upstream: 'IRCTC returned an error',
};

/** Text with https:// URLs turned into links (text nodes only, never innerHTML). */
function linkify(text) {
  return String(text)
    .split(/(https:\/\/[^\s]+?)(?=[.,)]?(?:\s|$))/)
    .map((part) => (/^https:\/\//.test(part) ? h('a', { href: part, target: '_blank', rel: 'noopener' }, part) : part));
}

const RISK_LABEL = { 'short-halt': 'Short halt', night: 'Night switch' };

/** Results view: a status hero, journey plans, then every berth vacant on the trip. */
export function createResultsView({ root }) {
  function show(...children) {
    root.hidden = false;
    replaceChildren(root, ...children);
  }

  function renderLoading(query) {
    root.setAttribute('aria-busy', 'true');
    show(
      h(
        'div',
        { class: 'results-head' },
        h('div', {}, h('h2', { class: 'results-head__title' }, h('span', { class: 'mono' }, query.train), 'Finding vacant seats…')),
        h('div', { class: 'spinner', 'aria-hidden': 'true' }),
      ),
    );
  }

  /** The real reason, what to do, and the technical facts to copy into a bug report. */
  function renderError(err) {
    root.setAttribute('aria-busy', 'false');
    const message = err?.message || String(err ?? 'Unknown error');
    const diagnostics = typeof err?.diagnostics === 'function' ? err.diagnostics() : [['Error', `${err?.name ?? 'Error'}: ${message}`]];
    const report = [`Nishchit error: ${message}`, ...diagnostics.map(([k, v]) => `${k}: ${v}`), `Page: ${location.href}`, `Browser: ${navigator.userAgent}`].join('\n');
    const copyBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn--ghost btn--sm',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(report);
            copyBtn.lastChild.textContent = 'Copied';
          } catch {
            copyBtn.lastChild.textContent = 'Copy failed — select the text above';
          }
        },
      },
      icon('copy'),
      h('span', {}, 'Copy details'),
    );
    show(
      h(
        'div',
        { class: 'state-card state-card--error', role: 'alert' },
        h('h2', {}, ERROR_TITLE[err?.code] ?? 'Something went wrong'),
        h('p', {}, message),
        err?.hint ? h('p', { class: 'state-card__hint' }, linkify(err.hint)) : null,
        h(
          'details',
          { class: 'state-card__details' },
          h('summary', {}, 'Technical details'),
          h('dl', {}, diagnostics.map(([k, v]) => [h('dt', {}, k), h('dd', { class: 'mono' }, String(v))])),
          copyBtn,
        ),
      ),
    );
  }

  function render(r) {
    root.setAttribute('aria-busy', 'false');
    show(
      header(r),
      statusHero(r),
      stageNote(r),
      warningsNote(r),
      h('h2', { class: 'section-title' }, 'journey plans'),
      plans(r),
      h('h2', { class: 'section-title' }, `vacant berths (${r.seats.length})`),
      seats(r),
    );
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hide() {
    root.hidden = true;
    replaceChildren(root);
  }

  return { render, renderLoading, renderError, hide };
}

/* ------------------------------ header ------------------------------ */

function header(r) {
  const { train, query } = r;
  return h(
    'div',
    { class: 'results-head' },
    h(
      'div',
      {},
      h('h2', { class: 'results-head__title' }, h('span', { class: 'mono' }, train.number), train.name),
      h('p', { class: 'results-head__sub' }, `${train.route[r.origin].name} → ${train.route[r.destination].name}`),
      h(
        'p',
        { class: 'results-head__meta' },
        `${formatDay(fromISODate(query.date))} · ${plural(query.party, 'traveller')} · ${query.cls === 'all' ? 'All classes' : classLabel(query.cls)} · `,
        h('span', { class: 'pill pill--ok', title: `Fetched ${r.fetchedAt?.toLocaleTimeString?.() ?? ''}` }, r.via === 'proxy' ? 'Live · proxy' : 'Live IRCTC'),
      ),
    ),
    h('div', { class: 'stat-tiles' }, statTile(r.totals.full, 'full'), statTile(r.totals.partial, 'partial')),
  );
}

function statTile(value, label) {
  return h('div', { class: 'stat-tile' }, h('strong', { class: 'stat-tile__value' }, String(value)), h('span', { class: 'stat-tile__label' }, label));
}

function statusHero(r) {
  const route = r.train.route;
  const low = (s) => s.toLowerCase();
  let kind;
  let word;
  let sub;
  if (r.plans.length) {
    kind = 'full';
    word = 'Covered.';
    const best = r.plans[0];
    sub = `${plural(r.query.party, 'berth')} in ${best.cls} · ${best.switches === 0 ? 'direct, no switch' : plural(best.switches, 'switch', 'switches')}`;
  } else if (r.partial) {
    kind = 'partial';
    word = 'Most of the way.';
    const reached = route[r.partial.reachedIndex];
    sub = `Seated to ${reached.name}, then ${r.partial.uncoveredKm} km with no free berth yet.`;
  } else if (r.boardLater) {
    kind = 'partial';
    word = 'Board later.';
    const board = route[r.boardLater.boardIndex];
    sub = `Seats exist from ${board.name} onward (${r.boardLater.skippedKm} km to reach it another way).`;
  } else {
    kind = 'none';
    word = 'No seat yet.';
    sub = 'Every berth is booked on this stretch. Try another class or date, or check at the second chart.';
  }
  return h(
    'div',
    { class: `status-hero status--${kind}` },
    h('p', { class: 'eyebrow' }, low(`${route[r.origin].name} → ${route[r.destination].name}`)),
    h('div', { class: 'status-hero__row' }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), h('h3', { class: 'status-word' }, word)),
    h('p', { class: 'status-hero__sub' }, sub),
  );
}

function stageNote(r) {
  const s = r.schedule;
  const msg = {
    [CHART_STAGES.NOT_PREPARED]: `Chart expected ${formatDateTime(s.firstChart)}.`,
    [CHART_STAGES.FIRST]: `Book each leg via IRCTC current booking before the second chart at ${formatDateTime(s.secondChart)}.`,
    [CHART_STAGES.SECOND]: `Second chart is out. Train leaves source at ${formatDateTime(s.departure)}.`,
    [CHART_STAGES.DEPARTED]: 'Train has left its source. Show these berths to the TTE on board.',
  }[r.stage];
  return h('p', { class: 'banner' }, icon('clock'), h('span', {}, h('strong', {}, `${STAGE_LABEL[r.stage]}. `), msg));
}

/** Partial data must be visible: e.g. a coach IRCTC didn't return. */
function warningsNote(r) {
  if (!r.warnings?.length) return null;
  return h(
    'div',
    { class: 'state-card state-card--warn', role: 'status' },
    h('h3', {}, 'Some of the chart is missing'),
    r.warnings.map((w) => h('p', {}, w)),
  );
}

/* ------------------------------- plans ------------------------------ */

function plans(r) {
  if (r.plans.length) {
    return h('div', { class: 'plan-list' }, r.plans.map((plan, i) => planCard(r, plan, i === 0 ? 'Best' : null)));
  }

  const items = [];
  if (r.partial) items.push(planCard(r, { ...r.partial.plan, cls: r.partial.cls }, `To ${r.train.route[r.partial.reachedIndex].code}`, r.partial.reachedIndex));
  if (r.boardLater) {
    const board = r.train.route[r.boardLater.boardIndex];
    items.push(planCard(r, { ...r.boardLater.plan, cls: r.boardLater.cls }, `From ${board.code}`));
  }
  if (!items.length) items.push(note('No vacant berths on this stretch', 'Try another class or date, or check again at the second chart.'));
  return h('div', { class: 'plan-list' }, items);
}

function note(title, text, tone = '') {
  return h('div', { class: `state-card ${tone ? `state-card--${tone}` : ''}` }, h('h3', {}, title), h('p', {}, text));
}

function planCard(r, plan, badge, gapTo = null) {
  const { route } = r.train;
  const through = r.throughFares[plan.cls];
  const extra = through !== undefined ? plan.fare - through : 0;
  const title = plan.switches === 0 ? 'Direct — one berth' : plural(plan.switches, 'switch', 'switches');

  const rows = [];
  plan.legs.forEach((leg, i) => {
    if (i > 0) rows.push(switchRow(route[leg.from], plan.legs[i - 1], leg));
    rows.push(legRow(route, leg, i + 1));
  });

  return h(
    'article',
    { class: `plan ${badge === 'Best' ? 'plan--best' : ''}` },
    h(
      'header',
      { class: 'plan__head' },
      h(
        'div',
        { class: 'plan__badges' },
        badge ? h('span', { class: 'pill pill--accent' }, badge) : null,
        h('span', { class: 'pill pill--dark', title: classLabel(plan.cls) }, plan.cls),
        h('h3', { class: 'plan__title' }, title),
      ),
      h('div', { class: 'plan__fare' }, h('strong', {}, rupees(plan.fare)), h('small', {}, extra > 0 ? `est. · +${rupees(extra)} vs one ticket` : 'est. fare')),
    ),
    ribbon(route, plan, gapTo),
    h('ol', { class: 'legs' }, rows),
    h(
      'p',
      { class: 'plan__foot' },
      plan.legs.length > 1 ? 'Book the scarcest leg first. ' : '',
      'Not a ticket until each leg is booked on IRCTC.',
    ),
  );
}

function ribbon(route, plan, gapTo) {
  const first = plan.legs[0];
  const last = plan.legs[plan.legs.length - 1];
  const track = [];
  plan.legs.forEach((leg, i) => {
    const grow = Math.max(leg.km, 1);
    const label = leg.berths.map((b) => `${b.coach}·${b.number}`).join(' ');
    track.push(
      h(
        'div',
        { class: `ribbon__seg ribbon__seg--${i % 2 === 0 ? 'a' : 'b'}`, style: `flex: ${grow} 1 0` },
        h('span', { class: 'ribbon__seg-label' }, label),
      ),
    );
    if (i < plan.legs.length - 1) {
      const risky = Boolean(plan.legs[i + 1].switchRisk);
      track.push(
        h(
          'div',
          { class: `ribbon__node ${risky ? 'ribbon__node--risky' : ''}` },
          h('span', { class: 'ribbon__node-label' }, route[leg.to].code),
        ),
      );
    }
  });
  if (gapTo !== null && gapTo < route.length - 1) {
    track.push(h('div', { class: 'ribbon__node ribbon__node--risky' }, h('span', { class: 'ribbon__node-label' }, route[gapTo].code)));
    track.push(h('div', { class: 'ribbon__seg ribbon__seg--gap', style: 'flex: 2 1 0' }, h('span', { class: 'ribbon__seg-label' }, 'gap')));
  }
  const endCode = gapTo !== null ? route[route.length - 1].code : route[last.to].code;
  return h(
    'div',
    { class: 'ribbon' },
    h('span', { class: 'ribbon__cap' }, route[first.from].code),
    h('div', { class: 'ribbon__track', role: 'img', 'aria-label': 'Journey segments' }, track),
    h('span', { class: 'ribbon__cap' }, endCode),
  );
}

function legRow(route, leg, n) {
  const a = route[leg.from];
  const b = route[leg.to];
  const codes = leg.berths.map((x) => `${x.coach}-${x.number}`).join(', ');
  const type = leg.berths.length === 1 ? berthLabel(leg.berths[0].type) : `${leg.berths.length} berths`;
  return h(
    'li',
    { class: 'leg' },
    h('span', { class: 'leg__num' }, String(n)),
    h(
      'div',
      { class: 'leg__body' },
      h(
        'div',
        { class: 'leg__route' },
        h('span', { class: 'leg__code' }, codes),
        h('span', { class: 'leg__type' }, type),
        h('span', { class: 'leg__time' }, `${stopDep(a)}–${stopArr(b)}`),
      ),
      h('span', { class: 'leg__meta' }, `${a.name} → ${b.name} · ${formatDuration(leg.minutes)} · ${leg.km} km`),
    ),
  );
}

function switchRow(stop, prevLeg, nextLeg) {
  const risky = Boolean(nextLeg.switchRisk);
  const night = (nextLeg.switchRisk ?? []).includes('night');
  return h(
    'li',
    { class: `switch ${risky ? 'switch--risky' : ''}` },
    icon(night ? 'moon' : 'switch'),
    h(
      'div',
      { class: 'switch__text' },
      h('strong', {}, `Switch at ${stop.name} · ${stopArr(stop)}`),
      h('span', {}, `${stop.haltMin} min halt · ${prevLeg.coach === nextLeg.coach ? 'same coach' : `walk ${prevLeg.coach} → ${nextLeg.coach}`}`),
    ),
    risky ? h('div', { class: 'switch__tags' }, (nextLeg.switchRisk ?? []).map((risk) => h('span', { class: 'pill pill--warn' }, RISK_LABEL[risk]))) : null,
  );
}

/* ------------------------------- seats ------------------------------ */

function seats(r) {
  if (!r.seats.length) return note('No coaches found', 'No berth is vacant on any part of your trip.');
  const { route } = r.train;
  return h(
    'ul',
    { class: 'seat-list' },
    r.seats.map(({ berth, status, spans }) =>
      h(
        'li',
        { class: 'seat' },
        h('span', { class: 'seat__id' }, `${berth.coach}-${berth.number}`),
        h('span', { class: 'seat__type' }, `${berthLabel(berth.type)} · ${berth.cls}`),
        h('span', { class: `pill ${status === 'full' ? 'pill--accent' : 'pill--muted'}` }, status === 'full' ? 'Vacant' : 'Partial'),
        h('span', { class: 'seat__spans' }, spans.map((s) => h('span', { class: 'station-chip' }, `${route[s.from].code} → ${route[s.to].code}`))),
      ),
    ),
  );
}
