# Checkbox + RadioGroup Primitives

**Date:** 2026-05-07
**Status:** Draft, pending implementation plan
**Builds on:** `2026-05-06-ui-primitives.md` (the original primitives layer)

## 1. Overview

Add two primitives to `src/lib/ui/primitives/`: `Checkbox.svelte` (bare styled `<input type="checkbox">`) and `RadioGroup.svelte` (items-prop group of labeled radios sharing a generated `name`). Migrate the three existing consumers (`CookStepRow`, `EndCookDialog`, `BatchEditor` status field) to use them.

## 2. Architecture

### `Checkbox.svelte`

Just-the-box approach. Consumers wrap in `<label>` themselves when they want inline text. Bindable `checked: boolean`, plus passthrough for `disabled`, `class`, `onchange`, and `...rest` for `data-testid` / `aria-label` / etc.

```svelte
<!-- src/lib/ui/primitives/Checkbox.svelte -->
<script lang="ts">
  let {
    checked = $bindable(false),
    disabled = false,
    class: extraClass = '',
    onchange,
    ...rest
  }: {
    checked?: boolean;
    disabled?: boolean;
    class?: string;
    onchange?: (e: Event) => void;
    [key: string]: unknown;
  } = $props();

  const DEFAULT_CLASS = 'accent-ochre cursor-pointer disabled:cursor-not-allowed';

  function handleChange(e: Event) {
    checked = (e.currentTarget as HTMLInputElement).checked;
    onchange?.(e);
  }
</script>

<input
  type="checkbox"
  checked={checked}
  {disabled}
  onchange={handleChange}
  class="{DEFAULT_CLASS} {extraClass}"
  {...rest}
/>
```

`accent-ochre` gives the native checkbox a project-palette fill when checked. Consumers override via `class`.

The one-way `checked={checked}` + manual `handleChange` mirrors the TextInput pattern: works equally cleanly whether the consumer uses `bind:checked` or one-way `checked={x} onchange={...}`. CookStepRow uses the latter pattern (the parent owns the truth and the row checkbox is one-way driven by the cook session's step state).

### `RadioGroup.svelte`

Items-prop API. The primitive owns the entire group, generates a unique `name` (overridable), and renders a flex row of labeled radios. Generic `T extends string | number` lets it type-check for string-union (e.g. `BatchStatus`) and numeric groups.

```svelte
<!-- src/lib/ui/primitives/RadioGroup.svelte -->
<script lang="ts" generics="T extends string | number">
  type Option = { value: T; label: string };

  let {
    value = $bindable<T>(),
    options,
    name,
    disabled = false,
    class: extraClass = '',
    ...rest
  }: {
    value: T;
    options: Option[];
    name?: string;
    disabled?: boolean;
    class?: string;
    [key: string]: unknown;
  } = $props();

  const groupName = name ?? `radio-group-${Math.random().toString(36).slice(2)}`;
</script>

<div class="flex gap-4 {extraClass}" {...rest}>
  {#each options as opt}
    <label class="flex items-center gap-2 cursor-pointer text-sm">
      <input
        type="radio"
        name={groupName}
        value={opt.value}
        bind:group={value}
        {disabled}
        class="accent-ochre"
      />
      {opt.label}
    </label>
  {/each}
</div>
```

The generated `groupName` ensures multiple `RadioGroup` instances on the same page don't conflict.

## 3. Migrations

### `EndCookDialog.svelte` — fork-as-draft checkbox

Find:
```svelte
<input type="checkbox" bind:checked={forkAsDraft} data-testid="fork-as-draft-checkbox" />
```
Replace with:
```svelte
<Checkbox bind:checked={forkAsDraft} data-testid="fork-as-draft-checkbox" />
```

Add `import Checkbox from '$lib/ui/primitives/Checkbox.svelte';` to the script block.

### `CookStepRow.svelte` — step-completed checkbox

The existing `<input type="checkbox">` is around line 56. Inspect for any extra props (likely `bind:checked`, `aria-label`, possibly `class`). Replace with `<Checkbox ...>` preserving every prop verbatim.

Add `import Checkbox from '$lib/ui/primitives/Checkbox.svelte';` to the script block.

### `BatchEditor.svelte` — status RadioGroup

Find:
```svelte
<div class="flex gap-4">
  <label class="flex items-center gap-2"><input type="radio" bind:group={status} value="draft" /> Draft</label>
  <label class="flex items-center gap-2"><input type="radio" bind:group={status} value="cooked" /> Cooked</label>
</div>
```
Replace with:
```svelte
<RadioGroup
  bind:value={status}
  options={[
    { value: 'draft', label: 'Draft' },
    { value: 'cooked', label: 'Cooked' }
  ]}
  name="status"
/>
```

Add `import RadioGroup from '$lib/ui/primitives/RadioGroup.svelte';` to the script block.

## 4. Out of scope

- Multi-select checkbox groups (CheckboxGroup). YAGNI — current consumers are all single bool toggles.
- Rich label content for radios (children-snippet API). Deferred until a consumer needs it.
- Checkbox with built-in label prop — rejected by design.
- Switch / toggle visual variant — separate concern.
- Indeterminate checkbox state — no consumer needs it.
- Custom-styled (non-`accent-color`) checkbox/radio rendering — would require fully custom box visuals, big visual scope.

## 5. Testing

- **No new tests.** Existing E2E exercises all three migration sites:
  - `fork-as-draft-checkbox` in the cook flow tests.
  - The step-completed checkbox in `edit-batch.e2e.ts` if applicable, or via the cook view flow.
  - The Draft/Cooked radios via batch editor flows.
- All three suites stay green: `~/.bun/bin/bun x svelte-check --threshold warning` (0/0), `~/.bun/bin/bun run e2e` (6 passed), `~/.bun/bin/bun test` (91 passed).
- **Manual visual check:**
  - `EndCookDialog`: open the dialog, toggle the fork-as-draft checkbox, confirm the ochre accent shows when checked.
  - `CookStepRow`: in cook view, mark a step done; checkbox accent shows.
  - `BatchEditor`: toggle Draft / Cooked; the radio dot is ochre.

## 6. Risks

- **`accent-color` browser variation:** Safari, Chrome, Firefox each render the accent slightly differently. Acceptable for utility purposes.
- **Generic constraint `T extends string | number`:** broader than `string` only. Permissive but not unsafe.
- **`bind:group` through a $bindable prop:** the primitive uses `bind:group={value}` on the inner `<input type="radio">` where `value` is a $bindable parent prop. This is the standard Svelte 5 idiom and works correctly — the bindable prop coordinates with the consumer's `bind:value`.
- **Generated `name` collision:** `Math.random().toString(36).slice(2)` produces ~11 chars of randomness. Collision probability across the rare multi-RadioGroup-per-page scenario is effectively zero.
