# UI Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Ship four reusable Svelte primitives — `Button`, `TextInput`, `Select`, `Dialog` — and migrate the five existing dialogs to use them, killing the duplicated Tailwind class strings and a11y boilerplate.

**Architecture:** Each primitive is a single `.svelte` file at `src/lib/ui/primitives/`. Variants are class-based (a `variant`/`size` prop maps to a Tailwind class string). Consumers can extend with a `class` prop appended last. No external libraries.

**Tech Stack:** Svelte 5 runes · TypeScript · Tailwind v4

Reference spec: `docs/superpowers/specs/2026-05-06-ui-primitives.md`.

---

## Spec amendment

The spec was amended after writing to add a 6th `Button` variant — `success` (juniper-colored). This was discovered while surveying `OutcomeForm`, `EndCookDialog`, and `CookQuickNoteFab` for migration: all three use a `border-juniper text-juniper hover:bg-juniper` button style for the "save outcome / mark cooked / save edited note" action. The `success` variant captures this. The spec file at `docs/superpowers/specs/2026-05-06-ui-primitives.md` reflects the amendment.

---

## File Structure

```
src/lib/ui/primitives/
  Button.svelte          # NEW
  TextInput.svelte       # NEW
  Select.svelte          # NEW
  Dialog.svelte          # NEW

src/lib/ui/
  ConfirmDeleteDialog.svelte           # MODIFIED: migrated to use primitives
  EditVariablesDialog.svelte           # MODIFIED: migrated
  OutcomeForm.svelte                   # MODIFIED: migrated

src/lib/ui/cook/
  EndCookDialog.svelte                 # MODIFIED: migrated
  CookQuickNoteFab.svelte              # MODIFIED: migrated
```

---

## Migration rules (apply to every dialog migration task)

When migrating a dialog, follow these rules consistently:

1. **Wrap with `<Dialog>`** — replace the hand-rolled backdrop `<div>` (`fixed inset-0 bg-obsidian/40 ...`) AND the inner card `<div>`/`<form>` wrapper with a `<Dialog>` component. The `<Dialog>` owns: backdrop, `role="dialog"`, `aria-modal`, `aria-labelledby`, `tabindex="-1"`, Escape key, backdrop click, the title `<h2>`.
2. **Keep `<form>` if the dialog had one** — `<Dialog>` does NOT include a `<form>`. If the original had one (`ConfirmDeleteDialog`, `EditVariablesDialog`, `OutcomeForm`), put it inside `<Dialog>` as the children. If the original had a `<div>` (`CookQuickNoteFab`, `EndCookDialog`), use a `<div>` as the children.
3. **Replace `<button>` with `<Button>`** — pick the variant per this table:
   - `border border-ochre bg-ochre text-canvas ...` → `variant="primary"`
   - `border border-ochre text-ochre hover:bg-ochre ...` → `variant="outline"`
   - `border border-juniper text-juniper hover:bg-juniper ...` → `variant="success"`
   - `text-obsidian/60 hover:text-obsidian` (no border) → `variant="ghost"`
   - `border border-dashed ...` → `variant="dashed"`
   - Size: most uppercase-tracking buttons are `size="md"`; smaller `text-xs px-3 py-1.5` are `size="sm"`. If unsure, eyeball the result in the browser.
4. **Replace plain `<input type="text">` and `<input>` (default) with `<TextInput>`** — pass `bind:value`, `placeholder`, `disabled`, etc. through. Preserve any extra classes via the `class` prop.
5. **Replace `<select>` with `<Select>`** — keep the inner `<option>` children as-is.
6. **Preserve every `data-testid`, `aria-label`, `id` attribute exactly** — the E2E suite relies on them. `<Button>`, `<TextInput>`, `<Select>` all forward `data-testid`, `aria-label`, etc. via prop spread (Task 1 covers this).
7. **Preserve the dialog's old title `id`** — the existing dialogs all use specific ids like `confirm-delete-dialog-title`. Pass these via `<Dialog titleId="...">` (Task 1 Step 4 implements this prop).
8. **Don't touch unrelated logic** — only swap the visual primitives. State, validation, callbacks, etc. stay exactly as they were.
9. **After every migration:** run `~/.bun/bin/bun run e2e`, `~/.bun/bin/bun test`, and `~/.bun/bin/bun x svelte-check --threshold warning`. All must pass.

---

## Task 1: Build the four primitives

**Files:**
- Create: `src/lib/ui/primitives/Button.svelte`
- Create: `src/lib/ui/primitives/TextInput.svelte`
- Create: `src/lib/ui/primitives/Select.svelte`
- Create: `src/lib/ui/primitives/Dialog.svelte`

These four are bundled into one task because each is small (<60 lines), they have no logic to test (pure markup + class strings), and they're a tightly-coupled set consumed together by every migration that follows.

- [ ] **Step 1: Create `src/lib/ui/primitives/Button.svelte`**

```svelte
<!-- src/lib/ui/primitives/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'outline' | 'ghost' | 'dashed' | 'danger' | 'success';
  type Size = 'sm' | 'md';

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    class: extraClass = '',
    onclick,
    children,
    ...rest
  }: {
    variant?: Variant;
    size?: Size;
    type?: 'button' | 'submit';
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  const VARIANT_CLASS: Record<Variant, string> = {
    primary: 'border border-ochre bg-ochre text-canvas hover:bg-ochre/90',
    danger: 'border border-ochre bg-ochre text-canvas hover:bg-ochre/90',
    outline: 'border border-ochre text-ochre hover:bg-ochre hover:text-canvas',
    ghost: 'text-obsidian/60 hover:text-obsidian',
    dashed: 'border border-dashed border-drafting text-obsidian/60 hover:border-ochre hover:text-ochre',
    success: 'border border-juniper text-juniper hover:bg-juniper hover:text-canvas'
  };

  const SIZE_CLASS: Record<Size, string> = {
    md: 'px-4 py-2 text-sm uppercase tracking-wider rounded-sm',
    sm: 'px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm'
  };

  const COMMON = 'disabled:opacity-50 disabled:cursor-not-allowed';
</script>

<button
  {type}
  {disabled}
  {onclick}
  class="{VARIANT_CLASS[variant]} {SIZE_CLASS[size]} {COMMON} {extraClass}"
  {...rest}
>
  {@render children()}
</button>
```

- [ ] **Step 2: Create `src/lib/ui/primitives/TextInput.svelte`**

```svelte
<!-- src/lib/ui/primitives/TextInput.svelte -->
<script lang="ts">
  let {
    value = $bindable(''),
    placeholder = '',
    type = 'text',
    inputmode,
    disabled = false,
    class: extraClass = '',
    oninput,
    onblur,
    ...rest
  }: {
    value?: string;
    placeholder?: string;
    type?: string;
    inputmode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url' | 'none';
    disabled?: boolean;
    class?: string;
    oninput?: (e: Event) => void;
    onblur?: (e: FocusEvent) => void;
    [key: string]: unknown;
  } = $props();

  const DEFAULT_CLASS = 'border border-drafting bg-canvas px-3 py-2 rounded-sm text-sm';
</script>

<input
  bind:value
  {type}
  {inputmode}
  {placeholder}
  {disabled}
  {oninput}
  {onblur}
  class="{DEFAULT_CLASS} {extraClass}"
  {...rest}
/>
```

- [ ] **Step 3: Create `src/lib/ui/primitives/Select.svelte`**

```svelte
<!-- src/lib/ui/primitives/Select.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    value = $bindable(),
    disabled = false,
    class: extraClass = '',
    children,
    ...rest
  }: {
    value?: unknown;
    disabled?: boolean;
    class?: string;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  const DEFAULT_CLASS = 'border border-drafting bg-canvas px-3 py-2 rounded-sm text-sm';
</script>

<select
  bind:value
  {disabled}
  class="{DEFAULT_CLASS} {extraClass}"
  {...rest}
>
  {@render children()}
</select>
```

- [ ] **Step 4: Create `src/lib/ui/primitives/Dialog.svelte`**

```svelte
<!-- src/lib/ui/primitives/Dialog.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    title,
    titleId,
    subtitle,
    class: extraClass = '',
    onClose,
    children
  }: {
    open?: boolean;
    title: string;
    titleId?: string;
    subtitle?: string;
    class?: string;
    onClose?: () => void;
    children: Snippet;
  } = $props();

  // Auto-generated id if consumer didn't supply one. $props.id() gives a stable
  // unique id per component instance.
  const autoId = `dialog-title-${$props.id()}`;
  const headingId = $derived(titleId ?? autoId);

  function close() {
    open = false;
    onClose?.();
  }

  function backdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  const DEFAULT_CARD = 'bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm max-h-[90vh] overflow-auto';
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50"
    onclick={backdropClick}
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="dialog"
    aria-modal="true"
    aria-labelledby={headingId}
    tabindex="-1"
  >
    <div class="{DEFAULT_CARD} {extraClass}">
      <div>
        <h2 id={headingId} class="font-serif text-xl">{title}</h2>
        {#if subtitle}<p class="text-sm text-obsidian/60 mt-1">{subtitle}</p>{/if}
      </div>
      {@render children()}
    </div>
  </div>
{/if}
```

- [ ] **Step 5: Run svelte-check to confirm all four compile cleanly**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Run unit suite — confirm no regressions**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 7: Commit (controller)**

```bash
git add src/lib/ui/primitives/
git commit -m "feat(ui): primitives — Button, TextInput, Select, Dialog"
```

---

## Task 2: Migrate `ConfirmDeleteDialog`

**Files:**
- Modify: `src/lib/ui/ConfirmDeleteDialog.svelte`

This is the simplest dialog (single typed-input form, two buttons). Migrating it first validates the primitive APIs end-to-end before touching the more complex ones.

- [ ] **Step 1: Read the current file**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/ConfirmDeleteDialog.svelte`

The current file (~112 lines) has:
- A hand-rolled `<svelte:window onkeydown=...>` for Escape (REMOVE — Dialog owns this).
- A hand-rolled outer `<div role="dialog" aria-modal ...>` with backdrop click handler (REMOVE — Dialog owns this).
- A `<form onsubmit={submit}>` with the dialog's content (KEEP, place inside Dialog).
- A `<h2 id="confirm-delete-dialog-title">{title}</h2>` (REMOVE — Dialog renders the title; pass `titleId="confirm-delete-dialog-title"`).
- A `<p>{body}</p>` after the title (KEEP, this is the dialog body content not a subtitle).
- Optional typed input (`<input bind:this={typedEl} bind:value={typedInput} ...>`) — replace with `<TextInput>`.
- Cancel button (`<button type="button" onclick={close} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian" data-testid="confirm-delete-cancel">`) — replace with `<Button type="button" variant="ghost" size="md" onclick={close} data-testid="confirm-delete-cancel">Cancel</Button>`.
- Submit button (`<button type="submit" disabled={!canConfirm} class="border border-ochre {canConfirm ? 'bg-ochre text-canvas' : 'text-ochre opacity-50'} ...">`) — this is the only tricky one because the variant changes between `primary` (when `canConfirm`) and `outline` (when `!canConfirm`). Use `variant={canConfirm ? 'primary' : 'outline'}`.

- [ ] **Step 2: Rewrite the component**

Replace the entire content of `src/lib/ui/ConfirmDeleteDialog.svelte` with:

```svelte
<!-- src/lib/ui/ConfirmDeleteDialog.svelte -->
<script lang="ts">
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';

  let {
    open = $bindable(false),
    title,
    body,
    confirmLabel,
    mode = 'simple',
    typedMatch = '',
    onConfirm
  }: {
    open?: boolean;
    title: string;
    body: string;
    confirmLabel: string;
    mode?: 'simple' | 'typed';
    typedMatch?: string;
    onConfirm: () => Promise<void> | void;
  } = $props();

  let typedInput = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  const canConfirm = $derived(
    !submitting && (mode === 'simple' || typedInput.trim() === typedMatch)
  );

  function close() {
    open = false;
    typedInput = '';
    error = null;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    submitting = true;
    error = null;
    try {
      await onConfirm();
      close();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete';
    } finally {
      submitting = false;
    }
  }

  let typedEl = $state<HTMLInputElement | undefined>();
  $effect(() => {
    if (open && mode === 'typed') typedEl?.focus();
  });
</script>

<Dialog
  bind:open
  {title}
  titleId="confirm-delete-dialog-title"
  onClose={close}
>
  <form
    onsubmit={submit}
    class="flex flex-col gap-4"
    data-testid="confirm-delete-dialog"
  >
    <p class="text-sm whitespace-pre-wrap">{body}</p>

    {#if mode === 'typed'}
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Type to confirm</span>
        <TextInput
          bind:this={typedEl}
          bind:value={typedInput}
          class="font-mono"
          data-testid="confirm-delete-input"
        />
      </label>
    {/if}

    {#if error}
      <p class="text-ochre text-sm" data-testid="confirm-delete-error">{error}</p>
    {/if}

    <div class="flex justify-end gap-2 pt-2">
      <Button
        type="button"
        variant="ghost"
        onclick={close}
        data-testid="confirm-delete-cancel"
      >Cancel</Button>
      <Button
        type="submit"
        variant={canConfirm ? 'primary' : 'outline'}
        disabled={!canConfirm}
        data-testid="confirm-delete-submit"
      >{submitting ? 'Deleting…' : confirmLabel}</Button>
    </div>
  </form>
</Dialog>
```

- [ ] **Step 3: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200, no errors in `/tmp/bb-dev.log`.

- [ ] **Step 4: Run svelte-check**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 5: Run E2E suite**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -5`
Expected: 6 passed.

- [ ] **Step 6: Run unit suite**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 7: Manual visual check**

Start the dev server (`~/.bun/bin/bun run dev`), open `http://localhost:5173/`, click into any recipe, click `Delete Recipe` to open the dialog. Confirm: looks the same as before, Escape closes, backdrop click closes, typed input focuses, the Delete Recipe button enables only when the name matches.

- [ ] **Step 8: Commit (controller)**

```bash
git add src/lib/ui/ConfirmDeleteDialog.svelte
git commit -m "refactor(ui): migrate ConfirmDeleteDialog to primitives"
```

---

## Task 3: Migrate `EditVariablesDialog`

**Files:**
- Modify: `src/lib/ui/EditVariablesDialog.svelte`

This is the most prop-heavy dialog (rows of inputs + selects + variant buttons). It validates that the primitives handle complex usage including class overrides.

- [ ] **Step 1: Replace the entire file content**

Replace `src/lib/ui/EditVariablesDialog.svelte` with:

```svelte
<!-- src/lib/ui/EditVariablesDialog.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableType } from '$lib/server';
  import { api } from '$lib/ui/api-client';
  import { untrack } from 'svelte';
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';
  import Select from '$lib/ui/primitives/Select.svelte';

  let {
    open = $bindable(false),
    recipeId,
    schema,
    onSaved
  }: {
    open?: boolean;
    recipeId: string;
    schema: VariableSchemaItem[];
    onSaved: () => Promise<void> | void;
  } = $props();

  type Row = { name: string; unit: string; type: VariableType; originalType: VariableType | null; confirming: boolean };

  function toRows(s: VariableSchemaItem[]): Row[] {
    return s.map(v => ({ name: v.name, unit: v.unit, type: v.type, originalType: v.type, confirming: false }));
  }

  let rows = $state<Row[]>(untrack(() => toRows(schema)));
  let submitting = $state(false);
  let serverError = $state<string | null>(null);

  $effect(() => {
    if (open) {
      rows = toRows(schema);
      serverError = null;
    }
  });

  const trimmedNames = $derived(rows.map(r => r.name.trim()));
  const emptyNameIdx = $derived(trimmedNames.findIndex(n => n === ''));
  const duplicateNames = $derived.by(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const n of trimmedNames) {
      const key = n.toLowerCase();
      if (key === '') continue;
      if (seen.has(key)) dups.add(key);
      seen.add(key);
    }
    return dups;
  });
  const canSave = $derived(!submitting && emptyNameIdx === -1 && duplicateNames.size === 0);

  function isDuplicate(i: number): boolean {
    const key = trimmedNames[i].toLowerCase();
    if (key === '') return false;
    return duplicateNames.has(key) && trimmedNames.findIndex(n => n.toLowerCase() === key) !== i;
  }

  function addRow() {
    rows = [...rows, { name: '', unit: '', type: 'number', originalType: null, confirming: false }];
  }

  function startRemove(i: number) {
    rows = rows.map((r, idx) => idx === i ? { ...r, confirming: true } : r);
  }
  function cancelRemove(i: number) {
    rows = rows.map((r, idx) => idx === i ? { ...r, confirming: false } : r);
  }
  function confirmRemove(i: number) {
    rows = rows.filter((_, idx) => idx !== i);
  }

  function close() {
    open = false;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!canSave) return;
    submitting = true;
    serverError = null;
    try {
      const next: VariableSchemaItem[] = rows.map(r => ({
        name: r.name.trim(),
        unit: r.unit.trim(),
        type: r.type
      }));
      await api.patchRecipe(recipeId, { variableSchema: next });
      await onSaved();
      close();
    } catch (err) {
      serverError = err instanceof Error ? err.message : 'Failed to save';
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog
  bind:open
  title="Edit Variables"
  titleId="edit-variables-dialog-title"
  subtitle="Changes apply to all batches in this recipe."
  class="max-w-2xl"
  onClose={() => { if (!submitting) close(); }}
>
  <form
    onsubmit={save}
    class="flex flex-col gap-4"
    data-testid="edit-variables-dialog"
  >
    {#if serverError}
      <p class="text-ochre text-sm" data-testid="edit-variables-error">{serverError}</p>
    {/if}

    <div class="flex flex-col gap-2">
      {#each rows as row, i (i)}
        <div
          class="flex flex-col gap-1 border border-drafting/50 p-2 rounded-sm"
          data-testid="var-edit-row"
        >
          {#if row.confirming}
            <div class="flex items-center justify-between gap-2 text-sm">
              <span>Remove "{row.name.trim() || '(unnamed)'}"?</span>
              <div class="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onclick={() => confirmRemove(i)}
                  data-testid="var-remove-confirm"
                >Confirm</Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onclick={() => cancelRemove(i)}
                  data-testid="var-remove-cancel"
                >Cancel</Button>
              </div>
            </div>
          {:else}
            <div class="flex gap-2 items-center">
              <TextInput
                bind:value={row.name}
                placeholder="Name"
                class="flex-1 px-2 py-1"
                data-testid="var-name"
              />
              <TextInput
                bind:value={row.unit}
                placeholder="Unit"
                class="w-24 px-2 py-1 font-mono"
                data-testid="var-unit"
              />
              <Select
                bind:value={row.type}
                class="px-2 py-1"
                data-testid="var-type"
              >
                <option value="number">number</option>
                <option value="text">text</option>
              </Select>
              <button
                type="button"
                onclick={() => startRemove(i)}
                aria-label="Remove variable"
                class="text-obsidian/50 hover:text-ochre px-2"
                data-testid="var-remove"
              >×</button>
            </div>
            {#if row.name.trim() === ''}
              <p class="text-ochre text-xs">Name is required.</p>
            {:else if isDuplicate(i)}
              <p class="text-ochre text-xs">Duplicate name.</p>
            {/if}
            {#if row.originalType !== null && row.type !== row.originalType}
              <p class="text-obsidian/60 text-xs">Existing values may not parse cleanly under the new type.</p>
            {/if}
          {/if}
        </div>
      {/each}
    </div>

    <Button
      type="button"
      variant="dashed"
      onclick={addRow}
      class="text-sm normal-case tracking-normal"
      data-testid="add-variable-btn"
    >+ Add Variable</Button>

    <div class="flex justify-end gap-2 pt-2 border-t border-drafting">
      <Button
        type="button"
        variant="ghost"
        onclick={close}
        disabled={submitting}
        data-testid="edit-variables-cancel"
      >Cancel</Button>
      <Button
        type="submit"
        variant={canSave ? 'primary' : 'outline'}
        disabled={!canSave}
        data-testid="edit-variables-submit"
      >{submitting ? 'Saving…' : 'Save Changes'}</Button>
    </div>
  </form>
</Dialog>
```

Note: the bare `×` button stays as a raw `<button>` because it's an icon-only button — `Button` primitive's variants are sized for text labels, and "icon-only" is explicitly out of scope per the spec. Same for the dashed `+ Add Variable` which uses `class="text-sm normal-case tracking-normal"` to override the default uppercase tracking applied by `Button`'s size string.

- [ ] **Step 2: Run svelte-check**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 3: Run E2E suite**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -5`
Expected: 6 passed (the `edit-variables.e2e.ts` test specifically exercises this dialog end-to-end).

- [ ] **Step 4: Run unit suite**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 5: Manual visual check**

Open the dev server, navigate to a recipe, click `Edit Variables`. Confirm: dialog looks the same, all rows render, remove/confirm flow works, validation error text appears for empty/duplicate names, Save Changes is disabled when invalid and ochre-solid when valid.

- [ ] **Step 6: Commit (controller)**

```bash
git add src/lib/ui/EditVariablesDialog.svelte
git commit -m "refactor(ui): migrate EditVariablesDialog to primitives"
```

---

## Task 4: Migrate `OutcomeForm`

**Files:**
- Modify: `src/lib/ui/OutcomeForm.svelte`

`OutcomeForm` is the dialog used to mark a batch cooked or edit its outcome (rating + outcome notes). The primary action button uses the juniper `success` variant.

- [ ] **Step 1: Read the current file to understand its full content**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/OutcomeForm.svelte`

Note the structure:
- Outer backdrop `<div>` — REPLACE with `<Dialog>`.
- Inner `<form>` — KEEP inside Dialog.
- Inner card `<div class="bg-canvas border border-obsidian p-6 ...">` — REMOVE; Dialog provides this.
- A `<h2>` — REMOVE; Dialog renders the title.
- `<textarea>` for outcome notes — KEEP as-is (textarea is explicitly out of scope per spec §10).
- Cancel button (ghost) — replace with `<Button variant="ghost">`.
- Primary action button (`border border-juniper text-juniper hover:bg-juniper`) — replace with `<Button variant="success">`.

- [ ] **Step 2: Apply the migration rules from the top of this plan**

Following the migration rules section above:
1. Identify the dialog's title (currently `cook-form-title` or similar — preserve the exact `id` and pass via `titleId`). Read the current file to confirm the exact title id.
2. Determine if the dialog had a `<form>` (it does).
3. Replace outer + inner card wrappers with `<Dialog bind:open ... titleId="..." onClose={...}>`. Wrap the existing `<form>` as the children.
4. Replace each `<button>` per the variant table (Cancel → `variant="ghost"`, Save → `variant="success"`).
5. Preserve every `data-testid`, `aria-label`, and the `<textarea>`.
6. Do not touch the form's `onsubmit` handler, props, or state.

The implementer should produce a structurally identical result to Task 2 — outer `<Dialog>`, inner `<form data-testid="...">` with the same children minus the now-redundant `<h2>` and any cook-warning banner kept as-is, ending with a `<div class="flex justify-end gap-2 pt-2">` containing two `<Button>` elements.

- [ ] **Step 3: Run svelte-check**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Run E2E suite**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -5`
Expected: 6 passed (multiple E2E tests cover OutcomeForm via the "Mark Cooked" flow in `foundation.e2e.ts` and `edit-batch.e2e.ts`).

- [ ] **Step 5: Run unit suite**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 6: Manual visual check**

Open the dev server, create or open a draft batch, click "Mark Cooked" (in the BatchDetail `…` menu). Confirm the form opens, looks the same, the rating selector works, outcome notes textarea is functional, Cancel closes, Save Outcome submits with the juniper-styled button.

- [ ] **Step 7: Commit (controller)**

```bash
git add src/lib/ui/OutcomeForm.svelte
git commit -m "refactor(ui): migrate OutcomeForm to primitives"
```

---

## Task 5: Migrate `EndCookDialog`

**Files:**
- Modify: `src/lib/ui/cook/EndCookDialog.svelte`

This dialog is shown at the end of a cook session — summary of cooked steps + outcome notes + optional fork-as-draft checkbox. Primary action is `success` (juniper).

- [ ] **Step 1: Read the current file**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/cook/EndCookDialog.svelte`

Note: this dialog does NOT have a `<form>` — it's a `<div>` with action buttons that call handlers directly. Keep that structure (Dialog children = a `<div>` not a `<form>`).

- [ ] **Step 2: Apply the migration rules**

1. Replace outer + inner card wrappers with `<Dialog bind:open title="..." titleId="..." onClose={close}>`. Read the existing `<h2>` text and id and pass them via `title` and `titleId`.
2. Place the existing inner content (summary div, textarea, fork checkbox row, button row) inside the Dialog as children. Wrap them in a single `<div class="flex flex-col gap-4" data-testid="end-cook-dialog">` (or whatever testid existed on the original card div — preserve it exactly).
3. Replace Cancel button → `<Button variant="ghost">`.
4. Replace primary `border-juniper` button → `<Button variant="success">`.
5. The `<textarea>` and the `<input type="checkbox">` and the inline `<input>` for fork-label stay as raw HTML (out of scope for primitives).
6. Preserve all `data-testid` attributes (`end-cook-dialog`, `end-cook-summary`, `quick-notes-recap`, `fork-as-draft-checkbox`, `fork-label`, etc.).

- [ ] **Step 3: Run svelte-check**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Run E2E suite**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -5`
Expected: 6 passed.

- [ ] **Step 5: Run unit suite**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 6: Manual visual check**

Open the dev server, start a cook session, complete it (or simulate the end-cook flow). Confirm the End Cook dialog renders identically: summary grid, notes textarea, quick-notes recap (if present), fork-as-draft checkbox + label input, Cancel and the juniper Save button.

- [ ] **Step 7: Commit (controller)**

```bash
git add src/lib/ui/cook/EndCookDialog.svelte
git commit -m "refactor(ui): migrate EndCookDialog to primitives"
```

---

## Task 6: Migrate `CookQuickNoteFab`

**Files:**
- Modify: `src/lib/ui/cook/CookQuickNoteFab.svelte`

This component has TWO parts: a floating action button (the `📝` round button) and a dialog. The FAB itself is a one-off rounded shape — leave it as a raw `<button>` (rounded-full, fixed-position, the `Button` primitive's rectangular shape doesn't fit). Migrate the dialog only.

- [ ] **Step 1: Read the current file**

Run: `cat /Users/katieWork/Developer/better-batch/src/lib/ui/cook/CookQuickNoteFab.svelte`

The dialog (lines ~74-156) is a `<div>` (not a `<form>`) with: title, notes list (each note is editable inline), add-note section with textarea, and Close button. Buttons inside:
- Note edit Cancel — `text-obsidian/60 hover:text-obsidian` → `variant="ghost"`, `size="sm"`
- Note edit Save — `border border-juniper text-juniper hover:bg-juniper` → `variant="success"`, `size="sm"`
- Note Delete — `text-ochre/70 hover:text-ochre` (small uppercase) → use raw `<button>` (this is a tiny destructive link-style button that doesn't match any clean variant)
- Note Edit — `text-obsidian/60 hover:text-obsidian` (small uppercase) → use raw `<button>` (matches the same micro-action pattern as Delete, keeping them visually paired)
- + Add note — `border border-ochre text-ochre ...` → `variant="outline"`, `size="sm"`
- Close — `text-obsidian/60 hover:text-obsidian` (md size) → `variant="ghost"`, `size="md"`

- [ ] **Step 2: Apply the migration rules**

1. Keep the floating `<button>` (the FAB) at the top of the template exactly as it is — do NOT migrate.
2. Replace the dialog backdrop + card wrappers with `<Dialog bind:open title="Notes for next batch" titleId="quick-note-title" onClose={close}>`.
3. Move existing dialog content inside Dialog children. The original had a header with `<h2 id="quick-note-title">` and a sibling `<span>` showing `{notes.length} captured` — Dialog now renders the `<h2>`, so move the captured-count `<span>` into the children area as a separate paragraph, or keep it inline by passing a custom layout. Simplest: render the captured-count `<span>` immediately below Dialog's header by including it as the first child element with appropriate spacing.
4. Replace the buttons per the table in Step 1.
5. Preserve all `data-testid` (`quick-note-fab`, `quick-note-badge`, `quick-note-modal`, `quick-note-list`, `quick-note-item`, `quick-note-textarea`, `quick-note-save`, `quick-note-save-edit`, `quick-note-edit`, `quick-note-delete`, `quick-note-close`).
6. The `<textarea>` stays raw.

- [ ] **Step 3: Run svelte-check**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Run E2E suite**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -5`
Expected: 6 passed.

- [ ] **Step 5: Run unit suite**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 6: Manual visual check**

Open the dev server, start a cook session. Click the floating 📝 FAB, confirm the dialog opens and looks identical: notes list, add-note textarea, the inline edit/delete/save flow on existing notes, the + Add note button, Close. Open via Escape and backdrop-click both close it.

- [ ] **Step 7: Commit (controller)**

```bash
git add src/lib/ui/cook/CookQuickNoteFab.svelte
git commit -m "refactor(ui): migrate CookQuickNoteFab dialog to primitives"
```

---

## Self-review notes

**Spec coverage:**
- Spec §3 (file structure under `primitives/`) → Task 1
- Spec §4 (Button: variant + size + type + disabled + class + onclick + children, plus 6 variant strings and 2 size strings) → Task 1 Step 1
- Spec §5 (TextInput: bind:value + passthrough props + default class) → Task 1 Step 2
- Spec §6 (Select: bind:value + children for options + default class same as TextInput) → Task 1 Step 3
- Spec §7 (Dialog shell: open + title + titleId + subtitle + class + onClose + children, with backdrop/Escape/role/aria/tabindex) → Task 1 Step 4
- Spec §8 Plan A: migrate ConfirmDeleteDialog → Task 2
- Spec §8 Plan A: migrate EditVariablesDialog → Task 3
- Spec §8 Plan A: migrate OutcomeForm → Task 4
- Spec §8 Plan A: migrate EndCookDialog → Task 5
- Spec §8 Plan A: migrate CookQuickNoteFab → Task 6
- Spec §9 testing (E2E + svelte-check + unit) → every migration task includes Steps 3-5 running all three
- Spec §10 out of scope (Textarea, IconButton, focus trap, animations, theme tokens, tailwind-merge) → respected; raw `<textarea>` and the `×` icon button are explicitly left raw

**Type consistency:**
- All migration tasks use the same component import paths (`$lib/ui/primitives/Button.svelte` etc.) defined in Task 1.
- All migration tasks use the same variant names (`primary` / `outline` / `ghost` / `dashed` / `success`; `danger` is unused in this plan, deliberately reserved).
- `<Dialog>`'s `titleId` prop is used consistently in all 5 migration tasks to preserve the original `aria-labelledby` references.
- `data-testid` preservation rule (rule 6 in Migration rules) applied identically in every migration task.

**Risks / things to watch during implementation:**
- The `Dialog` component uses `$props.id()` which is a Svelte 5 builtin for stable component-instance ids. If for some reason it isn't available in the project's Svelte version, the implementer can fall back to a `Math.random().toString(36)` id generated once at component init.
- Manual visual checks (Step 6/7 in each task) are the safety net for class-string regressions that won't show up in E2E. Don't skip them.
- Task 3 (EditVariablesDialog) keeps the `+ Add Variable` button with `class="text-sm normal-case tracking-normal"` to override the size string's `text-sm uppercase tracking-wider`. This is the spec's "appended-last wins" pattern in action — `normal-case` overrides `uppercase`, and `tracking-normal` overrides `tracking-wider`. Confirmed Tailwind v4 honors source order on conflicting utilities.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-ui-primitives.md`. 6 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
