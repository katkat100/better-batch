# UI Primitives Sweep — Plan B-2: Cook view + Merge surfaces

**Date:** 2026-05-06
**Status:** Draft, pending implementation plan
**Builds on:** `2026-05-06-ui-primitives.md` (Plan A) and `2026-05-06-ui-primitives-sweep-b1.md` (Plan B-1)

## 1. Overview

Final sweep of hand-rolled buttons/inputs across the cook view and merge surfaces. Adds one new `Button` variant — `menuitem` — to capture overflow-menu styling that ghost cannot model. Retrofits `BatchDetail.svelte`'s menu items (currently raw) to use it.

## 2. Spec amendment — `menuitem` Button variant

Plan B-1 surfaced a real gap: ghost's text-only hover doesn't fit overflow-menu items that use background-fill on hover. Adding a 7th variant.

**Variant class string:**
```
text-obsidian hover:bg-drafting/40 text-left w-full
```

The variant bakes in: full-width left-aligned and the `hover:bg-drafting/40` background-fill hover. Casing/tracking come from the size string (the existing menu items in `BatchDetail` use `text-xs uppercase tracking-wider`, matching `size="sm"`). Used for overflow `…` menu items.

The actual menu-item padding in `BatchDetail` is `px-3 py-2`, slightly different from `size="sm"`'s `px-3 py-1.5`. Consumers override with `class="py-2"` when exact padding match matters.

For destructive menu items (e.g., `Delete Batch` with ochre text + ochre/10 hover), consumers append a class override:
```svelte
<Button variant="menuitem" class="text-ochre hover:bg-ochre/10 hover:text-ochre">
```

This is the existing append-last-wins pattern.

After adding the variant, the spec for `Button.svelte` covers 7 variants total: `primary`, `outline`, `ghost`, `dashed`, `danger`, `success`, `menuitem`.

## 3. Files in scope

### Cook view
- `src/lib/ui/cook/CookStartBanner.svelte` (1 element) — Start Cook trigger button.
- `src/lib/ui/cook/CookTopBar.svelte` (1) — Exit/back button.
- `src/lib/ui/cook/CookStepRow.svelte` (2) — checkbox + a button likely.
- `src/lib/ui/cook/CookTimerDock.svelte` (9) — timer chips, manual-add button, dismiss controls, popover trigger.

### Merge surfaces
- `src/lib/ui/MergePicker.svelte` (2) — branch select + Go button.
- `src/lib/ui/MergeIngredientRow.svelte` (6) — A/B/custom/result pick buttons. **Most stay raw** (rule §5.10).
- `src/lib/ui/MergeStepRow.svelte` (6) — same pattern. Most stay raw.
- `src/lib/ui/MergeVarRow.svelte` (4) — same pattern. Most stay raw.

### Retrofit
- `src/lib/ui/BatchDetail.svelte` — swap currently-raw menu items to `<Button variant="menuitem">`. Plan B-1 left them raw because no variant fit; the new `menuitem` variant fixes that.

### Out of scope
- `src/lib/ui/CompareView.svelte` — zero form elements.
- Read-only display files (`VariableTile`, `VariableDiffTable`).

## 4. Migration rules (restated, plus B-2 additions)

Rules 1-9 from Plan B-1 still apply (variant table, leave-raw escape hatch, preserve testids, don't touch unrelated logic, test all three suites green per task).

**B-2 additions:**

10. **Merge pick buttons** in `MergeVarRow`, `MergeIngredientRow`, `MergeStepRow` — leave raw. Their styling encodes pick state (`text-ochre font-bold` when active; `text-juniper font-bold` for the B side; `text-obsidian/60` when inactive). This is value-driven styling, not a button variant. Migrate only the genuinely button-shaped controls (e.g., a Reset or "custom" toggle that's a regular action).
11. **Cook timer chips** in `CookTimerDock.svelte` — leave raw if they encode timer state via color (juniper for running, ochre for paused, drafting for stopped). They're status-with-click, not action buttons. Migrate the manual-add button, dismiss × (icon-only — leave raw per rule 5), and any straightforward action buttons.

## 5. Task ordering

1. Extend `Button.svelte` to add the `menuitem` variant.
2. Retrofit `BatchDetail.svelte` menu items.
3. `CookStartBanner.svelte` — small.
4. `CookTopBar.svelte` — small.
5. `CookStepRow.svelte` — small.
6. `CookTimerDock.svelte` — largest cook file.
7. `MergePicker.svelte` — small.
8. `MergeVarRow.svelte`, `MergeIngredientRow.svelte`, `MergeStepRow.svelte` — bundle into one task since the pattern repeats and most picks stay raw.

## 6. Testing

Same as prior plans: after every task, all three suites stay green:
- `~/.bun/bin/bun x svelte-check --threshold warning` → `0 ERRORS 0 WARNINGS`.
- `~/.bun/bin/bun run e2e` → 6 passed.
- `~/.bun/bin/bun test` → 91 passed.

Manual visual check of any user-facing change: open the dev server, exercise the migrated surface (cook session, merge flow, batch overflow menu).

## 7. Out of scope

- New primitives (`Textarea`, `IconButton`, `Checkbox`).
- Variants beyond `menuitem`.
- Visual redesign — output should look identical to current state.
- Refactoring component structure or logic.
- Cook view's wake-lock / tick logic, timer popover positioning — leave alone.

## 8. Risks

- **`menuitem` color drift:** the variant uses `text-obsidian` (full opacity). If BatchDetail's menu items previously used `text-obsidian/80` or similar reduced opacity, the retrofit will look slightly bolder. Mitigation: check during the retrofit task; if visible drift, update the variant class to `text-obsidian/80` before continuing.
- **CookTimerDock complexity:** popover anchoring (the manual-timer popover that uses `position: fixed` to escape the dock's overflow context), tick-driven countdown reactivity, timer-state coloring — these are all working today. Mitigation: do CookTimerDock late in the plan, after simpler cook files validate the variant table; don't touch popover positioning or tick logic.
- **Merge row submit buttons:** if any of the three Merge*Row files have an "apply pick" or similar action button at the bottom (not the per-side picks), make sure to migrate those even though most picks stay raw.
