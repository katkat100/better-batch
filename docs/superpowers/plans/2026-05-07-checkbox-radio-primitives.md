# Checkbox + RadioGroup Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Add `Checkbox.svelte` and `RadioGroup.svelte` primitives at `src/lib/ui/primitives/`, then migrate the three existing consumers (`CookStepRow`, `EndCookDialog`, `BatchEditor`).

**Architecture:** Two new bare-styled primitives that wrap native `<input type="checkbox">` and a flex group of `<input type="radio">` respectively. Both use the one-way render + manual write-back pattern (matching the recent TextInput fix) so they work with `bind:` and one-way `value={x} onchange/onevent={...}` consumer styles. RadioGroup takes an items prop and owns the shared `name` attribute.

**Tech Stack:** Svelte 5 runes · TypeScript · Tailwind v4

Reference spec: `docs/superpowers/specs/2026-05-07-checkbox-radio-primitives.md`.

---

## File Structure

```
src/lib/ui/primitives/
  Checkbox.svelte          # NEW
  RadioGroup.svelte        # NEW

src/lib/ui/cook/
  CookStepRow.svelte       # MODIFIED — use Checkbox
  EndCookDialog.svelte     # MODIFIED — use Checkbox

src/lib/ui/
  BatchEditor.svelte       # MODIFIED — use RadioGroup for status
```

---

## Task 1: Create `Checkbox.svelte` and `RadioGroup.svelte`

**Files:**
- Create: `src/lib/ui/primitives/Checkbox.svelte`
- Create: `src/lib/ui/primitives/RadioGroup.svelte`

Bundled because both are tiny declarative wrappers and consumed together by the migrations in subsequent tasks.

- [ ] **Step 1: Create `src/lib/ui/primitives/Checkbox.svelte` with this exact content:**

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

- [ ] **Step 2: Create `src/lib/ui/primitives/RadioGroup.svelte` with this exact content:**

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
  {#each options as opt (opt.value)}
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

- [ ] **Step 3: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Run unit suite.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 5 (commit) — SKIP. Controller commits after migrations.**

---

## Task 2: Migrate `EndCookDialog` and `CookStepRow` to `Checkbox`

**Files:**
- Modify: `src/lib/ui/cook/EndCookDialog.svelte`
- Modify: `src/lib/ui/cook/CookStepRow.svelte`

Both use a raw `<input type="checkbox">`. Replace each with `<Checkbox>` preserving all attributes.

- [ ] **Step 1: Migrate `EndCookDialog.svelte`.**

Add `import Checkbox from '$lib/ui/primitives/Checkbox.svelte';` to the script block (after the existing imports).

Find the line containing `data-testid="fork-as-draft-checkbox"` (around line 128). The current markup is approximately:

```svelte
<input type="checkbox" bind:checked={forkAsDraft} data-testid="fork-as-draft-checkbox" />
```

Replace with:

```svelte
<Checkbox bind:checked={forkAsDraft} data-testid="fork-as-draft-checkbox" />
```

Preserve any other props on the original (e.g., if there's an `id`, `aria-label`, or `class`, keep them). The minimum required props for the migration are `bind:checked` and `data-testid`.

- [ ] **Step 2: Migrate `CookStepRow.svelte`.**

Add `import Checkbox from '$lib/ui/primitives/Checkbox.svelte';` to the script block (after the existing imports).

The current markup at lines 55-62:

```svelte
    <input
      type="checkbox"
      checked={isChecked}
      onchange={(e) => onCheck(index, (e.currentTarget as HTMLInputElement).checked)}
      aria-label="Mark step {index + 1} done"
      class="mt-1.5"
      data-testid="cook-step-checkbox"
    />
```

Replace with:

```svelte
    <Checkbox
      checked={isChecked}
      onchange={(e) => onCheck(index, (e.currentTarget as HTMLInputElement).checked)}
      aria-label="Mark step {index + 1} done"
      class="mt-1.5"
      data-testid="cook-step-checkbox"
    />
```

This is one-way usage (consumer owns the truth via `isChecked` from the parent). The Checkbox primitive's manual `handleChange` writes back to the local bindable AND forwards to the consumer's `onchange` — the consumer's handler reads `e.currentTarget.checked` which still reflects the actual DOM input state. This works because the inner `<input>` is what gets clicked; the bindable `checked` prop is only used as the rendered attribute.

- [ ] **Step 3: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Run E2E.**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -10`
Expected: 6 passed. The cook flow test exercises both checkboxes (`cook-step-checkbox` via the cook view, `fork-as-draft-checkbox` via end-cook flow if covered).

- [ ] **Step 5: Run unit suite.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 6 (commit) — SKIP.**

---

## Task 3: Migrate `BatchEditor` status field to `RadioGroup`

**Files:** Modify `src/lib/ui/BatchEditor.svelte`.

- [ ] **Step 1: Add the import.**

In the `<script lang="ts">` block of `src/lib/ui/BatchEditor.svelte`, add (alongside the existing primitive imports near `import Button` and `import TextInput`):

```ts
  import RadioGroup from './primitives/RadioGroup.svelte';
```

- [ ] **Step 2: Replace the status fieldset's inner div.**

Find the existing fieldset (around lines 185-191):

```svelte
  <fieldset class="flex flex-col gap-1 text-sm">
    <legend class="text-[11px] uppercase tracking-wider mb-2">Status</legend>
    <div class="flex gap-4">
      <label class="flex items-center gap-2"><input type="radio" bind:group={status} value="draft" /> Draft</label>
      <label class="flex items-center gap-2"><input type="radio" bind:group={status} value="cooked" /> Cooked</label>
    </div>
  </fieldset>
```

Replace the inner `<div>` (lines 187-190) — keep the `<fieldset>` and `<legend>` exactly:

```svelte
  <fieldset class="flex flex-col gap-1 text-sm">
    <legend class="text-[11px] uppercase tracking-wider mb-2">Status</legend>
    <RadioGroup
      bind:value={status}
      options={[
        { value: 'draft', label: 'Draft' },
        { value: 'cooked', label: 'Cooked' }
      ]}
      name="status"
    />
  </fieldset>
```

The `RadioGroup` primitive renders a `<div class="flex gap-4">` internally, matching the original layout. The two `<label class="flex items-center gap-2">...<input>...</label>` children are equivalent to what the primitive renders.

- [ ] **Step 3: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

If a generic-narrowing error appears at the call site (the type of `status` is `BatchStatus = 'draft' | 'cooked' | 'archived'`), add an explicit generic to the call:

```svelte
<RadioGroup<BatchStatus> ... />
```

The current spec doesn't anticipate this being needed since `BatchStatus` extends `string`, but svelte-check may not infer the generic without help. If the implementer hits this, the explicit generic is the fix.

- [ ] **Step 4: Run E2E.**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -10`
Expected: 6 passed.

- [ ] **Step 5: Run unit suite.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 6: Quick dev-server compile check.**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200, no errors in `/tmp/bb-dev.log`.

- [ ] **Step 7 (commit) — SKIP.**

---

## Self-review notes

**Spec coverage:**
- Spec §2 Checkbox API (just-the-box, `accent-ochre`, one-way render + manual write-back) → Task 1 Step 1.
- Spec §2 RadioGroup API (items prop, generic `T extends string | number`, generated name) → Task 1 Step 2.
- Spec §3 EndCookDialog migration → Task 2 Step 1.
- Spec §3 CookStepRow migration → Task 2 Step 2.
- Spec §3 BatchEditor migration → Task 3.
- Spec §4 out of scope (no group, no rich label, no built-in label, no switch, no indeterminate, no fully custom rendering) → respected.
- Spec §5 testing → encoded in every task's verification steps.
- Spec §6 risks (accent-color variation, generic constraint, bind:group via $bindable) → tolerated; documented.

**Placeholder scan:** none. All migration code is concrete.

**Type consistency:**
- `Checkbox` props: `checked: boolean`, `disabled: boolean`, `class: string`, `onchange: (e: Event) => void`. Matches the existing primitives' shape.
- `RadioGroup` `value: T` is the bindable; `options: { value: T; label: string }[]`; `name?: string`. Generic constraint matches spec.
- `data-testid` and `aria-label` preserved verbatim across all three migrations.

**Risks during implementation:**
- The `<RadioGroup<BatchStatus> ... />` syntax uses TypeScript generic call notation, which Svelte 5 supports for components with `generics="T"`. If the implementer hits an inference issue, the explicit-generic syntax is the fix (Task 3 Step 3).
- The `Checkbox` primitive's `bind:checked` and `checked={x} onchange={...}` patterns both work because of the one-way render + write-back pattern. The CookStepRow migration uses the latter (consumer-owns-truth via the parent's `isChecked` prop), which is fine.
- The CookStepRow markup is inside a `<label>` that already wraps a sibling text element. The migration only swaps the `<input>` for `<Checkbox>`, leaving the wrapping `<label>` intact. This preserves the click-target-the-whole-row behavior.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-07-checkbox-radio-primitives.md`. 3 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
