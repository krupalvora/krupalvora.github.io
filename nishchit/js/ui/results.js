import { CHART_STAGES } from '../domain/chart.js';
import { legKm, legMinutes } from '../domain/route.js';
import { fromISODate, formatDuration } from '../domain/time.js';
import { CONFIG } from '../config.js';
import { h, icon, replaceChildren } from './dom.js';
import { hardRefresh } from './hardRefresh.js';
import { berthLabel, classLabel, formatDateTime, formatDay, plural, rupees, stopArr, stopDep } from './format.js';

const STAGE_LABEL = {
  [CHART_STAGES.NOT_PREPARED]: 'Chart not prepared',
  [CHART_STAGES.FIRST]: 'First chart',
  [CHART_STAGES.SECOND]: 'Second chart',
  [CHART_STAGES.DEPARTED]: 'Train departed',
};

const ERROR_TITLE = {
  'no-source': 'Not connected to IRCTC',
  'needs-desktop': 'Open Nishchit on a computer',
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

/**
 * Results view: a status hero, journey plans, then every berth vacant on the trip, grouped by
 * coach and filterable. `intro` (the "how it works" panel) is hidden while results are shown.
 */
export function createResultsView({ root, intro = null }) {
  // Berth explorer filters and open coach groups. Kept across the coach-by-coach re-renders of
  // one search, reset when a new search starts.
  const explorer = { status: 'all', types: new Set(), open: new Map() };

  function show(...children) {
    root.hidden = false;
    if (intro) intro.hidden = true;
    document.body.classList.add('has-results');
    replaceChildren(root, ...children);
  }

  function renderLoading(query, progress = null) {
    const first = !progress;
    if (first) {
      explorer.status = 'all';
      explorer.types.clear();
      explorer.open.clear();
    }
    root.setAttribute('aria-busy', 'true');
    show(
      h(
        'div',
        { class: 'loading-card', role: 'status' },
        h('div', { class: 'spinner spinner--lg', 'aria-hidden': 'true' }),
        h('h2', { class: 'loading-card__title' }, 'Finding vacant seats on ', h('span', { class: 'mono' }, query.train)),
        h('p', { class: 'loading-card__sub' }, progress?.total ? progressText(progress) : 'Reading the live chart from IRCTC…'),
        progressBar(progress),
      ),
    );
    // Phones: results sit under the form, so bring the loader into view once per search.
    if (first && root.getBoundingClientRect().top > window.innerHeight * 0.6) {
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** Berths found so far, while later coaches are still being fetched. */
  function renderPartial(r, progress) {
    root.setAttribute('aria-busy', 'true');
    show(
      h(
        'div',
        { class: 'partial-banner', role: 'status' },
        h(
          'div',
          { class: 'partial-banner__row' },
          h('span', { class: 'spinner spinner--sm', 'aria-hidden': 'true' }),
          h('span', {}, `${progressText(progress)} - showing berths found so far`),
        ),
        progressBar(progress),
      ),
      header(r),
      statusHero(r),
      warningsNote(r),
      h('h2', { class: 'section-title' }, 'journey plans'),
      plans(r),
      berthExplorer(r, explorer, 'vacant berths so far'),
    );
    // No scrollIntoView on partial updates - it would yank the page on every coach.
  }

  /** No extension yet: not an error, just the one setup step. */
  function renderInstall(err) {
    show(
      h(
        'div',
        { class: 'install-card' },
        h('span', { class: 'install-card__icon', 'aria-hidden': 'true' }, icon('download')),
        h('h2', {}, 'One quick step: add the Nishchit extension'),
        h('p', {}, err?.message),
        err?.hint ? h('p', { class: 'install-card__hint' }, err.hint) : null,
        h(
          'div',
          { class: 'install-card__actions' },
          h('a', { class: 'btn btn--primary', href: 'install.html' }, icon('download'), 'Install the extension'),
          h('button', { type: 'button', class: 'btn btn--ghost', onclick: (e) => hardRefresh(e.currentTarget) }, icon('refresh'), "I've installed it"),
        ),
        h('p', { class: 'install-card__foot' }, 'Free, works in Chrome, Edge, Brave and Firefox. Or check the chart directly ', h('a', { href: CONFIG.chartsUrl, target: '_blank', rel: 'noopener' }, 'on IRCTC'), '.'),
      ),
    );
  }

  /** The real reason, what to do, and the technical facts to copy into a bug report. */
  function renderError(err) {
    root.setAttribute('aria-busy', 'false');
    if (err?.code === 'needs-extension') {
      renderInstall(err);
      return;
    }
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
            copyBtn.lastChild.textContent = 'Copy failed - select the text above';
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
        h(
          'div',
          { class: 'state-card__actions' },
          h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: (e) => hardRefresh(e.currentTarget) }, icon('refresh'), h('span', {}, 'Hard refresh and try again')),
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
      berthExplorer(r, explorer, 'vacant berths'),
    );
    // Only scroll when the results start below the fold (mobile: under the form). On a laptop
    // they sit beside the form and are already in view.
    if (root.getBoundingClientRect().top > window.innerHeight * 0.6) {
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function hide() {
    root.hidden = true;
    if (intro) intro.hidden = false;
    document.body.classList.remove('has-results');
    replaceChildren(root);
  }

  return { render, renderLoading, renderPartial, renderError, hide };
}

function progressText({ done, total }) {
  return `Reading coach ${Math.min(done + 1, total)} of ${total}`;
}

/** Determinate when the coach count is known, otherwise an indeterminate sweep. */
function progressBar(progress) {
  const total = progress?.total ?? 0;
  const pct = total ? Math.round((Math.min(progress.done, total) / total) * 100) : null;
  return h(
    'div',
    {
      class: `progress${pct === null ? ' progress--indeterminate' : ''}`,
      role: 'progressbar',
      'aria-label': 'Chart loading progress',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': pct === null ? null : String(pct),
    },
    h('span', { class: 'progress__fill', style: pct === null ? null : `width: ${Math.max(pct, 4)}%` }),
  );
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
        h('span', { class: 'pill pill--ok', title: `Fetched ${r.fetchedAt?.toLocaleTimeString?.() ?? ''}` }, r.via === 'proxy' ? 'Live · proxy' : r.via === 'extension' ? 'Live · your browser' : 'Live IRCTC'),
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
  } else if (r.stitched) {
    kind = 'partial';
    word = r.stitched.standingKm ? 'Most of the way.' : 'Covered, with more switches.';
    const s = r.stitched;
    sub = s.standingKm
      ? `Seated ${s.seatedKm} of ${s.seatedKm + s.standingKm} km in ${s.cls} · ${plural(s.switches, 'switch', 'switches')} · ${s.standingKm} km with no free berth.`
      : `Seated all the way in ${s.cls} · ${plural(s.switches, 'switch', 'switches')}.`;
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

  const { route } = r.train;
  const items = [];
  // The stitched plan seats the most km (switching and standing as needed). The simpler
  // "to X" / "from Y" plans stay as alternatives only when they need fewer switches.
  const best = r.stitched;
  if (best) items.push(planCard(r, best, 'Most seated'));
  const worthShowing = (p) => !best || (p.switches < best.switches && seatedKm(p) < best.seatedKm);

  if (r.partial) {
    const p = { ...r.partial.plan, cls: r.partial.cls };
    p.legs = [...p.legs, gapLeg(route, r.partial.reachedIndex, r.destination)];
    if (worthShowing(p)) items.push(planCard(r, p, `To ${route[r.partial.reachedIndex].code}`));
  }
  if (r.boardLater) {
    const p = { ...r.boardLater.plan, cls: r.boardLater.cls };
    p.legs = [gapLeg(route, r.origin, r.boardLater.boardIndex), ...p.legs];
    if (worthShowing(p)) items.push(planCard(r, p, `From ${route[r.boardLater.boardIndex].code}`));
  }
  if (!items.length) items.push(note('No vacant berths on this stretch', 'Try another class or date, or check again at the second chart.'));
  return h('div', { class: 'plan-list' }, items);
}

function gapLeg(route, from, to) {
  return { from, to, gap: true, km: legKm(route, from, to), minutes: legMinutes(route, from, to), berths: [], coach: null, fare: 0, switchRisk: null };
}

function seatedKm(plan) {
  return plan.legs.reduce((s, l) => s + (l.gap ? 0 : l.km), 0);
}

function note(title, text, tone = '') {
  return h('div', { class: `state-card ${tone ? `state-card--${tone}` : ''}` }, h('h3', {}, title), h('p', {}, text));
}

function planCard(r, plan, badge) {
  const { route } = r.train;
  const through = r.throughFares[plan.cls];
  const extra = through !== undefined ? plan.fare - through : 0;
  const standingKm = plan.legs.reduce((s, l) => s + (l.gap ? l.km : 0), 0);
  const seatedLegs = plan.legs.filter((l) => !l.gap).length;
  const title = plan.switches === 0 ? (standingKm ? 'One berth' : 'Direct - one berth') : plural(plan.switches, 'switch', 'switches');

  const rows = [];
  let n = 0;
  plan.legs.forEach((leg, i) => {
    if (leg.gap) {
      rows.push(gapRow(route, leg));
      return;
    }
    const prev = plan.legs[i - 1];
    if (prev && !prev.gap) rows.push(switchRow(route[leg.from], prev, leg));
    n += 1;
    rows.push(legRow(route, leg, n));
  });

  return h(
    'article',
    { class: `plan ${badge === 'Best' || badge === 'Most seated' ? 'plan--best' : ''}` },
    h(
      'header',
      { class: 'plan__head' },
      h(
        'div',
        { class: 'plan__badges' },
        badge ? h('span', { class: 'pill pill--accent' }, badge) : null,
        h('span', { class: 'pill pill--dark', title: classLabel(plan.cls) }, plan.cls),
        h('h3', { class: 'plan__title' }, title),
        standingKm ? h('span', { class: 'pill pill--warn' }, `${standingKm} km standing`) : null,
      ),
      h(
        'div',
        { class: 'plan__fare' },
        h('strong', {}, rupees(plan.fare)),
        h('small', {}, standingKm ? 'est. · seated legs' : extra > 0 ? `est. · +${rupees(extra)} vs one ticket` : 'est. fare'),
      ),
    ),
    ribbon(route, plan),
    h('ol', { class: 'legs' }, rows),
    h(
      'p',
      { class: 'plan__foot' },
      seatedLegs > 1 ? 'Book the scarcest leg first. ' : '',
      standingKm ? 'No berth is free on the dashed stretches: you will need a ticket for them too, and to stand or find a seat on board. ' : '',
      'Not a ticket until each leg is booked on IRCTC.',
    ),
  );
}

function ribbon(route, plan) {
  const first = plan.legs[0];
  const last = plan.legs[plan.legs.length - 1];
  const track = [];
  let seatIdx = 0;
  plan.legs.forEach((leg, i) => {
    const grow = Math.max(leg.km, 1);
    if (leg.gap) {
      track.push(h('div', { class: 'ribbon__seg ribbon__seg--gap', style: `flex: ${grow} 1 0` }, h('span', { class: 'ribbon__seg-label' }, 'stand')));
    } else {
      const full = leg.berths.map((b) => `${b.coach}·${b.number}`).join(' ');
      // One berth: show it. Several: just the coaches (full list is in the leg card + tooltip).
      const label = leg.berths.length === 1 ? full : [...new Set(leg.berths.map((b) => b.coach))].join(' ');
      track.push(
        h(
          'div',
          { class: `ribbon__seg ribbon__seg--${seatIdx % 2 === 0 ? 'a' : 'b'}`, style: `flex: ${grow} 1 0`, title: full },
          h('span', { class: 'ribbon__seg-label' }, label),
        ),
      );
      seatIdx += 1;
    }
    const next = plan.legs[i + 1];
    if (next) {
      const risky = Boolean(next.switchRisk) || leg.gap || next.gap;
      track.push(
        h(
          'div',
          { class: `ribbon__node ${risky ? 'ribbon__node--risky' : ''}` },
          h('span', { class: 'ribbon__node-label' }, route[leg.to].code),
        ),
      );
    }
  });
  return h(
    'div',
    { class: 'ribbon' },
    h('span', { class: 'ribbon__cap' }, route[first.from].code),
    h('div', { class: 'ribbon__track', role: 'img', 'aria-label': 'Journey segments' }, track),
    h('span', { class: 'ribbon__cap' }, route[last.to].code),
  );
}

/** A stretch with no free berth: the traveller stays on the train without one. */
function gapRow(route, leg) {
  const a = route[leg.from];
  const b = route[leg.to];
  return h(
    'li',
    { class: 'switch switch--risky' },
    icon('alert'),
    h(
      'div',
      { class: 'switch__text' },
      h('strong', {}, `No berth · ${a.name} → ${b.name}`),
      h('span', {}, `${stopDep(a)}–${stopArr(b)} · ${formatDuration(leg.minutes)} · ${leg.km} km · stand, or ask the TTE`),
    ),
    h('div', { class: 'switch__tags' }, h('span', { class: 'pill pill--warn' }, 'Standing')),
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

/* --------------------------- berth explorer --------------------------- */

const TYPE_ORDER = ['LB', 'MB', 'UB', 'SL', 'SU'];
const OPEN_ALL_UP_TO = 48; // berths; above this, only the most useful coaches start open

/**
 * Every berth free on any part of the trip, grouped by coach (in train order) as compact tiles.
 * Filters: whole trip vs part of it, and berth type. Filtering repaints only this section.
 */
function berthExplorer(r, state, label) {
  const section = h('section', { class: 'berths', 'aria-labelledby': 'berths-title' });
  const paint = () => replaceChildren(section, ...berthsContent(r, state, label, paint));
  paint();
  return section;
}

function berthsContent(r, state, label, repaint) {
  const title = h('h2', { class: 'section-title', id: 'berths-title' }, `${label} (${r.seats.length})`);
  if (!r.seats.length) return [title, note('No vacant berths', 'No berth is free on any part of your trip in this class.')];

  const { route } = r.train;
  const matches = (s) => (state.status === 'all' || s.status === state.status) && (!state.types.size || state.types.has(s.berth.type));
  const shown = r.seats.filter(matches);

  const groups = new Map();
  for (const s of shown) {
    if (!groups.has(s.berth.coach)) groups.set(s.berth.coach, []);
    groups.get(s.berth.coach).push(s);
  }
  const coachOrder = [...r.coaches.map((c) => c.coach).filter((c) => groups.has(c)), ...[...groups.keys()].filter((c) => !r.coaches.some((x) => x.coach === c))];
  const isOpen = (coach, i) => {
    if (state.open.has(coach)) return state.open.get(coach);
    if (shown.length <= OPEN_ALL_UP_TO) return true;
    // Phones: just the first coach, so the page isn't thousands of pixels of tiles.
    if (globalThis.matchMedia?.('(max-width: 719px)').matches) return i === 0;
    return i < 2 || groups.get(coach).some((s) => s.status === 'full');
  };
  const allOpen = coachOrder.every((c, i) => isOpen(c, i));

  const statusBtn = (value, text, count) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg-btn',
        'aria-pressed': String(state.status === value),
        disabled: count === 0 && value !== 'all',
        onclick: () => {
          state.status = value;
          repaint();
        },
      },
      text,
      h('span', { class: 'seg-btn__count' }, String(count)),
    );

  const typesPresent = TYPE_ORDER.filter((t) => r.seats.some((s) => s.berth.type === t));
  const typeChip = (t) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(state.types.has(t)),
        onclick: () => {
          if (state.types.has(t)) state.types.delete(t);
          else state.types.add(t);
          repaint();
        },
      },
      berthLabel(t),
    );

  const toolbar = h(
    'div',
    { class: 'berths__bar' },
    h(
      'div',
      { class: 'seg', role: 'group', 'aria-label': 'Show berths free for' },
      statusBtn('all', 'All', r.seats.length),
      statusBtn('full', 'Whole trip', r.totals.full),
      statusBtn('partial', 'Part of trip', r.totals.partial),
    ),
    typesPresent.length > 1 ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Berth type' }, typesPresent.map(typeChip)) : null,
  );

  const head = h(
    'div',
    { class: 'berths__head' },
    title,
    coachOrder.length > 1
      ? h(
        'button',
        {
          type: 'button',
          class: 'link-btn',
          onclick: () => {
            coachOrder.forEach((c) => state.open.set(c, !allOpen));
            repaint();
          },
        },
        allOpen ? 'Collapse all' : 'Expand all',
      )
      : null,
  );

  if (!shown.length) {
    return [
      head,
      toolbar,
      h(
        'div',
        { class: 'state-card' },
        h('h3', {}, 'No berths match these filters'),
        h(
          'p',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'link-btn',
              onclick: () => {
                state.status = 'all';
                state.types.clear();
                repaint();
              },
            },
            'Clear filters',
          ),
        ),
      ),
    ];
  }

  const coachGroups = coachOrder.map((coach, i) => {
    const items = groups.get(coach).sort((a, b) => a.berth.number - b.berth.number);
    const full = items.filter((s) => s.status === 'full').length;
    return h(
      'details',
      {
        class: 'coach',
        open: isOpen(coach, i),
        ontoggle: (e) => state.open.set(coach, e.currentTarget.open),
      },
      h(
        'summary',
        { class: 'coach__head' },
        h('span', { class: 'coach__name' }, coach),
        h('span', { class: 'coach__cls' }, items[0].berth.cls),
        h(
          'span',
          { class: 'coach__counts' },
          full ? h('span', { class: 'coach__full' }, `${full} whole trip`) : null,
          items.length - full ? h('span', {}, `${items.length - full} part`) : null,
        ),
      ),
      h(
        'ul',
        { class: 'berth-grid' },
        items.map(({ berth, status, spans }) =>
          h(
            'li',
            {
              class: `berth berth--${status}`,
              title: `${berth.coach}-${berth.number} · ${berthLabel(berth.type)} · ${status === 'full' ? 'free for your whole trip' : 'free for part of your trip'}`,
            },
            h('span', { class: 'berth__no' }, String(berth.number)),
            h('span', { class: 'berth__type' }, berthLabel(berth.type)),
            h(
              'span',
              { class: 'berth__spans' },
              status === 'full' ? 'Whole trip' : spans.map((s) => `${route[s.from].code}→${route[s.to].code}`).join(', '),
            ),
          ),
        ),
      ),
    );
  });

  return [
    head,
    toolbar,
    h(
      'p',
      { class: 'berths__legend' },
      h('span', { class: 'legend legend--full' }, 'Free for your whole trip'),
      h('span', { class: 'legend legend--partial' }, 'Free for part of it'),
      state.status !== 'all' || state.types.size ? h('span', { class: 'berths__count' }, `Showing ${shown.length} of ${r.seats.length}`) : null,
    ),
    h('div', { class: 'coach-list' }, coachGroups),
  ];
}
