# Nishchit

Find berths left vacant after the reservation chart and stitch them into a seated journey.
V1 is a static site (vanilla HTML/CSS/JS, ES modules, no build step) for GitHub Pages.

## Run

```sh
npm start        # serves on http://localhost:5173 (python3 http.server)
npm test         # node --test, no dependencies
```

## Deploy (GitHub Pages)

Nishchit ships inside the portfolio repo at `nishchit/` and is served at `<site>/nishchit/`.
Every path is relative, so it works under any base path. **There is no demo or simulated
data**: every search reads the real chart from IRCTC, through the visitor's own browser via
the Nishchit Connector extension (below). Without it, the page says so and shows how to install it.

- `.nojekyll` at the repo root disables Jekyll so nothing is skipped or rewritten.
- Dev-only files (`server.mjs`, `lib/`, `tests/`, `package.json`, `docs/`) are never imported by
  the browser.
- Secrets (`.irctc-session`, `.chrome-irctc/`, `.irctc-dumps/`) are git-ignored and never deployed.
- After changing anything in `connector/`, run `npm run pack:connector` and commit
  `assets/nishchit-connector.zip` (the setup card links to it).

## Structure

```
js/domain/     pure logic, no DOM: engine (plan search), route, berths, chart timing, fare
js/data/       IrctcProvider (live IRCTC) + connector.js (talks to the extension)
js/app/        search.js: runs the engine per class and builds the view model
js/state/      query <-> URL (shareable links, back button)
js/ui/         form + results rendering (text via DOM nodes, never innerHTML)
connector/     the Nishchit Connector browser extension (MV3)
tests/         node:test unit tests; tests/fixtures/ holds test-only timetables + chart simulator
```

## Engine

Each berth is a set of free station intervals. Dijkstra over (station, coach) states with a
lexicographic cost: fewer switches → safe switches (halt ≥ 5 min, not 23:00–06:00) → party
together → short walk → lower fare → berth type. Max 2 switches; otherwise returns the
furthest reachable station and the earliest station from which seats exist to the destination.
Top 3 distinct plans per class. Party of N needs N berths per leg.

## Live IRCTC data

The page cannot call IRCTC by itself. Two hard blockers, both visible in a captured browser
request to `trnscheduleenquiry`:

1. **CORS.** IRCTC returns `Access-Control-Allow-Origin: https://www.operations.irctc.co.in`
   — not a wildcard. The browser refuses to let JS on any other origin read the response.
2. **Akamai session.** Every call needs live `_abck` / `bm_*` cookies, minted by Akamai's own
   script running *on irctc.co.in*. A page on another origin can neither create nor send them.

A server-side proxy solves both, but then every user's request leaves from **one** IP, which
Akamai blocks quickly (datacenter IPs get 403 outright). So production uses the visitor's own
browser instead.

### Nishchit Connector (production): requests from the user's own browser

[connector/](connector/) is a small Manifest V3 extension (Chrome, Edge, Brave):

```
Nishchit page ──postMessage──▶ bridge.js (content script) ──▶ background.js (service worker)
                                                                   │ chrome.scripting.executeScript(world: MAIN)
                                                                   ▼
                                              www.irctc.co.in/online-charts tab (background)
                                              fetch('/online-charts/api/…')  ← same-origin
```

- The request runs **inside an IRCTC tab**, so it's a same-origin call: no CORS, Akamai's own
  script has minted this user's cookies, and it leaves from the user's IP. No server of ours is
  involved, so there is nothing shared for IRCTC to block.
- It reuses an IRCTC tab the user already has open, or opens `online-charts` in a background
  tab, waits for the `_abck`/`bm_sz` cookies, and closes that tab after 10 idle minutes.
- On a 403 it reloads the IRCTC tab once (Akamai re-mints the session) and retries.
- Allow-list: only `GET trnscheduleenquiry/<train>`, `POST trainComposition`,
  `POST coachComposition` on `www.irctc.co.in`. The page never chooses the origin.
- It only injects its bridge on `krupalvora.github.io/nishchit/*` and `localhost` (edit
  `connector/manifest.json` if the site moves).

Install (until it's on the Chrome Web Store): download `assets/nishchit-connector.zip` (or use
the `connector/` folder), unzip, `chrome://extensions` → Developer mode → **Load unpacked**.

How the page picks a route ([js/main.js](js/main.js) `selectProvider`):

```
?proxy=<url> / CONFIG.live.base   explicit proxy
connector installed                via the user's browser (production)
localhost + server.mjs running     same-origin dev proxy (detected via /__nishchit/health)
none                               "Connect Nishchit to IRCTC" card; searches fail with that reason
```

### Errors

Errors are never swallowed or replaced with fake data. `ProviderError`
([js/data/provider.js](js/data/provider.js)) carries a plain-language message and hint for the
user plus the facts for us: code, HTTP status, endpoint, route (connector/proxy), and IRCTC's
own words (`error` / `errorMessage` field, or the Akamai edge reference such as
`#221.36adce17…` from an HTML error page). The UI shows the message + hint, with a
**Technical details** panel and a **Copy details** button for bug reports; the console logs the
same as a collapsed group (`[nishchit] <code>: …`). A coach IRCTC fails to return is shown as a
"Some of the chart is missing" warning rather than silently dropped.

### Dev proxy on your machine (localhost)

[server.mjs](server.mjs) is a local dev server that serves the site **and** proxies IRCTC on
the same origin (so no CORS) from your local IP (which IRCTC accepts; datacenter IPs get 403).

**Option A — auto session (no copy-paste, recommended):**
```sh
npm run serve:auto
```
This drives a local Chrome via the DevTools Protocol ([lib/irctcSession.mjs](lib/irctcSession.mjs)):
a Chrome window opens to the online-charts page, Akamai mints the session there, and the server
reads the cookies automatically — and re-reads them on a 403. The browser profile persists in
`.chrome-irctc/` (gitignored), so after the first run it usually comes up already authenticated.
Then open **http://localhost:5173/?live=1**. Needs Chrome installed (override its path with
`CHROME=...`). It controls a browser on your machine, so it is local-only — not for Pages.

**Option B — paste a cookie once:**
1. In Chrome at `https://www.irctc.co.in/online-charts`, load a chart, then in DevTools → Network
   copy the full `Cookie` request header from any `online-charts` request.
2. ```sh
   printf '%s' 'PASTE_THE_COOKIE_HEADER_HERE' > .irctc-session   # gitignored
   npm run serve:live
   ```
   (or `IRCTC_COOKIE='...' npm run serve:live`)
3. Open **http://localhost:5173/?live=1** and search a train (e.g. 19017).

Either way, the first response of each IRCTC endpoint is saved to `.irctc-dumps/` (gitignored) so
the field mapping in `mapChart.js` can be checked against real data. With Option B, cookies
expire — refresh `.irctc-session` and restart when calls start returning 403 (Option A refreshes
itself).

### Runtime toggles

```
?proxy=https://host          force a proxy you host elsewhere
```

### Response mapping

IRCTC's JSON is undocumented. The adapters isolate it:

- [js/data/irctc/mapSchedule.js](js/data/irctc/mapSchedule.js) — `trnscheduleenquiry` → route.
  Confident; tolerant of field-name variants.
- [js/data/irctc/mapChart.js](js/data/irctc/mapChart.js) — chart → engine berths. The chart is
  **two POST calls**: `trainComposition` → `cdd[]` (`coachName`, `classCode`) plus chart status
  (`chartOneDate` / `chartStatusResponseDto.chartOneFlag`), then `coachComposition` per coach →
  `bdd[]` (`berthNo`, `berthCode`), each with `bsd[]` segments `{from, to, occupancy}` where
  `from`/`to` are station codes and `occupancy:false` = vacant. These field names are confirmed
  against real captured responses and covered by an end-to-end test. Classes the planner models
  are SL / 3A / 2A; other coaches (1A, CC, 2S, …) are skipped in V1.

## Swapping in any other data source

Implement `getTrain(number)` and `getChart({ train, date })` with the contract documented in
[js/data/provider.js](js/data/provider.js); nothing else changes.

Not affiliated with IRCTC or Indian Railways. A plan is not a ticket.
