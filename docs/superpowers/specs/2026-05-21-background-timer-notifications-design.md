# Background timer notifications on Android

**Status:** Design approved 2026-05-21.
**Owner:** Katie.
**Builds on:** Capacitor Android scaffold (2026-05-21). The cook timer
alarm + overshoot work from 2026-05-08 provides the foreground
behavior this spec extends.

## Summary

Schedule a native Android notification at the moment a cook timer
starts, so the alarm fires even when the app has been backgrounded
and JS execution is throttled. On the web (or when the user hasn't
granted permission) the existing in-app chime + vibration + title
flash path is unchanged. When JS detects a timer finish with
substantial overshoot (≥2 seconds), suppress the in-app chime to
avoid alerting twice — the OS already fired while the user was away.

## Motivation

Today the timer alarm relies on a `setInterval` ticking every 250ms
to detect when remaining hits 0, then fires Web Audio, vibration,
and an optional Web `Notification`. On Android, when the user
backgrounds the app, the WebView pauses or heavily throttles JS.
Timers expire silently. The user comes back to a chip that's been
in "finished" state for minutes with no audible cue. For cooking,
where you set a timer specifically so you can step away, this is the
single biggest correctness gap on the phone.

`@capacitor/local-notifications` schedules a notification with the
OS at timer-start time. The OS fires the notification when its
internal clock hits the trigger — independent of the WebView's JS
state. This is the same primitive that all native Android timer apps
use.

## Behavior

### From the user's perspective

- They press 🔔 once on the cook timer dock to opt into native
  notifications (same toggle that exists today; the implementation
  underneath now goes through the native permissions prompt on
  Android).
- They start a timer normally — by tapping a step's inline timer
  trigger, or by adding a manual timer via the dock.
- They background the app, lock the phone, walk away.
- When the timer's duration elapses, an Android system notification
  fires with title "Timer done" and body like "Step 3 · 10 min".
  Tapping it brings the app back to the foreground.
- On return, the cook timer dock shows the timer chip as finished,
  with an accurate overshoot count. The chime does NOT fire a
  second time (the suppression rule applies).
- Pausing a timer cancels the scheduled native notification.
  Resuming reschedules with the new remaining time. Removing a
  timer cancels the schedule.

### What stays the same

- Foreground behavior is unchanged. JS detects finish in real time
  and fires chime + vibrate + chip pulse + title flash. The pending
  native notification gets cancelled in the same tick to avoid a
  double sound.
- Web behavior is unchanged. The scheduling module is a no-op when
  `Capacitor.isNativePlatform()` returns false. Web users continue
  to use the in-app alerts + optional Web Notification.
- The 🔔 toggle in the dock keeps the same UI surface and label
  ("🔔 on" / "🔔 off"). Only the permission API it consults
  underneath changes per platform.

## Architecture

### New module: `cook-notifications.ts`

`src/lib/ui/cook/cook-notifications.ts` owns the scheduling lifecycle.
Public API:

```ts
export async function scheduleTimerNotification(
  timerId: string,
  ms: number,
  label: string,
  stepIndex: number
): Promise<void>;

export async function cancelTimerNotification(timerId: string): Promise<void>;

export async function cancelAllTimerNotifications(): Promise<void>;
```

Module-private state:

- `idMap: Map<string, number>` — pairs each timer's UUID with the
  Capacitor numeric ID we use to talk to `LocalNotifications.cancel`.
- `nextNumericId: number` — incrementing counter starting at 1, used
  to allocate the next numeric ID.

All three exported functions begin with a guard:
`if (!Capacitor.isNativePlatform()) return;`. On web they're no-ops.

`scheduleTimerNotification` body (native path):

```ts
const numericId = nextNumericId++;
idMap.set(timerId, numericId);
await LocalNotifications.schedule({
  notifications: [{
    id: numericId,
    title: 'Timer done',
    body: stepIndex >= 0 ? `Step ${stepIndex + 1} · ${label}` : label,
    schedule: { at: new Date(Date.now() + ms) }
  }]
});
```

`cancelTimerNotification` body (native path):

```ts
const numericId = idMap.get(timerId);
if (numericId === undefined) return;
idMap.delete(timerId);
await LocalNotifications.cancel({ notifications: [{ id: numericId }] });
```

`cancelAllTimerNotifications` iterates the map and dispatches a
single batch cancel.

### Platform-aware permission helper

`cook-alerts.ts`'s existing `ensureNotificationPermission()` becomes
platform-aware:

```ts
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return 'granted';
    if (status.display === 'denied') return 'denied';
    const next = await LocalNotifications.requestPermissions();
    return next.display === 'granted' ? 'granted' : 'denied';
  }
  // existing web path unchanged
  ...
}
```

The 🔔 toggle in the dock keeps using this function. No UI changes
needed — the user just sees the platform-appropriate permission
prompt (system dialog on Android, browser dialog on web).

### Timer lifecycle integration

`CookView.svelte` owns the timer state via `timers = $state<DockTimer[]>([])`
and four handlers. Each gains a scheduling side effect:

- `handleStartTimer(stepIndex, match)` — after pushing the new
  `DockTimer` to state, call
  `scheduleTimerNotification(t.id, match.durationMs, match.label, stepIndex)`.
- `handleAddManual(durationMs, label)` — same pattern; `stepIndex` is
  `-1` for manual timers (the module already special-cases this in
  the body composition).
- `handlePauseToggle(id)` — when pausing, `cancelTimerNotification(id)`.
  When resuming, compute the new remaining
  (`durationMs - now() + startedAt + pausedAccumMs - pauseSpan`) and
  reschedule with that.
- `handleRemoveTimer(id)` — call `cancelTimerNotification(id)` before
  filtering out.

These changes are localized to the four handlers. The dock
component remains display-and-control: it emits the callbacks and
the parent handles scheduling.

### Overshoot suppression in the dock

`CookTimerDock.svelte`'s existing finish-detection `$effect` already
maintains `finishedAtById` (the timestamp at which JS first detected
rem ≤ 0). Two changes:

1. **Cancel the pending native notification** in the same tick that
   JS detects finish:

   ```ts
   finishedAtById.set(t.id, Date.now());
   cancelTimerNotification(t.id);  // foreground catch
   // ...existing chime/vibrate/fireNotification calls...
   ```

   If the app was foreground when the timer hit 0, this cancellation
   wins the race against the OS firing the notification (LocalNotifications
   trigger ahead-of-time so cancel-before-fire is reliable for
   sub-second windows).

2. **Suppress in-app alerts on background-resume:**

   ```ts
   const overshoot = -rem;  // rem is already <= 0 at this point
   const isBackgroundResume = overshoot >= 2000;
   finishedAtById.set(t.id, Date.now());
   cancelTimerNotification(t.id);
   if (!isBackgroundResume) {
     playFinishChime();
     vibrateFinish();
     if (notifyEnabled) fireNotification(t.label, t.stepIndex, `timer-${t.id}`);
   }
   // chip pulse + title flash still kick in regardless
   ```

   The 2-second threshold is generous: any normal foreground tick
   would catch the moment within 250ms (the existing tick interval).
   Crossing 2 seconds implies the JS was paused or the page was
   backgrounded — exactly the case where the native notification
   already alerted the user.

### Native plugin wiring

`bun add @capacitor/local-notifications` adds the JS bridge. The
plugin's Android side is included automatically by `npx cap sync` —
it copies the plugin's Java/Kotlin source into the `android/`
project, registers it in `MainActivity`, and contributes
`POST_NOTIFICATIONS` to `AndroidManifest.xml`.

The user runs `bun run android` (which already chains
`build → cap:sync → cap:open`) to pick up the new plugin.

## Files touched

**New:**
- `src/lib/ui/cook/cook-notifications.ts` — scheduling module.
- `tests/ui/cook/cook-notifications.test.ts` — unit tests for the
  id-map management and web no-op behavior (mocking
  `Capacitor.isNativePlatform`).

**Modified:**
- `src/lib/ui/cook/cook-alerts.ts` — `ensureNotificationPermission`
  becomes platform-aware.
- `src/lib/ui/cook/CookView.svelte` — schedule/cancel calls in
  `handleStartTimer`, `handleAddManual`, `handlePauseToggle`,
  `handleRemoveTimer`.
- `src/lib/ui/cook/CookTimerDock.svelte` — overshoot threshold +
  cancel-on-JS-detect.
- `package.json` — `@capacitor/local-notifications` added to
  dependencies. `bun.lock` updates accordingly.

**No e2e.** Native scheduling can't be exercised in Playwright. The
device smoke test (start a timer, lock the phone, wait, hear the OS
notification) is the verification.

## Testing

**Unit tests** in `tests/ui/cook/cook-notifications.test.ts` cover
the pure logic that's testable without a native platform:

- `scheduleTimerNotification` is a no-op when
  `Capacitor.isNativePlatform()` returns false (no id-map mutation,
  no LocalNotifications call).
- `cancelTimerNotification` is a no-op for an unknown timer ID.
- After scheduling, the id-map associates the timer UUID with a
  numeric ID. After cancelling, the entry is removed.
- `cancelAllTimerNotifications` clears the map and issues a batch
  cancel (with all numeric IDs).

The tests mock `@capacitor/core`'s `Capacitor.isNativePlatform` and
`@capacitor/local-notifications`'s default export. Bun's `mock()` API
covers this.

**No new tests** for `CookView.svelte` or `CookTimerDock.svelte`.
The integration is small and the lifecycle-handler side effects are
exercised by the manual smoke test on the device. Adding component
tests for these would add complexity without catching anything the
device test wouldn't.

**Manual smoke test on Android** (final verification):

1. Open the app, press 🔔 to grant native notification permission
   (Android's system dialog appears).
2. Start a cook timer (set a 30-second one for fast verification).
3. Lock the phone or background the app.
4. Wait. The Android notification should fire approximately on time.
   Tapping it opens the app to the cook view.
5. The cook timer chip shows finished + overshoot ≥ 30s.
6. The chime does NOT fire on return (suppression kicked in).
7. Foreground variant: start a 10-second timer with the app
   foregrounded. The chime fires at 0; no native notification appears
   (cancelled before firing).
8. Pause/resume variant: start a 60-second timer, pause it after 10
   seconds, wait 30 seconds, resume. The native notification should
   re-fire approximately 50 seconds after the resume (the
   reschedule-with-new-remaining path).

## Out of scope

- iOS support via `@capacitor/ios`. We don't have an iOS scaffold;
  the abstraction in this spec works for iOS but won't be tested.
- Notification sound customization. Default OS sound only.
- Notification grouping or stacking (Android groups by default).
- Foreground service for "ongoing" cook sessions — overkill for a
  personal app; we accept that even with notifications scheduled, the
  app's elapsed-time counter pauses while backgrounded. The
  notification still fires correctly because it's OS-scheduled, not
  JS-driven.
- Replacing the in-app chime when foreground on native (i.e. always
  using the OS notification as the sole alert). Considered and
  rejected during brainstorming — keeping the chime feels right
  during active cooking.
- Persisting native notifications across an app reinstall. Cancelled
  on uninstall.

## Open questions

None at design approval time.
