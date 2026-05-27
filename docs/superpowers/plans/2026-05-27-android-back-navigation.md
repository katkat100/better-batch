# Android Back Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android's system back gesture (edge swipe + hardware button) dismiss the topmost open dialog/popover before stepping back through route history; only exit at the root.

**Architecture:** A small dismissable-layer stack store lives in `src/lib/ui/dismissable-stack.ts`. Each dialog and popover registers a dismiss function on open and deregisters on close via `$effect` cleanup. A back-button listener in `+layout.svelte` (Capacitor `@capacitor/app`) calls `popTop()` first; only if the stack is empty does it fall through to `window.history.back()` / `App.exitApp()`. Web users see no behavior change.

**Tech Stack:** SvelteKit 2, Svelte 5 (`$state`, `$effect`, `$bindable`), Capacitor 8 + `@capacitor/app`, Bun + `bun:test`.

**Spec:** [`2026-05-27-android-back-navigation.md`](../specs/2026-05-27-android-back-navigation.md)

---

## Notes for implementers

- The bun binary lives at `~/.bun/bin`. Prefix commands with `export PATH="$HOME/.bun/bin:$PATH"`.
- Validation per task: `bun run typecheck && bun run lint && bun test && bun run e2e`. All four stay green.
- E2E may need a pre-built `build/`; if it times out, run `bun run build` first then `bun run e2e`.
- Pre-commit hook runs typecheck / lint / test / knip. Never `--no-verify`. Never push or amend.
- The end of the plan (Task 5) needs `bunx cap sync android`, which requires Android Studio / SDK locally. If the implementer can't run cap sync, that's fine — the spec says to defer it to the user. Note the requirement and stop short of running it.

---

### Task 1: Dismissable stack store (TDD)

**Files:**
- Create: `src/lib/ui/dismissable-stack.ts`
- Create: `tests/ui/dismissable-stack.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/dismissable-stack.test.ts` with this exact content:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { get } from 'svelte/store';
import { register, popTop, stackDepth } from '../../src/lib/ui/dismissable-stack';

beforeEach(() => {
  while (popTop()) {}
});

describe('dismissable stack', () => {
  it('starts empty', () => {
    expect(get(stackDepth)).toBe(0);
    expect(popTop()).toBe(false);
  });

  it('registers a dismiss fn and pops it', () => {
    let dismissed = false;
    register(() => { dismissed = true; });
    expect(get(stackDepth)).toBe(1);
    expect(popTop()).toBe(true);
    expect(dismissed).toBe(true);
    expect(get(stackDepth)).toBe(0);
  });

  it('pops in LIFO order', () => {
    const calls: string[] = [];
    register(() => calls.push('a'));
    register(() => calls.push('b'));
    register(() => calls.push('c'));
    popTop();
    popTop();
    popTop();
    expect(calls).toEqual(['c', 'b', 'a']);
  });

  it('cleanup removes a registered fn from the middle of the stack', () => {
    const calls: string[] = [];
    register(() => calls.push('a'));
    const cleanupB = register(() => calls.push('b'));
    register(() => calls.push('c'));
    cleanupB();
    expect(get(stackDepth)).toBe(2);
    popTop();
    popTop();
    expect(calls).toEqual(['c', 'a']);
  });

  it('cleanup is idempotent', () => {
    const cleanup = register(() => {});
    cleanup();
    cleanup();
    expect(get(stackDepth)).toBe(0);
  });

  it('popTop returns false on empty stack', () => {
    expect(popTop()).toBe(false);
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test tests/ui/dismissable-stack.test.ts 2>&1 | tail -10`
Expected: cannot resolve `../../src/lib/ui/dismissable-stack`. That's the red state.

- [ ] **Step 3: Implement the stack store**

Create `src/lib/ui/dismissable-stack.ts` with this exact content:

```ts
import { writable } from 'svelte/store';

type DismissFn = () => void;
const stack: DismissFn[] = [];

export const stackDepth = writable(0);

/**
 * Register a dismiss function. Returns a cleanup that removes it
 * from the stack. Designed to be called inside an `$effect` so the
 * effect's cleanup runs the deregister automatically.
 */
export function register(dismiss: DismissFn): () => void {
  stack.push(dismiss);
  stackDepth.set(stack.length);
  return () => {
    const i = stack.indexOf(dismiss);
    if (i >= 0) {
      stack.splice(i, 1);
      stackDepth.set(stack.length);
    }
  };
}

/**
 * Pop and invoke the topmost dismiss function. Returns true if a
 * layer was dismissed, false if the stack was empty.
 */
export function popTop(): boolean {
  const top = stack.pop();
  if (top) {
    stackDepth.set(stack.length);
    top();
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Verify the tests pass**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test tests/ui/dismissable-stack.test.ts 2>&1 | tail -10`
Expected: 6 pass / 0 fail.

- [ ] **Step 5: Pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3
```
Expected: 0 typecheck errors, lint clean, all unit tests pass (180 existing + the new 6 = 190, depending on Phase 2/3 tally — confirm against the previous head count).

- [ ] **Step 6: Commit**

```bash
cd /Users/katieWork/Developer/better-batch && export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/dismissable-stack.ts tests/ui/dismissable-stack.test.ts && git commit -m "$(cat <<'EOF'
feat(ui): add dismissable-layer stack for back-button dismissal

A tiny LIFO store that dialogs and popovers register with on open.
The upcoming Capacitor back-button listener will pop the topmost
layer before falling through to route navigation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Knip will accept the new file because the test (a knip entry) imports it.

---

### Task 2: Install `@capacitor/app` + back-button listener

**Files:**
- Modify: `package.json` (via `bun add`)
- Modify: `bun.lock`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Install the dependency**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun add @capacitor/app 2>&1 | tail -5`

Expected: dep added to `dependencies` in `package.json`. Verify with `grep '"@capacitor/app"' package.json`.

- [ ] **Step 2: Read the current layout**

Run: `cat src/routes/+layout.svelte`

You should see something like:
```svelte
<script>
  import '../app.css';
  let { children } = $props();
</script>

<a href="#app-main" class="sr-only focus:not-sr-only fixed top-2 left-2 z-50 ...">Skip to content</a>

<main id="app-main">
  {@render children()}
</main>
```

- [ ] **Step 3: Add the back-button listener**

Edit `src/routes/+layout.svelte`. Convert the inline `<script>` to typed (if not already), and add the imports + `onMount`:

```svelte
<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import { App } from '@capacitor/app';
  import { popTop } from '$lib/ui/dismissable-stack';

  let { children } = $props();

  onMount(() => {
    if (!Capacitor.isNativePlatform()) return;
    const pending = App.addListener('backButton', ({ canGoBack }) => {
      if (popTop()) return;
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
    return () => {
      pending.then((h) => h.remove());
    };
  });
</script>

<a href="#app-main" class="sr-only focus:not-sr-only fixed top-2 left-2 z-50 bg-canvas border border-obsidian px-3 py-2 rounded-sm text-sm focus:outline-2 focus:outline-ochre">Skip to content</a>

<main id="app-main">
  {@render children()}
</main>
```

If the existing layout uses different exact classes on the skip link, preserve them verbatim — only the `<script>` block changes substantively.

- [ ] **Step 4: Pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -10
```

If e2e fails on a webServer timeout, run `bun run build` first then `bun run e2e`. Expected: green. The listener is gated on `Capacitor.isNativePlatform()` which returns false on Playwright/web, so the listener is a no-op and existing tests are unaffected.

- [ ] **Step 5: Commit**

```bash
cd /Users/katieWork/Developer/better-batch && export PATH="$HOME/.bun/bin:$PATH" && git add package.json bun.lock src/routes/+layout.svelte && git commit -m "$(cat <<'EOF'
feat(android): install @capacitor/app and wire back-button listener

The layout-level listener pops the topmost dismissable layer first,
then falls through to window.history.back() if the WebView has
history, then exits the app. Gated on Capacitor.isNativePlatform()
so web users see no change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Register Dialog primitive with the stack

**Files:**
- Modify: `src/lib/ui/primitives/Dialog.svelte`

- [ ] **Step 1: Read the current Dialog primitive**

Run: `cat src/lib/ui/primitives/Dialog.svelte`

You should see the existing `$effect` block that handles focus + inert when `open` flips true, with a cleanup that removes inert and restores focus.

- [ ] **Step 2: Add the stack import**

Edit `src/lib/ui/primitives/Dialog.svelte` script imports — add:

```ts
import { register } from '$lib/ui/dismissable-stack';
```

- [ ] **Step 3: Extend the existing $effect to register with the stack**

Find the existing `$effect` that runs when `open` is true. Modify it as follows. The exact current code may differ slightly in indentation/style, but the pattern should look like:

```ts
$effect(() => {
  if (!open) return;

  previouslyFocused = document.activeElement as HTMLElement | null;
  const main = document.getElementById('app-main');
  main?.setAttribute('inert', '');
  queueMicrotask(() => dialogEl?.focus());
  const unregister = register(() => close());

  return () => {
    main?.removeAttribute('inert');
    previouslyFocused?.focus?.();
    previouslyFocused = null;
    unregister();
  };
});
```

Two changes:
- Inside the effect body, after `queueMicrotask(...)`, add `const unregister = register(() => close());`.
- Inside the cleanup function returned from the effect, add `unregister();` as the last line.

If the existing effect doesn't have a `close()` function in scope, note that `Dialog.svelte` defines `function close() { open = false; onClose?.(); }` near the top of the script block — `register(() => close())` uses that exact `close` function so dismissal triggers the same `onClose` callback path as the × button and ESC.

- [ ] **Step 4: Pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -10
```

Expected: green. All dialog-exercising e2e flows still pass — the registration is invisible on web (no listener pops it).

- [ ] **Step 5: Commit**

```bash
cd /Users/katieWork/Developer/better-batch && export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/primitives/Dialog.svelte && git commit -m "$(cat <<'EOF'
feat(ui): register Dialog with the dismissable stack

Every Dialog consumer now opts into Android back-button dismissal for
free via the existing open/close effect lifecycle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Register all popovers with the stack

**Files:**
- Modify: `src/lib/ui/BatchDetail.svelte`
- Modify: `src/lib/ui/MultiplierToggle.svelte`
- Modify: `src/lib/ui/cook/CookTimerDock.svelte`
- Modify: `src/routes/+page.svelte`

The pattern for each popover is identical: import `register` from the stack, add an `$effect` that calls `register(() => stateVar = false)` when the state variable is true.

- [ ] **Step 1: Update `src/lib/ui/BatchDetail.svelte`**

Add to the existing script imports:
```ts
import { register } from '$lib/ui/dismissable-stack';
```

Add these four `$effect` blocks anywhere convenient in the script block (e.g. after the existing window-listener function declarations). Each one is independent — paste them in order:

```ts
$effect(() => {
  if (!popoverOpen) return;
  return register(() => popoverOpen = false);
});

$effect(() => {
  if (!moreOpen) return;
  return register(() => moreOpen = false);
});

$effect(() => {
  if (!compareOpen) return;
  return register(() => compareOpen = false);
});

$effect(() => {
  if (!mergeOpen) return;
  return register(() => mergeOpen = false);
});
```

The state variables `popoverOpen`, `moreOpen`, `compareOpen`, and `mergeOpen` already exist in this file (declared with `$state(false)`). The four effects run when each variable flips true and clean up when it flips false.

- [ ] **Step 2: Update `src/lib/ui/MultiplierToggle.svelte`**

Add import:
```ts
import { register } from '$lib/ui/dismissable-stack';
```

Add this `$effect` after the existing script declarations:

```ts
$effect(() => {
  if (!menuOpen) return;
  return register(() => menuOpen = false);
});
```

- [ ] **Step 3: Update `src/lib/ui/cook/CookTimerDock.svelte`**

Add import:
```ts
import { register } from '$lib/ui/dismissable-stack';
```

Add this `$effect` after the existing script declarations:

```ts
$effect(() => {
  if (!manualOpen) return;
  return register(() => manualOpen = false);
});
```

- [ ] **Step 4: Update `src/routes/+page.svelte`**

Add import:
```ts
import { register } from '$lib/ui/dismissable-stack';
```

Add this `$effect` after the existing welcome-related declarations:

```ts
$effect(() => {
  if (!welcomeOpen) return;
  return register(() => welcomeOpen = false);
});
```

- [ ] **Step 5: Pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -10
```

Expected: green. The registrations are invisible on web — every existing e2e flow works because no listener pops the stack on Playwright.

- [ ] **Step 6: Commit**

```bash
cd /Users/katieWork/Developer/better-batch && export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/BatchDetail.svelte src/lib/ui/MultiplierToggle.svelte src/lib/ui/cook/CookTimerDock.svelte src/routes/+page.svelte && git commit -m "$(cat <<'EOF'
feat(ui): register all popovers with the dismissable stack

BatchDetail (inconsistency, more-actions, compare, merge),
MultiplierToggle (⋯ menu), CookTimerDock (manual timer), and the
home WelcomePanel each gain a one-line $effect that registers a
dismiss fn while open. The Android back gesture now closes them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Predictive-back opt-in + cap sync

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Read the current manifest**

Run: `cat android/app/src/main/AndroidManifest.xml`

You should see an `<application>` tag with several `android:*` attributes (allowBackup, icon, label, roundIcon, supportsRtl, theme).

- [ ] **Step 2: Add `android:enableOnBackInvokedCallback="true"`**

Edit `android/app/src/main/AndroidManifest.xml`. Add the attribute alongside the existing application attributes:

```xml
<application
    android:allowBackup="true"
    android:enableOnBackInvokedCallback="true"
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:supportsRtl="true"
    android:theme="@style/AppTheme">
```

The attribute order doesn't matter; alphabetical is fine. This opts the app into Android 13+'s predictive-back peek animation.

- [ ] **Step 3: Run cap sync (skip if no Android SDK locally)**

If the user has Android Studio / SDK set up and wants to rebuild:
```bash
export PATH="$HOME/.bun/bin:$PATH" && bunx cap sync android 2>&1 | tail -15
```

`cap sync` will update `android/app/src/main/assets/capacitor.plugins.json` and `android/capacitor.settings.gradle` to register `@capacitor/app`. If the implementer doesn't have Android Studio available, **skip this step** and note in the report that the user needs to run it locally.

- [ ] **Step 4: Pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -10
```

Expected: green. The manifest change is opaque to the web pipeline.

- [ ] **Step 5: Commit**

If you ran `cap sync`, include the generated changes:
```bash
cd /Users/katieWork/Developer/better-batch && export PATH="$HOME/.bun/bin:$PATH" && git add android/ && git commit -m "$(cat <<'EOF'
feat(android): opt into predictive-back gesture (API 33+)

Add android:enableOnBackInvokedCallback=true to the application tag
so Android 13+ shows the peek-back animation for the system back
swipe. Capacitor v8 wires the WebView's OnBackInvokedDispatcher
automatically when a backButton listener is attached.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If you skipped `cap sync`, only the manifest changed:
```bash
cd /Users/katieWork/Developer/better-batch && export PATH="$HOME/.bun/bin:$PATH" && git add android/app/src/main/AndroidManifest.xml && git commit -m "$(cat <<'EOF'
feat(android): opt into predictive-back gesture (API 33+)

Add android:enableOnBackInvokedCallback=true to the application tag
so Android 13+ shows the peek-back animation for the system back
swipe. The user needs to run 'bunx cap sync android' locally to
register the new @capacitor/app plugin in the generated Android
sources before rebuilding the APK.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Verification sweep

**Files:**
- No edits.

- [ ] **Step 1: Stack consumers audit**

Run: `grep -rln "register(" src/lib src/routes 2>/dev/null | sort`
Expected: at least 6 paths — the stack file itself plus 5 consumers (Dialog, BatchDetail, MultiplierToggle, CookTimerDock, +page.svelte).

- [ ] **Step 2: Listener audit**

Run: `grep -n "backButton\|popTop\|App.exitApp" src/routes/+layout.svelte`
Expected: 3 hits — the addListener for `backButton`, the call to `popTop`, and `App.exitApp`.

- [ ] **Step 3: Capacitor dep audit**

Run: `grep '"@capacitor/app"' package.json`
Expected: one match.

- [ ] **Step 4: Predictive-back audit**

Run: `grep "enableOnBackInvokedCallback" android/app/src/main/AndroidManifest.xml`
Expected: one match with value `"true"`.

- [ ] **Step 5: Final full pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5 && bunx knip 2>&1 | tail -5
```
Expected: 0 typecheck errors, lint clean, all unit tests pass (existing + 6 new stack tests), 12 e2e pass, knip clean.

- [ ] **Step 6: Manual verification (Android device)**

Build the APK on an Android device and walk through these flows. (If the implementer doesn't have a device, hand this checklist to the user.)

1. Home page → swipe back. App exits.
2. Home → open a recipe → swipe back. Lands on home.
3. Recipe → New Batch editor → swipe back. Lands on recipe detail.
4. Home → New Recipe button → dialog opens → swipe back. Dialog closes, home stays.
5. Batch with inconsistencies → tap ⚠ → swipe back. Popover closes, batch detail stays.
6. Cook view → tap "+ Manual" timer → swipe back. Manual timer popover closes, cook view stays.
7. Batch → more-actions … → swipe back. Menu closes.
8. Batch → more-actions … → Compare with… → picker opens → swipe back. Picker closes (more-actions also closed by the existing in-app logic, so it doesn't re-pop).
9. Cook view → multiplier ⋯ menu open → swipe back. Menu closes.
10. Fresh install → Welcome panel visible → swipe back. Welcome dismisses; second swipe exits app.

If any item fails, the report should specify which one and what happened.

- [ ] **Step 7: Report completion**

Summarize: commits, what's covered, anything deferred (e.g. cap sync if the implementer couldn't run it), and the manual-device verification status.
