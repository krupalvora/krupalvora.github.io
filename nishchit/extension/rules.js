/**
 * What the extension is allowed to do. Pure functions, shared by background.js and the tests.
 *
 * The extension fetches only the three public online-charts endpoints the Nishchit page needs,
 * with strictly validated inputs, and only when asked by a Nishchit page. Nothing else.
 */

export const IRCTC = 'https://www.irctc.co.in';
export const CHARTS_PAGE = `${IRCTC}/online-charts/`;

/** Pages allowed to ask the extension for data (must match content_scripts in manifest.json). */
export const PAGE_ORIGINS = ['https://krupalvora.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173'];

const ROUTES = [
  { name: 'schedule', method: 'GET', re: /^\/eticketing\/protected\/mapps1\/trnscheduleenquiry\/\d{5}$/ },
  { name: 'trainComposition', method: 'POST', re: /^\/online-charts\/api\/trainComposition$/ },
  { name: 'coachComposition', method: 'POST', re: /^\/online-charts\/api\/coachComposition$/ },
];

/**
 * Validate a request from the page. Returns { name, method, path, body } with a rebuilt body
 * (only known fields, normalised), or throws with a short reason.
 */
export function validateRequest(req) {
  if (!req || typeof req !== 'object') throw new Error('request required');
  const path = String(req.path ?? '');
  const route = ROUTES.find((r) => r.re.test(path));
  if (!route) throw new Error('unknown endpoint');
  if (req.method !== route.method) throw new Error(`use ${route.method}`);
  if (route.method === 'GET') return { name: route.name, method: 'GET', path, body: undefined };

  let parsed;
  try {
    parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    throw new Error('JSON body required');
  }
  return { name: route.name, method: 'POST', path, body: JSON.stringify(validateBody(route.name, parsed)) };
}

function validateBody(name, b) {
  if (!b || typeof b !== 'object') throw new Error('JSON body required');
  const check = (field, re) => {
    const v = String(b[field] ?? '').trim().toUpperCase();
    if (!re.test(v)) throw new Error(`invalid ${field}`);
    return v;
  };
  const stn = /^[A-Z]{1,5}$/;
  const out = {
    trainNo: check('trainNo', /^\d{5}$/),
    jDate: check('jDate', /^\d{4}-\d{2}-\d{2}$/),
    boardingStation: check('boardingStation', stn),
  };
  if (name === 'coachComposition') {
    out.remoteStation = check('remoteStation', stn);
    out.trainSourceStation = check('trainSourceStation', stn);
    out.coach = check('coach', /^[A-Z0-9]{1,4}$/);
    out.cls = check('cls', /^(SL|3A|2A|1A|3E|CC|EC|2S)$/);
  }
  return out;
}

/** True when IRCTC refused the request outright (as opposed to answering with data or an error body). */
export function isRefusal(status, text = '') {
  if ([401, 403, 429, 520].includes(status)) return true;
  return /<title>\s*Access Denied/i.test(text);
}

/** Only our own content script, running on a Nishchit page, may ask. */
export function isAllowedSender(sender, extensionId) {
  if (!sender || sender.id !== extensionId) return false;
  const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : '');
  return PAGE_ORIGINS.includes(origin);
}

/** Headers IRCTC's own chart page sends with these calls. */
export function irctcHeaders() {
  return {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    bmirak: 'webbm',
    greq: String(Date.now()),
  };
}
