/**
 * Device and browser detection, shared by the search page and the install page.
 * Used to pick instructions and to tell phones/tablets that Nishchit needs a computer:
 * the browser extension that reads IRCTC's chart only runs in desktop browsers today.
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

/** Which instructions apply to this visitor. */
export function platformFor({ os, browser }) {
  if (os === 'ios') return 'ios';
  if (os === 'android') return browser === 'firefox' ? 'firefox' : 'android';
  if (browser === 'firefox') return 'firefox';
  if (browser === 'safari') return 'safari';
  return 'chromium';
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** Phones and tablets (Android, iPhone, iPad): no extension, so no live chart yet. */
export function isMobileDevice(env = detectEnvironment()) {
  return env.os === 'android' || env.os === 'ios';
}
