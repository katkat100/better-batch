<!-- src/lib/ui/cook/CookTimerDock.svelte -->
<script lang="ts">
  import Button from '$lib/ui/primitives/Button.svelte';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import {
    playFinishChime,
    vibrateFinish,
    ensureNotificationPermission,
    fireNotification,
    startTitleFlash,
    stopTitleFlash,
    updateTitleFlashCount
  } from './cook-alerts';
  import { cancelTimerNotification } from './cook-notifications';
  import { Capacitor } from '@capacitor/core';

  export interface DockTimer {
    id: string;
    stepIndex: number;
    label: string;
    durationMs: number;
    startedAt: number;
    pausedAt: number | null;
    pausedAccumMs: number;
    finished: boolean;
  }

  let {
    timers,
    onPauseToggle,
    onRemove,
    onAddManual
  }: {
    timers: DockTimer[];
    onPauseToggle: (id: string) => void;
    onRemove: (id: string) => void;
    onAddManual: (durationMs: number, label: string) => void;
  } = $props();

  // ms timestamp at which a timer's alarm first fired. Set once per timer and
  // never replaced, so the alarm cannot fire more than once. The entry is
  // dropped only when the timer itself is removed.
  const finishedAtById = new SvelteMap<string, number>();
  const liveNotifications = new SvelteMap<string, Notification>();
  let notifyEnabled = $state(false);
  type PermState = 'default' | 'denied' | 'granted' | 'unsupported';
  // On native (Capacitor), LocalNotifications is always available regardless
  // of whether the Web Notification API exists in the WebView. So 'unsupported'
  // only applies on web when the Notification global is missing.
  let notifyPermission = $state<PermState>(
    Capacitor.isNativePlatform()
      ? 'default'
      : (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  );

  let manualOpen = $state(false);
  let mh = $state(0);
  let mm = $state(0);
  let ms = $state(0);
  let mlabel = $state('');

  function fmt(remaining: number): string {
    if (remaining < 0) remaining = 0;
    const totalSec = Math.floor(remaining / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function remainingMs(t: DockTimer, now: number): number {
    const pauseSpan = t.pausedAt !== null ? now - t.pausedAt : 0;
    const elapsed = now - t.startedAt - t.pausedAccumMs - pauseSpan;
    return t.durationMs - elapsed;
  }

  let tick = $state(0);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (timers.length === 0) {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      return;
    }
    if (!intervalId) {
      intervalId = setInterval(() => { tick++; }, 250);
    }
    return () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    };
  });

  // Reactive remaining-by-id map. Recomputes when tick or timers change.
  const remainingById = $derived.by(() => {
    void tick; // explicit reactive read so this re-runs on every tick
    const map = new SvelteMap<string, number>();
    const now = Date.now();
    for (const t of timers) map.set(t.id, remainingMs(t, now));
    return map;
  });

  // Live overshoot per timer. Grows from when the alarm fired until the timer
  // is dismissed (which removes it from the dock entirely).
  const overshootById = $derived.by(() => {
    void tick;
    const m = new SvelteMap<string, number>();
    const now = Date.now();
    for (const [id, finAt] of finishedAtById) m.set(id, Math.max(0, now - finAt));
    return m;
  });

  // Drop alarm state and close any live notification when a timer is removed.
  $effect(() => {
    const liveIds = new Set(timers.map(t => t.id));
    for (const id of [...finishedAtById.keys()]) if (!liveIds.has(id)) finishedAtById.delete(id);
    for (const id of [...liveNotifications.keys()]) {
      if (!liveIds.has(id)) {
        liveNotifications.get(id)?.close();
        liveNotifications.delete(id);
      }
    }
  });

  // Detect first-finish per timer and fire alerts. The presence of an entry in
  // finishedAtById is the gate — it's set once and never replaced, so the
  // chime, vibration, and notification fire exactly once per timer no matter
  // how long the user takes to dismiss.
  $effect(() => {
    for (const t of timers) {
      const rem = remainingById.get(t.id) ?? 0;
      if (rem > 0) continue;
      if (finishedAtById.has(t.id)) continue;
      const overshoot = -rem;  // rem is already <= 0 here
      const isBackgroundResume = overshoot >= 2000;
      // Foreground = the user is actively looking at the app. Cancel the
      // pending native notification only in that case; otherwise the OS just
      // fired and we'd be removing the notification before the user sees it.
      const isForeground = typeof document !== 'undefined' && document.visibilityState === 'visible';
      finishedAtById.set(t.id, Date.now());
      if (isForeground) {
        void cancelTimerNotification(t.id);
      }
      if (!isBackgroundResume) {
        playFinishChime();
        vibrateFinish();
        if (notifyEnabled) {
          const n = fireNotification(t.label, t.stepIndex, `timer-${t.id}`);
          if (n) {
            liveNotifications.set(t.id, n);
            n.onclick = () => { onRemove(t.id); window.focus(); };
          }
        }
      }
    }
  });

  // Title flash while any finished timer is still in the dock.
  $effect(() => {
    const pending = timers.filter(t => finishedAtById.has(t.id)).length;
    if (pending > 0) {
      startTitleFlash(pending);
      updateTitleFlashCount(pending);
    } else {
      stopTitleFlash();
    }
    return () => stopTitleFlash();
  });

  async function toggleNotifications(): Promise<void> {
    if (notifyPermission === 'unsupported') return;
    if (!notifyEnabled) {
      const perm = await ensureNotificationPermission();
      notifyPermission = perm;
      notifyEnabled = perm === 'granted';
    } else {
      notifyEnabled = false;
    }
  }

  function submitManual() {
    const total = mh * 3_600_000 + mm * 60_000 + ms * 1000;
    if (total <= 0) return;
    onAddManual(total, mlabel.trim() || 'manual');
    manualOpen = false;
    mh = 0; mm = 0; ms = 0; mlabel = '';
  }
</script>

<svelte:window onkeydown={(e) => manualOpen && e.key === 'Escape' && (manualOpen = false)} />

<div
  class="sticky bottom-0 z-30 bg-obsidian text-canvas px-4 py-2 flex items-center gap-4 overflow-x-auto relative"
  data-testid="cook-timer-dock"
>
    {#each timers as t (t.id)}
      {@const rem = remainingById.get(t.id) ?? 0}
      {@const finished = finishedAtById.has(t.id)}
      {@const overshoot = overshootById.get(t.id) ?? 0}
      <div
        class="flex items-center gap-2 shrink-0 {finished ? 'animate-pulse' : ''}"
        data-testid="dock-timer"
        data-timer-id={t.id}
        data-needs-ack={finished ? 'true' : undefined}
      >
        {#if finished}
          <span
            class="font-mono text-ochre text-base font-semibold min-w-[68px]"
            data-testid="timer-overshoot"
            data-overshoot-ms={overshoot}
            title="Time elapsed since the timer ended"
          >+{fmt(overshoot)}</span>
        {:else}
          <span class="font-mono text-canvas text-base font-semibold min-w-[68px]">{fmt(rem)}</span>
        {/if}
        <span class="text-[10px] opacity-70 truncate max-w-[120px]">{t.stepIndex >= 0 ? `step ${t.stepIndex + 1} · ${t.label}` : t.label}</span>
        {#if finished}
          <button
            type="button"
            onclick={() => onRemove(t.id)}
            class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-ochre text-ochre hover:bg-ochre hover:text-canvas rounded-sm"
            data-testid="ack-timer-btn"
            aria-label="Dismiss and remove timer"
          >dismiss</button>
        {:else}
          <button
            type="button"
            onclick={() => onPauseToggle(t.id)}
            class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-canvas/30 hover:border-canvas rounded-sm"
            aria-label={t.pausedAt !== null ? 'Resume timer' : 'Pause timer'}
          >{t.pausedAt !== null ? 'play' : 'pause'}</button>
          <button
            type="button"
            onclick={() => onRemove(t.id)}
            class="text-canvas/50 hover:text-ochre"
            aria-label="Remove timer"
          >×</button>
        {/if}
      </div>
    {/each}
    {#if timers.length === 0}
      <span class="text-[10px] opacity-50">No timers running</span>
    {/if}
    {#if notifyPermission !== 'unsupported'}
      <button
        type="button"
        onclick={toggleNotifications}
        class="ml-auto text-[10px] uppercase tracking-wider px-2 py-1 border border-canvas/30 hover:border-canvas rounded-sm shrink-0"
        data-testid="toggle-notifications-btn"
        aria-label={notifyEnabled ? 'Disable browser notifications' : 'Enable browser notifications'}
        aria-pressed={notifyEnabled}
        title={notifyPermission === 'denied' ? 'Browser notifications blocked' : (notifyEnabled ? 'Notifications on' : 'Notifications off')}
        disabled={notifyPermission === 'denied'}
      >{notifyEnabled ? '🔔 on' : '🔔 off'}</button>
    {/if}
    <button
      type="button"
      onclick={() => manualOpen = !manualOpen}
      class="{notifyPermission === 'unsupported' ? 'ml-auto' : ''} text-[10px] uppercase tracking-wider px-2 py-1 border border-canvas/30 hover:border-canvas rounded-sm shrink-0"
      data-testid="add-manual-timer-btn"
    >+ Manual</button>

</div>

{#if manualOpen}
  <button
    tabindex="-1"
    aria-hidden="true"
    type="button"
    class="fixed inset-0 z-40 bg-transparent"
    aria-label="close manual timer"
    onclick={() => manualOpen = false}
  ></button>
  <div class="fixed right-4 bottom-16 bg-canvas text-obsidian border border-obsidian rounded-sm p-3 flex flex-col gap-2 text-sm w-56 z-50 shadow-lg" data-testid="manual-timer-popover">
    <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Manual timer</span>
    <div class="flex gap-2 font-mono text-sm">
      <input type="number" min="0" bind:value={mh} aria-label="Hours" class="border border-drafting bg-canvas px-1 py-0.5 w-12 rounded-sm" placeholder="h" />
      <input type="number" min="0" max="59" bind:value={mm} aria-label="Minutes" class="border border-drafting bg-canvas px-1 py-0.5 w-12 rounded-sm" placeholder="m" />
      <input type="number" min="0" max="59" bind:value={ms} aria-label="Seconds" class="border border-drafting bg-canvas px-1 py-0.5 w-12 rounded-sm" placeholder="s" />
    </div>
    <TextInput bind:value={mlabel} placeholder="Label (optional)" aria-label="Manual timer label" class="px-2 py-1 text-xs" />
    <div class="flex justify-end gap-2">
      <button type="button" onclick={() => manualOpen = false} class="text-xs text-obsidian/60">Cancel</button>
      <Button variant="success" size="sm" onclick={submitManual} class="py-1" data-testid="manual-timer-submit">Start</Button>
    </div>
  </div>
{/if}
