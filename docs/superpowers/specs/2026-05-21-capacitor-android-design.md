# Capacitor Android scaffold (sub-project 3 of 3)

**Status:** Design approved 2026-05-21.
**Owner:** Katie.
**Part of:** Three-step path to an Android phone app. Sub-project 1
(IndexedDB storage rewrite) and sub-project 2 (adapter-static + build-time
seed) are shipped. This sub-project wraps the static SPA build in a
Capacitor Android shell so the app installs and runs on an Android
device or emulator.

## Summary

Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`. Create
`capacitor.config.ts` at the repo root pointing at the `build/`
directory. Run `npx cap add android` once to generate the `android/`
native project. Add npm scripts (`cap:sync`, `cap:open`, `android`)
that build, sync the bundle into the native project, and open Android
Studio. The success criterion is: "Better Batch" installs on a
connected Android device and launches showing the home page with
seeded recipes.

No Capacitor plugins beyond the core platform. Web APIs we already
use (`Web Audio`, `navigator.vibrate`, `Notification`) work inside the
WebView for the active-foreground case.

## Motivation

After sub-projects 1 and 2, `bun run build` produces a self-contained
static SPA in `build/`. That bundle can already run inside any
WebView. Capacitor wires that WebView into a native Android app shell
with one CLI command and a small amount of project glue. The result
is an installable APK with no production-grade requirements (no Play
Store distribution, no signing CI) — it's a personal sideload app.

## Behavior

### From the user's perspective

- `bun run android` builds the web app, copies it into the Android
  project, and opens Android Studio. From there the user clicks Run
  and the app launches on whatever device or emulator is selected.
- On first launch in a clean install, the app loads the seed snapshot
  (bundled inside the APK) and populates IndexedDB. From then on the
  device's IndexedDB is the source of truth — exactly like the web
  app.
- All UI features (multipliers, cook view, ingredient checks,
  timers, etc.) work identically. The phone interactions are touch
  gestures on the same DOM.
- Web Audio plays the timer chime through the device's media output;
  `navigator.vibrate` vibrates the phone; in-app Web `Notification`
  toasts work while the app is foreground.

### What doesn't work yet

- **Backgrounded alarms.** Web `Notification` only fires while the
  WebView is active. If the user backgrounds the app and walks away,
  the alarm fires late or not at all when they return. Adding
  `@capacitor/local-notifications` is the established follow-up; out
  of scope here.
- **Offline Google Fonts.** `src/app.html` references Fraunces and
  Inter via the Google Fonts CDN. With no network, the app falls
  back to system fonts. Functional but uglier. Bundling the fonts
  locally is a polish item.
- **Play Store distribution.** No signing config, no release
  pipeline. Sideload only.
- **Native icon and splash.** Capacitor's default generic logo
  ships. Customizing the icon is a standard Android resource flow
  that can happen at any time later.

## Architecture

### Dependencies

Three packages, all from the Capacitor team:

```bash
bun add @capacitor/core @capacitor/android
bun add -D @capacitor/cli
```

- `@capacitor/core` — the runtime bridge that gets bundled into the
  web app. Adds a small JS shim that detects whether the page is
  running inside a Capacitor native container and surfaces native
  APIs if so. With no plugins installed, the runtime is effectively
  a no-op detector — the web app behaves identically to today.
- `@capacitor/android` — the native Android platform code. Lives in
  `node_modules/@capacitor/android` as Gradle source that gets pulled
  in during `cap add android`.
- `@capacitor/cli` — dev-time only. Provides the `cap` command used
  by `cap add`, `cap sync`, `cap open`.

### `capacitor.config.ts`

A new file at the repo root:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.katkat100.betterbatch',
  appName: 'Better Batch',
  webDir: 'build'
};

export default config;
```

- `appId` — the Android package name. Follows the `io.github.<username>.<app>`
  convention common to personal/open-source Android apps. No domain
  ownership required.
- `appName` — the display name shown on the phone's home screen and
  in the app switcher.
- `webDir: 'build'` — adapter-static's output directory. After every
  `bun run build`, `cap sync` copies this directory into the Android
  project's WebView assets path.

No other Capacitor config options are needed for v1. Splash screen,
status bar, server URL — all defaults.

### `android/` directory

`npx cap add android` runs once during initial setup. It does two
things:

1. Creates an `android/` directory containing a Gradle project that
   embeds a WebView and serves the bundled web app from
   `android/app/src/main/assets/public/`.
2. Configures `AndroidManifest.xml` with the right
   permissions (notably `INTERNET` for the Google Fonts CDN) and
   the launcher activity.

This directory is committed to git. It's the "native source" of the
Android app — the same way an iOS project's `ios/` directory would
be source, or a SvelteKit project's `src/` is. Subsequent `cap sync`
calls only update the bundled web assets and the auto-generated
`capacitor.config.json` mirror inside `android/`; they don't
regenerate the project structure.

### npm scripts

Three new entries in `package.json`'s `scripts`:

```json
"cap:sync": "cap sync",
"cap:open": "cap open android",
"android": "bun run build && bun run cap:sync && bun run cap:open"
```

- `cap:sync` — copies `build/` into the Android project's WebView
  assets and refreshes the bundled `capacitor.config.json`. Run
  this after every `bun run build` if you want the native build to
  see updates.
- `cap:open` — launches Android Studio with the `android/` project
  loaded. From there the developer drives the Run button.
- `android` — the iterating-loop convenience. Builds web, syncs,
  opens Studio.

No `cap:run` script. Running on a device is faster from inside
Android Studio (Logcat, device picker, instant rebuild).

### `.gitignore`

`cap add android` generates an `android/.gitignore` that covers
most build artifacts. We verify it includes:

- `android/.gradle/` (Gradle daemon caches)
- `android/.idea/` (Android Studio workspace state)
- `android/app/build/` (build outputs)
- `android/build/` (top-level build dir)
- `android/local.properties` (developer's local SDK path)
- `android/captures/` (screenshots/captures)

If any of these are missing in the generated `.gitignore`, add them.

We do NOT ignore:

- `android/app/build.gradle` — project config, committed.
- `android/app/src/` — Android source code (mostly generated, but
  also the manifest and any future custom edits).
- `android/gradle/` (wrapper) — committed so anyone cloning the repo
  can build without setting up Gradle themselves.

## Files touched

**New:**
- `capacitor.config.ts` — top-level config file.
- `android/` — entire directory generated by `npx cap add android`.
  Includes the Gradle wrapper, project structure, default
  manifest, default icon and splash assets, and Capacitor's
  bridge code.

**Modified:**
- `package.json` — three new dev dependencies and three new scripts.
- `bun.lock` — lockfile updated for the new deps.

**Possibly modified:**
- `.gitignore` (top level) — patch only if the auto-generated
  `android/.gitignore` misses any of the listed entries.

## Testing

This sub-project doesn't add automated tests. The verification is
manual against a real Android device or emulator.

**Smoke test sequence after the scaffold lands:**

1. `bun run android` — builds, syncs, opens Studio.
2. In Studio, ensure an emulator or connected device is selected
   in the device picker (the user has Android Studio + SDK
   installed; this is standard local setup).
3. Click Run. Gradle compiles the app, installs it on the target,
   and launches it.
4. Confirm:
   - The launcher icon (default Capacitor logo) appears on the
     home screen.
   - Tapping it opens the app to the recipe list.
   - At least one recipe from the seed snapshot is visible.
   - Tapping into a recipe shows its batches and details.
   - Touch interactions (tapping buttons, scrolling, opening
     dialogs) work.

If any of those four steps fail, that's a blocking issue. The plan
will provide concrete debugging guidance (mostly Logcat output via
Studio).

**Existing unit + e2e tests** continue to gate every commit via
lefthook (typecheck/lint/knip/bun test). E2E tests still run against
`bun run dev`. Capacitor changes don't touch any of those code paths.

## Out of scope

- `@capacitor/local-notifications` for backgrounded alarms.
- `@capacitor/preferences`, `@capacitor/filesystem`, or any other
  Capacitor plugin. Web APIs cover everything we use.
- Custom app icon. Default Capacitor logo for v1.
- Custom splash screen. Default Capacitor splash for v1.
- Bundling Google Fonts locally. CDN with fallback is acceptable.
- Play Store signing, release builds, or distribution pipelines.
- iOS via `@capacitor/ios`. Out of scope; we can add it later if
  needed.
- Automated Android-build CI.
- A11y / a11y testing on the Android device.

## Open questions

None at design approval time.
