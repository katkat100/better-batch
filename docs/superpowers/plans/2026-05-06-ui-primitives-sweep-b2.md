# UI Primitives Sweep B-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Add a `menuitem` variant to `Button.svelte`, retrofit `BatchDetail`'s menu items to use it, then sweep cook view + merge surface buttons/inputs to use the existing primitives.

**Architecture:** One spec change (new variant). Then mechanical migration following the variant table. Some files have heavy "leave raw" footprint (merge picks, timer chips) — that's expected per the spec.

**Tech Stack:** Svelte 5 runes · TypeScript · Tailwind v4

Reference spec: `docs/superpowers/specs/2026-05-06-ui-primitives-sweep-b2.md`.

---

## File Structure

```
src/lib/ui/primitives/
  Button.svelte                              # MODIFIED: add menuitem variant

src/lib/ui/
  BatchDetail.svelte                         # MODIFIED: retrofit menu items
  MergePicker.svelte                         # MODIFIED
  MergeIngredientRow.svelte                  # MODIFIED
  MergeStepRow.svelte                        # MODIFIED
  MergeVarRow.svelte                         # MODIFIED

src/lib/ui/cook/
  CookStartBanner.svelte                     # MODIFIED
  CookTopBar.svelte                          # MODIFIED
  CookStepRow.svelte                         # MODIFIED
  CookTimerDock.svelte                       # MODIFIED
```

---

## Migration rules (apply across all migration tasks)

1. **Imports:** Add the primitives needed at the top of each `<script lang="ts">` block:
   ```ts
   import Button from '$lib/ui/primitives/Button.svelte';
   import TextInput from '$lib/ui/primitives/TextInput.svelte';
   import Select from '$lib/ui/primitives/Select.svelte';
   ```
2. **Variant table** (now 7 variants):
   - ochre solid → `primary`
   - ochre outline → `outline`
   - juniper outline → `success`
   - ghost (no border, no background, text-only hover) → `ghost`
   - dashed → `dashed`
   - menuitem (text-obsidian hover:bg-drafting/40 text-left w-full) → `menuitem` (introduced in Task 1)
3. **Sizes:** `text-sm px-4 py-2` → `md` (default); `text-xs px-3 py-1.5` → `sm`. If padding differs (e.g., menu items use `px-3 py-2`), pass the override via `class="py-2"`.
4. **Sentence-case override** if the original was not uppercase: `class="text-sm normal-case tracking-normal"`.
5. **Leave raw:**
   - `<textarea>`.
   - Icon-only buttons (`×`, `▲`, `▼`, `📝`, single-glyph buttons).
   - `<input type="checkbox">`, `<input type="radio">`, `<input type="number">` (narrow widget).
   - **Merge pick buttons** (`MergeVarRow`, `MergeIngredientRow`, `MergeStepRow`) — value-driven styling per spec §4.10.
   - **Cook timer chips** (in `CookTimerDock`) — status-with-click coloring per spec §4.11.
   - `<a>` anchors styled like buttons.
   - Anything where hover/active/disabled compose poorly with a variant.
6. **Preserve every `data-testid`, `aria-label`, `id`, `for`, `name`** exactly. Primitives forward unknown props via `{...rest}`.
7. **Don't touch unrelated logic** — state, validation, callbacks, popover positioning, tick timers, wake-lock — leave alone.
8. **Per-task verification (always all three):**
   - `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3` → `0 ERRORS 0 WARNINGS`.
   - `~/.bun/bin/bun run e2e 2>&1 | tail -10` → 6 passed.
   - `~/.bun/bin/bun test 2>&1 | tail -3` → 91 passed.
9. **Edge case escape:** if a button doesn't fit cleanly, leave it raw with a `<!-- raw: <reason> -->` comment.

---

## Task 1: Add `menuitem` variant to `Button.svelte`

**Files:** Modify `src/lib/ui/primitives/Button.svelte`.

- [ ] **Step 1: Update the `Variant` type and the `VARIANT_CLASS` map.**

Open `src/lib/ui/primitives/Button.svelte`. Find the `Variant` type alias and add `'menuitem'`:

```ts
  type Variant = 'primary' | 'outline' | 'ghost' | 'dashed' | 'danger' | 'success' | 'menuitem';
```

Find the `VARIANT_CLASS` const and add a new entry inside the object (alongside the existing entries):

```ts
  const VARIANT_CLASS: Record<Variant, string> = {
    primary: 'border border-ochre bg-ochre text-canvas hover:bg-ochre/90',
    danger: 'border border-ochre bg-ochre text-canvas hover:bg-ochre/90',
    outline: 'border border-ochre text-ochre hover:bg-ochre hover:text-canvas',
    ghost: 'text-obsidian/60 hover:text-obsidian',
    dashed: 'border border-dashed border-drafting text-obsidian/60 hover:border-ochre hover:text-ochre',
    success: 'border border-juniper text-juniper hover:bg-juniper hover:text-canvas',
    menuitem: 'text-obsidian hover:bg-drafting/40 text-left w-full'
  };
```

- [ ] **Step 2: Run svelte-check.**
Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 3: Run unit suite.**
Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 4 (commit) — SKIP. Controller commits.**

---

## Task 2: Retrofit `BatchDetail.svelte` menu items

**Files:** Modify `src/lib/ui/BatchDetail.svelte`.

The `…` overflow menu currently has 4 raw `<button>` elements (Compare with…, Merge with…, Mark as Cooked, Delete) plus 1 raw `<a>` (Edit). Replace the `<button>` elements with `<Button variant="menuitem">`. Leave the `<a>` raw (it's an anchor for navigation).

- [ ] **Step 1: Add the import.**

In the script block of `src/lib/ui/BatchDetail.svelte`, find the imports section (around line 10). Add:

```ts
    import Button from '$lib/ui/primitives/Button.svelte';
```

(This re-adds the import that was removed in the B-1 cleanup commit.)

- [ ] **Step 2: Replace the `Compare with…` button.**

Find this block (around lines 156-165):

```svelte
                        <!-- raw: menu item styling — hover:bg-drafting/40 background highlight differs from ghost hover:text-obsidian -->
                        <button
                            type="button"
                            onclick={() => {
                                moreOpen = false;
                                compareOpen = true;
                            }}
                            class="text-left px-3 py-2 text-xs uppercase tracking-wider hover:bg-drafting/40"
                            data-testid="compare-btn">Compare with…</button
                        >
```

Replace with:

```svelte
                        <Button
                            variant="menuitem"
                            size="sm"
                            class="py-2"
                            onclick={() => {
                                moreOpen = false;
                                compareOpen = true;
                            }}
                            data-testid="compare-btn"
                        >Compare with…</Button>
```

(Removes the `<!-- raw: ... -->` comment, swaps to `<Button variant="menuitem" size="sm" class="py-2">`.)

- [ ] **Step 3: Replace the `Merge with…` button.**

Find the next block (around lines 166-175):

```svelte
                        <!-- raw: menu item styling -->
                        <button
                            type="button"
                            onclick={() => {
                                moreOpen = false;
                                mergeOpen = true;
                            }}
                            class="text-left px-3 py-2 text-xs uppercase tracking-wider hover:bg-drafting/40"
                            data-testid="merge-btn">Merge with…</button
                        >
```

Replace with:

```svelte
                        <Button
                            variant="menuitem"
                            size="sm"
                            class="py-2"
                            onclick={() => {
                                moreOpen = false;
                                mergeOpen = true;
                            }}
                            data-testid="merge-btn"
                        >Merge with…</Button>
```

- [ ] **Step 4: Leave the `Edit` `<a>` anchor as raw.**

Around lines 177-182. It's an `<a>`, not a `<button>`. The existing comment is correct; keep both the `<a>` and its `<!-- raw: anchor menu item -->` comment unchanged.

- [ ] **Step 5: Replace the `Mark as Cooked` button.**

Find the block (around lines 184-192):

```svelte
                        {#if batch.status === 'draft'}
                            <!-- raw: menu item styling -->
                            <button
                                type="button"
                                onclick={() => { moreOpen = false; onMarkCooked(); }}
                                class="text-left px-3 py-2 text-xs uppercase tracking-wider hover:bg-drafting/40"
                                data-testid="mark-cooked-btn"
                            >Mark as Cooked</button>
                        {/if}
```

Replace with:

```svelte
                        {#if batch.status === 'draft'}
                            <Button
                                variant="menuitem"
                                size="sm"
                                class="py-2"
                                onclick={() => { moreOpen = false; onMarkCooked(); }}
                                data-testid="mark-cooked-btn"
                            >Mark as Cooked</Button>
                        {/if}
```

- [ ] **Step 6: Replace the destructive `Delete` button with class override.**

Find the block (around lines 194-210):

```svelte
                        <!-- raw: menu item styling — destructive ochre text with bg-ochre/10 hover differs from any Button variant -->
                        <button
                            type="button"
                            onclick={() => {
                                moreOpen = false;
                                if (canDelete) deleteOpen = true;
                            }}
                            disabled={!canDelete}
                            title={canDelete
                                ? ""
                                : `Delete child batches first (${childCount} child${childCount === 1 ? "" : "ren"})`}
                            class="text-left px-3 py-2 text-xs uppercase tracking-wider text-ochre hover:bg-ochre/10 disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid="delete-batch-btn"
                            >Delete{!canDelete
                                ? ` (${childCount} child${childCount === 1 ? "" : "ren"})`
                                : ""}</button
                        >
```

Replace with:

```svelte
                        <Button
                            variant="menuitem"
                            size="sm"
                            class="py-2 text-ochre hover:bg-ochre/10 hover:text-ochre"
                            onclick={() => {
                                moreOpen = false;
                                if (canDelete) deleteOpen = true;
                            }}
                            disabled={!canDelete}
                            title={canDelete
                                ? ""
                                : `Delete child batches first (${childCount} child${childCount === 1 ? "" : "ren"})`}
                            data-testid="delete-batch-btn"
                        >Delete{!canDelete
                            ? ` (${childCount} child${childCount === 1 ? "" : "ren"})`
                            : ""}</Button>
```

The `class` override appends `text-ochre hover:bg-ochre/10 hover:text-ochre` after the variant's `text-obsidian hover:bg-drafting/40`. Tailwind source-order means the override wins. The Button's `disabled:opacity-50 disabled:cursor-not-allowed` is in the COMMON class — note the original used `disabled:opacity-40`, the variant has `disabled:opacity-50`. This is a 10% opacity difference; acceptable.

- [ ] **Step 7: Run all three suites.**

```bash
~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3
~/.bun/bin/bun run e2e 2>&1 | tail -10
~/.bun/bin/bun test 2>&1 | tail -3
```

Expected: 0/0, 6 passed, 91 passed. Multiple E2E flows click these menu items (`compare-btn`, `merge-btn`, `mark-cooked-btn`, `delete-batch-btn`).

- [ ] **Step 8: Manual visual check.**

Start dev server, open a recipe, click `…` on a batch. Confirm the menu items look essentially identical: hover background fill, ochre Delete styling, disabled state.

- [ ] **Step 9 (commit) — SKIP.**

---

## Task 3: Migrate `CookStartBanner.svelte`

**Files:** Modify `src/lib/ui/cook/CookStartBanner.svelte`.

- [ ] **Step 1: Read the file.**
Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/cook/CookStartBanner.svelte`

It has 1 button — likely a "Start Cook" CTA. Note its class string and `data-testid`.

- [ ] **Step 2: Migrate.**

1. Add `import Button from '$lib/ui/primitives/Button.svelte';` to the script block.
2. Replace the button per the variant table:
   - If it's `border border-ochre bg-ochre text-canvas hover:...` → `<Button variant="primary">`.
   - If it's `border border-ochre text-ochre hover:bg-ochre hover:text-canvas` → `<Button variant="outline">`.
   - If it's `border border-juniper text-juniper hover:bg-juniper ...` → `<Button variant="success">`.
3. Determine size from padding/text classes (`px-4 py-2 text-sm` → md; `px-3 py-1.5 text-xs` → sm).
4. Preserve `data-testid` and `onclick` exactly.

- [ ] **Step 3: Run all three suites.**

```bash
~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3
~/.bun/bin/bun run e2e 2>&1 | tail -10
~/.bun/bin/bun test 2>&1 | tail -3
```

Expected: 0/0, 6, 91.

- [ ] **Step 4 (commit) — SKIP.**

---

## Task 4: Migrate `CookTopBar.svelte`

**Files:** Modify `src/lib/ui/cook/CookTopBar.svelte`.

- [ ] **Step 1: Read the file.**
Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/cook/CookTopBar.svelte`

It has 1 button (likely Exit/Back). If it's an `<a>` instead, leave raw and report.

- [ ] **Step 2: Migrate.**

1. Add `import Button from '$lib/ui/primitives/Button.svelte';` if it's a `<button>`.
2. Match per the variant table.
3. Preserve `data-testid` and any `aria-label`.
4. If it's an `<a>` anchor, leave raw with a comment.

- [ ] **Step 3: Run all three suites.**

Same commands as Task 3.

- [ ] **Step 4 (commit) — SKIP.**

---

## Task 5: Migrate `CookStepRow.svelte`

**Files:** Modify `src/lib/ui/cook/CookStepRow.svelte`.

- [ ] **Step 1: Read the file.**
Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/cook/CookStepRow.svelte`

It has 2 elements. Likely a `<input type="checkbox">` (which stays raw) and a button or another input.

- [ ] **Step 2: Migrate.**

1. `<input type="checkbox">` → leave raw.
2. If there's a `<button>`, match per the variant table. If it's a click area or an icon button, leave raw.
3. Add imports needed.
4. Preserve all `data-testid`.

- [ ] **Step 3: Run all three suites.**

- [ ] **Step 4 (commit) — SKIP.**

---

## Task 6: Migrate `CookTimerDock.svelte`

**Files:** Modify `src/lib/ui/cook/CookTimerDock.svelte`.

This is the heaviest cook file (9 elements). Approach with care.

- [ ] **Step 1: Read the file fully.**
Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/cook/CookTimerDock.svelte`

Note every `<button>` and identify:
- **Timer chips** (one per active timer) — likely color-coded by state (juniper running, ochre paused, drafting stopped). LEAVE RAW per spec §4.11. They're status-with-click, not button-shaped actions.
- **Manual-add button** (`📝` or similar) — likely a clean trigger button, candidate for migration.
- **Dismiss `×` buttons** on each timer chip — icon-only, leave raw.
- **Manual timer popover** — popover positioning is `position: fixed z-50` per past work. Don't touch the popover wrapper. The Save/Add button inside the popover is a candidate for migration.
- **Any clear-all or stop-all button.**

Take notes before editing.

- [ ] **Step 2: Migrate.**

1. Add `import Button from '$lib/ui/primitives/Button.svelte';` (and `TextInput`/`Select` only if a clean text input is found — most timer inputs are `inputmode="numeric"` for minutes/seconds, which fits TextInput).
2. **Timer chips:** leave raw. Add a `<!-- raw: timer chip styling -->` comment on each one.
3. **Manual-add trigger** and **popover Save button:** migrate per the variant table.
4. **Dismiss `×`** buttons: leave raw (icon-only).
5. **Numeric input fields** for timer duration (if present): migrate to `<TextInput inputmode="numeric">` if they're clean text-style inputs. If they use a stepper or custom widget, leave raw.
6. Don't touch the `tick`-based `$derived` reactivity, the wake-lock acquire/release effects, or the popover's `position: fixed` positioning.

- [ ] **Step 3: Run all three suites.**

Expected: 0/0, 6 passed, 91 passed.

- [ ] **Step 4: Manual visual check.**

Open the dev server, start a cook session, open the timer dock. Confirm: timer chips look the same, manual-add trigger works, popover opens above the dock (not clipped), dismiss × works.

- [ ] **Step 5 (commit) — SKIP.**

---

## Task 7: Migrate `MergePicker.svelte`

**Files:** Modify `src/lib/ui/MergePicker.svelte`.

`MergePicker` is the entry component for the merge flow — likely shows a select for picking the batch to merge from + a Go/Confirm button.

- [ ] **Step 1: Read the file.**
Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/MergePicker.svelte`

- [ ] **Step 2: Migrate.**

1. Add primitive imports needed.
2. The `<select>` for picking the source batch → `<Select>`. Keep `<option>` children verbatim and preserve `bind:value`, `data-testid`, etc.
3. The Go/Confirm button → match per the variant table.
4. Any Cancel/Close button → `<Button variant="ghost">`.
5. Preserve all `data-testid`.

- [ ] **Step 3: Run all three suites.**

- [ ] **Step 4 (commit) — SKIP.**

---

## Task 8: Migrate the three Merge*Row files

**Files:**
- Modify: `src/lib/ui/MergeVarRow.svelte`
- Modify: `src/lib/ui/MergeIngredientRow.svelte`
- Modify: `src/lib/ui/MergeStepRow.svelte`

These three follow the same pattern: each row shows an A side (left), a B side (right), and a custom override option. The user clicks A or B (or types a custom value) to "pick" that side. Per spec §4.10, the pick buttons stay RAW — they encode value-driven styling.

- [ ] **Step 1: Read all three files.**
Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/MergeVarRow.svelte /Users/katieWork/Developer/better-batch/src/lib/ui/MergeIngredientRow.svelte /Users/katieWork/Developer/better-batch/src/lib/ui/MergeStepRow.svelte`

Identify, in each file:
- **Pick buttons** (`pick-a`, `pick-b`, `pick-custom` or similar testids) — these have `text-ochre font-bold` when selected vs `text-obsidian/60` when not. LEAVE RAW.
- **Custom-value `<input>`** (only `MergeVarRow` is known to have one — `data-testid="custom-input"`). Migrate to `<TextInput>` if it's a clean text input.
- **Any other action button** (e.g., a "skip" button or row-level "reset"). Migrate per the variant table if found.

- [ ] **Step 2: Migrate `MergeVarRow.svelte`.**

1. Add `import TextInput from '$lib/ui/primitives/TextInput.svelte';` if you migrate the custom input.
2. The pick buttons (pick-a, pick-b, pick-custom) — LEAVE RAW with `<!-- raw: value-driven pick styling -->` comments.
3. The `<input type="text">` for custom value (`data-testid="custom-input"`) — replace with `<TextInput>`. Pass `inputmode` (likely `decimal` for number-typed schema items, `text` otherwise — preserve whatever the original had). Pass `value` and `oninput` through (the original uses an `oninput={(e) => setCustom(...)}` handler — keep the same shape, just on the primitive).
4. Preserve every `data-testid`.

- [ ] **Step 3: Migrate `MergeIngredientRow.svelte`.**

1. Read the file. The 6 elements are likely: A side button, B side button, custom toggle, plus inputs for custom amount/unit/name (3 inputs).
2. Pick buttons (pick-a, pick-b, pick-custom) — LEAVE RAW.
3. Custom-value `<input>` fields (amount/unit/name) — migrate to `<TextInput>`. Layer compact-spacing class via `class` prop (likely `class="px-2 py-1"`).
4. If there's a section `<select>` for the picked-side ingredient, migrate to `<Select>`.
5. Preserve every `data-testid`.

- [ ] **Step 4: Migrate `MergeStepRow.svelte`.**

1. Read the file. 6 elements likely include pick buttons and a custom textarea or text fields.
2. Pick buttons — LEAVE RAW.
3. `<textarea>` for custom step text — leave raw (out of scope for primitives).
4. Any plain `<input>` for custom field — `<TextInput>`.
5. Preserve every `data-testid`.

- [ ] **Step 5: Run all three suites.**

```bash
~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3
~/.bun/bin/bun run e2e 2>&1 | tail -10
~/.bun/bin/bun test 2>&1 | tail -3
```

Expected: 0/0, 6 passed, 91 passed. The merge flow is exercised by E2E tests if any are present; if not, manual check is the safety net.

- [ ] **Step 6: Manual visual check.**

Open dev server, navigate to a recipe with at least 2 batches, click the `…` menu → `Merge with…`, pick a source batch. Confirm the merge picker shows correctly, click through ingredient/step/var rows, exercise the A/B/custom pick toggles, fill a custom value. Confirm picks visually update (font-bold + color change).

- [ ] **Step 7 (commit) — SKIP.**

---

## Self-review notes

**Spec coverage:**
- Spec §2 (`menuitem` variant) → Task 1.
- Spec §3 file list (cook view + merge) → Tasks 3-8 covers all 7 migration files (CookStartBanner, CookTopBar, CookStepRow, CookTimerDock, MergePicker, MergeVarRow, MergeIngredientRow, MergeStepRow).
- Spec §3 retrofit (`BatchDetail` menu items) → Task 2.
- Spec §4.10 (merge picks stay raw) → applied in Task 8.
- Spec §4.11 (cook timer chips stay raw) → applied in Task 6.
- Spec §5 task ordering (variant first, BatchDetail second, cook small-to-large, then merge) → followed: Task 1 → Task 2 → Tasks 3-5 (small cook) → Task 6 (CookTimerDock last cook) → Task 7 → Task 8.
- Spec §6 testing → encoded in rule 8 + every task's verification step.
- Spec §7 out of scope → respected (no new variants beyond `menuitem`, no Textarea, no logic changes).
- Spec §8 risks (menuitem color drift, CookTimerDock complexity, merge submit buttons) → addressed in Task 2 (visual check), Task 6 (notes about popover/tick), Task 8 (explicit "if there's a row-level action, migrate" guidance).

**Type consistency:**
- `Variant` type updated in Task 1; subsequent tasks reference the new `'menuitem'` value.
- All primitive imports use the same `$lib/ui/primitives/...` paths.
- `data-testid` preservation rule applied identically across every migration task.

**Risks:**
- **Task 2 disabled-opacity drift:** Button's COMMON class uses `disabled:opacity-50`, BatchDetail's Delete button used `disabled:opacity-40`. 10% difference is documented and accepted.
- **Task 6 timer chips:** the implementer has to identify timer chips by their class signature (juniper/ochre/drafting state coloring). If they aren't sure, leaving raw is the safe choice.
- **Task 8 unknown structure:** without reading the three Merge*Row files in advance, the plan can't enumerate every element. The guidance is principle-based ("pick buttons stay raw, custom inputs become TextInput") which the implementer applies after reading.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-ui-primitives-sweep-b2.md`. 8 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
