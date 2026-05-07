# TextInput `bind:value` Undefined Fix + UsesEditor Cleanup

**Date:** 2026-05-07
**Status:** Draft, pending implementation plan

## 1. Overview

Fix a silent rendering failure in `src/lib/ui/primitives/TextInput.svelte` where `bind:value` to an expression that evaluates to `undefined` (e.g. an array slot like `amountInputs[i]` before `amountInputs` is populated) doesn't behave correctly. Then revert `src/lib/ui/UsesEditor.svelte`'s amount input from a manual `value + oninput` workaround back to clean `bind:value`.

## 2. The bug

When a consumer writes `<TextInput bind:value={amountInputs[i]} />` and `amountInputs[i]` is `undefined` at first render, the inner `<input bind:value>` silently fails — the input renders blank, but writes back to the parent expression don't always propagate. This was discovered during the UI primitives sweep (Plan B-1 Task 5) and worked around in `UsesEditor` with the awkward pattern:

```svelte
<TextInput
  value={amountInputs[i] ?? ''}
  oninput={(e) => { amountInputs[i] = (e.target as HTMLInputElement).value; }}
  ...
/>
```

This forces consumers to manually replicate `bind:value` semantics whenever the bound expression might be undefined. The primitive should handle it.

## 3. Fix

### TextInput

Loosen the `value` prop type from `string` to `string | undefined`, and bridge through manual one-way render + manual write-back:

```svelte
<script lang="ts">
  let {
    value = $bindable<string | undefined>(''),
    element = $bindable<HTMLInputElement | undefined>(undefined),
    placeholder = '',
    type = 'text',
    inputmode,
    disabled = false,
    class: extraClass = '',
    oninput,
    onblur,
    ...rest
  }: {
    value?: string | undefined;
    element?: HTMLInputElement;
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

  function handleInput(e: Event) {
    value = (e.currentTarget as HTMLInputElement).value;
    oninput?.(e);
  }
</script>

<input
  bind:this={element}
  value={value ?? ''}
  {type}
  {inputmode}
  {placeholder}
  {disabled}
  oninput={handleInput}
  {onblur}
  class="{DEFAULT_CLASS} {extraClass}"
  {...rest}
/>
```

Three concrete changes:

1. Type of `value` widened from `string` to `string | undefined`.
2. Inner `<input>` switches from `bind:value` to `value={value ?? ''}` (one-way render with empty-string fallback for undefined).
3. New `handleInput` updates the bindable `value` and calls the consumer's `oninput` (if any). This preserves `bind:value` semantics (parent expression gets updated) and the existing `oninput` prop.

### UsesEditor revert

In `src/lib/ui/UsesEditor.svelte`, replace the amount-input block:

```svelte
<TextInput
  value={amountInputs[i] ?? ''}
  oninput={(e) => { amountInputs[i] = (e.target as HTMLInputElement).value; }}
  onblur={() => commitAmount(i)}
  placeholder="Amount"
  aria-label="Amount for use {i + 1}"
  class="font-mono"
  data-testid="use-amount"
/>
```

with:

```svelte
<TextInput
  bind:value={amountInputs[i]}
  onblur={() => commitAmount(i)}
  placeholder="Amount"
  aria-label="Amount for use {i + 1}"
  class="font-mono"
  data-testid="use-amount"
/>
```

## 4. Out of scope

- `BatchEditor.svelte`'s variable inputs (`value={String(current ?? '')} + oninput`) — that's a richer type bridge (variables are `number | string | null`, not `string | undefined`). Not the bug being fixed.
- Adding a numeric / typed variant of TextInput — separate concern.
- IME composition handling, controlled vs uncontrolled distinctions, debouncing, etc.
- Other primitives — only `TextInput` has this bug.

## 5. Testing

- **No new tests.** The existing E2E suite already exercises UsesEditor's amount input via the `use-amount` testid in `edit-batch.e2e.ts` (the `add-use-btn` + `use-amount.fill('250')` flow). After the revert, that test still passes — confirming `bind:value` works through the primitive.
- **All three suites stay green:** `~/.bun/bin/bun x svelte-check --threshold warning` (0/0), `~/.bun/bin/bun run e2e` (6 passed), `~/.bun/bin/bun test` (91 passed).
- **Manual check:** open BatchEditor on any batch, click "+ Add step", click "+ Add ingredient use" inside the step. Confirm the amount input renders, accepts input, and the typed value persists when adding more uses or steps.

## 6. Risks

- **Type widening surfaces nothing:** `string | undefined` is broader than the old `string`. Anything that satisfied `string` still satisfies `string | undefined`. svelte-check will catch any consumer that was relying on the narrower type (none expected).
- **Consumer `oninput` ordering:** the consumer's `oninput` now fires *after* the primitive writes back to the bound `value`. This matches Svelte's normal `bind:value` ordering (Svelte 5 writes to the bound expression before consumer event handlers run on the same event), so no consumer should care.
- **No regression to existing consumers** (`ConfirmDeleteDialog`, `EditVariablesDialog`, `OutcomeForm`, `BatchEditor`, `MergePicker`, `MergeVarRow`, `Toolbar`, `NewRecipeDialog`) — they all pass `bind:value={someStringStateField}` where the field is initialized to a string, so the new behavior is identical to the old.
