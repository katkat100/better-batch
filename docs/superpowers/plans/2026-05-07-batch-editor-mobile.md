# BatchEditor Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Below `md` (768px), restack BatchEditor's ingredient rows so the name input gets full width on phones and the row stops collapsing inputs to unusable widths.

**Architecture:** Single-file markup change to `src/lib/ui/BatchEditor.svelte` plus a focused E2E test selector update (positional `nth(N)` → semantic `getByLabel`). Uses Tailwind responsive classes (`md:contents`, `md:order-*`, `md:flex-row`). DOM order on mobile is name → amount → unit → section; `md:order-*` restores the desktop visual order without re-rendering.

**Tech Stack:** Svelte 5 · Tailwind v4 · Playwright

Reference spec: `docs/superpowers/specs/2026-05-07-batch-editor-mobile.md`.

---

## File Structure

```
src/lib/ui/BatchEditor.svelte    # MODIFIED — ingredient row markup restack
tests/e2e/edit-batch.e2e.ts      # MODIFIED — switch ingredient input selectors to getByLabel
```

---

## Task 1: Restack ingredient row markup

**Files:** Modify `src/lib/ui/BatchEditor.svelte`.

The current ingredient row block is at lines 217-262 (a `{#each ingredients as ing, i (i)}` body). Replace its content with a responsive layout that stacks below `md` and matches the existing horizontal layout at `md+`.

- [ ] **Step 1: Read the current file.**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/BatchEditor.svelte | sed -n '215,272p'`

Confirm the existing block matches the expected structure (each ingredient row is `<div class="flex gap-2 items-center" data-testid="ingredient-edit-row">` containing the arrows column, three TextInputs, the section select, and the × button).

- [ ] **Step 2: Replace the ingredient row body.**

Find this block (the entire `{#each ingredients as ing, i (i)}` loop body):

```svelte
      <div class="flex gap-2 items-center" data-testid="ingredient-edit-row">
        <div class="flex flex-col w-5 shrink-0">
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
        <TextInput bind:value={ing.amount} onblur={() => evalIngredientAmountOnBlur(i)} placeholder="Amount" aria-label="Ingredient {i + 1} amount" class="px-2 py-1.5 w-24" />
        <TextInput bind:value={ing.unit} placeholder="Unit" aria-label="Ingredient {i + 1} unit" class="px-2 py-1.5 w-20" />
        <TextInput
          bind:value={ing.name}
          placeholder="Ingredient"
          aria-label="Ingredient {i + 1} name"
          class="px-2 py-1.5 flex-1"
        />
        <select
          value={ing.section ?? '__none__'}
          onchange={(e) => {
            const val = (e.currentTarget as HTMLSelectElement).value;
            ing.section = val === '__none__' ? undefined : val;
          }}
          aria-label="Ingredient {i + 1} section"
          class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm text-sm w-32"
          data-testid="ingredient-section"
        >
          <option value="__none__">(no section)</option>
          {#each sectionOptions as sec}
            <option value={sec}>{sec}</option>
          {/each}
          <option value="__new__">+ New section…</option>
        </select>
        <button type="button" onclick={() => removeIngredient(i)} aria-label="Remove ingredient {i + 1}" class="text-obsidian/40 hover:text-ochre">×</button>
      </div>
```

Replace with:

```svelte
      <div class="flex gap-2 items-start md:items-center" data-testid="ingredient-edit-row">
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

        <div class="flex-1 flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
          <TextInput
            bind:value={ing.name}
            placeholder="Ingredient"
            aria-label="Ingredient {i + 1} name"
            class="px-2 py-1.5 md:flex-1 md:order-3"
          />
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

        <button
          type="button"
          onclick={() => removeIngredient(i)}
          aria-label="Remove ingredient {i + 1}"
          class="text-obsidian/40 hover:text-ochre pt-2 md:pt-0"
        >×</button>
      </div>
```

Key changes from original:
- Outer flex: `items-start md:items-center` (so arrows + × align with the top of the stacked content on mobile).
- Arrows column: added `pt-1 md:pt-0` for vertical alignment with the first input on mobile.
- New `<div class="flex-1 flex flex-col gap-2 md:flex-row md:items-center md:gap-2">` wraps the inputs + select. Stacks vertically on mobile, flat row on desktop.
- Name TextInput: `md:flex-1 md:order-3` — full width on mobile, third visual position on desktop.
- Amount + Unit pair wrapped in `<div class="flex gap-2 md:contents">` — paired row on mobile, flat siblings on desktop via `display: contents`.
  - Amount: `flex-1 md:flex-none md:w-24 md:order-1`.
  - Unit: `flex-1 md:flex-none md:w-20 md:order-2`.
- Section `<select>`: `md:w-32 md:order-4` — full width on mobile, 32 on desktop, fourth visual position.
- × button: added `pt-2 md:pt-0` for vertical alignment on mobile.

- [ ] **Step 3: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Run unit suite.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 5: Run E2E suite (expected to fail — Task 2 fixes it).**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -10`
Expected: **5 passed, 1 failed** — `edit-batch.e2e.ts` fails because its `locator('input').nth(N)` selectors now hit a different input (DOM order changed). This is intentional and fixed in Task 2.

- [ ] **Step 6 (commit) — SKIP. Controller commits after Task 2 makes E2E green again.**

---

## Task 2: Update E2E selectors to use `getByLabel`

**Files:** Modify `tests/e2e/edit-batch.e2e.ts`.

The test at `tests/e2e/edit-batch.e2e.ts:18-37` uses positional `locator('input').nth(N)` to fill the three ingredient inputs. After Task 1, the DOM order is name → amount → unit instead of amount → unit → name, so positional indexing breaks. Switch to `getByLabel(...)` which uses the existing stable `aria-label` attributes.

- [ ] **Step 1: Read the current test.**

Run: `cat /Users/katieWork/Developer/better-batch/tests/e2e/edit-batch.e2e.ts`

Note the existing block at lines 18-37 that fills two ingredient rows and exercises reorder.

- [ ] **Step 2: Replace the ingredient-fill blocks.**

Find this block in the test:

```ts
  const ingRows = page.getByTestId('ingredient-edit-row');
  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(0).locator('input').nth(0).fill('500');
  await ingRows.nth(0).locator('input').nth(1).fill('g');
  await ingRows.nth(0).locator('input').nth(2).fill('flour');
  await ingRows.nth(0).locator('input').nth(2).blur();

  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(1).locator('input').nth(0).fill('100');
  await ingRows.nth(1).locator('input').nth(1).fill('g');
  await ingRows.nth(1).locator('input').nth(2).fill('water');
  await ingRows.nth(1).locator('input').nth(2).blur();

  // Verify reorder: move water up, water becomes index 0
  await ingRows.nth(1).getByTestId('ingredient-move-up').click();
  await expect(ingRows.nth(0).locator('input').nth(2)).toHaveValue('water');
  await expect(ingRows.nth(1).locator('input').nth(2)).toHaveValue('flour');
  // Move water back down to restore order for the rest of the test
  await ingRows.nth(0).getByTestId('ingredient-move-down').click();
  await expect(ingRows.nth(0).locator('input').nth(2)).toHaveValue('flour');
```

Replace with:

```ts
  const ingRows = page.getByTestId('ingredient-edit-row');
  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(0).getByLabel(/^Ingredient 1 amount$/).fill('500');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 unit$/).fill('g');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).fill('flour');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).blur();

  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(1).getByLabel(/^Ingredient 2 amount$/).fill('100');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 unit$/).fill('g');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 name$/).fill('water');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 name$/).blur();

  // Verify reorder: move water up, water becomes index 0
  await ingRows.nth(1).getByTestId('ingredient-move-up').click();
  await expect(ingRows.nth(0).getByLabel(/name$/)).toHaveValue('water');
  await expect(ingRows.nth(1).getByLabel(/name$/)).toHaveValue('flour');
  // Move water back down to restore order for the rest of the test
  await ingRows.nth(0).getByTestId('ingredient-move-down').click();
  await expect(ingRows.nth(0).getByLabel(/name$/)).toHaveValue('flour');
```

Notes:
- `getByLabel(/^Ingredient 1 amount$/)` matches the exact `aria-label="Ingredient 1 amount"` attribute on the amount input. Using a regex with `^...$` anchors makes the match exact rather than substring.
- After reorder, `ingRows.nth(0).getByLabel(/name$/)` works because each row has exactly one input whose label ends in "name" (the others end in "amount" or "unit"). Using a permissive `/name$/` regex inside the row scope avoids depending on the original "Ingredient 1 / Ingredient 2" numbering, since after a reorder the visible position changes but the label numbers don't.

- [ ] **Step 3: Run E2E.**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -10`
Expected: 6 passed.

- [ ] **Step 4: Run unit suite — confirm no regression.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 5: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Quick dev-server compile check.**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200, no errors in /tmp/bb-dev.log.

- [ ] **Step 7 (commit) — SKIP.**

---

## Self-review notes

**Spec coverage:**
- Spec §3 breakpoint (`md` 768px) → Task 1 markup uses `md:` prefix throughout.
- Spec §4 markup pattern (arrows left, content stacked, × right; `md:contents`, `md:order-*`, `md:flex-row`) → Task 1 Step 2 full code.
- Spec §5 selectors and tests (existing `data-testid` and `aria-label` preserved; switch test from positional `nth(N)` to `getByLabel`) → Task 2.
- Spec §6 out of scope (UsesEditor, step rows, variables, status, submit) → respected; Task 1 only touches the ingredient row block.
- Spec §7 testing → Tasks 1 Steps 3-5 + Task 2 Steps 3-5.
- Spec §8 risks (tab order on desktop) → documented; not blocking.

**Placeholder scan:** none. All markup and test code is concrete.

**Type consistency:**
- `data-testid="ingredient-edit-row"`, `ingredient-move-up/down`, `ingredient-section`, `add-ingredient-btn` all preserved.
- `aria-label="Ingredient {i + 1} {amount|unit|name|section}"` patterns preserved verbatim from the original markup.
- The test's `getByLabel(/^Ingredient 1 amount$/)` regex matches the exact `aria-label` produced by the markup at row 0.

**Risks during implementation:**
- The block being replaced is large (~46 lines). The implementer must replace the *entire ingredient row body* (the `{#each}` loop's contents), not the `{#each}` itself or the `<fieldset>`. Step 2 quotes the exact start and end markers.
- The existing E2E test passes a positional selector pattern; the new pattern uses `getByLabel`. If the implementer mistakes `getByLabel` for `getByRole('label')` or similar, the test will silently match nothing. The expected E2E output (6 passed) is the safety net.
- Playwright's `getByLabel` matches inputs by their accessible name (computed from `aria-label`, `<label for>`, etc.). The current markup uses `aria-label` directly on the `<input>`/`<TextInput>`, so this is a direct match. No `<label>` wiring changes needed.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-07-batch-editor-mobile.md`. 2 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
