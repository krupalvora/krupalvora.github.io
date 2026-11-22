#!/usr/bin/env bash
# Copy the Nishchit web app (the folder above mobile/) into assets/web/, which the app bundles.
# Run after any change to the site: index.html, privacy.html, css/, js/, assets/.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
site="$(cd "$here/.." && pwd)"
dest="$here/assets/web"

rm -rf "$dest"
mkdir -p "$dest"
cp "$site/index.html" "$site/privacy.html" "$site/irctc-rules.json" "$dest/"
cp -R "$site/css" "$site/js" "$site/assets" "$dest/"
# Browser-extension install page and its script are not used in the app.
rm -f "$dest/js/install.js" "$dest/css/install.css"
echo "Synced web app -> $dest"
