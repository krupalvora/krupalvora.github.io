# Nishchit mobile (Flutter)

Runs Nishchit on Android and iPhone with **no extension, proxy or computer**: the phone fetches
IRCTC's chart itself.

## How it works

- The web app (one folder up) is bundled into the app under `assets/web/` and served from an
  in-app server on `http://localhost:47615`. ES modules don't load from `file://`, which is why
  the app runs its own server.
- An injected script ([lib/main.dart](lib/main.dart), `_bridgeScript`) speaks the same
  `nishchit:ping` / `nishchit:fetch` protocol as the browser extension's content script. The page
  can't tell them apart except for `data-nishchit-app`, which only changes wording ("Live · your phone").
- [lib/irctc_fetcher.dart](lib/irctc_fetcher.dart) is the app's version of `extension/background.js`:
  it calls IRCTC directly from the phone (native code has no CORS limits). If IRCTC refuses, it
  makes the call from inside IRCTC's own chart page, loaded in a hidden WebView, and closes that
  page after 2 idle minutes. Requests go one at a time with a 300 ms gap.
- [lib/irctc_rules.dart](lib/irctc_rules.dart) is a port of `extension/rules.js`: only the three
  chart endpoints, with validated inputs. **Keep it in sync with `extension/rules.js`.**
- External links (IRCTC, GitHub) open in the phone's browser.

## Setup (once)

Needs Flutter 3.24+, plus Android Studio (Android) or Xcode (iOS).

```sh
cd mobile
./tool/setup.sh     # flutter create + Android/iOS settings + copies the web app + pub get
flutter run         # with a phone plugged in (USB debugging on) or an emulator
```

## After changing the website

```sh
./tool/sync_web.sh  # re-copy index.html, css/, js/, assets/ into assets/web/
```

## Install on a phone without a cable

```sh
flutter build apk --release    # build/app/outputs/flutter-apk/app-release.apk
```

Send the APK to the phone and open it (Android asks you to allow installs from that source).
Without a signing key configured, the release build uses the debug key, which is fine for
personal use but not for the Play Store. iPhones need Xcode and an Apple developer account
(free accounts work for 7 days at a time).

## Tests

```sh
flutter test        # request allowlist (irctc_rules.dart)
```
