# Nishchit

Find berths left vacant after the reservation chart and stitch them into a seated journey.
V1 is a static site (vanilla HTML/CSS/JS, ES modules, no build step) for GitHub Pages.

## Run

```sh
npm start        # serves on http://localhost:5173 (python3 http.server)
npm test         # node --test, no dependencies
```

## Deploy

Nishchit ships inside the portfolio repo at `nishchit/` and is served at `<site>/nishchit/`.
Every path is relative, so it works under any base path. **There is no demo or simulated
data**: every search reads the real chart from IRCTC through the proxy in `worker/`.

1. Deploy the proxy (Cloudflare account needed, free plan is fine):
   ```sh
   npx wrangler login
   npx wrangler kv namespace create CACHE     # optional: shared cache; paste the id into worker/wrangler.toml
   npm run worker:deploy                      # prints https://nishchit-proxy.<account>.workers.dev
   ```
2. Put that URL in `CONFIG.live.base` ([js/config.js](js/config.js)) and push to Pages.
   (`?proxy=<url>` overrides it for testing.)

- `.nojekyll` at the repo root disables Jekyll so nothing is skipped or rewritten.
- Dev-only files (`server.mjs`, `lib/`, `worker/`, `tests/`, `package.json`, `docs/`) are never
  imported by the browser.
- Secrets (`.irctc-session`, `.chrome-irctc/`, `.irctc-dumps/`) are git-ignored and never deployed.

## Structure

```
js/domain/     pure logic, no DOM: engine (plan search), route, berths, chart timing, fare
js/data/       IrctcProvider (live IRCTC via the proxy)
js/app/        search.js: runs the engine per class and builds the view model
js/state/      query <-> URL (shareable links, back button)
js/ui/         form + results rendering (text via DOM nodes, never innerHTML)
worker/        Cloudflare Worker proxy to IRCTC (production)
tests/         node:test unit tests; tests/fixtures/ holds test-only timetables + chart simulator
```

## Engine

Each berth is a set of free station intervals. Dijkstra over (station, coach) states with a
lexicographic cost: fewer switches → safe switches (halt ≥ 5 min, not 23:00–06:00) → party
together → short walk → lower fare → berth type. Max 2 switches; otherwise returns the
furthest reachable station and the earliest station from which seats exist to the destination.
Top 3 distinct plans per class. Party of N needs N berths per leg.

## Live IRCTC data

The data is the public chart at https://www.irctc.co.in/online-charts/. Its page calls:

```
POST /online-charts/api/trainComposition   { trainNo, jDate, boardingStation }      -> coaches + chart status
POST /online-charts/api/coachComposition   { trainNo, jDate, boardingStation,
                                             remoteStation, trainSourceStation,
                                             coach, cls }                           -> berths + vacant segments
GET  /eticketing/protected/mapps1/trnscheduleenquiry/{train}                        -> route
```

A page on another origin can't read these (IRCTC's `Access-Control-Allow-Origin` is only
`https://www.operations.irctc.co.in`), so the page calls a proxy with the same paths.

### Proxy (worker/index.js)

- Forwards only those three endpoints, with validated inputs, and adds CORS for the site.
- Identifies itself (`User-Agent: Nishchit/1.0 (+site)`). It does **not** try to get past
  IRCTC's bot protection (no cookie, fingerprint or IP tricks).
- Caches successful answers (schedule 24 h, chart and coaches 10 min, "not prepared" 5 min) in
  KV, so many users searching the same train and date cost IRCTC one call per TTL. IRCTC
  `{ error }` bodies and failures are never cached.
- **If IRCTC blocks it** (401/403/429 or Akamai's "Access Denied" page) it answers
  `503 { blocked: true, upstreamStatus, reference, since }` and stops calling IRCTC for 2 min.
  The page shows "IRCTC is blocking Nishchit's server right now" with a link to check the
  chart on IRCTC directly, plus the Akamai reference under Technical details.
- `npm run worker:dev` runs it locally (http://localhost:8787 → use `?proxy=http://localhost:8787`).

Whether IRCTC tolerates the proxy is IRCTC's call: Cloudflare's IP ranges may well be refused.
If they are, users see the block message; nothing is faked. (As of Nov 2026 it is refused: Cloudflare 520.)

### Browser extension (extension/)

Because IRCTC refuses servers, the working production route is the **Nishchit browser
extension**: it fetches the chart from the user's own browser and hands it to the page. When it
is installed the page uses it automatically (result card: "Live · your browser"); otherwise the
page uses the Worker, and a block suggests installing the extension. See
[extension/README.md](extension/README.md) for install, design and Chrome Web Store publishing.

### Mobile app (mobile/)

A Flutter app that bundles this site and fetches the chart from the phone itself, using the
same message protocol as the extension. Phones need no extension or computer. See
[mobile/README.md](mobile/README.md).

### Errors

Errors are never swallowed or replaced with fake data. `ProviderError`
([js/data/provider.js](js/data/provider.js)) carries a plain-language message and hint for the
user plus the facts for us: code, HTTP status, endpoint, route, and IRCTC's
own words (`error` / `errorMessage` field, the proxy's `blocked` report, or the Akamai edge reference such as
`#221.36adce17…` from an HTML error page). The UI shows the message + hint (links clickable), with a
**Technical details** panel and a **Copy details** button for bug reports; the console logs the
same as a collapsed group (`[nishchit] <code>: …`). A coach IRCTC fails to return is shown as a
"Some of the chart is missing" warning rather than silently dropped.

### Dev proxy with your own session (localhost)

[server.mjs](server.mjs) is a local dev server that serves the site **and** proxies IRCTC on
the same origin (so no CORS) from your local IP (which IRCTC accepts; datacenter IPs get 403).

**Option A - auto session (no copy-paste, recommended):**
```sh
npm run serve:auto
```
This drives a local Chrome via the DevTools Protocol ([lib/irctcSession.mjs](lib/irctcSession.mjs)):
a Chrome window opens to the online-charts page, Akamai mints the session there, and the server
reads the cookies automatically - and re-reads them on a 403. The browser profile persists in
`.chrome-irctc/` (gitignored), so after the first run it usually comes up already authenticated.
Then open **http://localhost:5173/?live=1**. Needs Chrome installed (override its path with
`CHROME=...`). It controls a browser on your machine, so it is local-only - not for Pages.

**Option B - paste a cookie once:**
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
expire - refresh `.irctc-session` and restart when calls start returning 403 (Option A refreshes
itself).

### Response mapping

IRCTC's JSON is undocumented. The adapters isolate it:

- [js/data/irctc/mapSchedule.js](js/data/irctc/mapSchedule.js) - `trnscheduleenquiry` → route.
  Confident; tolerant of field-name variants.
- [js/data/irctc/mapChart.js](js/data/irctc/mapChart.js) - chart → engine berths. The chart is
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
