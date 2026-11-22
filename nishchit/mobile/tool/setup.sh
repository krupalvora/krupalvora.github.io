#!/usr/bin/env bash
# One-time setup: generate the Android/iOS projects with `flutter create` and apply the
# platform settings the app needs. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v flutter >/dev/null || { echo "Flutter is not installed: https://docs.flutter.dev/get-started/install"; exit 1; }

flutter create --project-name nishchit --org io.github.krupalvora --platforms=android,ios .
rm -rf test/widget_test.dart  # flutter create's counter-app test doesn't apply

# Android: internet, cleartext only to the in-app localhost server.
manifest=android/app/src/main/AndroidManifest.xml
mkdir -p android/app/src/main/res/xml
cat > android/app/src/main/res/xml/network_security_config.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
    </domain-config>
</network-security-config>
XML
grep -q 'android.permission.INTERNET' "$manifest" || \
  perl -0pi -e 's#(\s*)<application#$1<uses-permission android:name="android.permission.INTERNET"/>$1<application#' "$manifest"
grep -q 'networkSecurityConfig' "$manifest" || \
  perl -0pi -e 's#<application\b#<application android:networkSecurityConfig="\@xml/network_security_config"#' "$manifest"
perl -pi -e 's#android:label="nishchit"#android:label="Nishchit"#' "$manifest"

# Android Gradle: flutter_local_notifications needs compileSdk 37+ and core library desugaring.
gradle=android/app/build.gradle.kts
perl -pi -e 's#compileSdk = flutter\.compileSdkVersion#compileSdk = 37 // flutter_local_notifications needs 37+#' "$gradle"
grep -q 'isCoreLibraryDesugaringEnabled' "$gradle" || \
  perl -0pi -e 's#(targetCompatibility = JavaVersion\.VERSION_\d+\n)#$1        isCoreLibraryDesugaringEnabled = true // flutter_local_notifications\n#' "$gradle"
grep -q 'coreLibraryDesugaring(' "$gradle" || \
  printf '\ndependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n}\n' >> "$gradle"

# iOS: allow the localhost server (App Transport Security), display name.
plist=ios/Runner/Info.plist
/usr/libexec/PlistBuddy -c 'Delete :NSAppTransportSecurity' "$plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c 'Add :NSAppTransportSecurity dict' "$plist"
/usr/libexec/PlistBuddy -c 'Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName Nishchit' "$plist" 2>/dev/null || true

./tool/sync_web.sh
flutter pub get
echo
echo "Done. Plug in a phone (USB debugging on) and run: flutter run"
