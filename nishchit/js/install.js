import { detectExtension } from './data/extensionBridge.js';

/**
 * install.html: works out the visitor's device and browser, puts the matching instructions
 * first, and says whether the extension is already installed (and up to date).
 */

export function detectEnvironment(nav = navigator) {
  const ua = nav.userAgent ?? '';
  const touchMac = /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1; // iPadOS reports as Mac
  const os = /iPhone|iPad|iPod/.test(ua) || touchMac ? 'ios'
    : /Android/.test(ua) ? 'android'
      : /CrOS/.test(ua) ? 'chromeos'
        : /Windows/.test(ua) ? 'windows'
          : /Macintosh|Mac OS X/.test(ua) ? 'mac'
            : /Linux/.test(ua) ? 'linux'
              : 'other';
  const browser = /Firefox\/|FxiOS/.test(ua) ? 'firefox'
    : /Edg\/|EdgA\//.test(ua) ? 'edge'
      : /OPR\/|Opera/.test(ua) ? 'opera'
        : /Vivaldi/.test(ua) ? 'vivaldi'
          : nav.brave ? 'brave'
            : /Chrome\/|CriOS/.test(ua) ? 'chrome'
              : /Safari\//.test(ua) ? 'safari'
                : 'other';
  return { os, browser };
}

/** Which card applies to this visitor. */
export function platformFor({ os, browser }) {
  if (os === 'ios') return 'ios';
  if (os === 'android') return browser === 'firefox' ? 'firefox' : 'android';
  if (browser === 'firefox') return 'firefox';
  if (browser === 'safari') return 'safari';
  return 'chromium';
}

const EXTENSIONS_PAGE = {
  chrome: 'chrome://extensions',
  edge: 'edge://extensions',
  brave: 'brave://extensions',
  opera: 'opera://extensions',
  vivaldi: 'vivaldi://extensions',
};
const DEV_MODE_WHERE = {
  edge: 'In Edge it\'s in the left-hand menu of the extensions page.',
  opera: 'In Opera it\'s a switch in the top-right corner.',
};
const NAMES = {
  chrome: 'Chrome', edge: 'Edge', brave: 'Brave', opera: 'Opera', vivaldi: 'Vivaldi', firefox: 'Firefox', safari: 'Safari', other: 'your browser',
};
const OS_NAMES = { mac: 'Mac', windows: 'Windows', linux: 'Linux', chromeos: 'ChromeOS', android: 'Android', ios: 'iPhone/iPad', other: 'your device' };

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

async function main() {
  const env = detectEnvironment();
  const platform = platformFor(env);

  // Put this visitor's card first and highlight it.
  const card = document.querySelector(`[data-platform="${platform}"]`);
  if (card) {
    card.classList.add('is-yours');
    card.parentElement.prepend(card);
  }
  const forYou = document.getElementById('for-you');
  forYou.textContent = `You're on ${NAMES[env.browser]} on ${OS_NAMES[env.os]}. Your instructions are first.`;
  forYou.hidden = false;

  // Chrome-family details for this browser and OS.
  document.getElementById('ext-url').textContent = EXTENSIONS_PAGE[env.browser] ?? EXTENSIONS_PAGE.chrome;
  if (DEV_MODE_WHERE[env.browser]) document.getElementById('devmode-where').textContent = DEV_MODE_WHERE[env.browser];
  document.querySelector(`.os-notes [data-os="${env.os}"]`)?.classList.add('is-yours');

  const copy = document.getElementById('copy-ext-url');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('ext-url').textContent);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select and copy it';
    }
    setTimeout(() => (copy.textContent = 'Copy'), 2000);
  });

  // Latest version (the manifest is served next to this page) and the installed one.
  const [latest, installed] = await Promise.all([
    fetch('extension/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((m) => m?.version ?? null).catch(() => null),
    detectExtension({ timeoutMs: 600 }),
  ]);
  if (latest) document.getElementById('version-label').textContent = `Version ${latest}`;
  showStatus({ platform, latest, installed });
}

function showStatus({ platform, latest, installed }) {
  const box = document.getElementById('ext-status');
  box.replaceChildren();
  if (installed && latest && compareVersions(installed, latest) < 0) {
    box.className = 'ext-status ext-status--warn';
    box.append(`Nishchit extension ${installed} is installed. Version ${latest} is available: see "Updating to a new version" below.`);
  } else if (installed) {
    box.className = 'ext-status ext-status--ok';
    const link = Object.assign(document.createElement('a'), { href: './', textContent: 'Search a train' });
    box.append(`The Nishchit extension is installed (version ${installed}) and working on this page. `, link);
  } else if (platform === 'chromium') {
    box.className = 'ext-status';
    box.append('The extension isn\'t installed in this browser yet. Follow the steps below, then reload this page.');
  } else {
    box.className = 'ext-status ext-status--warn';
    box.append('Your browser can\'t add the Nishchit extension yet. The details are below.');
  }
  box.hidden = false;
}

if (typeof document !== 'undefined') main();
