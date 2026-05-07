# BatchEditor Mobile Layout

**Date:** 2026-05-07
**Status:** Draft, pending implementation plan
**Related:** `2026-05-06-recipe-page-mobile.md` (sibling mobile work — recipe page tabs)

## 1. Overview

Make ingredient rows in `src/lib/ui/BatchEditor.svelte` usable on small viewports. Currently each row is a single horizontal flex of `[arrows w-5] [amount w-24] [unit w-20] [name flex-1] [section w-32] [×]` — on a 375px phone the name input collapses to almost zero width.

Below the `md` breakpoint (768px), restack each ingredient row per Layout C: arrows on the left edge, × on the right, inputs vertically stacked between (name on top, amount+unit on a shared row, section below). Above `md`, the existing horizontal layout is preserved exactly.

This spec covers ingredient rows in `BatchEditor` only. Other surfaces inside the editor (variables grid, status radios, step rows, UsesEditor, submit row) are out of scope — see §6.

## 2. Architecture

Single-file change to `src/lib/ui/BatchEditor.svelte`. No new components, no new primitives. Uses Tailwind responsive classes only.

The DOM order on mobile is the mobile visual order. On desktop, `md:order-*` utility classes restore the original visual order (amount → unit → name → section) without re-rendering.

## 3. Breakpoint

`md` (768px).

- Below `md`: Layout C (stacked).
- `md` and above: existing horizontal row.

This differs from the recipe-page's `lg` breakpoint because BatchEditor is a full-width route page with no aside. It only starts cramping below ~640px in practice.

## 4. Markup

The current ingredient row is at `src/lib/ui/BatchEditor.svelte:218`. Replace its body with:

```svelte
<div class="flex gap-2 items-start md:items-center" data-testid="ingredient-edit-row">
  <!-- Arrows (left rail) -->
  <div class="flex flex-col w-5 shrink-0 pt-1 md:pt-0">
    <button
      type="button"
      onclick={() => ingredients = moveItem(ingredients, i, i - 1)}
      disabled={i === 0}
      aria-label="Move ingredient {i + 1} up"
      class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
      data-testid="ingredient-move-up"
    >▲</button>
    <button
      type="button"
      onclick={() => ingredients = moveItem(ingredients, i, i + 1)}
      disabled={i === ingredients.length - 1}
      aria-label="Move ingredient {i + 1} down"
      class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
      data-testid="ingredient-move-down"
    >▼</button>
  </div>

  <!-- Inner content: stacked on mobile, flat row on desktop -->
  <div class="flex-1 flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
    <TextInput
      bind:value={ing.name}
      placeholder="Ingredient"
      aria-label="Ingredient {i + 1} name"
      class="px-2 py-1.5 md:flex-1 md:order-3"
    />
    <!-- amount + unit: paired row on mobile, flat siblings on desktop via md:contents -->
    <div class="flex gap-2 md:contents">
      <TextInput
        bind:value={ing.amount}
        onblur={() => evalIngredientAmountOnBlur(i)}
        placeholder="Amount"
        aria-label="Ingredient {i + 1} amount"
        class="flex-1 md:flex-none md:w-24 md:order-1 px-2 py-1.5"
      />
      <TextInput
        bind:value={ing.unit}
        placeholder="Unit"
        aria-label="Ingredient {i + 1} unit"
        class="flex-1 md:flex-none md:w-20 md:order-2 px-2 py-1.5"
      />
    </div>
    <select
      value={ing.section ?? '__none__'}
      onchange={(e) => {
        const val = (e.currentTarget as HTMLSelectElement).value;
        ing.section = val === '__none__' ? undefined : val;
      }}
      aria-label="Ingredient {i + 1} section"
      class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm text-sm md:w-32 md:order-4"
      data-testid="ingredient-section"
    >
      <option value="__none__">(no section)</option>
      {#each sectionOptions as sec}
        <option value={sec}>{sec}</option>
      {/each}
      <option value="__new__">+ New section…</option>
    </select>
  </div>

  <!-- × remove (right rail) -->
  <button
    type="button"
    onclick={() => removeIngredient(i)}
    aria-label="Remove ingredient {i + 1}"
    class="text-obsidian/40 hover:text-ochre pt-2 md:pt-0"
  >×</button>
</div>
```

### Key techniques

- **`md:contents`** on the amount+unit wrapper: above `md`, the wrapper's `display: contents` makes its children participate in the parent flex as if the wrapper weren't there. This lets amount and unit be a paired row on mobile while flat siblings of name/section on desktop.
- **`md:order-1` through `md:order-4`** restore the desktop visual order (amount → unit → name → section) without changing DOM order. Mobile DOM order is name → amount → unit → section.
- **Vertical alignment shifts**: `items-start` on mobile (so arrows + × align with the top of the stacked inner content), `md:items-center` on desktop (matches existing). Arrows get `pt-1` and × gets `pt-2` on mobile to roughly align with the first input row visually.

## 5. Selectors and tests

Every existing `data-testid` and `aria-label` is preserved verbatim. No E2E changes needed — the existing `edit-batch.e2e.ts` test exercises ingredient rows by `data-testid="ingredient-edit-row"` and inner `locator('input').nth(N)` selectors. The DOM order changes (name now comes before amount/unit), so:

- `ingRows.nth(N).locator('input').nth(0)` was amount; now it's **name**.
- `ingRows.nth(N).locator('input').nth(1)` was unit; now it's **amount**.
- `ingRows.nth(N).locator('input').nth(2)` was name; now it's **unit**.

This will break the existing test. The fix: switch the test from positional `locator('input').nth(N)` to `getByLabel(/amount/i)`, `getByLabel(/unit/i)`, `getByLabel(/^Ingredient \d+ name$/i)` — using the existing `aria-label` attributes which are stable across the layout change.

This is the only test edit needed. It's a small, deliberate change to make the test depend on semantic labels rather than DOM position.

## 6. Out of scope

- **`UsesEditor`** — the per-step ingredient-use grid is tight on 375px (~150px for the ingredient select after the indent), but workable. **REVISIT LATER:** if the cramped select becomes annoying in real use, restack on mobile (ingredient select on its own row, amount+unit display+× on a second row).
- **Step rows** — already use a vertical card layout with naturally-flexing textarea. Fine on mobile.
- **Variables grid** — already `grid-cols-2`. Fits.
- **Status radios** — trivially fit.
- **Submit / Cancel button row** — already simple.
- **Drag-and-drop reorder** — separate future work; up/down arrows remain the reorder mechanism.
- **BatchEditor's outer container padding/spacing** — unchanged. The fix is per-row only.

## 7. Testing

- **Existing E2E (`edit-batch.e2e.ts`):** must be updated to use `getByLabel` instead of positional `locator('input').nth(N)` for the three ingredient inputs (amount/unit/name). After the update, all 6 E2E tests pass.
- **Unit suite:** unchanged. 91 pass.
- **svelte-check:** 0 errors / 0 warnings.
- **Manual viewport check:**
  - iPhone SE (375×667) — 3-row stacked layout, name input full-width, amount+unit splitting, section full-width, × visible right edge.
  - iPhone 14 (390×844) — same.
  - iPad portrait (768×1024) — exactly at `md` boundary (`md` is `min-width: 768px`); should hit the **desktop horizontal layout**.
  - iPad landscape (1024×768) — desktop layout.
  - Desktop (1280+) — desktop layout, identical to current.

## 8. Risks

- **Tab navigation order on desktop:** `md:order-*` is visual only; keyboard tab order follows DOM order. On desktop, tabbing through the inputs goes name → amount → unit → section instead of the visual amount → unit → name → section. Small a11y inconsistency. Acceptable: most desktop users use a mouse for these per-row inputs.
- **Section select label width on mobile:** `(no section)` and `+ New section…` may look odd at full width with extra trailing space. Cosmetic; native `<select>` will render fine.
- **`md:contents` browser support:** safe in all evergreen browsers (Safari 11.1+, Chrome 65+, Firefox 37+).
- **Visual jitter at exactly 768px:** Tailwind `md` is `min-width: 768px`, so 767px shows mobile layout, 768px+ shows desktop. No practical risk.
