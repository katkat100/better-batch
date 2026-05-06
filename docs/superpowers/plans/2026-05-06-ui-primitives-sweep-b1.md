# UI Primitives Sweep B-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Migrate the remaining hand-rolled `<button>`/`<input>`/`<select>` elements in `NewRecipeDialog`, forms (`BatchEditor`, `UsesEditor`), and page chrome (`BatchDetail`, `Toolbar`, home route, recipe route) to use the `Button` / `TextInput` / `Select` / `Dialog` primitives from Plan A.

**Architecture:** Mechanical migration. No new primitives, no new variants. Each task: read → swap raw HTML for primitives per the variant table → run tests → commit. Each task touches exactly one file.

**Tech Stack:** Svelte 5 runes · TypeScript · Tailwind v4

Reference spec: `docs/superpowers/specs/2026-05-06-ui-primitives-sweep-b1.md`.
Reference Plan A: `docs/superpowers/plans/2026-05-06-ui-primitives.md`.

---

## File Structure

```
src/lib/ui/NewRecipeDialog.svelte                 # MODIFIED (dialog migration)
src/lib/ui/BatchEditor.svelte                     # MODIFIED
src/lib/ui/UsesEditor.svelte                      # MODIFIED
src/lib/ui/BatchDetail.svelte                     # MODIFIED
src/lib/ui/Toolbar.svelte                         # MODIFIED
src/routes/+page.svelte                           # MODIFIED
src/routes/recipes/[id]/+page.svelte              # MODIFIED
```

---

## Migration rules (apply to every task)

These rules are identical to Plan A. Restated for clarity.

1. **Add imports at the top of the `<script lang="ts">` block** for whichever primitives the file uses. Available imports:
   ```ts
   import Button from '$lib/ui/primitives/Button.svelte';
   import TextInput from '$lib/ui/primitives/TextInput.svelte';
   import Select from '$lib/ui/primitives/Select.svelte';
   import Dialog from '$lib/ui/primitives/Dialog.svelte';
   ```
2. **Replace `<button>` per the variant table:**
   - `border border-ochre bg-ochre text-canvas hover:...` → `<Button variant="primary">`
   - `border border-ochre text-ochre hover:bg-ochre hover:text-canvas` → `<Button variant="outline">`
   - `border border-juniper text-juniper hover:bg-juniper ...` → `<Button variant="success">`
   - `text-obsidian/60 hover:text-obsidian` (no border, no background) → `<Button variant="ghost">`
   - `border border-dashed border-drafting ...` → `<Button variant="dashed">`
   - **Size:** `text-sm uppercase tracking-wider px-4 py-2` → default (`size="md"`); `text-xs uppercase tracking-wider px-3 py-1.5` → `size="sm"`. The `<Button>` size string already includes `uppercase tracking-wider rounded-sm` — if the original had different casing/tracking (e.g., `normal-case`), add `class="text-sm normal-case tracking-normal"` (or appropriate override) so the appended-last class wins.
3. **Replace plain text `<input>` (default or `type="text"`) with `<TextInput>`.** Pass `bind:value`, `placeholder`, `disabled`, `inputmode`, etc. through. Layer extra utility classes via `class` prop. Need DOM focus? Use `bind:element` (not `bind:this`) — TextInput exposes the inner `<input>` via an `element` $bindable prop.
4. **Replace `<select>` with `<Select>`.** Keep `<option>` children verbatim.
5. **Leave raw:**
   - `<textarea>` (out of scope of primitives layer).
   - Icon-only buttons (`×`, `▲`, `▼`, single-glyph buttons) — `Button` size strings include uppercase/tracking that don't fit icons. Override class is awkward.
   - `<input type="checkbox">`, `<input type="radio">`, `<input type="number">` (narrow widget purpose).
   - Buttons with unique shapes (FAB, circular). None expected in B-1.
6. **Preserve every `data-testid`, `aria-label`, `id`, `for=`, `name` exactly.** All primitives forward unknown props via `{...rest}` spread.
7. **Don't touch unrelated logic.** State, validation, callbacks stay as-is.
8. **Per-task verification:**
   - `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3` → expect `0 ERRORS 0 WARNINGS`.
   - `~/.bun/bin/bun run e2e 2>&1 | tail -10` → expect 6 passed.
   - `~/.bun/bin/bun test 2>&1 | tail -3` → expect 91 pass.
9. **Edge cases — leave raw and report:** if a button in the file doesn't cleanly match any variant, leave it as raw HTML, add a one-line comment above it explaining why, and surface it in the implementer report. Don't force a near-match.

---

## Task 1: Migrate `NewRecipeDialog.svelte`

**Files:** Modify `src/lib/ui/NewRecipeDialog.svelte`.

This is the 6th dialog (missed in Plan A). Pattern matches the 5 dialogs already done.

- [ ] **Step 1: Read the file fully.**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/NewRecipeDialog.svelte`

Note: the dialog title `id`, every `data-testid` (`new-recipe-btn`, `new-recipe-dialog`, `new-recipe-name`, `new-recipe-submit`, etc.), the form's `onsubmit` handler, and whether the dialog has an internal `open` $bindable prop or is parent-mounted via `{#if}`.

- [ ] **Step 2: Apply migration rules.**

1. Replace the hand-rolled backdrop + inner card with `<Dialog ... title="..." titleId="..." onClose={...}>`. Choose `bind:open` if the file owns an `open` $bindable; use `open={true}` if the parent toggles via `{#if}`.
2. If the dialog has a `<form>`, keep it as Dialog's children. If a `<div>`, keep that.
3. Replace name `<input>` with `<TextInput>`.
4. Replace the preset `<select>` with `<Select>`.
5. Replace Cancel button → `<Button variant="ghost">`. Replace Create/Submit button → `<Button variant="primary">` (or `<Button variant={canSubmit ? 'primary' : 'outline'}>` if there's a disabled state with style change).
6. Remove the old `<h2>` (Dialog renders the title).

- [ ] **Step 3: Run verification.**

Run all three:
```bash
~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3
~/.bun/bin/bun run e2e 2>&1 | tail -10
~/.bun/bin/bun test 2>&1 | tail -3
```
All must be green per rule 8 above.

- [ ] **Step 4 (commit) — SKIP. Controller commits.**

---

## Task 2: Migrate `src/routes/+page.svelte` (home)

**Files:** Modify `src/routes/+page.svelte`.

- [ ] **Step 1: Read the file.**

Run: `cat /Users/katieWork/Developer/better-batch/src/routes/+page.svelte`

The file has one button — `+ New Recipe` with `data-testid="new-recipe-btn"`. It's an ochre outline trigger that opens NewRecipeDialog.

- [ ] **Step 2: Apply migration rules.**

1. Add `import Button from '$lib/ui/primitives/Button.svelte';` to the script block.
2. Replace `<button class="border border-ochre text-ochre ...">` with `<Button variant="outline">`. Preserve `data-testid="new-recipe-btn"`, the `onclick` handler, and any `aria-label`.

- [ ] **Step 3: Run verification.**

Same three commands as Task 1 Step 3. Must be green.

- [ ] **Step 4 (commit) — SKIP.**

---

## Task 3: Migrate `src/routes/recipes/[id]/+page.svelte`

**Files:** Modify `src/routes/recipes/[id]/+page.svelte`.

- [ ] **Step 1: Read the file.**

Run: `cat /Users/katieWork/Developer/better-batch/src/routes/recipes/\[id\]/+page.svelte`

Two buttons: `Edit Variables` (`data-testid="edit-variables-btn"`, drafting-border outline style) and `Delete Recipe` (`data-testid="delete-recipe-btn"`, ochre outline).

- [ ] **Step 2: Apply migration rules.**

1. Add `import Button from '$lib/ui/primitives/Button.svelte';` to the script block.
2. The `Edit Variables` button uses a `border border-drafting text-obsidian hover:border-ochre hover:text-ochre` style — this doesn't match a clean variant. Per rule 9, leave raw and add a comment: `<!-- raw: drafting-border style; no matching variant -->`. Alternatively, use `<Button variant="ghost" class="border border-drafting hover:border-ochre">` if the override composes cleanly — try this first; fall back to raw if visual differs.
3. The `Delete Recipe` button is `border border-ochre text-ochre hover:bg-ochre hover:text-canvas` → `<Button variant="outline">`. Preserve all attributes.
4. Size on both is `px-3 py-1.5 text-xs` → `size="sm"`.

- [ ] **Step 3: Run verification.**

Same three commands.

- [ ] **Step 4 (commit) — SKIP.**

---

## Task 4: Migrate `Toolbar.svelte`

**Files:** Modify `src/lib/ui/Toolbar.svelte`.

- [ ] **Step 1: Read the file.**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/Toolbar.svelte`

This is the home-page tag/sort filter toolbar. It has 4 form elements (likely tag chips + a sort `<select>`).

- [ ] **Step 2: Apply migration rules.**

1. Add imports for whichever primitives are needed (likely `Button` and `Select`).
2. Migrate the sort `<select>` → `<Select>`.
3. Tag chips: each is a small `<button>`. If they have ochre-outline-when-active / ghost-when-inactive styling, use `<Button variant={isActive ? 'outline' : 'ghost'} size="sm">`. If the styling is custom (e.g., a small drafting-border chip with active state via background change), leave them raw and add a `<!-- raw: chip styling -->` comment. Decide based on what the file actually contains.
4. Preserve every `data-testid` and `aria-pressed` attribute.

- [ ] **Step 3: Run verification.**

Same three commands.

- [ ] **Step 4 (commit) — SKIP.**

---

## Task 5: Migrate `UsesEditor.svelte`

**Files:** Modify `src/lib/ui/UsesEditor.svelte`.

- [ ] **Step 1: Read the file.**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/UsesEditor.svelte`

This component edits the per-step ingredient-use list (which ingredients each step uses, and their amount). 4 form elements expected.

- [ ] **Step 2: Apply migration rules.**

1. Add imports for `Button`, `TextInput`, `Select` (likely all three).
2. Migrate the ingredient `<select>` (which picks from the recipe's ingredients) → `<Select>`.
3. Migrate the amount `<input type="text">` (or `inputmode="decimal"`) → `<TextInput>`.
4. Migrate the `+ Add use` button → `<Button variant="dashed">` if dashed-style, or `<Button variant="outline" size="sm">` if ochre-outline.
5. The `× Remove use` button is icon-only → leave raw.
6. Preserve every `data-testid` (`add-use-btn`, `use-amount`, `use-ingredient`, `remove-use-btn`, etc.).

- [ ] **Step 3: Run verification.**

Same three commands. The `edit-batch.e2e.ts` test exercises UsesEditor heavily — particular attention if E2E fails.

- [ ] **Step 4 (commit) — SKIP.**

---

## Task 6: Migrate `BatchDetail.svelte`

**Files:** Modify `src/lib/ui/BatchDetail.svelte`.

- [ ] **Step 1: Read the file.**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/BatchDetail.svelte`

This is the recipe-batch detail panel with: batch header, overflow `…` menu (with items like Compare with…, Merge with…, Mark Cooked, Edit Outcome, Delete Batch), action buttons. 8 form elements.

- [ ] **Step 2: Apply migration rules.**

1. Add `import Button from '$lib/ui/primitives/Button.svelte';`.
2. The `…` overflow menu trigger button is icon-only — leave raw.
3. Each menu item button (Compare, Merge, Mark Cooked, etc.) is a ghost-style block → `<Button variant="ghost" size="sm" class="w-full text-left normal-case tracking-normal">`. Note: menu items typically use `text-left` and don't want uppercase/tracking — apply the override class. If the override doesn't compose cleanly (visual glitch), leave raw with a comment.
4. Action buttons (Mark Cooked, Edit Outcome, etc., if they appear standalone outside the menu) → match the variant table.
5. Preserve every `data-testid` (`more-actions-btn`, `compare-btn`, `merge-btn`, `mark-cooked-btn`, `edit-outcome-btn`, `delete-batch-btn`, etc.) and every `aria-label`.

- [ ] **Step 3: Run verification.**

Same three commands. E2E suite exercises this file heavily (delete batch, mark cooked, compare, merge flows).

- [ ] **Step 4 (commit) — SKIP.**

---

## Task 7: Migrate `BatchEditor.svelte`

**Files:** Modify `src/lib/ui/BatchEditor.svelte`.

This is the largest file (~18 form elements). Migrate last so all variant decisions from prior tasks are validated. The file contains: variable inputs (top of form), ingredient rows (amount/unit/name/section, with reorder + remove), step rows (textarea-based, with reorder + remove), use rows inside steps (delegated to `UsesEditor`), `+ Add ingredient` / `+ Add step` / `+ Add variable` buttons.

- [ ] **Step 1: Read the file fully.**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/BatchEditor.svelte`

Take notes on every `<button>`, `<input>`, `<select>` and its styling. Identify which are icon-only (`×`, `▲`, `▼`) — leave those raw.

- [ ] **Step 2: Apply migration rules.**

Element-by-element guidance:

- **Variable value inputs** (top of form): plain text inputs with `inputmode="decimal"` for number-typed schema items → `<TextInput>` with `inputmode` passed through. Preserve any per-row class overrides via the `class` prop.
- **Ingredient row inputs** (amount, unit, name): `<TextInput>` with `class="px-2 py-1 ..."` to maintain the row's compact spacing. The `flex-1` on the name input goes through `class`.
- **Section `<select>`** on each ingredient row: → `<Select class="px-2 py-1">`.
- **Reorder `▲▼` buttons** on rows: leave raw.
- **`× Remove`** buttons on rows: leave raw.
- **`+ Add ingredient` / `+ Add step` / `+ Add variable`** buttons: → `<Button variant="dashed" class="text-sm normal-case tracking-normal">`. The class override is required because dashed-add buttons in the existing file are sentence-case, not uppercase.
- **Submit button** at the bottom (`Save Batch` / `Save Draft` / similar): → `<Button type="submit" variant={canSubmit ? 'primary' : 'outline'} disabled={!canSubmit}>`. Match whatever existing logic was driving the `bg-ochre vs opacity-50` swap.
- **Step textarea**: leave raw.
- **`UsesEditor`** sub-component invocations: don't touch — Task 5 already migrated them.
- **Preserve every `data-testid`** including: `batch-label`, `batch-submit`, `add-ingredient-btn`, `add-step-btn`, `add-variable-btn` (if present), `add-use-btn`, `ingredient-edit-row`, `step-edit-row`, `ingredient-move-up`, `ingredient-move-down`, `step-move-up`, `step-move-down`, `step-text`, `use-amount`, etc.

- [ ] **Step 3: Run verification.**

Same three commands. **Particular attention here** — the `edit-batch.e2e.ts` test exercises virtually every element in this file. If anything fails, debug before proceeding.

- [ ] **Step 4 (commit) — SKIP.**

---

## Self-review notes

**Spec coverage:**
- Spec §2 file list (NewRecipeDialog, BatchEditor, UsesEditor, BatchDetail, Toolbar, home, recipe page) → Tasks 1, 7, 5, 6, 4, 2, 3 respectively. All 7 files have a task.
- Spec §3 migration rules → restated at top of plan, referenced in every task.
- Spec §4 sizing → reflected in task ordering decisions.
- Spec §5 task ordering (small-first, BatchEditor last) → followed exactly: Tasks 1 (NewRecipeDialog warm-up) → 2-3 (route pages, trivial) → 4 (Toolbar) → 5 (UsesEditor) → 6 (BatchDetail) → 7 (BatchEditor).
- Spec §6 testing (E2E + svelte-check + unit, all green per task) → encoded in rule 8 + every task's Step 3.
- Spec §7 out of scope → respected; no new primitives, no redesign, no refactor.
- Spec §8 risks (BatchEditor complexity, variant misclassification, overflow menu items) → all surfaced in Tasks 7, 6 and rule 9.

**Type consistency:**
- Variant names (`primary` / `outline` / `ghost` / `dashed` / `success` / `danger`) used consistently across all tasks; match Plan A's spec.
- All primitive imports use the same paths (`$lib/ui/primitives/Button.svelte` etc.).
- "Edge cases — leave raw and report" rule (rule 9) applied identically in every task.

**Risks during implementation:**
- **Task 3's Edit Variables button:** the drafting-border style is intentionally distinct from Delete Recipe's ochre outline. The `<Button variant="ghost" class="border border-drafting hover:border-ochre">` override may or may not compose cleanly with the ghost variant's no-border default. Implementer should A/B test; falling back to raw is acceptable.
- **Task 6's overflow menu items:** menu items typically need `text-left w-full` and `normal-case`. The class override pattern handles this but visual fidelity should be eyeballed.
- **Task 7's BatchEditor:** if the implementer hits a wall (E2E failure, variant doesn't fit, structural issue), reporting BLOCKED with specifics is preferred over forcing a workaround.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-ui-primitives-sweep-b1.md`. 7 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
