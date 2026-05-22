# Style deduplication: shared primitives + utility classes

**Status:** Design approved 2026-05-21.
**Owner:** Katie.

## Summary

Extract recurring style patterns out of inlined Tailwind class strings
so future visual tweaks can land in one place. Add three new Svelte
primitives for structural patterns (`Field`, `Card`, `SectionHeading`)
and four new Tailwind `@layer components` utility classes for text
patterns (`.text-label`, `.text-caption`, `.text-kicker`,
`.text-placeholder`). Migrate the ~12 files that hand-roll these
patterns to use the new primitives and classes.

## Motivation

A grep of `src/lib/ui` and `src/routes` shows the same class strings
duplicated dozens of times:

- `text-[11px] uppercase tracking-wider` (form labels) — 13 uses
- `text-[11px] uppercase tracking-wider text-obsidian/50` (dim section
  header) — 9 uses
- `text-[10px] uppercase tracking-wider text-obsidian/50` (smaller
  kicker) — 10 uses
- `flex flex-col gap-1 text-sm` (the standard label-wrapping `<label>`
  used in every dialog form) — 15 uses
- `text-sm text-obsidian/40 italic` (empty-state placeholder text) — 5
  uses
- `font-serif text-2xl` (page/section heading) — 4 uses

Every change to label sizing, color, or spacing currently means a
cross-file search-and-replace, with the risk of missing variants. The
existing primitives (`Button`, `Dialog`, `TextInput`, `Select`,
`Checkbox`, `RadioGroup`) cover their patterns well — they should stay
unchanged.

## Behavior

No visual or behavioral changes are intended. This is a pure source
reorganization. After the migration, every form label, card, section
heading, etc. renders pixel-identical to before.

## Architecture

### New Svelte primitives

These wrap *structural* patterns — a label plus the wrapping
container, a bordered card, a heading element — where you want both
the wrapper and the inner text styled consistently.

#### `src/lib/ui/primitives/Field.svelte`

```svelte
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

Replaces the recurring pattern:

```svelte
<label class="flex flex-col gap-1 text-sm">
  <span class="text-[11px] uppercase tracking-wider">Name</span>
  <TextInput bind:value={name} />
</label>
```

Notes:

- The `htmlFor` prop is optional; if the consumer's input has an `id`,
  passing it here gives proper label-for-input association. Most
  current dialogs use implicit nesting (input inside the label) so the
  attr is not strictly needed.
- The optional `hint` and `error` props are a forward-looking
  addition. The migration does **not** move existing per-field error
  `<p>` elements into the Field component — those stay where they are.
  Future forms can opt into the consolidated layout; the existing ones
  are out of scope for this refactor.

#### `src/lib/ui/primitives/Card.svelte`

```svelte
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

Replaces standalone bordered sections like the merge-conflict cards,
the inconsistency popover container, the variable summary block, etc.

#### `src/lib/ui/primitives/SectionHeading.svelte`

```svelte
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

Replaces the 4 uses of `<h2 class="font-serif text-2xl">` (and the
several `text-xl` variants).

### New Tailwind component classes

These go in `src/app.css` inside a `@layer components` block:

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

The naming is semantic, not visual: `.text-label` is for the textual
label of a form field; `.text-caption` is a small dim caption above a
group; `.text-kicker` is an even smaller eyebrow line; `.text-placeholder`
is the italic "(no notes yet)"–style empty-state text.

Tailwind 4's component layer means consumers can still pass override
utilities (e.g. `class="text-caption mb-2"`) and the cascade respects
declaration order.

## Files touched

**Added:**

- `src/lib/ui/primitives/Field.svelte`
- `src/lib/ui/primitives/Card.svelte`
- `src/lib/ui/primitives/SectionHeading.svelte`

**Modified — primitive layer:**

- `src/app.css` — add the `@layer components` block with the four new
  text utility classes.

**Modified — consumer migrations** (file → patterns to replace):

- `src/lib/ui/BatchDetail.svelte` — `text-[11px] uppercase tracking-wider`
  variants → `.text-label` / `.text-caption`; the `font-serif text-2xl`
  heading → `SectionHeading`; the inconsistency popover container →
  `Card`.
- `src/lib/ui/BatchEditor.svelte` — multiple `text-[11px]` label spans
  inside hand-rolled `<label>` wrappers → `Field`.
- `src/lib/ui/OutcomeForm.svelte` — same `Field` migration.
- `src/lib/ui/Toolbar.svelte` — `text-[10px]` kickers → `.text-kicker`.
- `src/lib/ui/VariableDiffTable.svelte` — `text-[11px]` headers →
  `.text-label` or `.text-caption` as appropriate.
- `src/lib/ui/MergeVarRow.svelte` — same.
- `src/lib/ui/ConfirmDeleteDialog.svelte` — `Field` for the "type to
  confirm" input.
- `src/lib/ui/CompareView.svelte` — `text-[10px]` kickers + section
  cards → `.text-kicker` and `Card`.
- `src/lib/ui/NewRecipeDialog.svelte` — every `<label class="flex
  flex-col gap-1 text-sm">` → `Field`.
- `src/lib/ui/MergePicker.svelte` — `text-[10px]` kickers →
  `.text-kicker`.
- `src/lib/ui/cook/EndCookDialog.svelte` — `Field`s for the notes +
  rating + label inputs.
- `src/routes/recipes/[id]/+page.svelte` — page heading +
  `text-[11px]` callouts.

**Not modified:** all other files. Anything with a one-off class
string stays inline. The existing primitives (Button, Dialog,
TextInput, Select, Checkbox, RadioGroup) are unchanged.

## Out of scope

- Visual design changes. The migration is byte-for-byte equivalent.
- Retiring or merging existing primitives.
- Patterns used fewer than 3 times.
- Animation/motion utility classes.
- Color-system overhaul. The semantic color names (`canvas`, `ochre`,
  `obsidian`, `juniper`, `drafting`) stay as-is in `app.css`.

## Testing

This is a pure source-reorganization. No new unit tests. Validation
comes from:

- **Typecheck + lint:** changes touch many files; svelte-check and
  eslint will catch typos in class names or missing imports.
- **Existing e2e suite:** 10 tests cover the dialogs, editor, cook
  view, and inconsistency UI. If a migration accidentally breaks
  layout (e.g., a missing wrapper), the tests still pass — but spot
  checks of the most-touched screens (`/recipes/[id]`, batch editor,
  cook view, end-cook dialog) will catch visual regressions.
- **Per-task screenshots:** after each batch of file migrations, a
  quick local browser check of the affected screen confirms parity.

## Open questions

None at design approval time.
