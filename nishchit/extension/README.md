# Nishchit browser extension

IRCTC blocks requests from servers (the Cloudflare Worker gets a 520), but it answers people's
own browsers. This extension lets the Nishchit page read the public chart **from the user's
browser**: their own connection and IRCTC session, one request at a time, only the three chart
endpoints. There is no server in between.

One codebase (Manifest V3 WebExtension). Packaged by `npm run extension:zip` for:
- **Chrome, Edge, Brave, Opera, Vivaldi** (Mac / Windows / Linux / ChromeOS): tested.
- **Firefox** (desktop + Android): `dist/nishchit-extension-firefox-<v>.zip` for Firefox Add-ons.
  Only the manifest differs. Not yet tested in Firefox. Firefox installs only Mozilla-signed add-ons.
- **Safari**: needs Xcode's `safari-web-extension-converter` and an Apple developer account; not built.

## Install

**Download page:** https://krupalvora.github.io/nishchit/install.html (zip + steps for every browser and OS; built by `npm run extension:zip` into `downloads/`, which is committed).

**From the Chrome Web Store:** _(link here once published)_

**Unpacked (developers):**
1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → choose this `extension/` folder.
3. Open https://krupalvora.github.io/nishchit/ (or `npm start` → http://localhost:5173) and search.
   The result card says **Live · your browser**.

## How it works

```
Nishchit page ──postMessage──▶ content.js ──runtime message──▶ background.js ──fetch──▶ www.irctc.co.in
```

- `content.js` runs only on Nishchit pages (`manifest.json` → `content_scripts.matches`) and
  relays requests. The page detects it via `data-nishchit-extension` on `<html>`
  ([../js/data/extensionBridge.js](../js/data/extensionBridge.js)).
- `background.js` validates every request with [rules.js](rules.js) (same rules as the Worker),
  serialises them with a 300 ms gap, and fetches directly.
- If IRCTC refuses a direct call (it wants its chart page's session, typically for
  `coachComposition`), the call is made from an IRCTC chart tab instead: an open one is reused,
  otherwise one opens in the background and closes after 2 idle minutes.

## Develop

```sh
npm test                         # includes tests/extension.test.js
npm run extension:icons          # re-render icons/ from assets/favicon.svg
npm run extension:zip            # dist/nishchit-extension-<version>.zip for the Web Store
```

Allowed page origins live in two places that must agree (a test checks this):
`manifest.json` `content_scripts.matches` and `rules.js` `PAGE_ORIGINS`.

## Publish to the Chrome Web Store

1. Register at https://chrome.google.com/webstore/devconsole (one-time US$5 fee).
2. `npm run extension:zip`, then **New item** → upload the zip.
3. Store listing: use [STORE_LISTING.md](STORE_LISTING.md). Upload at least one 1280×800
   screenshot of a Nishchit result page.
4. Privacy: policy URL `https://krupalvora.github.io/nishchit/privacy.html`. Answer the
   data-usage form as "does not collect user data". Permission justifications are in
   STORE_LISTING.md.
5. Submit for review (usually a few days).
6. After approval, put the store URL in `CONFIG.extension.installUrl`
   ([../js/config.js](../js/config.js)) and in the Install section above.

For each update: bump `version` in `manifest.json`, `npm run extension:zip`, upload.
