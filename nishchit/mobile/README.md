# Nishchit mobile (Flutter)

Runs Nishchit on Android and iPhone with **no extension, proxy or computer**: the phone fetches
IRCTC's chart itself.

## Nothing IRCTC-specific is compiled into the app

When IRCTC changes its endpoints, payloads or responses, **push to GitHub Pages: no app update.**
Installed apps pick the change up on their next launch.

| What changes when IRCTC changes | Where it lives | Hosted at |
| --- | --- | --- |
| Response parsing (`js/data/irctc/*.js`), endpoints (`js/config.js`), the whole UI | the website | https://krupalvora.github.io/nishchit/ |
| Which requests the phone may make: paths, request fields and their formats, headers, what counts as a block, timings | [`../irctc-rules.json`](../irctc-rules.json) | https://krupalvora.github.io/nishchit/irctc-rules.json |

- The app's WebView loads the **live site**, so the JS parser updates with every push.
- `irctc-rules.json` is fetched at launch, validated, and cached on the phone. To change it: edit,
  **bump `revision`**, push. A file that fails validation is ignored; the app keeps the previous rules.
- Safety limits no rules file can lift: HTTPS only, host must be `irctc.co.in`, every pattern
  must be anchored (`^…$`), and at least 200 ms between IRCTC calls.
- Offline at launch? The app falls back to the copy of the site and rules bundled at build time
  (`assets/web/`, made by `tool/sync_web.sh`).
- A change to the *shape* of the rules file itself bumps `schema`. Old apps ignore a schema they
  don't know, so only that kind of change needs an app release.
- Keep `irctc-rules.json` in step with `extension/rules.js`.

## "Your chart is ready" notification

A search fetches one coach at a time, so it takes a while. Start it, switch to another app, and
Nishchit notifies you when the result is in ("Seat found: 19017 · BVI → MSH: 3 plans…"). No
notification if the app is on screen. Permission is requested at the first search.

- The page reports start and finish through the bridge ([`../js/app/notify.js`](../js/app/notify.js));
  [lib/search_notifier.dart](lib/search_notifier.dart) shows the notification.
- **Android** keeps the app running in the background for minutes, which is plenty for a search.
- **iOS** suspends apps a few seconds after they leave the screen, so on iPhone a long search
  usually finishes when you come back.

## How it works

- [lib/main.dart](lib/main.dart): the WebView, the bridge script (the app's version of
  `extension/content.js`, same `nishchit:ping` / `nishchit:fetch` messages), back button,
  outside links open in the browser.
- [lib/irctc_fetcher.dart](lib/irctc_fetcher.dart): the app's version of `extension/background.js`.
  It calls IRCTC directly from the phone. If IRCTC refuses that, it makes the call from inside
  IRCTC's own chart page in a hidden WebView, then closes that page after 2 idle minutes.
- [lib/irctc_rules.dart](lib/irctc_rules.dart) + [lib/rules_store.dart](lib/rules_store.dart):
  parse, validate, cache and refresh `irctc-rules.json`.
- [lib/config.dart](lib/config.dart): the site and rules URLs.

## Build

Needs Flutter 3.50+, JDK 17 and the Android SDK (compileSdk 37, CMake 3.22.1). iOS needs Xcode.
The `android/` and `ios/` folders are committed, so `tool/setup.sh` is only needed to regenerate them.

```sh
./tool/sync_web.sh             # refresh the offline copy of the site (assets/web/)
flutter run                    # phone plugged in with USB debugging on, or an emulator
flutter build apk --release    # build/app/outputs/flutter-apk/app-release.apk
flutter test                   # rules validation tests
```

Send the APK to an Android phone and open it (Android asks you to allow installs from that
source). The release build is signed with the debug key: fine for personal use, but the Play
Store needs a real signing key.
