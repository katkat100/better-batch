# Android system back: dialog/popover dismissal + route history

**Status:** Design approved 2026-05-27.
**Owner:** Katie.

## Summary

Make the Android system back gesture (edge swipe or hardware button)
behave the way mobile users expect: close the topmost open
dialog/popover, then walk back through SvelteKit route history, then
exit the app at the root. Currently the app has no back-handling code
and `@capacitor/app` isn't installed, so the system back gesture
exits the app immediately.

The fix is a tiny global "dismissable stack" store that every
dialog and popover registers with on open. A back-button listener in
the layout pops the topmost dismiss function; only if the stack is
empty does it fall through to route navigation.

## Motivation

A user reported that on Android the built-in back swipe doesn't work
with the app — it closes the whole app instead of stepping back
through navigation or closing the currently-open dialog. That's the
default Capacitor behavior when no `backButton` listener is
registered.

Phone-native expectations:

1. Open a Dialog → back closes the dialog.
2. Open a popover (menu, picker) → back closes the popover.
3. On a sub-route (recipe detail, batch editor, cook view) → back
   navigates to the parent route.
4. At the root → back exits the app.

## Behavior

### System back priority

When the system back button or edge gesture fires on Android, the
listener resolves in this order:

1. **Topmost dismissable layer**: if any dialog or popover is open,
   call its dismiss function and return. The dismissable stack pops
   the most recently opened layer regardless of which component
   owns it.
2. **Route history**: if `canGoBack` from the Capacitor event is
   true, call `window.history.back()`. SvelteKit handles the route
   transition.
3. **Exit**: call `App.exitApp()`.

### Dismissable layers covered

- **Every Dialog primitive consumer** (NewRecipeDialog,
  ConfirmDeleteDialog, OutcomeForm, EndCookDialog, EditVariablesDialog,
  PasteRecipeDialog, InconsistencyDialog, CookQuickNoteFab dialog).
  Single integration inside `Dialog.svelte`.
- **BatchDetail inconsistency popover** (`popoverOpen`).
- **BatchDetail more-actions menu** (`moreOpen`).
- **BatchDetail compare picker** (`compareOpen`).
- **BatchDetail merge picker** (`mergeOpen`).
- **MultiplierToggle ⋯ menu** (`menuOpen`).
- **CookTimerDock manual-timer popover** (`manualOpen`).
- **WelcomePanel** (registered when `welcomeOpen` is true on the
  home page) — back should dismiss it before navigating.

### Web behavior (unchanged)

The back listener is gated on `Capacitor.isNativePlatform()`. On the
web build, the browser's native back button behaves exactly as it
does today (full route navigation, no dialog dismissal). We do not
want to interfere with browser history on web.

### Predictive back gesture (Android 13+)

`AndroidManifest.xml` opts the application into the predictive back
API:

```xml
<application
    android:enableOnBackInvokedCallback="true"
    …
```

Capacitor v8 wires the WebView's `OnBackInvokedDispatcher.setEnabled`
automatically when a `backButton` listener is registered, so no
additional Java/Kotlin code is needed. The result on Android 13+ is
the "peek back" animation users expect when they begin the swipe.

## Architecture

### Files added

- `src/lib/ui/dismissable-stack.ts` — the global stack store with `register` and `popTop`.
- `tests/ui/dismissable-stack.test.ts` — unit tests for the stack store.

### Files modified

- `package.json` / `bun.lock` — `@capacitor/app` dependency.
- `android/app/src/main/AndroidManifest.xml` — predictive-back opt-in.
- `src/lib/ui/primitives/Dialog.svelte` — register the dialog's `close` function with the stack while open.
- `src/lib/ui/BatchDetail.svelte` — register popoverOpen, moreOpen, compareOpen, mergeOpen.
- `src/lib/ui/MultiplierToggle.svelte` — register menuOpen.
- `src/lib/ui/cook/CookTimerDock.svelte` — register manualOpen.
- `src/routes/+page.svelte` — register welcomeOpen.
- `src/routes/+layout.svelte` — install the Capacitor back-button listener.

### Stack store API

```ts
// src/lib/ui/dismissable-stack.ts
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

Notes:
- The stack is LIFO (last-opened, first-dismissed) — matches user
  intuition for nested dialogs/popovers.
- `register` returns a cleanup that removes the exact function,
  not the top-of-stack — handles the case where a layer is
  programmatically closed (e.g. user clicks the dialog's Save) and
  some other layer is open above it.
- `stackDepth` is exported as a store mostly for testing /
  diagnostics; nothing in the app needs to read it.

### Consumer pattern (popovers)

Each non-Dialog popover gets one `$effect`:

```svelte
<script>
  import { register } from '$lib/ui/dismissable-stack';

  let popoverOpen = $state(false);

  $effect(() => {
    if (!popoverOpen) return;
    return register(() => popoverOpen = false);
  });
</script>
```

The `$effect` re-runs when `popoverOpen` changes. When it flips true,
we register; the effect's cleanup (returned from the body) runs when
`popoverOpen` flips false OR when the component unmounts. Either way
the stack stays clean.

### Consumer pattern (Dialog primitive)

Inside the existing `$effect` in `Dialog.svelte` that handles
focus/inert, add the register call alongside:

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

Every Dialog consumer gets back-button dismissal for free.

### Back-button listener

In `src/routes/+layout.svelte`:

```ts
import { onMount } from 'svelte';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { popTop } from '$lib/ui/dismissable-stack';

onMount(() => {
  if (!Capacitor.isNativePlatform()) return;
  const pending = App.addListener('backButton', ({ canGoBack }) => {
    if (popTop()) return;
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
  return () => {
    pending.then(h => h.remove());
  };
});
```

The Capacitor `App.addListener` returns a Promise of a handle; we
store the promise and resolve it in cleanup to call `.remove()`.

### Stack-depth interaction with focus restore

The Dialog primitive's existing focus-restore logic saves the
previously-focused element on open and restores it on close. When
back dismisses a dialog, `close()` is called, which sets `open =
false`, which triggers the effect's cleanup, which restores focus.
The flow is identical to ESC-key dismissal — no new code path.

## Testing

### Unit — `tests/ui/dismissable-stack.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { get } from 'svelte/store';
import { register, popTop, stackDepth } from '../../src/lib/ui/dismissable-stack';

beforeEach(() => {
  // Empty the stack between tests by popping until empty.
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
    cleanup();  // no-op
    expect(get(stackDepth)).toBe(0);
  });

  it('popTop returns false on empty stack', () => {
    expect(popTop()).toBe(false);
  });
});
```

### Manual verification (Android device)

Build APK with `bun run android`, install, and verify:

1. From home page, swipe back. App exits.
2. Open a recipe. Swipe back. Lands on home page (not exit).
3. Open recipe → new batch editor. Swipe back. Lands on recipe detail.
4. Open New Recipe dialog. Swipe back. Dialog closes, home page stays.
5. Open a batch with inconsistencies → tap the ⚠ badge → swipe back. Popover closes, batch detail stays.
6. Open MultiplierToggle ⋯ menu → swipe back. Menu closes, view stays.
7. Open Compare picker from a batch → swipe back. Picker closes.
8. Open EndCook dialog from cook view → swipe back. Dialog closes, cook view stays.
9. From home page on a fresh install (Welcome panel showing), swipe back. Welcome panel dismisses (then a second swipe exits app since panel state was popped, leaving an empty stack and we're at root).

### No e2e

Playwright can't dispatch Capacitor native events without significant
harness work. The unit tests cover the stack logic; the integration
between the stack and each consumer is mechanical (one `$effect`
each). Manual device verification covers the system-level wiring.

## Out of scope

- **Web-side history pushState** so browser back closes dialogs on
  web. Web users already have route history; dialog dismissal via
  ESC and × works. Adding pushState would make the URL pretty
  ugly and risk forward-button confusion.
- **iOS shell** — no iOS project exists yet.
- **Confirmation-on-exit prompt** ("Press back again to exit"). The
  default of immediate exit at root is fine — users can re-open the
  app one tap away.
- **Custom predictive-back animation** — Capacitor's default WebView
  handling produces the standard peek animation, which is what users
  expect.
- **Replacing existing ESC handlers**. The popovers' window-keydown
  ESC handlers still work for keyboard users; the back-button
  listener is additive.

## Open questions

None at design approval time.
