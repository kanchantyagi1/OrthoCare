# OrthoCare AI — Mobile App (Flutter)

AI Support. Human Care. Better Recovery.

A single Flutter codebase serving three roles — **Nurse**, **Patient**, and **Admin/Doctor** — against the OrthoCare AI NestJS backend. There is no separate web admin app: the admin/doctor dashboard is built as additional screens in this same app, gated by role.

## ⚠️ Important: this code is unverified

**Flutter SDK, Dart, and the Android SDK/Java/adb are not installed in the environment this code was written in.** Every file here was hand-written to match current Flutter/Dart conventions and the standard `flutter create` project layout, but **none of it has been run through `flutter pub get`, `flutter analyze`, or a compiler.**

Before trusting this code, install Flutter and run:

```bash
cd mobile
flutter pub get
flutter analyze
flutter test        # no widget tests were written yet — add them as you build on this
```

Fix anything `flutter analyze` flags (most likely: minor import/typo issues, or a dependency version bump needed for your installed Flutter channel) before proceeding to build.

## Building without local Flutter/Android tooling (CI)

Since this dev environment has no Flutter SDK or Android SDK/Java, `.github/workflows/mobile-build.yml`
builds a release APK + AAB in GitHub Actions on every push that touches `mobile/`, and on-demand via
the Actions tab ("Run workflow", optionally overriding the backend `api_base_url` input). Download the
`orthocare-ai-release-apk` / `orthocare-ai-release-aab` artifacts from the run's Summary page. The build
is debug-signed unless you add these repo secrets for real release signing:

- `ANDROID_KEYSTORE_BASE64` — your upload keystore, base64-encoded (`base64 -w0 your.jks`)
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS`

This requires pushing this repo to GitHub first — it hasn't been pushed anywhere from this dev
environment (no remote configured here).

## Setup

1. Install the [Flutter SDK](https://docs.flutter.dev/get-started/install) (stable channel) and the Android SDK (Android Studio is the easiest path — it installs both the SDK and a JDK).
2. Run `flutter doctor` and resolve anything it flags.
3. `cd mobile && flutter pub get`.
4. Point the app at your backend (default is the Android-emulator loopback `http://10.0.2.2:3000`, which reaches `localhost:3000` on the host machine):

   ```bash
   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
   ```

   For a physical device, use your machine's LAN IP instead of `10.0.2.2`, e.g. `--dart-define=API_BASE_URL=http://192.168.1.50:3000`. For a deployed backend, use its HTTPS URL.

5. Build a release APK:

   ```bash
   flutter build apk --release --dart-define=API_BASE_URL=https://api.yourclinic.example.com
   ```

   The default `android/app/build.gradle.kts` release build is **debug-signed** so this works out of the box for testing. Before distributing to real users, create a real upload key and signing config (`android/key.properties` + a `signingConfig` in `android/app/build.gradle.kts`) — never commit the keystore or `key.properties` (both are already in `.gitignore`).

## Push notifications (optional)

The app calls Firebase (`firebase_core`, `firebase_messaging`) for FCM push, but every call is wrapped in a try/catch in `lib/core/notifications/push_notification_service.dart` — **the app runs fine without any Firebase project configured**; push notifications are simply disabled and a debug line is logged. To enable real push:

1. Create a Firebase project and an Android app inside it with package name `com.orthocare.ai.orthocare_ai`.
2. Download `google-services.json` into `android/app/`.
3. Add the `com.google.gms.google-services` plugin to `android/settings.gradle.kts` and `android/app/build.gradle.kts` (omitted here on purpose, to keep the project buildable without a Firebase project).

## Architecture

- **State management:** Riverpod (`flutter_riverpod`) — see `lib/features/*/*_controller.dart`.
- **Networking:** Dio, wrapped in `lib/core/network/api_client.dart`. Attaches the JWT automatically, normalizes errors into `ApiException`, and routes to `/login` on a 401.
- **Routing:** `go_router`, in `lib/core/routing/app_router.dart`. A single `redirect` callback handles the auth gate *and* the per-role section guard (a patient can't navigate into `/admin/...`, etc.) — it is driven by `authControllerProvider`.
- **Session storage:** `flutter_secure_storage` (encrypted at rest) — never `SharedPreferences` for the JWT.
- **Models:** plain Dart classes with hand-written `fromJson` (no `build_runner`/codegen, since that can't be verified in this environment either).
- **Theme:** single source in `lib/core/theme/app_theme.dart`, Material 3, light + dark. No widget hard-codes a color or screen dimension; layouts use `MediaQuery`/`Flexible`/`Wrap` so the same code works across small/normal/large Android phones.

## Screens

**Auth**
1. Splash (`/splash`) — restores session from secure storage, routes by role.
2. Login (`/login`) — role is returned by the backend, not chosen in the UI.

**Nurse**
3. Dashboard (`/nurse/dashboard`) — today's shift, ACTIVE/OFFLINE punch state, new/pending/resolved counts, average response time.
4. Shift (`/nurse/shift`).
5. Punch In/Out — action on the dashboard, idempotent against double-tap.
6. Escalations list (`/nurse/escalations`) — urgent cases sorted first.
7. Escalation detail (`/nurse/escalations/:id`) — patient info, AI conversation, source documents, Call Patient / Mark Contacted / Resolve (full resolution form) / Escalate to Doctor.
8. Profile (`/nurse/profile`).

**Patient**
9. Dashboard (`/patient/dashboard`).
10. AI Chat (`/patient/chat`) — example-question chips, chat bubbles, "Was this helpful? Yes / No, talk to nurse" under each AI answer.
11. Chat history (`/patient/history`).
12. Escalation status (`/patient/escalations`) — tracks tickets the patient raised.

**Admin / Doctor** (folded into this app, not a separate web dashboard)
13. Dashboard (`/admin/dashboard`) — Active Nurses / Patient Chats / AI Resolved / Human Escalations / Pending / Urgent cards, plus a Nurse Performance table.
14. Nurse Management (`/admin/nurses`) — list/add/edit nurses.
15. Shift Management (`/admin/shifts`) — list/add/delete shifts per nurse.
16. Attendance (`/admin/attendance`) — punch-in/out report table.
17. Escalations (`/admin/escalations`) — all cases across all nurses; tapping one reuses the nurse Escalation Detail screen (server-side role check applies).
18. Document Knowledge Base (`/admin/knowledge`) — upload PDF/DOCX, status per document (Uploading → Processing → Ready/Active/Failed), Activate/Archive/Reprocess/Delete.

## REST contract

`lib/core/network/api_client.dart` calls the endpoints listed in the product spec (section 54): `/auth/*`, `/attendance/*`, `/shifts`, `/chat/*`, `/knowledge/documents*`, `/escalations*`, `/dashboard`, `/reports/*`.

Two endpoint groups are used by the admin screens but were **not** enumerated in the original spec's endpoint list — they need to exist on the backend for Nurse/Shift Management to work:

- `GET /nurses`, `POST /nurses`, `PUT /nurses/:id`, `DELETE /nurses/:id`
- `GET /escalations?scope=all` (admin: every case) vs. `GET /escalations?scope=mine` (nurse: assigned to me / patient: raised by me)
- `GET /dashboard/nurse` — a nurse-scoped variant of the admin `/dashboard` stats (today's shift, attendance, new/pending/resolved counts, average response time) consumed by the Nurse Dashboard screen

## Known gaps to close once Flutter is installed

- No widget/integration tests yet (`flutter test` currently has nothing to run).
- No app icon / launcher icon beyond the default Flutter one (`android/app/src/main/res/mipmap-*/ic_launcher.png` were not generated — add real icons via `flutter_launcher_icons` or manually before release).
- `pubspec.yaml` dependency versions were chosen from current knowledge at write-time; run `flutter pub outdated` once installed and bump if your Flutter SDK requires newer/older major versions (especially `file_picker`, `firebase_core`/`firebase_messaging`, and `go_router`, which move quickly).
- iOS was intentionally not scaffolded — the product spec targets Android only.
