#!/usr/bin/env bash
# Build Marbel AI sebagai APK Android (pembungkus WebView Capacitor).
#
# Prasyarat: JDK 17+, Android SDK (platform 35 + build-tools 35), Node.js 18+.
#   export ANDROID_HOME=/path/ke/Android/Sdk
#
# Pemakaian:
#   ./build-apk.sh            # APK debug  → android/app/build/outputs/apk/debug/app-debug.apk
#   ./build-apk.sh release    # APK release → android/app/build/outputs/apk/release/app-release.apk
#
# Build release ditandatangani memakai android/marbel-release.keystore bila ada;
# jika keystore/keystore.properties tidak ada, release memakai debug signing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-debug}"
cd "$ROOT"

if [ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]; then
  echo "ERROR: set ANDROID_HOME (atau ANDROID_SDK_ROOT) ke direktori Android SDK." >&2
  exit 1
fi
export ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"

if [ ! -d node_modules/@capacitor/android ]; then
  npm install --no-audit --no-fund @capacitor/core@7 @capacitor/cli@7 @capacitor/android@7
fi

# Aset web adalah sumber tunggal; www/ (webDir Capacitor) hanya salinannya.
mkdir -p www
cp index.html app.js styles.css www/

# Ikon launcher dihasilkan dari logo aplikasi.
python3 build-icon.py

# Platform android dibuat sekali, lalu aset web disinkronkan.
if [ ! -d android ]; then
  npx cap add android
fi
[ -f android/local.properties ] || printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
npx cap sync android

cd android

if [ "$MODE" = "release" ]; then
  ./gradlew --no-daemon assembleRelease
  APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
else
  ./gradlew --no-daemon assembleDebug
  APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
fi

echo
echo "APK: $APK"
ls -lh "$APK"
