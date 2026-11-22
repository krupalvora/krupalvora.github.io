/**
 * Packages extension/ three ways:
 *
 *   downloads/nishchit-extension-chrome.zip   manual install (Chrome, Edge, Brave, Opera, … on
 *                                              Mac / Windows / Linux / ChromeOS). Unzips to a
 *                                              `nishchit-extension/` folder for "Load unpacked".
 *                                              Committed and served by Pages; linked from install.html.
 *   dist/nishchit-extension-<v>.zip           Chrome Web Store upload (manifest at the zip root).
 *   dist/nishchit-extension-firefox-<v>.zip   Firefox Add-ons (AMO) upload: same code, Firefox
 *                                              manifest. Firefox only installs signed add-ons, so
 *                                              this is for submission, not for direct download.
 *
 *   node scripts/package-extension.mjs        (npm run extension:zip)
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'extension');
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
const { version } = manifest;
const SKIP = /(\.md$|\.DS_Store$)/;

const stage = mkdtempSync(join(tmpdir(), 'nishchit-ext-'));
mkdirSync(join(ROOT, 'downloads'), { recursive: true });
mkdirSync(join(ROOT, 'dist'), { recursive: true });

function copyExtension(dest, manifestOverride) {
  cpSync(SRC, dest, { recursive: true, filter: (p) => !SKIP.test(p) });
  if (manifestOverride) writeFileSync(join(dest, 'manifest.json'), `${JSON.stringify(manifestOverride, null, 2)}\n`);
}

function zip(cwd, out, what) {
  rmSync(out, { force: true });
  execFileSync('zip', ['-qrX', out, what], { cwd });
  console.log(out.replace(ROOT, ''));
}

// 1. Manual-install download: zip contains a single folder, so unzipping gives one obvious folder.
copyExtension(join(stage, 'manual', 'nishchit-extension'));
zip(join(stage, 'manual'), join(ROOT, 'downloads', 'nishchit-extension-chrome.zip'), 'nishchit-extension');

// 2. Chrome Web Store upload.
copyExtension(join(stage, 'store'));
zip(join(stage, 'store'), join(ROOT, 'dist', `nishchit-extension-${version}.zip`), '.');

// 3. Firefox (AMO). Firefox MV3 runs background code as an event page, not a service worker.
const firefox = structuredClone(manifest);
delete firefox.minimum_chrome_version;
firefox.background = { scripts: ['background.js'], type: 'module' };
firefox.browser_specific_settings = {
  gecko: { id: 'nishchit@krupalvora.github.io', strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } },
  gecko_android: { strict_min_version: '128.0' },
};
copyExtension(join(stage, 'firefox'), firefox);
zip(join(stage, 'firefox'), join(ROOT, 'dist', `nishchit-extension-firefox-${version}.zip`), '.');

rmSync(stage, { recursive: true, force: true });
