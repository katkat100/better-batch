<!-- src/lib/ui/cook/CookTimerDock.svelte -->
<script lang="ts">
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
    tick; // explicit reactive read so this re-runs on every tick
    const map = new Map<string, number>();
    const now = Date.now();
    for (const t of timers) map.set(t.id, remainingMs(t, now));
    return map;
  });

  function submitManual() {
    const total = mh * 3_600_000 + mm * 60_000 + ms * 1000;
    if (total <= 0) return;
    onAddManual(total, mlabel.trim() || 'manual');
    manualOpen = false;
    mh = 0; mm = 0; ms = 0; mlabel = '';
  }
</script>

<div
  class="sticky bottom-0 z-30 bg-obsidian text-canvas px-4 py-2 flex items-center gap-4 overflow-x-auto relative"
  data-testid="cook-timer-dock"
>
    {#each timers as t (t.id)}
      {@const rem = remainingById.get(t.id) ?? 0}
      <div class="flex items-center gap-2 shrink-0" data-testid="dock-timer" data-timer-id={t.id}>
        <span class="font-mono {rem <= 0 ? 'text-ochre' : 'text-canvas'} text-base font-semibold min-w-[60px]">{fmt(rem)}</span>
        <span class="text-[10px] opacity-70 truncate max-w-[120px]">step {t.stepIndex + 1} · {t.label}</span>
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
      </div>
    {/each}
    {#if timers.length === 0}
      <span class="text-[10px] opacity-50">No timers running</span>
    {/if}
    <button
      type="button"
      onclick={() => manualOpen = !manualOpen}
      class="ml-auto text-[10px] uppercase tracking-wider px-2 py-1 border border-canvas/30 hover:border-canvas rounded-sm shrink-0"
      data-testid="add-manual-timer-btn"
    >+ Manual</button>

    {#if manualOpen}
      <div class="absolute right-2 bottom-full mb-1 bg-canvas text-obsidian border border-obsidian rounded-sm p-3 flex flex-col gap-2 text-sm w-56 z-40" data-testid="manual-timer-popover">
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Manual timer</span>
        <div class="flex gap-2 font-mono text-sm">
          <input type="number" min="0" bind:value={mh} aria-label="Hours" class="border border-drafting bg-canvas px-1 py-0.5 w-12 rounded-sm" placeholder="h" />
          <input type="number" min="0" max="59" bind:value={mm} aria-label="Minutes" class="border border-drafting bg-canvas px-1 py-0.5 w-12 rounded-sm" placeholder="m" />
          <input type="number" min="0" max="59" bind:value={ms} aria-label="Seconds" class="border border-drafting bg-canvas px-1 py-0.5 w-12 rounded-sm" placeholder="s" />
        </div>
        <input bind:value={mlabel} placeholder="Label (optional)" aria-label="Manual timer label" class="border border-drafting bg-canvas px-2 py-1 rounded-sm text-xs" />
        <div class="flex justify-end gap-2">
          <button type="button" onclick={() => manualOpen = false} class="text-xs text-obsidian/60">Cancel</button>
          <button type="button" onclick={submitManual} class="border border-juniper text-juniper px-3 py-1 text-xs uppercase tracking-wider rounded-sm" data-testid="manual-timer-submit">Start</button>
        </div>
      </div>
    {/if}
</div>
