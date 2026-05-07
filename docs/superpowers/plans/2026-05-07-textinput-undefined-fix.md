# TextInput Undefined Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Fix `TextInput.svelte` so `bind:value` to expressions that may evaluate to `undefined` works without a workaround. Then revert `UsesEditor.svelte`'s amount-input workaround back to clean `bind:value`.

**Architecture:** Two-file change. Widen `value` prop type to `string | undefined`, switch the inner `<input>` from `bind:value` to one-way `value={value ?? ''}` + manual `oninput` write-back. Then collapse UsesEditor's three-line workaround back to one `bind:value`.

**Tech Stack:** Svelte 5 runes · TypeScript

Reference spec: `docs/superpowers/specs/2026-05-07-textinput-undefined-fix.md`.

---

## File Structure

```
src/lib/ui/primitives/TextInput.svelte    # MODIFIED — undefined-tolerant value handling
src/lib/ui/UsesEditor.svelte              # MODIFIED — revert amount-input workaround
```

---

## Task 1: Make TextInput tolerant of `undefined` bound values

**Files:** Modify `src/lib/ui/primitives/TextInput.svelte`.

- [ ] **Step 1: Replace the entire file content.**

Replace `src/lib/ui/primitives/TextInput.svelte` with this exact content:

```svelte
<!-- src/lib/ui/primitives/TextInput.svelte -->
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

Three concrete differences from the previous version:
1. `value` $bindable now typed `string | undefined` instead of `string`.
2. Inner `<input>` uses `value={value ?? ''}` (one-way render) instead of `bind:value`.
3. New `handleInput` writes back to `value` and forwards to consumer's `oninput` if provided.

- [ ] **Step 2: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

If errors appear (likely a type-narrowing issue at a call site), the fix is at the call site — see Task 2 for the UsesEditor revert which is one such call site that should now type-check more cleanly. Other consumers (`ConfirmDeleteDialog`, `EditVariablesDialog`, `OutcomeForm`, `BatchEditor`, `MergePicker`, `MergeVarRow`, `Toolbar`, `NewRecipeDialog`) all bind to `string` state and so satisfy `string | undefined` trivially — they should not break.

- [ ] **Step 3: Run E2E suite.**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -10`
Expected: 6 passed. The E2E covers TextInput usage across most existing consumers.

- [ ] **Step 4: Run unit suite.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 5 (commit) — SKIP. Controller commits after Task 2.**

---

## Task 2: Revert UsesEditor's amount-input workaround

**Files:** Modify `src/lib/ui/UsesEditor.svelte`.

- [ ] **Step 1: Replace the amount-input block.**

Find this block (the amount TextInput inside the use-row `{#each uses as use, i (i)}` loop):

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

Replace with:

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

The `value=` and `oninput=` lines collapse into one `bind:value`. All other props (`onblur`, `placeholder`, `aria-label`, `class`, `data-testid`) stay identical.

- [ ] **Step 2: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

If a type error surfaces at this `bind:value` site, it's because `amountInputs[i]` is typed `string` but TypeScript narrows array-index access as `string | undefined`. The TextInput now accepts `string | undefined`, so this should be fine. If not, the error is informative — paste it and we'll diagnose.

- [ ] **Step 3: Run E2E suite.**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -10`
Expected: 6 passed. The `edit-batch.e2e.ts` test exercises the amount input directly via the `add-use-btn` + `use-amount.fill('250')` flow.

- [ ] **Step 4: Run unit suite.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 5: Quick dev-server compile check.**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200, no errors in `/tmp/bb-dev.log`.

- [ ] **Step 6 (commit) — SKIP.**

---

## Self-review notes

**Spec coverage:**
- Spec §3 TextInput fix (type widen, one-way render, manual handleInput) → Task 1 Step 1.
- Spec §3 UsesEditor revert (collapse three lines to one `bind:value`) → Task 2 Step 1.
- Spec §4 out of scope (BatchEditor variables, numeric variant, IME, etc.) → respected; no other files touched.
- Spec §5 testing (svelte-check + E2E + unit per task; manual UsesEditor check) → Tasks 1 Steps 2-4 + Task 2 Steps 2-4.
- Spec §6 risks (type widening, ordering, no regression to other consumers) → addressed in Task 1 Step 2 note.

**Placeholder scan:** none. All code blocks are concrete and complete.

**Type consistency:**
- `value?: string | undefined` is the new type — used consistently in both the script-block destructure and the type annotation.
- `handleInput(e: Event)` signature matches Svelte 5's `oninput` event type.
- `data-testid="use-amount"` and `aria-label` preserved verbatim across the revert.

**Risks during implementation:**
- If the implementer's svelte-check on Task 1 finds a consumer that broke due to the type widening, it's almost certainly a consumer that was already passing `bind:value` to a string state — the wider type cannot reject what the narrower type accepted. So if errors appear, they're more likely from a different change (e.g., the implementer typo'd something) than from the type widening itself.
- The order of tasks matters: Task 1 must come first so that Task 2's `bind:value={amountInputs[i]}` works with the new tolerant primitive. Reversing the order would leave UsesEditor temporarily broken.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-07-textinput-undefined-fix.md`. 2 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
