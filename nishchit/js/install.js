import { detectExtension } from './data/extensionBridge.js';
import { compareVersions, detectEnvironment, platformFor } from './env.js';
import { hydrateIcons } from './ui/dom.js';

export { compareVersions, detectEnvironment, platformFor };

/**
 * install.html: a five-step installer for Chrome-family browsers, personalised to the visitor's
 * browser and OS, plus an honest note for browsers that can't take the extension yet.
 * Without JS every step shows at once (.wizard--all); with JS it goes one step at a time.
 */

const NAMES = { chrome: 'Chrome', edge: 'Edge', brave: 'Brave', opera: 'Opera', vivaldi: 'Vivaldi', firefox: 'Firefox', safari: 'Safari' };
const EXTENSIONS_PAGE = {
  chrome: 'chrome://extensions',
  edge: 'edge://extensions',
  brave: 'brave://extensions',
  opera: 'opera://extensions',
  vivaldi: 'vivaldi://extensions',
};
const DEV_MODE_TEXT = {
  edge: "In Edge it's a switch in the left-hand menu of the extensions page (open the menu with ☰ if you don't see it).",
};
const UNZIP_TEXT = {
  mac: 'Open your Downloads folder and double-click nishchit-extension-chrome.zip. A folder called nishchit-extension appears next to it.',
  windows: 'Open your Downloads folder, right-click nishchit-extension-chrome.zip, choose “Extract All…”, then “Extract”.',
  chromeos: 'Open the zip in the Files app, then copy the nishchit-extension folder into “My files”.',
  linux: 'Unzip it: unzip nishchit-extension-chrome.zip',
};
const NOT_HERE = {
  firefox: ['Firefox can’t add Nishchit yet', 'Firefox only installs add-ons signed by Mozilla. Nishchit is being submitted to Firefox Add-ons. Until then, open this page in Chrome, Edge or Brave on a computer.'],
  safari: ['Safari can’t add Nishchit', 'Safari extensions have to come from the App Store. Open this page in Chrome, Edge or Brave on this Mac and follow the steps below.'],
  android: ['Phones can’t add Nishchit yet', 'Chrome on Android has no extensions. Open this page on a computer, or check the chart on IRCTC from your phone for now. Firefox for Android support is coming.'],
  ios: ['iPhone and iPad can’t add Nishchit', 'Extensions there only come from the App Store. Open this page on a computer instead.'],
};

const STEPS = 5;

async function main() {
  hydrateIcons();
  const env = detectEnvironment();
  const platform = platformFor(env);
  personalise(env, platform);
  const wizard = setupWizard();

  const [latest, installed] = await Promise.all([
    fetch('extension/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((m) => m?.version ?? null).catch(() => null),
    detectExtension({ timeoutMs: 600 }),
  ]);
  if (latest) document.getElementById('version-label').textContent = `Version ${latest}`;
  showStatus({ platform, latest, installed, wizard });
}

function personalise(env, platform) {
  const isChromium = platform === 'chromium';
  if (isChromium && NAMES[env.browser]) document.getElementById('browser-name').textContent = NAMES[env.browser];
  document.getElementById('ext-url').textContent = EXTENSIONS_PAGE[env.browser] ?? EXTENSIONS_PAGE.chrome;
  if (DEV_MODE_TEXT[env.browser]) document.getElementById('devmode-text').textContent = DEV_MODE_TEXT[env.browser];
  if (UNZIP_TEXT[env.os]) document.getElementById('unzip-text').textContent = UNZIP_TEXT[env.os];
  if (env.os === 'mac') {
    for (const k of document.querySelectorAll('kbd[data-key="mod"]')) k.textContent = '⌘';
  }

  // Browsers that can't take it: say so first, plainly.
  const notHere = NOT_HERE[platform];
  if (notHere) {
    const box = document.getElementById('not-here');
    const title = document.createElement('h2');
    title.textContent = notHere[0];
    const text = document.createElement('p');
    text.textContent = notHere[1];
    box.replaceChildren(title, text);
    box.hidden = false;
    document.querySelector(`.other[data-platform="${platform}"]`)?.classList.add('is-yours');
  }

  const copy = document.getElementById('copy-ext-url');
  const label = copy.querySelector('span:last-child');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('ext-url').textContent);
      label.textContent = 'Copied';
      copy.classList.add('is-done');
    } catch {
      label.textContent = 'Select and copy it';
    }
    setTimeout(() => {
      label.textContent = 'Copy';
      copy.classList.remove('is-done');
    }, 2500);
  });
}

function setupWizard() {
  const wizard = document.getElementById('wizard');
  const steps = [...wizard.querySelectorAll('.step')];
  const dots = [...wizard.querySelectorAll('[data-dot]')];
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  const showAll = document.getElementById('show-all');
  let current = Number(readStep()) || 1;

  wizard.classList.remove('wizard--all');
  for (const s of steps) s.querySelector('.step__title').setAttribute('tabindex', '-1');

  function go(n, { focus = true } = {}) {
    current = Math.min(Math.max(n, 1), STEPS);
    saveStep(current);
    const all = wizard.classList.contains('wizard--all');
    for (const s of steps) s.hidden = !all && Number(s.dataset.step) !== current;
    for (const d of dots) {
      const k = Number(d.dataset.dot);
      d.classList.toggle('is-done', k < current);
      d.classList.toggle('is-current', k === current);
      if (k === current) d.setAttribute('aria-current', 'step');
      else d.removeAttribute('aria-current');
    }
    prev.hidden = all;
    next.hidden = all;
    prev.disabled = current === 1;
    next.textContent = current === STEPS ? 'Done' : current === 1 ? 'Already downloaded? Next' : 'Next';
    showAll.textContent = all ? 'One step at a time' : 'Show all steps';
    if (focus && !all) {
      steps[current - 1].querySelector('.step__title').focus({ preventScroll: true });
      const top = wizard.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.5) wizard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  prev.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => {
    if (current === STEPS) location.reload(); // the status box then shows whether it worked
    else go(current + 1);
  });
  showAll.addEventListener('click', () => {
    wizard.classList.toggle('wizard--all');
    go(current, { focus: false });
  });
  // Downloading is step 1: move on by itself once the download has started.
  document.getElementById('download').addEventListener('click', () => setTimeout(() => go(2), 700));
  document.getElementById('check-again').addEventListener('click', () => location.reload());

  go(current, { focus: false });
  return { element: wizard, go };
}

function showStatus({ platform, latest, installed, wizard }) {
  const box = document.getElementById('ext-status');
  box.replaceChildren();
  const link = (href, text) => Object.assign(document.createElement('a'), { href, textContent: text });

  if (installed && latest && compareVersions(installed, latest) < 0) {
    box.className = 'ext-status ext-status--warn';
    box.append(`You have version ${installed}. Version ${latest} is out: download it (step 1), replace the old folder, then click ↻ on Nishchit's card on the extensions page.`);
  } else if (installed) {
    box.className = 'ext-status ext-status--ok';
    box.append(`The Nishchit extension is installed and working (version ${installed}). `, link('./', 'Search a train →'));
    wizard.element.hidden = true;
    const again = Object.assign(document.createElement('button'), { type: 'button', className: 'link-btn', textContent: 'Show install steps' });
    again.addEventListener('click', () => {
      wizard.element.hidden = false;
      again.remove();
    });
    box.append(' ', again);
    clearStep();
  } else if (platform === 'chromium') {
    box.className = 'ext-status';
    box.append("Not installed in this browser yet. Follow the five steps below; it takes about two minutes.");
  } else {
    box.hidden = true;
    return;
  }
  box.hidden = false;
}

/* Remember the step across a reload ("Check again"), per tab. Storage may be unavailable. */
function readStep() {
  try {
    return sessionStorage.getItem('nishchit:install-step');
  } catch {
    return null;
  }
}
function saveStep(n) {
  try {
    sessionStorage.setItem('nishchit:install-step', String(n));
  } catch {
    /* fine without it */
  }
}
function clearStep() {
  try {
    sessionStorage.removeItem('nishchit:install-step');
  } catch {
    /* fine without it */
  }
}

if (typeof document !== 'undefined') main();
