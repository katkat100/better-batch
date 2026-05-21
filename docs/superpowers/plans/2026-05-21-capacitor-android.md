# Capacitor Android Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing static SPA build (from sub-project 2) in a Capacitor Android shell so "Better Batch" installs and launches on an Android device or emulator.

**Architecture:** Install `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`. Add `capacitor.config.ts` pointing at `build/`. Run `npx cap add android` once to generate the `android/` native project, then commit it. Three npm scripts wrap the dev loop (`cap:sync`, `cap:open`, `android`). No plugins beyond core — Web Audio, vibration, and Notifications all work inside the WebView for the foreground case.

**Tech Stack:** SvelteKit 2 static build, `@capacitor/core` v7, `@capacitor/android` v7, Bun, Android Studio + SDK already installed locally.

**Spec:** [`docs/superpowers/specs/2026-05-21-capacitor-android-design.md`](../specs/2026-05-21-capacitor-android-design.md)

---

## Task 1: Install Capacitor deps + create capacitor.config.ts

Add the three Capacitor packages and the root-level config that points the native shell at the static SPA build.

**Files:**
- Create: `capacitor.config.ts`
- Modify: `package.json` (deps)
- Modify: `bun.lock` (auto-updated)

- [ ] **Step 1: Install the runtime + native + CLI packages**

```bash
~/.bun/bin/bun add @capacitor/core @capacitor/android
~/.bun/bin/bun add -D @capacitor/cli
```

Expected: `package.json` gets `@capacitor/core` and `@capacitor/android` under `dependencies`, `@capacitor/cli` under `devDependencies`. `bun.lock` is updated. All three resolve to Capacitor v7 (current major as of writing); if bun resolves to a newer major, that's fine — Capacitor's CLI handles version detection.

Verify:

```bash
grep -A 1 "@capacitor" package.json
```

- [ ] **Step 2: Create `capacitor.config.ts` at the repo root**

Create `capacitor.config.ts`:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.katkat100.betterbatch',
  appName: 'Better Batch',
  webDir: 'build'
};

export default config;
```

- [ ] **Step 3: Run typecheck + lint + tests**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun test
```

Expected: 0 errors, all 158 tests pass. The new `capacitor.config.ts` is a config file that typescript-checks but is not bundled into the web app.

If knip flags `@capacitor/core` as unused, that's a false positive — it's bundled at native-build time even if no TypeScript import statement references it from the app code. Add to `knip.json`'s `ignoreDependencies` if needed:

```bash
grep -A 5 '"ignoreDependencies"' knip.json
```

If `ignoreDependencies` doesn't exist or doesn't include `@capacitor/core`, append it. Otherwise leave knip's config alone.

- [ ] **Step 4: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add -A && git commit -m "$(cat <<'EOF'
build: install Capacitor + add config

Adds @capacitor/core, @capacitor/cli, @capacitor/android. Creates
capacitor.config.ts pointing at build/ with the appId
io.github.katkat100.betterbatch and display name "Better Batch".
No native project yet — that lands in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Generate the `android/` project + npm scripts

Run `npx cap add android` once to scaffold the native project, then add the three npm scripts that drive the dev loop. The generated `android/` directory is committed because it's the source for the native build.

**Files:**
- New: `android/` (entire directory, generated)
- Modify: `package.json` (scripts)
- Possibly modify: `.gitignore` (only if `cap add` doesn't fully self-ignore)

- [ ] **Step 1: Ensure a fresh build is available**

`npx cap add android` reads from the configured `webDir`. If `build/` doesn't exist or is stale, generate it now:

```bash
~/.bun/bin/bun run build
```

Expected: the prebuild script logs snapshot counts, Vite builds, `build/index.html` and `build/seed/snapshot.json` exist.

- [ ] **Step 2: Generate the Android native project**

```bash
~/.bun/bin/bunx cap add android
```

Expected output includes lines like:
- `Adding native android project in ./android`
- `Syncing Gradle`
- `Copying web assets from build to android/app/src/main/assets/public`
- `Updating Android plugins`
- `Sync finished in ...`

After this completes:

```bash
ls android/
```

Expected: a Gradle project structure including `app/`, `gradle/`, `build.gradle`, `gradlew`, `gradle.properties`, `settings.gradle`, `variables.gradle`, `.gitignore`, and others.

- [ ] **Step 3: Verify the auto-generated `android/.gitignore`**

```bash
cat android/.gitignore
```

Expected entries (or equivalents):
- `.gradle/`
- `build/` and `app/build/`
- `.idea/`
- `local.properties`
- `captures/`

If anything is missing, append it. The goal: nothing in `android/` that's a build artifact or local-machine state should be committed. Things that SHOULD be committed:
- `android/app/build.gradle` (project config)
- `android/app/src/` (source — including the manifest)
- `android/build.gradle` (top-level config)
- `android/gradle/wrapper/` (Gradle wrapper jar + properties)
- `android/gradlew` and `android/gradlew.bat` (wrapper scripts)
- `android/settings.gradle` and `android/variables.gradle` (project structure)
- `android/.gitignore` itself

If you find a path that gets committed that shouldn't (e.g., `local.properties` slipping through), add it to `android/.gitignore` explicitly:

```bash
echo "local.properties" >> android/.gitignore
```

- [ ] **Step 4: Add the three npm scripts**

Edit `package.json`. Find the `scripts` block. Add these three keys, alongside the existing scripts:

```json
"cap:sync": "cap sync",
"cap:open": "cap open android",
"android": "bun run build && bun run cap:sync && bun run cap:open"
```

Place them anywhere within the `scripts` object. Order is cosmetic; the keys are independent.

- [ ] **Step 5: Confirm the scripts run cleanly**

```bash
~/.bun/bin/bun run cap:sync
```

Expected: `Capacitor sync finished in ...`, and the most recent `build/` contents are mirrored into `android/app/src/main/assets/public/`.

Verify:

```bash
ls android/app/src/main/assets/public/ | head -5
```

Expected: `index.html` and the `_app/` directory (and `seed/` containing `snapshot.json`).

Don't run `cap:open` or `android` here — those launch a GUI. Save the GUI flow for Task 3.

- [ ] **Step 6: Run typecheck + lint + knip + tests**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: 0 errors, all 158 unit tests pass.

If knip complains about `@capacitor/cli` being unused (it's only used by the npm scripts, not imported in code), add it to `knip.json`'s `ignoreDependencies` array, alongside any existing entries:

```bash
grep -B 1 -A 5 '"ignoreDependencies"' knip.json
```

If the file doesn't have an `ignoreDependencies` field, add one:

```json
"ignoreDependencies": ["@capacitor/cli"]
```

- [ ] **Step 7: Commit**

The android/ directory contains many files (typically 50–80). They all go in this commit. The implementer doesn't need to enumerate them; `git add android/ capacitor.config.ts package.json bun.lock` followed by maybe `knip.json` if it was modified covers it.

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add -A && git commit -m "$(cat <<'EOF'
feat(android): scaffold Capacitor native project + dev scripts

Runs npx cap add android once to generate the android/ Gradle project
that wraps the static SPA in a WebView. Adds three npm scripts:
cap:sync (mirrors build/ into the native project), cap:open (launches
Android Studio), and android (chains build + sync + open for the
iterating loop).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Device smoke test + push

This is the manual verification task. The implementer drives Android Studio to install the app on a connected device or emulator and confirms it launches. After verification passes, push the branch.

This task has no automated checks beyond the existing pipeline. The success criterion is visual confirmation of the running app.

**Files:** None modified by code. May add notes if the smoke surfaces a real issue requiring a config tweak.

- [ ] **Step 1: Confirm the previous tasks landed**

```bash
git log --oneline origin/main..HEAD
```

Expected: two new feature commits (Task 1 and Task 2) plus the spec/plan commits.

- [ ] **Step 2: Verify Android Studio + SDK are reachable**

```bash
ls /Applications/Android\ Studio.app 2>&1 | head -1
ls ~/Library/Android/sdk 2>&1 | head -1
which adb
```

Expected: all three return real paths. (User has these installed per the brainstorming context check.)

- [ ] **Step 3: Run the full dev chain**

```bash
~/.bun/bin/bun run android
```

This:
1. Builds the web app (`bun run build`).
2. Syncs into `android/` (`cap sync`).
3. Launches Android Studio with the project loaded (`cap open android`).

Expected: Android Studio opens with the `android/` project. Gradle starts indexing (this takes 30–90 seconds on first open as it downloads any missing dependencies).

- [ ] **Step 4: Pick a target and Run**

Inside Android Studio:
1. In the device dropdown at the top of the toolbar, pick an installed emulator or a connected physical device. If neither exists, create an emulator via Tools → Device Manager → Create Device, accept defaults.
2. Click the green Run button (▶) or hit Cmd+R.

Expected output in the Run tool window:
- Gradle compiles the app (may take 30–60 seconds first time).
- The app installs on the device.
- "Better Batch" launches on the device's screen, showing the home page with the seeded recipe list.

If Gradle fails with "SDK location not found" or similar:
```bash
# Make sure local.properties points at the right SDK
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
```
This file is gitignored and machine-local. Try Run again.

If Gradle fails with a dependency version mismatch, copy the exact error and check whether it's a Capacitor/Gradle Plugin version skew. Capacitor 7 needs Gradle 8.7+; the wrapper that `cap add android` generated handles this. Most version errors come from globally installed older Gradle; Studio uses the wrapper by default so this is rare.

- [ ] **Step 5: Verify the app behavior on device**

On the device's screen:

1. The launcher icon should show "Better Batch" with the default Capacitor logo.
2. Tapping it opens to the home page.
3. At least one recipe from `static/seed/snapshot.json` is visible in the list.
4. Tap into a recipe → batches list + a batch detail view loads.
5. Tap a batch → its detail view shows ingredients, steps, status.
6. Touch interactions (buttons, dialogs, scrolling) feel responsive.

If any of those six steps fail, STOP and report the specific failure. Common issues:
- White screen: WebView didn't load `build/`. Check Logcat in Studio for console errors.
- Recipes don't appear: seed-import didn't run. Check the network panel for `/seed/snapshot.json` → should be a 200 from the bundled assets.
- Touch broken: rare; usually a viewport meta tag issue. Check `src/app.html`.

- [ ] **Step 6: Confirm git status is clean**

After the smoke test, no source files should have changed. If anything mutated (e.g., `local.properties`), make sure it's gitignored. Verify:

```bash
git status
```

Expected: clean working tree (or only `local.properties` if not yet ignored — fix that and re-confirm).

- [ ] **Step 7: Push**

```bash
git push
```

Expected: push succeeds. The `android/` directory ships with the repo from this point forward.

---

## Notes for the implementer

- **Pre-commit hook** (`lefthook`) runs typecheck/lint/knip/test on commit (NOT e2e or Android builds). Use `export PATH="$HOME/.bun/bin:$PATH" &&` before commits.
- **Branch policy:** stay on `main`, do not push until Task 3 Step 7.
- **`npx cap add android` is one-shot.** If it produces a broken android/ directory for any reason, recover by deleting `android/` entirely and rerunning. The state is fully reproducible from `capacitor.config.ts` + the npm scripts.
- **`cap sync` is idempotent.** Run it as often as you want; it just mirrors `build/` into the native project.
- **Android Studio's Gradle daemon caches.** First run is slow (30–90s for indexing, 30–60s for first compile). Subsequent runs are 5–15s.
- **The `cap:open` script blocks the terminal until Studio is launched** (then returns). It's fine to background it or run in a separate shell.
- **If `cap add android` complains that the platform already exists**, the directory was created in a previous attempt. `rm -rf android/` and try again.
- **The smoke test in Task 3 is the only verification** for this sub-project. Unit tests + e2e tests can't reach inside the Android WebView. If the smoke test passes, ship.
