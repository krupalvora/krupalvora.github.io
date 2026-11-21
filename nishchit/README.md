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
Pages is static, so it runs in **demo mode** (simulated chart data) — every path is relative
(`css/…`, `js/…`, `assets/…`, data via `import.meta.url`), so it works under any base path.

- Live IRCTC mode **cannot** run on Pages: it needs the local proxy (`server.mjs`) — IRCTC's
  CORS and Akamai block direct browser calls, and only a local IP is accepted. On the deployed
  site, `?live=1` is ignored and it stays on demo (live turns on only from `localhost` or with
  an explicit `?proxy=<url>`).
- `.nojekyll` at the repo root disables Jekyll so nothing is skipped or rewritten.
- Dev-only files (`server.mjs`, `lib/`, `tests/`, `package.json`, `docs/`) are never imported by
  the browser; they sit in the repo but don't affect the Pages site.
- Secrets (`.irctc-session`, `.chrome-irctc/`, `.irctc-dumps/`) are git-ignored and never
  deployed.

## Structure

```
js/domain/     pure logic, no DOM: engine (plan search), route, berths, chart timing, fare
js/data/       VacancyProvider: StaticProvider = data/trains/*.json + simulated chart
js/app/        search.js: runs the engine per class and builds the view model
js/state/      query <-> URL (shareable links, back button)
js/ui/         form + results rendering (text via DOM nodes, never innerHTML)
data/trains/   demo timetables (illustrative, not official)
tests/         node:test unit tests
```

## Engine

Each berth is a set of free station intervals. Dijkstra over (station, coach) states with a
lexicographic cost: fewer switches → safe switches (halt ≥ 5 min, not 23:00–06:00) → party
together → short walk → lower fare → berth type. Max 2 switches; otherwise returns the
furthest reachable station and the earliest station from which seats exist to the destination.
Top 3 distinct plans per class. Party of N needs N berths per leg.

## Live IRCTC data

The page cannot call IRCTC directly. Two hard blockers, both visible in a captured browser
request to `trnscheduleenquiry`:

1. **CORS.** IRCTC returns `Access-Control-Allow-Origin: https://www.operations.irctc.co.in`
   — not a wildcard. The browser refuses to let JS on any other origin read the response.
2. **Akamai session.** Every call needs live `_abck` / `bm_*` cookies and `greq` / `bmirak`
   headers minted by a real browser session; they expire quickly.

So live data needs **a small proxy you run on your own origin** that holds a fresh IRCTC
session, calls IRCTC, and returns clean JSON with your own CORS header. The page code is
unchanged — `IrctcProvider` ([js/data/irctcProvider.js](js/data/irctcProvider.js)) speaks the
same `getTrain` / `getChart` contract as the simulator and points at that proxy.

### Run it live on your machine (localhost)

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

### Other runtime toggles

```
?live=1                      live via the current origin (use with server.mjs)
?live=1&proxy=https://host   live via a proxy you host elsewhere
?demo=1                      force the simulated StaticProvider (fallback / offline)
```

The deployed static site (GitHub Pages) can't proxy, so it stays on demo/simulated data unless
you point it at a hosted proxy.

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

### Proxy

A forwarding proxy (e.g. a Cloudflare Worker) supplies the CORS header and the `/eticketing`
and `/online-charts` paths from `CONFIG.live.endpoints`. Obtaining and refreshing the Akamai
session is the real work and is specific to IRCTC's protection — budget for it, and respect
IRCTC's terms of use. The proxy is intentionally **not** committed here.

## Swapping in any other data source

Implement `getTrain(number)` and `getChart({ train, date })` with the same shapes as
`StaticProvider` in [js/data/provider.js](js/data/provider.js); nothing else changes.

Not affiliated with IRCTC or Indian Railways. A plan is not a ticket.
