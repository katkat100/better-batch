# Recipe Page Mobile Layout

**Date:** 2026-05-06
**Status:** Draft, pending implementation plan

## 1. Overview

Make the recipe detail page (`src/routes/recipes/[id]/+page.svelte`) usable on small viewports. Currently the page uses `grid-cols-[340px_1fr]` (batch graph aside + detail pane) which crushes the detail to ~20px on a 375px-wide phone.

Below the `lg` breakpoint (1024px), swap to a two-tab layout: `Batches` (graph) and `<batch-label> detail`. Above `lg`, the existing two-column layout is unchanged.

This spec covers the recipe page only. `BatchEditor` mobile work is a separate spec.

## 2. Architecture

Single-file change to `src/routes/recipes/[id]/+page.svelte`. No new components. Tab state is local (`$state<'batches' | 'detail'>`). Picking a batch from the graph auto-advances to the Detail tab. Default tab on page load is `detail`.

## 3. Layout

### Below `lg` (mobile + small tablet)

```
┌─────────────────────────────┐
│ ← All recipes               │
│                             │
│ Sourdough        [Edit] [×] │  ← header (existing)
│ description...              │
├─────────────────────────────┤
│ Batches (3) │ v3 detail     │  ← tab bar
├─────────────────────────────┤
│                             │
│  <BatchGraph /> if batches  │
│  OR                         │
│  <BatchDetail /> if detail  │
│                             │
└─────────────────────────────┘
```

### `lg` and above (desktop)

Unchanged: `grid-cols-[340px_1fr]` with the graph in the left aside and detail in the right.

### Tab bar styling

- Container: `border-b border-drafting flex` (mobile-only via `lg:hidden`).
- Each tab: `flex-1 px-4 py-3 text-xs uppercase tracking-wider text-center`.
- Inactive: `text-obsidian/60 hover:text-obsidian`.
- Active: `text-ochre border-b-2 border-ochre -mb-px font-bold`.

### Tab labels

- Left: `Batches ({N})` — N = `data.batches.length`.
- Right: `{selected?.label ?? 'Detail'}` — dynamic; falls back to "Detail" if no batch selected.

## 4. State

```ts
type MobileTab = 'batches' | 'detail';
let mobileTab = $state<MobileTab>('detail');
```

When the existing `onSelect={(id) => selectedId = id}` callback fires (graph batch picked), also set `mobileTab = 'detail'`.

No URL persistence, no localStorage. Tab is ephemeral per page visit.

## 5. Responsive markup pattern

```svelte
<div class="flex-1 flex flex-col lg:grid lg:grid-cols-[340px_1fr] lg:gap-6 min-h-0">
  <!-- Tab bar — mobile only -->
  <div class="border-b border-drafting flex lg:hidden">
    <button
      type="button"
      onclick={() => mobileTab = 'batches'}
      class="flex-1 px-4 py-3 text-xs uppercase tracking-wider text-center {
        mobileTab === 'batches'
          ? 'text-ochre border-b-2 border-ochre -mb-px font-bold'
          : 'text-obsidian/60 hover:text-obsidian'
      }"
      data-testid="mobile-tab-batches"
    >Batches ({data.batches.length})</button>
    <button
      type="button"
      onclick={() => mobileTab = 'detail'}
      class="flex-1 px-4 py-3 text-xs uppercase tracking-wider text-center {
        mobileTab === 'detail'
          ? 'text-ochre border-b-2 border-ochre -mb-px font-bold'
          : 'text-obsidian/60 hover:text-obsidian'
      }"
      data-testid="mobile-tab-detail"
    >{selected?.label ?? 'Detail'}</button>
  </div>

  <aside
    class="overflow-auto lg:border-r lg:border-drafting lg:pr-6 {mobileTab === 'batches' ? '' : 'hidden'} lg:block"
  >
    <h2 class="text-[11px] uppercase tracking-wider text-obsidian/50 mb-3 hidden lg:block">
      Batches ({data.batches.length})
    </h2>
    <BatchGraph
      batches={data.batches}
      {selectedId}
      onSelect={(id) => { selectedId = id; mobileTab = 'detail'; }}
    />
  </aside>

  <section class="overflow-auto {mobileTab === 'detail' ? '' : 'hidden'} lg:block">
    {#if selected}
      <BatchDetail ... />
    {:else}
      <p class="text-sm text-obsidian/40">Select a batch to view details.</p>
    {/if}
  </section>
</div>
```

The mobile-only `aside` heading (`Batches (N)`) is hidden because it duplicates the tab label. On desktop, the heading shows.

The mobile-only spacing classes (`border-r`, `pr-6`) are gated to `lg:` so mobile gets full-width panes.

## 6. Empty state

If `data.batches.length === 0`, skip the tab bar entirely. Show the existing centered "+ Record V1" placeholder full-width on all viewports. No tabs to switch between.

```svelte
{#if data.batches.length === 0}
  <div class="flex-1 flex flex-col items-center justify-center gap-4 text-center">
    <p class="text-sm text-obsidian/60">No batches yet. Record your first one to get started.</p>
    <a href="...">+ Record V1</a>
  </div>
{:else}
  <!-- responsive grid + tabs -->
{/if}
```

## 7. Out of scope

- BatchEditor mobile layout (separate spec).
- Recipe header (title + tags + Edit Variables + Delete Recipe) responsive layout. May wrap awkwardly on phones, but addressed separately if so.
- Animated tab transitions, swipe gestures, URL state persistence.
- BatchDetail's internal mobile-friendliness (long ingredient lists, compare/merge tables). Separate concern.
- Recipe-list home page — already uses an auto-collapsing notecard grid.

## 8. Testing

- **No new unit tests.** Pure layout/responsive change.
- **No new E2E.** Existing E2E runs in desktop-sized Playwright headless browser; the desktop layout (`lg+`) is unchanged so the 6 existing tests still pass.
- **Manual viewport check:**
  - iPhone 14 (390×844) — tabs visible, panes full-width.
  - iPhone SE (375×667) — same.
  - iPad portrait (768×1024) — still in tab mode (`lg` is 1024px so 768 < lg).
  - iPad landscape (1024×768) — exactly at boundary; `min-width: 1024px` so should be desktop layout.
  - Desktop (1280+) — current two-column unchanged.
- **Stable test counts:** 91 unit, 6 E2E, 0/0 svelte-check.

## 9. Risks

- **Boundary jitter at exactly 1024px**: Tailwind `lg` is `min-width: 1024px`, so `<= 1023px` shows tabs, `>= 1024px` shows desktop. Practical risk: zero — users don't park at 1023px.
- **`hidden` class keeps the unmounted pane in the DOM**: BatchGraph stays mounted when on the Detail tab (just hidden). State persists across tab switches (good — selected highlight stays). If perf becomes a concern (it won't), conditionally render with `{#if mobileTab === 'batches'}` instead.
- **Tab label width**: `v10-with-stretch-folds detail` could be too long. Mitigation: the existing batch labels are short (e.g. `v3`, `initial`). If a label is unusually long, the tab will truncate via flex; consider `truncate` class on the label `<span>` if needed.
- **Switching tabs while BatchDetail has `…` overflow menu open**: the menu `moreOpen` state lives inside BatchDetail. Switching tabs doesn't affect it. When user comes back to Detail tab, the menu would still be open. Acceptable; minor edge case.
