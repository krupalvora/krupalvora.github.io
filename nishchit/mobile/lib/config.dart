// Where the app gets its content. Everything that can change when IRCTC changes lives on the
// website, not in the app:
//   - the page, the chart parsing (js/data/irctc/*.js) and endpoints (js/config.js) -> siteUrl
//   - which IRCTC requests the phone may make, headers, block detection -> rulesUrl
// Push to GitHub Pages and installed apps get it on their next launch.

const appVersion = '1.0.0';

/// The live Nishchit site, loaded in the app's WebView.
const siteUrl = 'https://krupalvora.github.io/nishchit/';

/// IRCTC request rules for the phone (see irctc_rules.dart).
const rulesUrl = 'https://krupalvora.github.io/nishchit/irctc-rules.json';

/// The copy of the site bundled in the app (assets/web/), used when the live site can't be
/// reached (offline at launch). Served locally because ES modules don't load from file://.
const localPort = 47615;
const localOrigin = 'http://localhost:$localPort';
