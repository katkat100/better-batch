# Background Timer Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedule a native Android notification at the moment each cook timer starts so the alarm fires even when the WebView has been backgrounded and JS is throttled.

**Architecture:** New `src/lib/ui/cook/cook-notifications.ts` module wraps `@capacitor/local-notifications` with three functions (`scheduleTimerNotification`, `cancelTimerNotification`, `cancelAllTimerNotifications`). All are no-ops on web via `Capacitor.isNativePlatform()` guard. `CookView.svelte`'s four timer handlers schedule/cancel as part of the lifecycle. `CookTimerDock.svelte`'s finish-detection $effect cancels the pending native notification when JS catches the finish in real time, and suppresses the in-app chime when overshoot ≥ 2s (the user already heard the OS alarm during background).

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, `@capacitor/core` and `@capacitor/local-notifications`, TypeScript, Bun test.

**Spec:** [`docs/superpowers/specs/2026-05-21-background-timer-notifications-design.md`](../specs/2026-05-21-background-timer-notifications-design.md)

---

## Task 1: Add `@capacitor/local-notifications` + new `cook-notifications.ts` module

The scheduling module wraps the plugin. All three exported functions are no-ops on web. On native, they translate timer-UUID strings to Capacitor's numeric IDs via a module-level Map.

**Files:**
- Create: `src/lib/ui/cook/cook-notifications.ts`
- Create: `tests/ui/cook/cook-notifications.test.ts`
- Modify: `package.json` (add dependency)

- [ ] **Step 1: Install the plugin**

```bash
~/.bun/bin/bun add @capacitor/local-notifications
```

Expected: `@capacitor/local-notifications` appears under `dependencies` in `package.json`. `bun.lock` is updated.

- [ ] **Step 2: Write the failing tests**

Create `tests/ui/cook/cook-notifications.test.ts`:

```ts
import { describe, it, expect, beforeEach, mock } from 'bun:test';

// Module-level mocks. The Capacitor + LocalNotifications modules are mocked
// per-test to control isNativePlatform and observe schedule/cancel calls.
let isNative = false;
const scheduleCalls: Array<{ notifications: Array<{ id: number; title: string; body: string; schedule: { at: Date } }> }> = [];
const cancelCalls: Array<{ notifications: Array<{ id: number }> }> = [];

mock.module('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNative
  }
}));

mock.module('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: async (opts: typeof scheduleCalls[number]) => { scheduleCalls.push(opts); return { notifications: [] }; },
    cancel: async (opts: typeof cancelCalls[number]) => { cancelCalls.push(opts); }
  }
}));

import {
  scheduleTimerNotification,
  cancelTimerNotification,
  cancelAllTimerNotifications,
  _resetForTests
} from '../../../src/lib/ui/cook/cook-notifications';

beforeEach(() => {
  scheduleCalls.length = 0;
  cancelCalls.length = 0;
  isNative = false;
  _resetForTests();
});

describe('cook-notifications on web (isNativePlatform = false)', () => {
  it('scheduleTimerNotification is a no-op', async () => {
    await scheduleTimerNotification('t1', 5000, 'rest', 0);
    expect(scheduleCalls.length).toBe(0);
  });

  it('cancelTimerNotification is a no-op', async () => {
    await cancelTimerNotification('t1');
    expect(cancelCalls.length).toBe(0);
  });

  it('cancelAllTimerNotifications is a no-op', async () => {
    await cancelAllTimerNotifications();
    expect(cancelCalls.length).toBe(0);
  });
});

describe('cook-notifications on native (isNativePlatform = true)', () => {
  beforeEach(() => { isNative = true; });

  it('scheduleTimerNotification assigns a numeric id and calls LocalNotifications.schedule', async () => {
    await scheduleTimerNotification('uuid-a', 10000, 'rest', 2);
    expect(scheduleCalls.length).toBe(1);
    expect(scheduleCalls[0].notifications.length).toBe(1);
    const n = scheduleCalls[0].notifications[0];
    expect(typeof n.id).toBe('number');
    expect(n.title).toBe('Timer done');
    expect(n.body).toBe('Step 3 · rest');  // stepIndex 2 → "Step 3"
    expect(n.schedule.at).toBeInstanceOf(Date);
  });

  it('uses "Manual timer" body when stepIndex is negative', async () => {
    await scheduleTimerNotification('uuid-m', 5000, 'sauce reduction', -1);
    expect(scheduleCalls[0].notifications[0].body).toBe('Manual timer · sauce reduction');
  });

  it('cancelTimerNotification looks up the numeric id and calls LocalNotifications.cancel', async () => {
    await scheduleTimerNotification('uuid-b', 1000, 'rest', 0);
    const numericId = scheduleCalls[0].notifications[0].id;
    await cancelTimerNotification('uuid-b');
    expect(cancelCalls.length).toBe(1);
    expect(cancelCalls[0].notifications).toEqual([{ id: numericId }]);
  });

  it('cancelTimerNotification is a no-op for unknown timer IDs', async () => {
    await cancelTimerNotification('never-scheduled');
    expect(cancelCalls.length).toBe(0);
  });

  it('cancelAllTimerNotifications cancels every scheduled timer in one batch', async () => {
    await scheduleTimerNotification('a', 1000, 'one', 0);
    await scheduleTimerNotification('b', 2000, 'two', 1);
    await cancelAllTimerNotifications();
    expect(cancelCalls.length).toBe(1);
    expect(cancelCalls[0].notifications.length).toBe(2);
  });

  it('scheduling the same timer ID twice reuses no state — second schedule allocates a new numeric id', async () => {
    await scheduleTimerNotification('a', 1000, 'one', 0);
    const firstId = scheduleCalls[0].notifications[0].id;
    await scheduleTimerNotification('a', 2000, 'two', 0);
    const secondId = scheduleCalls[1].notifications[0].id;
    expect(secondId).not.toBe(firstId);
    // After re-schedule, cancel uses the latest id
    await cancelTimerNotification('a');
    expect(cancelCalls[0].notifications).toEqual([{ id: secondId }]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
~/.bun/bin/bun test tests/ui/cook/cook-notifications.test.ts
```

Expected: all tests fail with `Cannot find module '../../../src/lib/ui/cook/cook-notifications'` or similar.

- [ ] **Step 4: Implement the module**

Create `src/lib/ui/cook/cook-notifications.ts`:

```ts
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Maps our timer UUID strings to the numeric IDs Capacitor uses.
const idMap = new Map<string, number>();
let nextNumericId = 1;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function buildBody(label: string, stepIndex: number): string {
  return stepIndex >= 0 ? `Step ${stepIndex + 1} · ${label}` : `Manual timer · ${label}`;
}

export async function scheduleTimerNotification(
  timerId: string,
  ms: number,
  label: string,
  stepIndex: number
): Promise<void> {
  if (!isNative()) return;
  const numericId = nextNumericId++;
  idMap.set(timerId, numericId);
  await LocalNotifications.schedule({
    notifications: [{
      id: numericId,
      title: 'Timer done',
      body: buildBody(label, stepIndex),
      schedule: { at: new Date(Date.now() + ms) }
    }]
  });
}

export async function cancelTimerNotification(timerId: string): Promise<void> {
  if (!isNative()) return;
  const numericId = idMap.get(timerId);
  if (numericId === undefined) return;
  idMap.delete(timerId);
  await LocalNotifications.cancel({ notifications: [{ id: numericId }] });
}

export async function cancelAllTimerNotifications(): Promise<void> {
  if (!isNative()) return;
  if (idMap.size === 0) return;
  const ids = [...idMap.values()].map(id => ({ id }));
  idMap.clear();
  await LocalNotifications.cancel({ notifications: ids });
}

// Test hook only — resets the id map and counter between cases.
export function _resetForTests(): void {
  idMap.clear();
  nextNumericId = 1;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
~/.bun/bin/bun test tests/ui/cook/cook-notifications.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 6: Run full pipeline**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: 0 errors. Knip may flag `@capacitor/local-notifications` initially — if so, the new module imports it, so knip should be satisfied. If knip still complains, the dependency is only used at native runtime; add it to `knip.json`'s `ignoreDependencies` array.

Full suite count goes from 158 → 167 (9 new tests).

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add -A && git commit -m "$(cat <<'EOF'
feat(cook): cook-notifications module for native scheduling

Adds @capacitor/local-notifications and a small wrapper module that
maps timer-UUID strings to Capacitor's numeric IDs. All three exported
functions (scheduleTimerNotification, cancelTimerNotification,
cancelAllTimerNotifications) are no-ops on web via the
Capacitor.isNativePlatform guard. No callers yet — wiring lands in
the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Platform-aware permission helper + lifecycle integration + overshoot suppression

This is the wiring task. It touches three files and lands as one atomic commit because the lifecycle calls and the suppression behavior are interdependent.

**Files:**
- Modify: `src/lib/ui/cook/cook-alerts.ts` (platform-aware `ensureNotificationPermission`)
- Modify: `src/lib/ui/cook/CookView.svelte` (schedule/cancel in 4 handlers)
- Modify: `src/lib/ui/cook/CookTimerDock.svelte` (overshoot suppression + cancel-on-JS-detect)

- [ ] **Step 1: Update `ensureNotificationPermission` to be platform-aware**

In `src/lib/ui/cook/cook-alerts.ts`, replace the existing `ensureNotificationPermission` function (currently at lines 44-48) with:

```ts
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// ... existing code above ...

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return 'granted';
    if (status.display === 'denied') return 'denied';
    const next = await LocalNotifications.requestPermissions();
    return next.display === 'granted' ? 'granted' : 'denied';
  }
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
```

Add the two imports at the top of `cook-alerts.ts` if they're not already present.

- [ ] **Step 2: Wire scheduling into `handleStartTimer`**

In `src/lib/ui/cook/CookView.svelte`, find the existing `handleStartTimer` function (around line 84). Add the import at the top of the `<script>` block:

```ts
import { scheduleTimerNotification, cancelTimerNotification } from './cook-notifications';
```

Then update `handleStartTimer` to schedule after pushing to state:

```ts
function handleStartTimer(stepIndex: number, match: TimerMatch) {
  const id = crypto.randomUUID();
  timers = [...timers, {
    id,
    stepIndex,
    label: match.label,
    durationMs: match.durationMs,
    startedAt: Date.now(),
    pausedAt: null,
    pausedAccumMs: 0,
    finished: false
  }];
  timersStarted++;
  void scheduleTimerNotification(id, match.durationMs, match.label, stepIndex);
}
```

(Lift `crypto.randomUUID()` into a local `id` const so the schedule call can reference it.)

- [ ] **Step 3: Wire pause-cancel and resume-reschedule into `handlePauseToggle`**

Update `handlePauseToggle` (around line 98) to:

```ts
function handlePauseToggle(id: string) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  const now = Date.now();
  if (t.pausedAt !== null) {
    // Resuming — recompute remaining and reschedule.
    t.pausedAccumMs += now - t.pausedAt;
    t.pausedAt = null;
    const remaining = t.durationMs - (now - t.startedAt - t.pausedAccumMs);
    if (remaining > 0) {
      void scheduleTimerNotification(t.id, remaining, t.label, t.stepIndex);
    }
  } else {
    // Pausing — cancel any pending native notification.
    t.pausedAt = now;
    void cancelTimerNotification(t.id);
  }
  timers = [...timers];
}
```

- [ ] **Step 4: Wire cancellation into `handleRemoveTimer` and scheduling into `handleAddManual`**

Update `handleRemoveTimer` (around line 111):

```ts
function handleRemoveTimer(id: string) {
  void cancelTimerNotification(id);
  timers = timers.filter(t => t.id !== id);
}
```

Update `handleAddManual` (around line 115):

```ts
function handleAddManual(durationMs: number, label: string) {
  const id = crypto.randomUUID();
  timers = [...timers, {
    id,
    stepIndex: -1,
    label,
    durationMs,
    startedAt: Date.now(),
    pausedAt: null,
    pausedAccumMs: 0,
    finished: false
  }];
  timersStarted++;
  void scheduleTimerNotification(id, durationMs, label, -1);
}
```

- [ ] **Step 5: Overshoot suppression + cancel-on-JS-detect in the dock**

In `src/lib/ui/cook/CookTimerDock.svelte`, add the import at the top of the `<script>` block:

```ts
import { cancelTimerNotification } from './cook-notifications';
```

Find the existing finish-detection `$effect` (around lines 119-135 — the block that iterates `timers` and adds to `finishedAtById`). Locate the body that runs when a timer first transitions to finished:

```ts
finishedAtById.set(t.id, Date.now());
playFinishChime();
vibrateFinish();
if (notifyEnabled) {
  const n = fireNotification(t.label, t.stepIndex, `timer-${t.id}`);
  // ...
}
```

Replace it with the suppression + cancel logic:

```ts
const overshoot = -rem;  // rem is already <= 0 here
const isBackgroundResume = overshoot >= 2000;
finishedAtById.set(t.id, Date.now());
void cancelTimerNotification(t.id);
if (!isBackgroundResume) {
  playFinishChime();
  vibrateFinish();
  if (notifyEnabled) {
    fireNotification(t.label, t.stepIndex, `timer-${t.id}`);
  }
}
```

(Read the exact surrounding lines first to preserve any other state mutations in that block — the snippet above shows the chime path; if the actual code also tracks alertedIds or similar, keep those mutations unconditionally outside the `if`.)

- [ ] **Step 6: Run typecheck + lint + tests**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: 0 errors, 167 tests pass.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add -A && git commit -m "$(cat <<'EOF'
feat(cook): native background timer notifications

CookView's four timer handlers now schedule/cancel native Android
notifications via the cook-notifications module. ensureNotificationPermission
delegates to LocalNotifications.checkPermissions on native, keeping
the existing Web Notification API path on web. CookTimerDock cancels
any pending native notification when JS catches the finish in real
time (foreground race), and suppresses the in-app chime + vibrate
when overshoot >= 2 seconds (background-resume case: the user already
heard the OS alarm).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Build + sync to Android, manual device smoke test, push

This is the user-driven verification. The implementer agent should NOT attempt to drive Android Studio. After landing Tasks 1 and 2, hand off to the user.

**Files:** None modified by the agent.

- [ ] **Step 1: Confirm Task 1 and Task 2 are committed**

```bash
git log --oneline origin/main..HEAD
```

Expected: the docs spec commit, the docs plan commit, plus two feature commits (Task 1 and Task 2).

- [ ] **Step 2: Run the Android dev chain**

```bash
~/.bun/bin/bun run android
```

This builds the web app, runs `cap sync` (which pulls in the new `@capacitor/local-notifications` plugin's native side and adds `POST_NOTIFICATIONS` to `AndroidManifest.xml`), and opens Android Studio.

- [ ] **Step 3: Run the app on the device**

Inside Android Studio:
1. Pick the target device in the dropdown.
2. Click Run (▶).

Expected: app installs and launches showing the recipe list.

- [ ] **Step 4: Smoke test — foreground**

On the device:
1. Open a recipe → cook a batch.
2. Tap a step's timer trigger (or add a manual timer for 10 seconds).
3. Wait foreground. At 10 seconds, the in-app chime + vibrate + chip pulse fires.
4. Confirm no OS notification appears in the notification shade (cancelled before it could fire because JS caught the moment).

- [ ] **Step 5: Smoke test — backgrounded**

On the device:
1. Press 🔔 in the cook timer dock. An Android system permission dialog appears ("Allow Better Batch to send notifications?"). Tap Allow.
2. Start a new timer for 30 seconds.
3. Lock the phone (or background the app).
4. Wait 30 seconds.
5. An Android system notification fires with title "Timer done" and body like "Step 3 · rest". Sound + vibrate per OS settings.
6. Tap the notification. The app comes back to the foreground.
7. The timer chip shows finished + overshoot ≥ 30s. The in-app chime does NOT fire (suppression kicked in because overshoot ≥ 2s).

- [ ] **Step 6: Smoke test — pause and resume**

On the device:
1. Start a new timer for 60 seconds.
2. Pause it after about 10 seconds (tap pause on the chip).
3. Wait 20 seconds. Background the app briefly to confirm no notification fires while paused.
4. Resume the timer. About 50 seconds later, the native notification should fire.

- [ ] **Step 7: Smoke test — remove cancels**

On the device:
1. Start a new timer for 60 seconds.
2. After 5 seconds, tap × on the chip (or "dismiss" if it shows that).
3. Background the app. Wait at least 60 seconds. No OS notification fires.

If any of those five smoke tests fail, STOP and report the specific failure. Common issues:
- Permission dialog doesn't appear on first 🔔 tap → check `LocalNotifications.requestPermissions` was actually called on native.
- Background notification doesn't fire → check `AndroidManifest.xml` has `POST_NOTIFICATIONS` after `cap sync`; check Capacitor's docs for the device's Android version.
- Double-firing (both OS sound and in-app chime on background-resume) → overshoot suppression isn't kicking in; verify the threshold check in `CookTimerDock.svelte`.

- [ ] **Step 8: Push**

After all five smoke tests pass:

```bash
git push
```

---

## Notes for the implementer (Tasks 1 + 2 only — Task 3 is user-driven)

- **Pre-commit hook** (`lefthook`) runs typecheck/lint/knip/test on commit. Use `export PATH="$HOME/.bun/bin:$PATH" &&` before commits.
- **Branch policy:** stay on `main`, do not push until Task 3 Step 8 (which is user-driven).
- **Task 2 lands all wiring atomically.** Don't split it across commits — between the permission helper update and the dock suppression, the timer lifecycle is in a mixed state. Keep it one commit.
- **`void`-prefix the schedule/cancel calls** in the Svelte handlers. The handlers are sync (they mutate state synchronously and trigger reactivity); the async scheduling fires in the background. `void` silences the TypeScript "unhandled promise" warning while making the fire-and-forget intent explicit.
- **The pause-resume math:** `remaining = durationMs - (now - startedAt - pausedAccumMs)`. After updating `pausedAccumMs` and clearing `pausedAt`, this gives the still-to-elapse milliseconds.
- **If you re-read `CookTimerDock.svelte`'s finish-detection effect and find additional state mutations** beyond the chime/vibrate/notification block (e.g., adding to an `alertedIds` set), keep those mutations OUTSIDE the `if (!isBackgroundResume)` guard. Only the audible/haptic reactions are suppressed; the bookkeeping that prevents re-fires should always run.
- **The test mocks use Bun's `mock.module`** which is supported in `bun:test`. If a test file you write reuses these mocks, make sure each test file establishes its mocks at module top level since `mock.module` is process-global once invoked.
