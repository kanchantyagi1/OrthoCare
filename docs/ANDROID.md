# OrthoCare AI — Android Build Guide

The Flutter app source in `mobile/` was hand-written in a dev environment with **no Flutter SDK,
no Android SDK/Java, and no `adb`** — none of it has been compiled, analyzed, or run yet. This is
a guide for the first human with that tooling to get it building. Expect to fix a handful of
minor issues on the first `flutter pub get && flutter analyze` (dependency version pins, etc.) —
see `mobile/README.md` for the specific risk areas the mobile build-out flagged.

The app covers **all three roles in one Flutter codebase** — patient, nurse, and admin/doctor
(the admin/doctor screens: dashboard, nurse management, shift management, attendance,
escalations, document knowledge base — are additional role-gated screens inside this same app,
not a separate web dashboard).

## 1. Install Flutter + Android tooling

1. Install Flutter (stable channel): https://docs.flutter.dev/get-started/install — pick your OS.
2. Run `flutter doctor` and resolve everything it flags. At minimum you need:
   - Android SDK + command-line tools (Flutter's installer can fetch these, or install Android
     Studio which bundles them)
   - A JDK (17 is the current safe default for Android Gradle Plugin compatibility)
   - `adb` on your `PATH` (comes with the Android SDK platform-tools)
3. Accept Android SDK licenses: `flutter doctor --android-licenses`

## 2. Get the project building

```bash
cd mobile
flutter pub get
flutter analyze
```

Fix whatever `flutter analyze` surfaces — null-safety nits, an import path, a version pin in
`pubspec.yaml` that needs bumping to what's actually on pub.dev today. This is expected; the code
was written against known-stable Flutter/Riverpod/Dio/go_router APIs but never compiler-checked.

## 3. Configure the backend API URL

Find the API base URL config (`mobile/lib/core/config.dart` or equivalent — check `mobile/README.md`
for the exact path chosen) and point it at your backend:

- Local dev: `http://10.0.2.2:3000` (Android emulator's alias for the host machine's `localhost`)
  or your machine's LAN IP if testing on a physical device on the same network.
- Production: `https://api.yourclinic.example` (after completing `docs/DEPLOYMENT.md`).

Never hardcode AWS/OpenAI/database credentials into the mobile app — it only ever talks to your
backend's REST API.

## 4. Wire up Firebase Cloud Messaging

1. In the Firebase console (same project as `docs/DEPLOYMENT.md` step 3), add an Android app with
   package name matching `mobile/android/app/build.gradle`'s `applicationId`
   (`com.orthocare.app`).
2. Download `google-services.json` and place it at `mobile/android/app/google-services.json`
   (gitignored — never commit it).
3. Confirm the Google Services Gradle plugin is applied (should already be wired into
   `mobile/android/build.gradle` / `app/build.gradle` by the initial scaffold — check
   `mobile/README.md` if `flutter build` complains it's missing).

## 5. Run it

```bash
flutter devices
flutter run -d <device-id>
```

Test on at least a small, normal, and large-screen Android device/emulator per spec section 62 —
Pixel, Samsung, OnePlus, and Xiaomi if you have access to real hardware; otherwise AVDs with
different screen sizes/densities are an acceptable stand-in for an MVP.

## 6. Generate a release signing key

```bash
keytool -genkey -v -keystore ~/orthocare-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias orthocare
```

Store the keystore and its passwords somewhere safe (a password manager, not git). Losing it means
you can never again publish an update to the same app listing.

Create `mobile/android/key.properties` (gitignored):

```properties
storePassword=<keystore password>
keyPassword=<key password>
keyAlias=orthocare
storeFile=/absolute/path/to/orthocare-release.jks
```

Confirm `mobile/android/app/build.gradle` reads `key.properties` for the release `signingConfig`
(wire this in if the initial scaffold left it as debug-signed only).

## 7. Build the release artifact

```bash
flutter build apk --release      # a single APK, fine for direct install/sideload/testing
# or, for Play Store distribution:
flutter build appbundle --release
```

Output lands under `mobile/build/app/outputs/flutter-apk/app-release.apk` (or
`.../bundle/release/app-release.aab`).

## 8. ARM64 / compatibility check

`pubspec.yaml`/Gradle should already restrict to `arm64-v8a` (per spec section 4/62 — no 32-bit
or x86 builds needed for modern devices). Sideload the release APK onto at least one physical
device before considering the MVP done; an emulator run alone does not prove Play Services/FCM
push delivery works, since many emulator images lack Google Play Services.
