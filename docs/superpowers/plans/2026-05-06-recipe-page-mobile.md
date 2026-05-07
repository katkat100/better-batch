# Recipe Page Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Below the `lg` (1024px) breakpoint, swap the recipe page's two-column grid layout for a `Batches | Detail` tab interface so it's usable on phones and small tablets.

**Architecture:** Single-file change to `src/routes/recipes/[id]/+page.svelte`. New local `mobileTab` state with auto-advance to Detail when a batch is picked from the graph. Above `lg`, the existing two-column layout is preserved unchanged.

**Tech Stack:** Svelte 5 runes · TypeScript · Tailwind v4

Reference spec: `docs/superpowers/specs/2026-05-06-recipe-page-mobile.md`.

---

## File Structure

```
src/routes/recipes/[id]/+page.svelte    # MODIFIED — only file touched
```

---

## Task 1: Add mobile tab interface to recipe page

**Files:** Modify `src/routes/recipes/[id]/+page.svelte`.

- [ ] **Step 1: Read the current file.**

Run: `cat /Users/katieWork/Developer/better-batch/src/routes/recipes/\[id\]/+page.svelte`

Note: existing imports, `data` prop shape (`{ recipe: Recipe; batches: Batch[] }`), `selectedId` state, `selected` $derived, the empty-state branch, the two-column grid markup, and the dialogs mounted at the bottom.

- [ ] **Step 2: Add `mobileTab` state.**

In the `<script lang="ts">` block, immediately below the existing `let editVarsOpen = $state(false);` line, add:

```ts
  type MobileTab = 'batches' | 'detail';
  let mobileTab = $state<MobileTab>('detail');
```

- [ ] **Step 3: Replace the existing two-column grid block.**

The existing block starts with `<div class="flex-1 grid grid-cols-[340px_1fr] gap-6 min-h-0">` and ends with the closing `</div>` of that grid (right before the `</div>` that closes the page-wrapper container).

Replace the entire existing block:

```svelte
    <div class="flex-1 grid grid-cols-[340px_1fr] gap-6 min-h-0">
      <aside class="border-r border-drafting pr-6 overflow-auto">
        <h2 class="text-[11px] uppercase tracking-wider text-obsidian/50 mb-3">Batches ({data.batches.length})</h2>
        <BatchGraph batches={data.batches} {selectedId} onSelect={(id) => selectedId = id} />
      </aside>
      <section class="overflow-auto">
        {#if selected}
          <BatchDetail
              recipe={data.recipe}
              batch={selected}
              batches={data.batches}
              onMarkCooked={handleMarkCooked}
              onEditOutcome={handleEditOutcome}
              onSelectBatch={(id) => selectedId = id}
            />
        {:else}
          <p class="text-sm text-obsidian/40">Select a batch to view details.</p>
        {/if}
      </section>
    </div>
```

With this:

```svelte
    <div class="flex-1 flex flex-col lg:grid lg:grid-cols-[340px_1fr] lg:gap-6 min-h-0">
      <!-- Mobile-only tab bar -->
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
          class="flex-1 px-4 py-3 text-xs uppercase tracking-wider text-center truncate {
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
        <h2 class="text-[11px] uppercase tracking-wider text-obsidian/50 mb-3 hidden lg:block">Batches ({data.batches.length})</h2>
        <BatchGraph batches={data.batches} {selectedId} onSelect={(id) => { selectedId = id; mobileTab = 'detail'; }} />
      </aside>
      <section class="overflow-auto {mobileTab === 'detail' ? '' : 'hidden'} lg:block">
        {#if selected}
          <BatchDetail
              recipe={data.recipe}
              batch={selected}
              batches={data.batches}
              onMarkCooked={handleMarkCooked}
              onEditOutcome={handleEditOutcome}
              onSelectBatch={(id) => selectedId = id}
            />
        {:else}
          <p class="text-sm text-obsidian/40">Select a batch to view details.</p>
        {/if}
      </section>
    </div>
```

Key changes vs original:
- Container: `flex flex-col lg:grid lg:grid-cols-[340px_1fr] lg:gap-6` — stacks on mobile, grid on desktop.
- New tab-bar `<div>` with `lg:hidden` — only appears on mobile.
- Aside: dropped `border-r pr-6` from the always-on classes; added them under `lg:` prefix. Conditionally `hidden` based on `mobileTab`. The aside heading (`Batches ({N})`) becomes desktop-only via `hidden lg:block` — on mobile the tab label already shows the count.
- Section: conditionally `hidden` based on `mobileTab`.
- BatchGraph's `onSelect` now also sets `mobileTab = 'detail'` to auto-advance.

The empty-state branch (`{#if data.batches.length === 0}`) above this block is unchanged — when there are no batches, no tabs are shown, just the centered placeholder.

- [ ] **Step 4: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 5: Run E2E suite.**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -10`
Expected: 6 passed. Existing E2E runs in a desktop-sized headless browser, so they exercise the `lg:` desktop branch which is structurally unchanged.

- [ ] **Step 6: Run unit suite.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 7: Manual viewport check.**

Start the dev server:

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

In a browser with DevTools device emulation, visit a recipe with multiple batches and verify:

1. **iPhone 14 (390×844):** tab bar visible, only one pane shown at a time. `Batches` tab shows the BatchGraph; `Detail` tab shows BatchDetail. Tapping a batch in the graph auto-advances to Detail.
2. **iPad portrait (768×1024):** still in tab mode (`lg` is `min-width: 1024px`).
3. **iPad landscape (1024×768):** desktop layout — both panes side-by-side, no tab bar.
4. **Desktop (1280+):** unchanged from before.
5. **Empty recipe (0 batches):** centered "+ Record V1" placeholder, no tab bar.

When done, kill the server:

```bash
pkill -f 'bun run dev'
```

- [ ] **Step 8 (commit) — SKIP. Controller commits after review.**

---

## Self-review notes

**Spec coverage:**
- Spec §2 architecture (single-file change, local mobileTab state, auto-advance) → Steps 2-3.
- Spec §3 layout (mobile stacked + tab bar; desktop grid) → Step 3 markup.
- Spec §3 tab styling (border-bottom on active, ochre underline) → Step 3 button class.
- Spec §3 tab labels (`Batches ({N})` and `{selected?.label ?? 'Detail'}`) → Step 3 markup.
- Spec §4 state (`MobileTab` type, default `'detail'`) → Step 2.
- Spec §5 responsive markup pattern → Step 3 (with `lg:` prefix gating).
- Spec §6 empty-state (skip tabs entirely when `batches.length === 0`) → preserved by leaving the existing `{#if data.batches.length === 0}` branch untouched, which already handles this case full-width.
- Spec §7 out of scope → respected; no animations, swipe, URL state.
- Spec §8 testing (svelte-check, E2E, unit, manual viewport) → Steps 4-7.
- Spec §9 risks (label truncation) → addressed via `truncate` class on the Detail tab in Step 3.

**Placeholder scan:** none. All markup is concrete and complete.

**Type consistency:** `MobileTab` defined in Step 2, used in Step 3 markup. `data-testid` names (`mobile-tab-batches`, `mobile-tab-detail`) consistent.

**Risks:**
- The implementer must place the new state declaration AFTER `editVarsOpen` (matching where the brainstorming spec landed it). If they place it elsewhere, no functional difference, but minor style inconsistency.
- The `lg:hidden` / `lg:block` pattern depends on Tailwind 4 honoring the breakpoint correctly. Tailwind 4 in this project is configured (verified by existing `lg:` use elsewhere if any, or by Tailwind defaults).

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-recipe-page-mobile.md`. 1 task.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
