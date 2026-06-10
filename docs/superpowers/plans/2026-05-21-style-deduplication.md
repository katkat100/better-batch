# Style deduplication implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract recurring style patterns (form labels, captions, kickers, placeholder text, bordered cards, section headings) into shared Tailwind component classes and Svelte primitives, then migrate every consumer.

**Architecture:** Hybrid — Svelte primitives (`Field`, `Card`, `SectionHeading`) wrap structural patterns, Tailwind `@layer components` classes (`.text-label`, `.text-caption`, `.text-kicker`, `.text-placeholder`) cover text-only patterns. Each migration is byte-for-byte visually identical; the change is purely where the style lives.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes, snippets), Tailwind v4 with `@layer components` and `@apply`, Bun + `bun:test`, Playwright e2e.

**Spec:** [`2026-05-21-style-deduplication.md`](../specs/2026-05-21-style-deduplication.md)

---

## Notes for implementers

- The bun binary lives at `~/.bun/bin`. Run `export PATH="$HOME/.bun/bin:$PATH"` at the start of each shell session or prepend to commands.
- Migrations are visual parity changes. There are **no new unit tests** for this work. Validation per task is `bun run typecheck && bun run lint && bun test && bun run e2e`. All four must remain green.
- Lefthook's pre-commit hook already runs typecheck/lint/test/knip. If pre-commit fails, fix the issue and create a new commit (do not amend).
- The user prefers we never push or commit without their explicit ask — so each task ends at `git commit` and does **not** push. The user will instruct when to push.

---

### Task 1: Add the four utility classes to app.css

**Files:**
- Modify: `src/app.css`

- [ ] **Step 1: Read the current app.css to confirm its structure**

Run: `cat src/app.css`
Expected: small file with `@import "tailwindcss"`, `@import '@fontsource-variable/...'` lines, `@theme { … }` block, body styles, and an existing `@layer base { … }` block.

- [ ] **Step 2: Add the `@layer components` block at the end of the file**

Edit `src/app.css`. After the existing `@layer base { … }` block, append:

```css

@layer components {
  .text-label {
    @apply text-[11px] uppercase tracking-wider;
  }
  .text-caption {
    @apply text-[11px] uppercase tracking-wider text-obsidian/50;
  }
  .text-kicker {
    @apply text-[10px] uppercase tracking-wider text-obsidian/50;
  }
  .text-placeholder {
    @apply text-sm text-obsidian/40 italic;
  }
}
```

- [ ] **Step 3: Verify the classes generate by running the build**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run build 2>&1 | tail -5`
Expected: `✓ done` with no errors. The classes will be tree-shaken if unused — that's fine for now.

- [ ] **Step 4: Run the full pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3`
Expected: 0 typecheck errors, lint clean, 180 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app.css
git commit -m "$(cat <<'EOF'
style(ui): add reusable text utility classes to app.css

.text-label / .text-caption / .text-kicker / .text-placeholder
cover the form-label, dim-section-header, eyebrow-kicker, and
italic-empty-state patterns currently duplicated across the app.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create the Field primitive

**Files:**
- Create: `src/lib/ui/primitives/Field.svelte`

- [ ] **Step 1: Write the new component**

Create `src/lib/ui/primitives/Field.svelte` with this content exactly:

```svelte
<!-- src/lib/ui/primitives/Field.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    hint,
    error,
    htmlFor,
    children
  }: {
    label: string;
    hint?: string;
    error?: string | null;
    htmlFor?: string;
    children: Snippet;
  } = $props();
</script>

<label class="flex flex-col gap-1 text-sm" for={htmlFor}>
  <span class="text-label">{label}</span>
  {@render children()}
  {#if hint && !error}
    <span class="text-xs text-obsidian/50">{hint}</span>
  {/if}
  {#if error}
    <span class="text-xs text-ochre">{error}</span>
  {/if}
</label>
```

- [ ] **Step 2: Run typecheck to confirm the component compiles**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -5`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ui/primitives/Field.svelte
git commit -m "$(cat <<'EOF'
feat(ui): add Field primitive for labeled form inputs

Wraps the recurring 'flex flex-col gap-1 text-sm label > .text-label
span + input' pattern used in every dialog form.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create the Card primitive

**Files:**
- Create: `src/lib/ui/primitives/Card.svelte`

- [ ] **Step 1: Write the new component**

Create `src/lib/ui/primitives/Card.svelte` with this content exactly:

```svelte
<!-- src/lib/ui/primitives/Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  type Pad = 'none' | 'sm' | 'md';

  let {
    pad = 'md',
    class: extraClass = '',
    children
  }: {
    pad?: Pad;
    class?: string;
    children: Snippet;
  } = $props();

  const PAD: Record<Pad, string> = { none: '', sm: 'p-2', md: 'p-3' };
</script>

<div class="border border-drafting bg-canvas rounded-sm {PAD[pad]} {extraClass}">
  {@render children()}
</div>
```

- [ ] **Step 2: Run typecheck**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -5`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ui/primitives/Card.svelte
git commit -m "$(cat <<'EOF'
feat(ui): add Card primitive for bordered content containers

Wraps the recurring 'border border-drafting bg-canvas rounded-sm
p-2/p-3' pattern used for non-input bordered sections.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Create the SectionHeading primitive

**Files:**
- Create: `src/lib/ui/primitives/SectionHeading.svelte`

- [ ] **Step 1: Write the new component**

Create `src/lib/ui/primitives/SectionHeading.svelte` with this content exactly:

```svelte
<!-- src/lib/ui/primitives/SectionHeading.svelte -->
<script lang="ts">
  type Size = 'lg' | 'xl' | '2xl';

  let {
    text,
    size = '2xl',
    class: extraClass = ''
  }: { text: string; size?: Size; class?: string } = $props();

  const SIZE: Record<Size, string> = {
    lg: 'font-serif text-lg',
    xl: 'font-serif text-xl',
    '2xl': 'font-serif text-2xl'
  };
</script>

<h2 class="{SIZE[size]} {extraClass}">{text}</h2>
```

- [ ] **Step 2: Run typecheck**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -5`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ui/primitives/SectionHeading.svelte
git commit -m "$(cat <<'EOF'
feat(ui): add SectionHeading primitive for serif headings

Wraps the recurring 'font-serif text-{lg,xl,2xl}' h2 pattern used
on dialog and page headers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Migration tasks

For each migration task below, follow the same pattern:

1. **Read** the target file end-to-end so you understand the surrounding context.
2. **Identify** every occurrence of the patterns this task targets — do not rely on a partial mental model.
3. **Apply** the swaps as described in the task body. Preserve every other attribute (data-testid, aria-label, bind:value, etc.) untouched.
4. **Run** the full pipeline: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`. All must be green.
5. **Commit** the changes in one commit using the message template provided.

### Patterns to recognize

These are the patterns you'll see across files. The "replace with" column shows how to migrate each:

| Pattern in the source | Replace with |
|----------------------|-------------|
| `<label class="flex flex-col gap-1 text-sm"><span class="text-[11px] uppercase tracking-wider">LABEL</span>{input}</label>` | `<Field label="LABEL">{input}</Field>` (import `Field` from `$lib/ui/primitives/Field.svelte`) |
| `class="text-[11px] uppercase tracking-wider"` (bare, on a span/p/div that is a form label) | `class="text-label"` |
| `class="text-[11px] uppercase tracking-wider text-obsidian/50"` | `class="text-caption"` |
| `class="text-[10px] uppercase tracking-wider text-obsidian/50"` | `class="text-kicker"` |
| `class="block text-[10px] uppercase tracking-wider text-obsidian/50"` | `class="block text-kicker"` |
| `class="text-sm text-obsidian/40 italic"` | `class="text-placeholder"` |
| `<h2 class="font-serif text-2xl">TEXT</h2>` | `<SectionHeading text="TEXT" />` (import from `$lib/ui/primitives/SectionHeading.svelte`) |
| `<h2 class="font-serif text-xl">TEXT</h2>` | `<SectionHeading text="TEXT" size="xl" />` |
| `<div class="border border-drafting bg-canvas rounded-sm p-3">…</div>` | `<Card>…</Card>` (import from `$lib/ui/primitives/Card.svelte`) |
| `<div class="border border-drafting bg-canvas rounded-sm p-2">…</div>` | `<Card pad="sm">…</Card>` |

**When NOT to migrate:**

- If a class string has additional utility classes (e.g. `text-[11px] uppercase tracking-wider mt-1 hidden lg:block`), keep the extras and replace only the duplicated chunk: `class="text-label mt-1 hidden lg:block"`.
- If a span has a color override (e.g. `text-ochre`, `text-juniper`, `text-obsidian/40` instead of `/50`), keep it inline — the variant is not the common pattern. Skip migration for that span.
- If the bordered container has additional structural classes (flex, gap, custom padding), do a manual judgment call: if `Card` plus an `extraClass` prop covers it cleanly, migrate; otherwise leave inline.
- Do not migrate the existing per-field error `<p>` elements. They stay where they are.

---

### Task 5: Migrate NewRecipeDialog

**Files:**
- Modify: `src/lib/ui/NewRecipeDialog.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/NewRecipeDialog.svelte`

You'll see four `<label class="flex flex-col gap-1 text-sm">` blocks (Name, Preset, Tags, Description). Each has a `<span class="text-[11px] uppercase tracking-wider">…</span>` child followed by an input/select/textarea.

- [ ] **Step 2: Import Field and migrate**

Add to the script imports:
```ts
import Field from '$lib/ui/primitives/Field.svelte';
```

Swap each `<label class="flex flex-col gap-1 text-sm">…<span class="text-[11px] uppercase tracking-wider">LABEL</span>{input}</label>` block to `<Field label="LABEL">{input}</Field>`. The four labels are: `Name`, `Preset`, `Tags (comma-separated)`, `Description`.

- [ ] **Step 3: Verify the pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: 0 typecheck errors, lint clean, 180 tests pass, all e2e pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/NewRecipeDialog.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use Field primitive in NewRecipeDialog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Migrate ConfirmDeleteDialog

**Files:**
- Modify: `src/lib/ui/ConfirmDeleteDialog.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/ConfirmDeleteDialog.svelte`

You'll see one `<label class="flex flex-col gap-1 text-sm">` containing a `<span class="text-[11px] uppercase tracking-wider">Type to confirm</span>` plus a `TextInput`.

- [ ] **Step 2: Import Field and migrate the single label**

Add to imports:
```ts
import Field from '$lib/ui/primitives/Field.svelte';
```

Swap the typed-confirm block to:
```svelte
<Field label="Type to confirm">
  <TextInput
    bind:element={typedEl}
    bind:value={typedInput}
    class="font-mono"
    data-testid="confirm-delete-input"
  />
</Field>
```

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/ConfirmDeleteDialog.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use Field primitive in ConfirmDeleteDialog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Migrate OutcomeForm

**Files:**
- Modify: `src/lib/ui/OutcomeForm.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/OutcomeForm.svelte`

You'll see two `<label class="flex flex-col gap-1 text-sm">` blocks (Outcome notes, Rating). The Rating one has a `<div class="flex flex-col gap-1 text-sm">` wrapper (not a `<label>`) — it can also become a `Field`.

- [ ] **Step 2: Import Field and migrate both blocks**

Add the import. Swap "Outcome notes" `<label>` to `<Field label="Outcome notes">{textarea}</Field>`. Swap the "Rating" `<div>` block to `<Field label="Rating">{rating}</Field>`. Note: when Field renders a Rating component instead of an input, the underlying `<label>` still works — but if the label-for-input association matters, the engineer can choose to use a `<fieldset>` instead. For our purposes, the `<label>` wrapper around the Rating is fine since Rating's clickable buttons are inside.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/OutcomeForm.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use Field primitive in OutcomeForm

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Migrate EndCookDialog

**Files:**
- Modify: `src/lib/ui/cook/EndCookDialog.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/cook/EndCookDialog.svelte`

You'll find:
- A `<label class="flex flex-col gap-1 text-sm">` for "Notes for this cook" / "Outcome notes" → migrate to `Field`.
- A `<div class="flex flex-col gap-1 text-sm">` for "Rating" → migrate to `Field` (same as OutcomeForm).
- A `<label class="flex flex-col gap-1 text-sm">` for "New batch label" → migrate to `Field`.
- Inside the summary grid, three `<span class="block text-[10px] uppercase tracking-wider text-obsidian/50">…</span>` lines for "Elapsed", "Steps", "Timers" → replace class with `block text-kicker`.
- A `<span class="text-[10px] uppercase tracking-wider text-obsidian/50">Improvement ideas captured…</span>` → replace class with `text-kicker`.
- A `<span class="text-[10px] uppercase tracking-wider">New batch label</span>` (without /50 dimming) inside the New batch label `<label>` — that becomes part of the `Field` label prop and disappears.

- [ ] **Step 2: Import Field and apply the swaps above**

Add `import Field from '$lib/ui/primitives/Field.svelte';` to the script imports.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/cook/EndCookDialog.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use Field primitive and .text-kicker in EndCookDialog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Migrate BatchEditor

**Files:**
- Modify: `src/lib/ui/BatchEditor.svelte`

- [ ] **Step 1: Read the file**

Run: `wc -l src/lib/ui/BatchEditor.svelte` then `cat src/lib/ui/BatchEditor.svelte` to read all of it.

You'll see multiple variable inputs as `<label class="flex flex-col gap-1 text-sm">` blocks for each variable in the schema. Each has a `<span class="text-[11px] uppercase tracking-wider">…</span>` child. These migrate to `<Field label="…">`.

You may also see standalone `<span class="text-[11px] uppercase tracking-wider">…</span>` headers (e.g. "Ingredients", "Steps", "Variables") that don't have an input — those become `<span class="text-label">…</span>`.

- [ ] **Step 2: Import Field and apply swaps**

Add `import Field from '$lib/ui/primitives/Field.svelte';` to imports.

For each `<label class="flex flex-col gap-1 text-sm">` block, convert to `<Field label="…">{contents-without-the-span}</Field>`.

For bare `<span class="text-[11px] uppercase tracking-wider">…</span>` (no parent label), change class to `text-label`.

If you see `<span class="text-[11px] uppercase tracking-wider text-obsidian/50">…</span>`, change class to `text-caption`.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green. BatchEditor is exercised by `edit-batch.e2e.ts` — confirm it still passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/BatchEditor.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use Field + label/caption classes in BatchEditor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Migrate BatchDetail

**Files:**
- Modify: `src/lib/ui/BatchDetail.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/BatchDetail.svelte`

You'll find:
- The batch title `<h2 class="font-serif text-2xl">{batch.label}</h2>` → swap to `<SectionHeading text={batch.label} />`.
- The inconsistency popover container `<span … class="… bg-canvas border border-drafting rounded-sm shadow-md p-3 …">` — the border + bg + rounded chunk overlaps with `Card`, but the element is a `<span role="dialog">` with extra layout classes (`absolute`, `left-0`, etc.). Skip this one — too many overlapping responsibilities to cleanly use `Card`.
- The `<span class="text-[10px] uppercase tracking-wider text-obsidian/50">Note:</span>` inside the popover → swap class to `text-kicker`.
- `<p class="text-[11px] uppercase tracking-wider text-juniper mt-1">Cooked {cookedDateLabel}</p>` — has a color variant (juniper) so it's NOT the common pattern — leave inline.
- Any `<span class="text-[11px] uppercase tracking-wider">…</span>` (no /50 dimming) → swap class to `text-label`.

- [ ] **Step 2: Import SectionHeading and apply swaps**

Add `import SectionHeading from '$lib/ui/primitives/SectionHeading.svelte';` to imports.

Apply the swaps above. Be careful not to touch the juniper-colored variant or the popover container.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green. `ingredient-inconsistency.e2e.ts` and `foundation.e2e.ts` exercise this — confirm they pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/BatchDetail.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use SectionHeading + label classes in BatchDetail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Migrate Toolbar

**Files:**
- Modify: `src/lib/ui/Toolbar.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/Toolbar.svelte`

Look for `text-[10px] uppercase tracking-wider text-obsidian/50` spans (kickers). Look also for any standalone `text-[11px] uppercase tracking-wider` instances.

- [ ] **Step 2: Apply swaps**

Replace `class="text-[10px] uppercase tracking-wider text-obsidian/50"` → `class="text-kicker"`.
Replace `class="text-[11px] uppercase tracking-wider"` → `class="text-label"`.
Replace `class="text-[11px] uppercase tracking-wider text-obsidian/50"` → `class="text-caption"`.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/Toolbar.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use text-label/caption/kicker classes in Toolbar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Migrate VariableDiffTable

**Files:**
- Modify: `src/lib/ui/VariableDiffTable.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/VariableDiffTable.svelte`

Same patterns: `text-[11px] uppercase tracking-wider` → `text-label`; `… text-obsidian/50` → `text-caption`; `text-[10px] … /50` → `text-kicker`.

- [ ] **Step 2: Apply swaps**

Replace as above. Keep any color-variant strings (e.g. `text-ochre`, `text-juniper`) inline.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green. `compare-merge.e2e.ts` exercises this.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/VariableDiffTable.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use text-label/caption/kicker classes in VariableDiffTable

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Migrate MergeVarRow

**Files:**
- Modify: `src/lib/ui/MergeVarRow.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/MergeVarRow.svelte`

Same pattern set as Task 12.

- [ ] **Step 2: Apply swaps**

Same replacements: bare `text-[11px] uppercase tracking-wider` → `text-label`; `/50` variants → `text-caption`; `text-[10px] … /50` → `text-kicker`. Preserve color-variant strings inline.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/MergeVarRow.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use text-label/caption/kicker classes in MergeVarRow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Migrate MergePicker

**Files:**
- Modify: `src/lib/ui/MergePicker.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/MergePicker.svelte`

Same kicker/label/caption patterns. Look also for `text-sm text-obsidian/40 italic` (empty state) — swap to `text-placeholder`.

- [ ] **Step 2: Apply swaps**

Apply the standard text-class swaps. Add `text-sm text-obsidian/40 italic` → `text-placeholder` where applicable.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/MergePicker.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use shared text utility classes in MergePicker

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Migrate CompareView

**Files:**
- Modify: `src/lib/ui/CompareView.svelte`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/ui/CompareView.svelte`

Same kicker/label/caption patterns. Watch for any `text-sm text-obsidian/40 italic` empty-state strings → `text-placeholder`.

If a `<div class="border border-drafting bg-canvas rounded-sm p-3">` exists without other structural classes, convert to `<Card>…</Card>` (import from `$lib/ui/primitives/Card.svelte`).

- [ ] **Step 2: Apply swaps**

Apply the standard text swaps and any Card migration where clean.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green. `compare-merge.e2e.ts` exercises this.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/CompareView.svelte
git commit -m "$(cat <<'EOF'
refactor(ui): use shared text/Card classes in CompareView

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Migrate recipes/[id]/+page.svelte

**Files:**
- Modify: `src/routes/recipes/[id]/+page.svelte`

- [ ] **Step 1: Read the file**

Run: `cat 'src/routes/recipes/[id]/+page.svelte'`

Look for:
- The recipe title `<h2 class="font-serif text-2xl">` (or similar serif heading) → `<SectionHeading text={…} />`.
- Any standalone `text-[11px] uppercase tracking-wider` callouts → swap class.
- Any `text-[10px] uppercase tracking-wider text-obsidian/50` lines → `text-kicker`.

- [ ] **Step 2: Apply swaps**

Import `SectionHeading` if needed. Apply text class swaps. Skip variants with non-/50 colors.

- [ ] **Step 3: Pipeline**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add 'src/routes/recipes/[id]/+page.svelte'
git commit -m "$(cat <<'EOF'
refactor(ui): use shared SectionHeading + text classes on recipe page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Verification sweep

**Files:**
- No edits. This is a final audit.

- [ ] **Step 1: Re-run the duplicate-pattern grep**

Run:
```bash
grep -rohP "class=\"[^\"]+\"" src/lib/ui src/routes 2>/dev/null | sort | uniq -c | sort -rn | awk '$1 >= 3' | head -30
```

Expected: the top entries that were `text-[11px] uppercase tracking-wider` / `text-[10px] uppercase tracking-wider text-obsidian/50` / `flex flex-col gap-1 text-sm` should now be GONE or significantly reduced. The remaining 3+ entries should be either:
- Patterns we intentionally chose not to migrate (variants with extra structural classes, color overrides)
- New legitimate patterns to consider for a future round

- [ ] **Step 2: Confirm visual parity by spot-checking screens**

Open the dev server and click through:
- `/` (recipe list)
- `/recipes/[any-recipe]` (recipe detail with graph + batch view)
- New batch dialog, edit batch view, end-cook dialog
- Compare two batches; merge them
- Delete dialog (typed-confirm and simple)

Each screen should look pixel-identical to before. If anything looks off, identify which migration introduced it and revert that specific commit before continuing.

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run dev` and open `http://localhost:5173/`.

- [ ] **Step 3: Final full pipeline run**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5 && bunx knip 2>&1 | tail -5`
Expected: 0 typecheck errors, lint clean, 180 tests pass, all e2e pass, knip clean.

- [ ] **Step 4: Report completion to the user**

Summarize: total commits added, total class strings deduplicated (estimate from before/after grep counts), any patterns intentionally left inline and why. Ask the user whether to push.
