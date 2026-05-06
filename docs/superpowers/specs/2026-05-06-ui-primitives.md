# UI Primitives — Button, TextInput, Select, Dialog

**Date:** 2026-05-06
**Status:** Draft, pending implementation plan

## 1. Overview

Extract four primitive components — `Button`, `TextInput`, `Select`, `Dialog` — to kill the duplication of Tailwind class strings and dialog a11y boilerplate that has accumulated across the codebase. This spec covers **Plan A**: ship the primitives and migrate the five existing dialogs. **Plan B** (sweep remaining hand-rolled buttons/inputs in non-dialog components) is deferred to a separate spec.

## 2. Architecture

A thin primitives layer at `src/lib/ui/primitives/`. Each primitive is a single Svelte 5 component. Variants are class-based: a `variant`/`size` prop maps to a Tailwind class string. Consumers can pass a `class` prop which is appended last so it wins via source order.

No external libraries — no `clsx`, no `tailwind-merge`. The variant maps are small and append-last is sufficient at this scale.

## 3. Files

```
src/lib/ui/primitives/
  Button.svelte
  TextInput.svelte
  Select.svelte
  Dialog.svelte
```

## 4. `Button.svelte`

### Props
- `variant: 'primary' | 'outline' | 'ghost' | 'dashed' | 'danger' | 'success'` — default `'primary'`
- `size: 'sm' | 'md'` — default `'md'`
- `type: 'button' | 'submit'` — default `'button'`
- `disabled?: boolean`
- `class?: string` — appended last
- `onclick?: (e: MouseEvent) => void`
- `children` snippet

### Variant class strings

Concrete classes drawn from existing usage so the visual result matches today.

- `primary`: `border border-ochre bg-ochre text-canvas hover:bg-ochre/90`
- `danger`: same as `primary` for now (tagged separately so it can diverge later)
- `outline`: `border border-ochre text-ochre hover:bg-ochre hover:text-canvas`
- `ghost`: `text-obsidian/60 hover:text-obsidian` (no border, no background)
- `dashed`: `border border-dashed border-drafting text-obsidian/60 hover:border-ochre hover:text-ochre`
- `success`: `border border-juniper text-juniper hover:bg-juniper hover:text-canvas` (used for "save outcome / mark cooked / save edited note" — found in `OutcomeForm`, `EndCookDialog`, `CookQuickNoteFab`)

### Size class strings
- `md`: `px-4 py-2 text-sm uppercase tracking-wider rounded-sm`
- `sm`: `px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm`

### Common
- All buttons get: `disabled:opacity-50 disabled:cursor-not-allowed`.
- `ghost` does *not* get `rounded-sm` because it has no border/background — that's fine, the size string still applies it but it has no visible effect.

## 5. `TextInput.svelte`

### Props
- `value` ($bindable string)
- `placeholder?: string`
- `type?: string` — default `'text'`
- `inputmode?: string`
- `disabled?: boolean`
- `class?: string`
- `oninput?: (e: Event) => void`
- `onblur?: (e: FocusEvent) => void`

Default class: `border border-drafting bg-canvas px-3 py-2 rounded-sm text-sm`.

## 6. `Select.svelte`

### Props
- `value` ($bindable)
- `disabled?: boolean`
- `class?: string`
- `children` snippet — consumer renders `<option>` elements

Default class: same as `TextInput`. Native `<select>` only — no custom dropdown UI.

## 7. `Dialog.svelte`

The shell that owns the a11y boilerplate.

### Props
- `open` ($bindable boolean)
- `title: string` — rendered as `<h2>` in the dialog header
- `subtitle?: string` — optional `<p>` under the title
- `class?: string` — applied to the inner card (so consumers can set `max-w-md` vs `max-w-2xl`)
- `onClose?: () => void` — called when the dialog closes (Escape, backdrop click, or programmatic `open = false`)
- `children` snippet — body + footer (consumer composes the form/buttons inside)

### Behavior
- Fixed backdrop with `bg-obsidian/40 z-50`.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the auto-generated `<h2>` id.
- `tabindex="-1"` on the wrapper.
- Escape closes via `<svelte:window onkeydown=...>`.
- Backdrop click closes only when `e.target === e.currentTarget`.
- Default inner card class: `bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm max-h-[90vh] overflow-auto`. Consumer `class` is appended last (e.g., to override `max-w-md` to `max-w-2xl`).
- Dialog does **not** wrap content in a `<form>`. Consumers that need form submit semantics wrap their content themselves (matches existing pattern in `ConfirmDeleteDialog`, `EditVariablesDialog`).
- Initial focus is **not** managed by the dialog. Consumers that need to focus an inner element use `$effect(() => { if (open) myEl?.focus(); })` (current pattern).

## 8. Phased migration

### Plan A (this work)

After the four primitives ship, migrate the five existing dialogs:
- `ConfirmDeleteDialog.svelte`
- `EditVariablesDialog.svelte`
- `OutcomeForm.svelte`
- `EndCookDialog.svelte`
- `CookQuickNoteFab.svelte` (the dialog portion — the FAB button itself also becomes a `Button`)

Each dialog migration:
1. Replace the hand-rolled backdrop + form wrapper with `<Dialog open={...} title="..." onClose={...}>`.
2. Replace inner buttons (Cancel, Submit, etc.) with `<Button variant="..." size="...">`.
3. Replace text inputs and selects with `<TextInput>` / `<Select>` where they appear.
4. Preserve every existing `data-testid` exactly so the E2E suite passes unchanged.

### Plan B (deferred)

Sweep remaining hand-rolled buttons/inputs across non-dialog components: `BatchEditor` row inputs, recipe header buttons, `BatchDetail` overflow menu items, cook view chrome, etc. Tracked separately.

## 9. Testing

- **No unit tests for the primitives themselves.** They're declarative class strings + prop forwarding; behavior is verified end-to-end.
- **Existing test suites must continue to pass unchanged after migration.** All `data-testid` attributes on consumer markup stay put. Run after migration:
  - `~/.bun/bin/bun test` — expect 91 pass.
  - `~/.bun/bin/bun run e2e` — expect 6 pass.
  - `~/.bun/bin/bun x svelte-check --threshold warning` — expect `0 ERRORS 0 WARNINGS`.
- **Manual visual check** of each migrated dialog after migration: open it in the browser, confirm it looks the same as before (focus on button colors, hover states, dialog spacing, Escape/backdrop close).

## 10. Out of scope

- Plan B (non-dialog button/input migration).
- `Textarea`, `IconButton`, `Checkbox`, or any other primitive not listed.
- Focus trap inside dialogs (current dialogs don't trap focus; primitives shouldn't add behavior that doesn't exist today).
- Animation / transitions on dialog open/close.
- Theme tokens or CSS-variable-driven variants — variants stay literal Tailwind strings.
- `tailwind-merge` or `clsx` — the appended-last pattern is the contract.

## 11. Risks

- **Class-override edge cases:** if a consumer needs to *remove* a default class (e.g., drop `rounded-sm`), append-last won't help. Acceptable risk — it's rare; that consumer can skip the primitive or we add `tailwind-merge` later.
- **Visual regression during dialog migration:** five dialogs change at once. Mitigation: migrate one dialog per task (one commit each), run E2E after each, eyeball each in the browser before committing.
- **`ghost` variant has no border-radius effect:** documented above (size string adds `rounded-sm` but it's invisible without border/background). Not a bug, just a no-op.
