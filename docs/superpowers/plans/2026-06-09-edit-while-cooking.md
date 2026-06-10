# Edit-while-cooking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user edit a batch's content (label, variables, ingredients, steps) while cooking it, without losing cook state; edits auto-save to the device and, at End Cook, become a new forked draft while the original batch is recorded as cooked.

**Architecture:** `CookView` holds a **working copy** of the batch content; all cook rendering reads it. An **edit-mode toggle** swaps the checklist for an editable panel built from editor components **extracted from `BatchEditor`** (one source of truth). Structural step edits remap `checkedSteps`/timers so progress follows its step. The working copy + cook progress auto-save to `localStorage` and restore on return. At End Cook the original gets its outcome patch; if the working copy changed, a forked draft is created from it.

**Tech Stack:** SvelteKit 2 (adapter-static, `ssr=false`), Svelte 5 runes/snippets, Tailwind v4, Capacitor (Android), `idb` for the recipe/batch store, `localStorage` for ephemeral cook sessions, Bun + `bun:test` for unit tests, Playwright for e2e.

**Spec:** [`2026-06-09-edit-while-cooking-design.md`](../specs/2026-06-09-edit-while-cooking-design.md)

---

## Notes for implementers

- The `bun` binary lives at `~/.bun/bin`. Run `export PATH="$HOME/.bun/bin:$PATH"` at the start of each shell session (or prepend it to commands).
- Per-task validation gate: `bun run typecheck && bun run lint && bun test`. Lefthook's pre-commit hook runs typecheck / lint (staged) / knip / test automatically; **e2e is NOT in the hook** — run it manually where a task says so (`bun run e2e <spec>`).
- knip treats `tests/**/*.test.ts` and `tests/e2e/**/*.e2e.ts` as entry points, so a function used only by its test is not flagged unused. New `.svelte` components must be imported by app code (each task wires its component into a parent in the same commit).
- The user prefers we never push or commit without their explicit ask — each task **ends at `git commit` and does not push**. If a pre-commit hook fails, fix it and make a **new** commit (do not amend).
- Svelte 5: `$state`, `$derived`, `$derived.by`, `$effect`, `$props`, `$bindable`. Use `bind:` for two-way props. Reactive sets/maps come from `svelte/reactivity` (`SvelteSet`, `SvelteMap`).
- Style tokens already in the codebase: `text-label`, `text-kicker`, `text-placeholder`, colors `ochre` / `obsidian` / `canvas` / `drafting` / `juniper`. Reuse them; don't invent new ones.

---

## File structure

**New (pure TS — fully unit-tested):**
- `src/lib/ui/layout/batch-content.ts` — `cleanBatchContent`, `nextVariables`, `evalVariableExpression`, `isContentDirty`, `summarizeEdits`. Shared by `BatchEditor`, `CookEditPanel`, and the End-Cook fork.
- `src/lib/ui/cook/layout/remap-cook-state.ts` — pure index remapping for `checkedSteps`/timers under remove/move.
- `src/lib/ui/cook/cook-session.ts` — `localStorage` save/load/clear of a cook session.

**New (Svelte components):**
- `src/lib/ui/IngredientEditor.svelte` — ingredients fieldset extracted from `BatchEditor`.
- `src/lib/ui/StepEditor.svelte` — steps fieldset extracted from `BatchEditor`.
- `src/lib/ui/cook/CookEditPanel.svelte` — cook edit-mode panel (label + variables + the two editors).

**Modified:**
- `src/lib/ui/BatchEditor.svelte` — consume the two editors + shared helpers (behavior-preserving).
- `src/lib/ui/cook/CookView.svelte` — working copy, edit toggle, structural handlers, session autosave/restore, End-Cook fork.
- `src/lib/ui/cook/CookTopBar.svelte` — edit toggle + edited indicator.
- `src/lib/ui/cook/EndCookDialog.svelte` — dirty-aware "new version" panel.

**New tests:**
- `tests/ui/batch-content.test.ts`, `tests/ui/cook/remap-cook-state.test.ts`, `tests/ui/cook/cook-session.test.ts`, `tests/e2e/cook-edit.e2e.ts`.

---

## Task 1: Shared batch-content helpers

**Files:**
- Create: `src/lib/ui/layout/batch-content.ts`
- Test: `tests/ui/batch-content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ui/batch-content.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import {
  cleanBatchContent,
  nextVariables,
  evalVariableExpression,
  isContentDirty,
  summarizeEdits
} from '../../src/lib/ui/layout/batch-content';
import type { Ingredient, Step } from '../../src/lib/data/types';

const ing = (id: string, name: string, amount = '0', unit = '', section?: string): Ingredient =>
  ({ id, name, amount, unit, ...(section ? { section } : {}) });
const step = (text: string, uses: { ingredientId: string; amount: number }[] = []): Step => ({ text, uses });

describe('cleanBatchContent', () => {
  it('drops empty-name ingredients, trims steps, drops empty steps, drops invalid uses', () => {
    const out = cleanBatchContent({
      ingredients: [ing('flour', 'flour', '500', 'g'), ing('', '', '', '')],
      steps: [
        step('  Mix  ', [{ ingredientId: 'flour', amount: 500 }, { ingredientId: 'ghost', amount: 1 }]),
        step('   ')
      ]
    });
    expect(out.ingredients).toEqual([ing('flour', 'flour', '500', 'g')]);
    expect(out.steps).toEqual([step('Mix', [{ ingredientId: 'flour', amount: 500 }])]);
  });
});

describe('nextVariables', () => {
  it('empty string clears to null', () => {
    expect(nextVariables({ hydration: 70 }, 'hydration', '', 'number')).toEqual({ hydration: null });
  });
  it('number type parses, keeps raw string when not finite', () => {
    expect(nextVariables({}, 'hydration', '72', 'number')).toEqual({ hydration: 72 });
    expect(nextVariables({}, 'hydration', 'abc', 'number')).toEqual({ hydration: 'abc' });
  });
  it('text type keeps the raw string', () => {
    expect(nextVariables({}, 'note', 'soft', 'text')).toEqual({ note: 'soft' });
  });
});

describe('evalVariableExpression', () => {
  it('evaluates arithmetic and returns null on garbage', () => {
    expect(evalVariableExpression('397 + 100')).toBe(497);
    expect(evalVariableExpression('not a number')).toBeNull();
  });
});

describe('isContentDirty', () => {
  const base = {
    label: 'v1',
    variables: { hydration: 70 },
    ingredients: [ing('flour', 'flour', '500', 'g')],
    steps: [step('Mix', [{ ingredientId: 'flour', amount: 500 }])]
  };
  it('is false for identical content', () => {
    expect(isContentDirty(structuredClone(base), base)).toBe(false);
  });
  it('ignores a trailing blank ingredient row', () => {
    const draft = structuredClone(base);
    draft.ingredients.push(ing('', '', '', ''));
    expect(isContentDirty(draft, base)).toBe(false);
  });
  it('is true on label, variable, ingredient amount, or added step', () => {
    expect(isContentDirty({ ...structuredClone(base), label: 'v2' }, base)).toBe(true);
    expect(isContentDirty({ ...structuredClone(base), variables: { hydration: 72 } }, base)).toBe(true);
    const dAmt = structuredClone(base); dAmt.ingredients[0].amount = '550';
    expect(isContentDirty(dAmt, base)).toBe(true);
    const dStep = structuredClone(base); dStep.steps.push(step('Bake'));
    expect(isContentDirty(dStep, base)).toBe(true);
  });
});

describe('summarizeEdits', () => {
  const base = {
    label: 'v1', variables: {},
    ingredients: [ing('flour', 'flour', '500', 'g')],
    steps: [step('Mix'), step('Rest')]
  };
  it('reports no changes', () => {
    expect(summarizeEdits(base, structuredClone(base))).toBe('No changes');
  });
  it('counts changed steps and added ingredients', () => {
    const draft = structuredClone(base);
    draft.steps[0].text = 'Mix well';
    draft.ingredients.push(ing('water', 'water', '350', 'g'));
    expect(summarizeEdits(base, draft)).toBe('1 step changed · 1 ingredient added');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test tests/ui/batch-content.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/ui/layout/batch-content'`.

- [ ] **Step 3: Implement the module**

Create `src/lib/ui/layout/batch-content.ts`:

```ts
import type { Ingredient, Step, VariableValue } from '$lib/server';
import { parseAmount } from './amount-parse';
import { ingredientDiff, stepObjectDiff } from '$lib/data/diff';

export interface BatchContent {
  ingredients: Ingredient[];
  steps: Step[];
}

export interface DirtyComparable {
  label: string;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
}

/** Mirror of BatchEditor's save-time cleaning: drop empty-name ingredients,
 *  trim step text, drop empty steps, and keep only uses whose ingredient survives. */
export function cleanBatchContent(content: BatchContent): BatchContent {
  const ingredients = content.ingredients.filter((i) => i.name.trim());
  const validIds = new Set(ingredients.map((i) => i.id));
  const steps: Step[] = content.steps
    .filter((s) => s.text.trim())
    .map((s) => ({
      text: s.text.trim(),
      uses: s.uses.filter((u) => validIds.has(u.ingredientId))
    }));
  return { ingredients, steps };
}

/** Pure form of BatchEditor.setVariable — returns the next variables record. */
export function nextVariables(
  variables: Record<string, VariableValue>,
  name: string,
  raw: string,
  type: 'number' | 'text'
): Record<string, VariableValue> {
  if (raw === '') return { ...variables, [name]: null };
  if (type === 'number') {
    const n = parseFloat(raw);
    return { ...variables, [name]: Number.isFinite(n) ? n : raw };
  }
  return { ...variables, [name]: raw };
}

/** Evaluate an arithmetic/fraction expression for a numeric field; null if not parseable. */
export function evalVariableExpression(raw: string): number | null {
  return parseAmount(raw);
}

function variablesEqual(a: Record<string, VariableValue>, b: Record<string, VariableValue>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = a[k] ?? null;
    const bv = b[k] ?? null;
    if (av !== bv) return false;
  }
  return true;
}

function ingredientsEqual(a: Ingredient[], b: Ingredient[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.id !== y.id || x.name !== y.name || x.amount !== y.amount || x.unit !== y.unit) return false;
    if ((x.section ?? '') !== (y.section ?? '')) return false;
  }
  return true;
}

function stepsEqual(a: Step[], b: Step[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].text !== b[i].text) return false;
    const au = a[i].uses, bu = b[i].uses;
    if (au.length !== bu.length) return false;
    for (let j = 0; j < au.length; j++) {
      if (au[j].ingredientId !== bu[j].ingredientId || au[j].amount !== bu[j].amount) return false;
    }
  }
  return true;
}

/** True when the working copy differs meaningfully from the original (after cleaning). */
export function isContentDirty(draft: DirtyComparable, original: DirtyComparable): boolean {
  if (draft.label.trim() !== original.label.trim()) return true;
  if (!variablesEqual(draft.variables, original.variables)) return true;
  const a = cleanBatchContent(draft);
  const b = cleanBatchContent(original);
  if (!ingredientsEqual(a.ingredients, b.ingredients)) return true;
  if (!stepsEqual(a.steps, b.steps)) return true;
  return false;
}

/** A short human summary of edits, e.g. "1 step changed · 1 ingredient added". */
export function summarizeEdits(original: BatchContent, draft: BatchContent): string {
  const a = cleanBatchContent(original);
  const b = cleanBatchContent(draft);
  const ing = ingredientDiff(a.ingredients, b.ingredients);
  const stp = stepObjectDiff(a.steps, b.steps);
  const count = (rows: { op: string }[], op: string) => rows.filter((r) => r.op === op).length;
  const pl = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const parts: string[] = [];
  const sMod = count(stp, 'mod'), sAdd = count(stp, 'add'), sRem = count(stp, 'rem');
  const iMod = count(ing, 'mod'), iAdd = count(ing, 'add'), iRem = count(ing, 'rem');
  if (sMod) parts.push(`${pl(sMod, 'step')} changed`);
  if (sAdd) parts.push(`${pl(sAdd, 'step')} added`);
  if (sRem) parts.push(`${pl(sRem, 'step')} removed`);
  if (iMod) parts.push(`${pl(iMod, 'ingredient')} changed`);
  if (iAdd) parts.push(`${pl(iAdd, 'ingredient')} added`);
  if (iRem) parts.push(`${pl(iRem, 'ingredient')} removed`);
  return parts.join(' · ') || 'No changes';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test tests/ui/batch-content.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Run the full gate and commit**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck && bun run lint && bun test`
Expected: 0 type errors, no lint errors, all tests pass.

```bash
git add src/lib/ui/layout/batch-content.ts tests/ui/batch-content.test.ts
git commit -m "feat(cook): add shared batch-content helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Cook-state remap helpers

**Files:**
- Create: `src/lib/ui/cook/layout/remap-cook-state.ts`
- Test: `tests/ui/cook/remap-cook-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ui/cook/remap-cook-state.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import {
  mapIndexThroughRemove,
  mapIndexThroughMove,
  checkedAfterRemove,
  checkedAfterMove
} from '../../../src/lib/ui/cook/layout/remap-cook-state';
import { moveItem } from '../../../src/lib/shared/array';

describe('mapIndexThroughRemove', () => {
  it('drops the removed index, shifts higher indices down', () => {
    expect(mapIndexThroughRemove(2, 2)).toBeNull();
    expect(mapIndexThroughRemove(3, 2)).toBe(2);
    expect(mapIndexThroughRemove(1, 2)).toBe(1);
    expect(mapIndexThroughRemove(-1, 2)).toBe(-1); // manual timer
  });
});

describe('mapIndexThroughMove', () => {
  // Verify against moveItem: element originally at index x ends up at mapIndexThroughMove(x,...).
  const verify = (from: number, to: number) => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    const moved = moveItem(arr, from, to);
    for (let x = 0; x < arr.length; x++) {
      expect(moved[mapIndexThroughMove(x, from, to)]).toBe(arr[x]);
    }
  };
  it('matches moveItem for forward and backward moves', () => {
    verify(1, 3);
    verify(3, 1);
    verify(0, 4);
  });
  it('leaves manual timer index (-1) untouched', () => {
    expect(mapIndexThroughMove(-1, 1, 3)).toBe(-1);
  });
});

describe('checkedAfterRemove / checkedAfterMove', () => {
  it('remaps a checked set through a remove', () => {
    expect([...checkedAfterRemove(new Set([0, 2, 3]), 2)].sort()).toEqual([0, 2]);
  });
  it('remaps a checked set through a move', () => {
    expect([...checkedAfterMove(new Set([1, 3]), 1, 3)].sort()).toEqual([2, 3]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test tests/ui/cook/remap-cook-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/ui/cook/layout/remap-cook-state.ts`:

```ts
/** New index of an item after the item at `removed` is deleted. null if it was the removed item. */
export function mapIndexThroughRemove(index: number, removed: number): number | null {
  if (index === removed) return null;
  return index > removed ? index - 1 : index;
}

/** New index of an item after moveItem(arr, from, to). Mirrors the splice permutation. */
export function mapIndexThroughMove(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < to) return index > from && index <= to ? index - 1 : index;
  return index >= to && index < from ? index + 1 : index;
}

export function checkedAfterRemove(checked: Set<number>, removed: number): Set<number> {
  const next = new Set<number>();
  for (const i of checked) {
    const m = mapIndexThroughRemove(i, removed);
    if (m !== null) next.add(m);
  }
  return next;
}

export function checkedAfterMove(checked: Set<number>, from: number, to: number): Set<number> {
  const next = new Set<number>();
  for (const i of checked) next.add(mapIndexThroughMove(i, from, to));
  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test tests/ui/cook/remap-cook-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate and commit**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck && bun run lint && bun test`
Expected: all green.

```bash
git add src/lib/ui/cook/layout/remap-cook-state.ts tests/ui/cook/remap-cook-state.test.ts
git commit -m "feat(cook): add cook-state remap helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Cook-session persistence

**Files:**
- Create: `src/lib/ui/cook/cook-session.ts`
- Test: `tests/ui/cook/cook-session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ui/cook/cook-session.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { saveSession, loadSession, clearSession, type CookSessionV1 } from '../../../src/lib/ui/cook/cook-session';

function fakeStore(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  } as Storage;
}

const session: CookSessionV1 = {
  v: 1, recipeId: 'sourdough', batchId: 'v3',
  draft: { label: 'v3', variables: { hydration: 72 }, ingredients: [], steps: [{ text: 'Mix', uses: [] }] },
  started: true, startedAt: 1000, checkedSteps: [0], quickNotes: ['more salt'], multiplier: 2,
  timers: [{ id: 't1', stepIndex: 0, label: 'rest', durationMs: 1000, startedAt: 1000, pausedAt: null, pausedAccumMs: 0, finished: false }]
};

describe('cook-session', () => {
  it('round-trips a session', () => {
    const store = fakeStore();
    saveSession(session, store);
    expect(loadSession('sourdough', 'v3', store)).toEqual(session);
  });
  it('returns null when no session exists', () => {
    expect(loadSession('sourdough', 'v3', fakeStore())).toBeNull();
  });
  it('returns null on recipe/batch mismatch', () => {
    const store = fakeStore();
    saveSession(session, store);
    expect(loadSession('other', 'v3', store)).toBeNull();
  });
  it('returns null on corrupt JSON', () => {
    const store = fakeStore();
    store.setItem('bb:cook:v1:sourdough:v3', '{not json');
    expect(loadSession('sourdough', 'v3', store)).toBeNull();
  });
  it('clears a session', () => {
    const store = fakeStore();
    saveSession(session, store);
    clearSession('sourdough', 'v3', store);
    expect(loadSession('sourdough', 'v3', store)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test tests/ui/cook/cook-session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/ui/cook/cook-session.ts`:

```ts
import type { Ingredient, Step, VariableValue } from '$lib/server';
import type { DockTimer } from './CookTimerDock.svelte';

export interface CookSessionV1 {
  v: 1;
  recipeId: string;
  batchId: string;
  draft: {
    label: string;
    variables: Record<string, VariableValue>;
    ingredients: Ingredient[];
    steps: Step[];
  };
  started: boolean;
  startedAt: number | null;
  checkedSteps: number[];
  quickNotes: string[];
  multiplier: number;
  timers: DockTimer[];
}

function sessionKey(recipeId: string, batchId: string): string {
  return `bb:cook:v1:${recipeId}:${batchId}`;
}

export function saveSession(session: CookSessionV1, store: Storage = globalThis.localStorage): void {
  try {
    store.setItem(sessionKey(session.recipeId, session.batchId), JSON.stringify(session));
  } catch {
    // Best-effort: quota exceeded or storage unavailable. Cook continues in memory.
  }
}

export function loadSession(
  recipeId: string,
  batchId: string,
  store: Storage = globalThis.localStorage
): CookSessionV1 | null {
  let raw: string | null = null;
  try {
    raw = store.getItem(sessionKey(recipeId, batchId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CookSessionV1;
    if (parsed?.v !== 1 || parsed.recipeId !== recipeId || parsed.batchId !== batchId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(
  recipeId: string,
  batchId: string,
  store: Storage = globalThis.localStorage
): void {
  try {
    store.removeItem(sessionKey(recipeId, batchId));
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test tests/ui/cook/cook-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate and commit**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck && bun run lint && bun test`
Expected: all green.

```bash
git add src/lib/ui/cook/cook-session.ts tests/ui/cook/cook-session.test.ts
git commit -m "feat(cook): add device-local cook-session persistence

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Extract `IngredientEditor`, wire into `BatchEditor`

This is a **behavior-preserving refactor** verified by existing e2e. Preserve every `data-testid` and `aria-label` verbatim.

**Files:**
- Create: `src/lib/ui/IngredientEditor.svelte`
- Modify: `src/lib/ui/BatchEditor.svelte`

- [ ] **Step 1: Create `IngredientEditor.svelte`**

Create `src/lib/ui/IngredientEditor.svelte` (lifted from `BatchEditor`'s ingredients fieldset + its supporting logic; uses shared `evalVariableExpression`):

```svelte
<!-- src/lib/ui/IngredientEditor.svelte -->
<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { moveItem } from '$lib/shared/array';
  import { slugify, uniqueSlug } from '$lib/shared/slug';
  import { evalVariableExpression } from '$lib/ui/layout/batch-content';
  import IconButton from '$lib/ui/primitives/IconButton.svelte';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';
  import Button from './primitives/Button.svelte';
  import type { Ingredient } from '$lib/server';
  import type { IngredientIssue } from '$lib/shared/batch-validation';

  let {
    ingredients = $bindable([]),
    issues = [],
    showUnreferencedHighlights = false,
    onRemoveIngredient
  }: {
    ingredients?: Ingredient[];
    issues?: IngredientIssue[];
    showUnreferencedHighlights?: boolean;
    onRemoveIngredient?: (id: string) => void;
  } = $props();

  const sumMismatchIds = $derived(
    new Set(issues.filter((i) => i.kind === 'sum-mismatch').map((i) => i.ingredientId))
  );
  const unreferencedIds = $derived(
    new Set(issues.filter((i) => i.kind === 'unreferenced').map((i) => i.ingredientId))
  );

  const sectionOptions = $derived.by<string[]>(() => {
    const set = new SvelteSet<string>();
    for (const ing of ingredients) {
      if (ing.section && ing.section.trim()) set.add(ing.section.trim());
    }
    return [...set];
  });

  // When user picks "+ New section…", prompt for a name and apply it.
  $effect(() => {
    for (let i = 0; i < ingredients.length; i++) {
      if (ingredients[i].section === '__new__') {
        const name = window.prompt('New section name:');
        ingredients[i].section = name && name.trim() ? name.trim() : undefined;
      }
    }
  });

  // Assign a stable id to any ingredient that has a name but no id yet.
  $effect(() => {
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.id && ing.name && ing.name.trim()) {
        const taken = new Set(ingredients.map((x) => x.id).filter(Boolean));
        ingredients[i].id = uniqueSlug(slugify(ing.name), taken);
      }
    }
  });

  function addIngredient() {
    ingredients = [...ingredients, { id: '', name: '', amount: '', unit: '' }];
  }
  function removeIngredient(i: number) {
    const removedId = ingredients[i].id;
    ingredients = ingredients.filter((_, idx) => idx !== i);
    onRemoveIngredient?.(removedId);
  }
  function evalIngredientAmountOnBlur(i: number) {
    const evaluated = evalVariableExpression(ingredients[i].amount);
    if (evaluated !== null && String(evaluated) !== ingredients[i].amount.trim()) {
      ingredients[i].amount = String(evaluated);
    }
  }
</script>

<fieldset class="flex flex-col gap-2">
  <legend class="text-label">Ingredients</legend>
  {#each ingredients as ing, i (i)}
    <div
      class="flex gap-2 items-start md:items-center {sumMismatchIds.has(ing.id) ||
      (showUnreferencedHighlights && unreferencedIds.has(ing.id))
        ? 'border border-ochre rounded-sm p-1 -m-1'
        : ''}"
      data-testid="ingredient-edit-row"
      data-ingredient-issue={sumMismatchIds.has(ing.id)
        ? 'sum-mismatch'
        : showUnreferencedHighlights && unreferencedIds.has(ing.id)
          ? 'unreferenced'
          : undefined}
    >
      <div class="flex flex-col w-5 shrink-0 pt-1 md:pt-0">
        <IconButton
          aria-label="Move ingredient {i + 1} up"
          onclick={() => { ingredients = moveItem(ingredients, i, i - 1); }}
          disabled={i === 0}
          class="text-[10px]"
          data-testid="ingredient-move-up">▲</IconButton
        >
        <IconButton
          aria-label="Move ingredient {i + 1} down"
          onclick={() => { ingredients = moveItem(ingredients, i, i + 1); }}
          disabled={i === ingredients.length - 1}
          class="text-[10px]"
          data-testid="ingredient-move-down">▼</IconButton
        >
      </div>

      <div class="flex-1 min-w-0 flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
        <TextInput
          bind:value={ing.name}
          placeholder="Ingredient"
          aria-label="Ingredient {i + 1} name"
          class="px-2 py-1.5 md:flex-1"
        />
        <div class="flex gap-2 min-w-0 md:contents">
          <TextInput
            bind:value={ing.amount}
            onblur={() => evalIngredientAmountOnBlur(i)}
            placeholder="Amount"
            aria-label="Ingredient {i + 1} amount"
            class="flex-1 md:flex-none w-1/2 flex md:w-24 px-2 py-1.5"
          />
          <TextInput
            bind:value={ing.unit}
            placeholder="Unit"
            aria-label="Ingredient {i + 1} unit"
            class="flex-1 md:flex-none w-1/2 flex md:w-20 px-2 py-1.5"
            autocapitalize="none"
          />
        </div>
        <select
          value={ing.section ?? '__none__'}
          onchange={(e) => {
            const val = (e.currentTarget as HTMLSelectElement).value;
            ing.section = val === '__none__' ? undefined : val;
          }}
          aria-label="Ingredient {i + 1} section"
          class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm text-sm w-full md:w-32"
          data-testid="ingredient-section"
        >
          <option value="__none__">(no section)</option>
          {#each sectionOptions as sec (sec)}
            <option value={sec}>{sec}</option>
          {/each}
          <option value="__new__">+ New section…</option>
        </select>
        {#if sumMismatchIds.has(ing.id)}
          {@const issue = issues.find((x) => x.kind === 'sum-mismatch' && x.ingredientId === ing.id)!}
          <span
            class="text-[10px] text-ochre whitespace-nowrap md:self-center"
            data-testid="ingredient-sum-warning"
            data-ingredient-id={ing.id}
            >⚠ used {issue.sum}/{issue.master}{issue.unit ?? ''}</span
          >
        {/if}
        {#if showUnreferencedHighlights && unreferencedIds.has(ing.id) && !sumMismatchIds.has(ing.id)}
          <span
            class="text-[10px] text-ochre whitespace-nowrap md:self-center"
            data-testid="ingredient-unreferenced-warning"
            data-ingredient-id={ing.id}>⚠ never used</span
          >
        {/if}
      </div>

      <IconButton
        aria-label="Remove ingredient {i + 1}"
        onclick={() => removeIngredient(i)}
        class="pt-2 md:pt-0">×</IconButton
      >
    </div>
  {/each}
  <Button
    type="button"
    onclick={addIngredient}
    variant="dashed"
    class="text-sm normal-case tracking-normal"
    data-testid="add-ingredient-btn">+ Add ingredient</Button
  >
</fieldset>
```

- [ ] **Step 2: Wire it into `BatchEditor.svelte` and swap helpers**

In `src/lib/ui/BatchEditor.svelte`:

(a) Add imports near the other `$lib/ui` imports:

```ts
import IngredientEditor from './IngredientEditor.svelte';
import { cleanBatchContent, nextVariables, evalVariableExpression } from './layout/batch-content';
```

(b) **Delete** these now-relocated declarations from the `<script>` (they live in `IngredientEditor` now):
- the `sectionOptions` `$derived.by` block,
- the `$effect` that prompts for `"__new__"` section names,
- the `$effect` that assigns ingredient ids,
- `function addIngredient()`,
- `function removeIngredient(i)`,
- `function evalIngredientAmountOnBlur(i)`,
- the `const unreferencedIds = $derived(...)` block.

Keep `liveIssues` and `sumMismatchIds` (still used by the steps/uses side).

(c) Replace `setVariable` and `evalVariableOnBlur` bodies to use the shared helpers:

```ts
  function setVariable(name: string, raw: string, type: 'number' | 'text') {
    variables = nextVariables(variables, name, raw, type);
  }

  function evalVariableOnBlur(name: string, type: 'number' | 'text', el: HTMLInputElement) {
    if (type !== 'number') return;
    const evaluated = evalVariableExpression(el.value);
    if (evaluated !== null && String(evaluated) !== el.value.trim()) {
      el.value = String(evaluated);
      variables = { ...variables, [name]: evaluated };
    }
  }
```

(d) In `doSave`, replace the inline cleaning (the `cleanIngredients` / `validIds` / `cleanSteps` block) with the shared helper. Find:

```ts
            const cleanIngredients = ingredients.filter((i) => i.name.trim());
            const validIds = new Set(cleanIngredients.map((i) => i.id));
            const cleanSteps: Step[] = steps
                .filter((s) => s.text.trim())
                .map((s) => ({
                    text: s.text.trim(),
                    uses: s.uses.filter((u) => validIds.has(u.ingredientId)),
                }));
```

Replace with:

```ts
            const { ingredients: cleanIngredients, steps: cleanSteps } = cleanBatchContent({ ingredients, steps });
```

(The later references to `cleanIngredients` / `cleanSteps` in `cleanedSnapshot` and the `patchBatch`/`createBatch` payloads stay unchanged.)

(e) Add a handler that strips orphaned uses when an ingredient is removed (this used to live inside the old `removeIngredient`). Add near the other functions:

```ts
  function handleIngredientRemoved(removedId: string) {
    steps = steps.map((s) => ({
      ...s,
      uses: s.uses.filter((u) => u.ingredientId !== removedId)
    }));
  }
```

(f) Replace the entire ingredients `<fieldset>…</fieldset>` markup block (the one with `legend` "Ingredients", `data-testid="ingredient-edit-row"`, ending at the `+ Add ingredient` button) with:

```svelte
    <IngredientEditor
        bind:ingredients
        issues={liveIssues}
        {showUnreferencedHighlights}
        onRemoveIngredient={handleIngredientRemoved}
    />
```

- [ ] **Step 3: Verify types, lint, unit tests**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck && bun run lint && bun test`
Expected: 0 type errors, no lint errors, all unit tests pass. (If `Step` is now unused in `BatchEditor`'s imports, remove it from the import to satisfy lint/knip.)

- [ ] **Step 4: Verify behavior with e2e**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run e2e tests/e2e/edit-batch.e2e.ts tests/e2e/ingredient-inconsistency.e2e.ts`
Expected: both specs PASS (ingredient add/move/remove, sections, sum-mismatch warnings, unreferenced highlight all behave as before).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/IngredientEditor.svelte src/lib/ui/BatchEditor.svelte
git commit -m "refactor(editor): extract IngredientEditor from BatchEditor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Extract `StepEditor`, wire into `BatchEditor`

Structural step ops go through callbacks (so a future consumer can react to index changes); text/uses edits stay two-way bound.

**Files:**
- Create: `src/lib/ui/StepEditor.svelte`
- Modify: `src/lib/ui/BatchEditor.svelte`

- [ ] **Step 1: Create `StepEditor.svelte`**

Create `src/lib/ui/StepEditor.svelte`:

```svelte
<!-- src/lib/ui/StepEditor.svelte -->
<script lang="ts">
  import IconButton from '$lib/ui/primitives/IconButton.svelte';
  import Button from './primitives/Button.svelte';
  import UsesEditor from './UsesEditor.svelte';
  import type { Ingredient, Step } from '$lib/server';

  let {
    steps = $bindable([]),
    ingredients,
    mismatchedIds = new Set<string>(),
    onAddStep,
    onRemoveStep,
    onMoveStep
  }: {
    steps?: Step[];
    ingredients: Ingredient[];
    mismatchedIds?: Set<string>;
    onAddStep: () => void;
    onRemoveStep: (i: number) => void;
    onMoveStep: (from: number, to: number) => void;
  } = $props();

  const allUses = $derived(steps.flatMap((s) => s.uses));
  const usableIngredients = $derived(ingredients.filter((ing) => ing.id && ing.name));
</script>

<fieldset class="flex flex-col gap-3">
  <legend class="text-label">Steps</legend>
  {#each steps as step, i (i)}
    <div class="flex flex-col gap-2 border border-drafting/50 p-3 rounded-sm" data-testid="step-edit-row">
      <div class="flex gap-2 items-start">
        <div class="flex flex-col w-5 shrink-0 pt-1">
          <IconButton
            aria-label="Move step {i + 1} up"
            onclick={() => onMoveStep(i, i - 1)}
            disabled={i === 0}
            class="text-[10px]"
            data-testid="step-move-up">▲</IconButton
          >
          <IconButton
            aria-label="Move step {i + 1} down"
            onclick={() => onMoveStep(i, i + 1)}
            disabled={i === steps.length - 1}
            class="text-[10px]"
            data-testid="step-move-down">▼</IconButton
          >
        </div>
        <span class="font-mono text-xs text-obsidian/60 pt-2">{i + 1}.</span>
        <textarea
          bind:value={step.text}
          rows="2"
          aria-label="Step {i + 1} text"
          class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm resize-none outline-none focus:border-ochre focus:ring-1 focus:ring-ochre"
          data-testid="step-text"
        ></textarea>
        <IconButton aria-label="Remove step {i + 1}" onclick={() => onRemoveStep(i)} class="pt-2">×</IconButton>
      </div>
      <UsesEditor
        bind:uses={step.uses}
        ingredients={usableIngredients}
        {allUses}
        {mismatchedIds}
      />
    </div>
  {/each}
  <Button
    type="button"
    onclick={onAddStep}
    variant="dashed"
    class="text-sm normal-case tracking-normal"
    data-testid="add-step-btn">+ Add step</Button
  >
</fieldset>
```

- [ ] **Step 2: Wire it into `BatchEditor.svelte`**

In `src/lib/ui/BatchEditor.svelte`:

(a) Add the import:

```ts
import StepEditor from './StepEditor.svelte';
```

(b) **Delete** the `const allUses = $derived(steps.flatMap((s) => s.uses));` line (now in `StepEditor`).

(c) Add a `moveStep` handler next to the existing `addStep` / `removeStep` (which stay as-is):

```ts
  function moveStep(from: number, to: number) {
    steps = moveItem(steps, from, to);
  }
```

(d) Replace the entire steps `<fieldset>…</fieldset>` markup block (the one with `legend` "Steps", `data-testid="step-edit-row"`, the inline `UsesEditor`, ending at the `+ Add step` button) with:

```svelte
    <StepEditor
        bind:steps
        ingredients={ingredients}
        mismatchedIds={sumMismatchIds}
        onAddStep={addStep}
        onRemoveStep={removeStep}
        onMoveStep={moveStep}
    />
```

(e) If `moveItem`, `UsesEditor`, or `IconButton` imports are now unused in `BatchEditor`, remove them (lint/knip will tell you). `moveItem` is still used by `moveStep`, so keep it; `UsesEditor` is no longer used directly — remove its import.

- [ ] **Step 3: Verify types, lint, unit tests**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck && bun run lint && bun test`
Expected: all green (resolve any now-unused imports flagged by lint/knip).

- [ ] **Step 4: Verify behavior with e2e**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run e2e tests/e2e/edit-batch.e2e.ts tests/e2e/reorder-rows.e2e.ts tests/e2e/paste-recipe.e2e.ts`
Expected: all PASS (step add/move/remove, uses editor, reorder, paste all behave as before).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/StepEditor.svelte src/lib/ui/BatchEditor.svelte
git commit -m "refactor(editor): extract StepEditor from BatchEditor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `CookView` working copy (render from a draft)

Introduce the working copy and make all cook rendering read it. **No edit UI yet** — behavior is identical, verified by the existing cook e2e.

**Files:**
- Modify: `src/lib/ui/cook/CookView.svelte`

- [ ] **Step 1: Replace `CookView.svelte` with the working-copy version**

Replace the entire file `src/lib/ui/cook/CookView.svelte` with:

```svelte
<!-- src/lib/ui/cook/CookView.svelte -->
<script lang="ts">
  import CookTopBar from './CookTopBar.svelte';
  import CookStartBanner from './CookStartBanner.svelte';
  import CookIngredients from './CookIngredients.svelte';
  import CookStepList from './CookStepList.svelte';
  import CookTimerDock, { type DockTimer } from './CookTimerDock.svelte';
  import { scheduleTimerNotification, cancelTimerNotification } from './cook-notifications';
  import CookQuickNoteFab from './CookQuickNoteFab.svelte';
  import EndCookDialog from './EndCookDialog.svelte';
  import { api } from '../api-client';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { SvelteSet } from 'svelte/reactivity';
  import { onMount, onDestroy } from 'svelte';
  import type { Recipe, Batch } from '$lib/server';
  import type { TimerMatch } from './layout/timer-parse';
  import type { Multiplier } from '../MultiplierToggle.svelte';

  let {
    recipe,
    batch
  }: {
    recipe: Recipe;
    batch: Batch;
  } = $props();

  // Working copy of the editable batch content. All cook rendering reads this;
  // `batch` stays the immutable original (for the outcome record + dirty checks).
  let draft = $state(
    structuredClone({
      label: batch.label,
      variables: batch.variables,
      ingredients: batch.ingredients,
      steps: batch.steps
    })
  );

  let multiplier = $state<Multiplier>(1);
  let started = $state(false);
  let startedAt = $state<number | null>(null);
  let elapsedMs = $state(0);
  let checkedSteps = $state(new Set<number>());
  let quickNotes = $state<string[]>([]);
  let timers = $state<DockTimer[]>([]);
  let timersStarted = $state(0);
  let endCookOpen = $state(false);
  let wasFullChecked = $state(false);

  const currentStepIndex = $derived.by(() => {
    for (let i = 0; i < draft.steps.length; i++) {
      if (!checkedSteps.has(i)) return i;
    }
    return -1;
  });

  const activeTimerKeys = $derived(new Set(
    timers.filter(t => !t.finished).map(t => `${t.stepIndex}:${t.startedAt}`)
  ));

  let elapsedTickId: ReturnType<typeof setInterval> | null = null;
  let wakeLock: WakeLockSentinel | null = null;

  onMount(async () => {
    elapsedTickId = setInterval(() => {
      if (started && startedAt !== null) elapsedMs = Date.now() - startedAt;
    }, 5000);
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      // wake lock unavailable or denied; proceed without it
    }
  });

  onDestroy(() => {
    if (elapsedTickId) clearInterval(elapsedTickId);
    if (wakeLock) wakeLock.release().catch(() => {});
  });

  function handleStart() {
    started = true;
    startedAt = Date.now();
    elapsedMs = 0;
  }

  function handleCheck(i: number, checked: boolean) {
    const next = new SvelteSet(checkedSteps);
    if (checked) next.add(i); else next.delete(i);
    checkedSteps = next;
    if (started && next.size === draft.steps.length && !wasFullChecked) {
      wasFullChecked = true;
      endCookOpen = true;
    }
  }

  function handleStartTimer(stepIndex: number, match: TimerMatch) {
    const id = crypto.randomUUID();
    timers = [...timers, {
      id,
      stepIndex,
      label: match.label,
      durationMs: match.durationMs,
      startedAt: Date.now(),
      pausedAt: null,
      pausedAccumMs: 0,
      finished: false
    }];
    timersStarted++;
    void scheduleTimerNotification(id, match.durationMs, match.label, stepIndex);
  }

  function handlePauseToggle(id: string) {
    const t = timers.find(x => x.id === id);
    if (!t) return;
    const now = Date.now();
    if (t.pausedAt !== null) {
      t.pausedAccumMs += now - t.pausedAt;
      t.pausedAt = null;
      const remaining = t.durationMs - (now - t.startedAt - t.pausedAccumMs);
      if (remaining > 0) {
        void scheduleTimerNotification(t.id, remaining, t.label, t.stepIndex);
      }
    } else {
      t.pausedAt = now;
      void cancelTimerNotification(t.id);
    }
    timers = [...timers];
  }

  function handleRemoveTimer(id: string) {
    void cancelTimerNotification(id);
    timers = timers.filter(t => t.id !== id);
  }

  function handleAddManual(durationMs: number, label: string) {
    const id = crypto.randomUUID();
    timers = [...timers, {
      id,
      stepIndex: -1,
      label,
      durationMs,
      startedAt: Date.now(),
      pausedAt: null,
      pausedAccumMs: 0,
      finished: false
    }];
    timersStarted++;
    void scheduleTimerNotification(id, durationMs, label, -1);
  }

  async function handleEndCookSubmit(input: {
    patch: Partial<Batch>;
    forkAsDraft: boolean;
    forkLabel: string;
  }) {
    let navigateTo = resolve(`/recipes/${recipe.id}?batch=${batch.id}`);

    if (Object.keys(input.patch).length > 0) {
      await api.patchBatch(recipe.id, batch.id, input.patch);
    }

    if (input.forkAsDraft && quickNotes.length > 0) {
      const cloned = structuredClone({
        variables: draft.variables,
        ingredients: draft.ingredients,
        steps: draft.steps
      });
      const description = `Captured during cook:\n${quickNotes.map(n => `• ${n}`).join('\n')}`;
      const newBatch = await api.createBatch(recipe.id, {
        label: input.forkLabel || `improvements from ${batch.label}`,
        parentIds: [batch.id],
        status: 'draft',
        variables: cloned.variables,
        ingredients: cloned.ingredients,
        steps: cloned.steps,
        outcomeNotes: description
      });
      navigateTo = resolve(`/recipes/${recipe.id}?batch=${newBatch.id}`);
    }

    await goto(navigateTo);
  }
</script>

<div class="flex flex-col min-h-screen bg-canvas">
  <CookTopBar
    {recipe}
    {batch}
    {started}
    {elapsedMs}
    onEndCook={() => endCookOpen = true}
  />

  {#if !started}
    <CookStartBanner onStart={handleStart} />
  {/if}

  <CookIngredients
    ingredients={draft.ingredients}
    steps={draft.steps}
    {currentStepIndex}
    {checkedSteps}
    {multiplier}
    onMultiplierChange={(next) => multiplier = next}
  />

  <CookStepList
    steps={draft.steps}
    ingredients={draft.ingredients}
    {checkedSteps}
    {currentStepIndex}
    {activeTimerKeys}
    {multiplier}
    onCheck={handleCheck}
    onStartTimer={handleStartTimer}
  />

  <div class="flex-1"></div>

  <CookQuickNoteFab bind:notes={quickNotes} />

  <CookTimerDock
    {timers}
    onPauseToggle={handlePauseToggle}
    onRemove={handleRemoveTimer}
    onAddManual={handleAddManual}
  />
</div>

<EndCookDialog
  bind:open={endCookOpen}
  {batch}
  startedAt={startedAt ?? Date.now()}
  {elapsedMs}
  {timersStarted}
  stepsChecked={checkedSteps.size}
  stepsTotal={draft.steps.length}
  {quickNotes}
  {multiplier}
  onSubmit={handleEndCookSubmit}
/>
```

- [ ] **Step 2: Verify types, lint, unit tests**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck && bun run lint && bun test`
Expected: all green.

- [ ] **Step 3: Verify behavior with e2e**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run e2e tests/e2e/cook.e2e.ts tests/e2e/multiplier.e2e.ts`
Expected: both PASS — cooking start→finish and multiplier behave exactly as before.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui/cook/CookView.svelte
git commit -m "refactor(cook): drive cook view from an editable working copy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Auto-save & restore the cook session

**Files:**
- Modify: `src/lib/ui/cook/CookView.svelte`

- [ ] **Step 1: Add the imports**

In `CookView.svelte`, add to the import block:

```ts
  import { saveSession, loadSession, clearSession, type CookSessionV1 } from './cook-session';
```

- [ ] **Step 2: Restore state on init**

Replace the `let draft = $state(...)` declaration **and** the six session-state declarations (`multiplier`, `started`, `startedAt`, `checkedSteps`, `quickNotes`, `timers`) with a restore-aware version. Replace:

```ts
  let draft = $state(
    structuredClone({
      label: batch.label,
      variables: batch.variables,
      ingredients: batch.ingredients,
      steps: batch.steps
    })
  );

  let multiplier = $state<Multiplier>(1);
  let started = $state(false);
  let startedAt = $state<number | null>(null);
  let elapsedMs = $state(0);
  let checkedSteps = $state(new Set<number>());
  let quickNotes = $state<string[]>([]);
  let timers = $state<DockTimer[]>([]);
```

with:

```ts
  // Restore a suspended session for this exact batch, if one exists on the device.
  const restored = loadSession(recipe.id, batch.id);

  let draft = $state(
    restored
      ? structuredClone(restored.draft)
      : structuredClone({
          label: batch.label,
          variables: batch.variables,
          ingredients: batch.ingredients,
          steps: batch.steps
        })
  );

  let multiplier = $state<Multiplier>((restored?.multiplier as Multiplier) ?? 1);
  let started = $state(restored?.started ?? false);
  let startedAt = $state<number | null>(restored?.startedAt ?? null);
  let elapsedMs = $state(restored && restored.startedAt !== null ? Date.now() - restored.startedAt : 0);
  let checkedSteps = $state(new Set<number>(restored?.checkedSteps ?? []));
  let quickNotes = $state<string[]>(restored?.quickNotes ?? []);
  let timers = $state<DockTimer[]>(restored?.timers ?? []);
```

- [ ] **Step 3: Persist on every change, and re-arm timer notifications on restore**

Add an autosave `$effect` immediately after the `activeTimerKeys` derived declaration:

```ts
  // Auto-save the whole session on any change. `structuredClone` deep-reads the
  // draft/timers proxies, so this effect re-subscribes on every nested edit (e.g.
  // typing in an ingredient name), not just on array reassignment. localStorage
  // writes are cheap and user-paced, so no debounce is needed.
  $effect(() => {
    const session: CookSessionV1 = {
      v: 1,
      recipeId: recipe.id,
      batchId: batch.id,
      draft: structuredClone({
        label: draft.label,
        variables: draft.variables,
        ingredients: draft.ingredients,
        steps: draft.steps
      }),
      started,
      startedAt,
      checkedSteps: [...checkedSteps],
      quickNotes: [...quickNotes],
      multiplier,
      timers: structuredClone(timers)
    };
    saveSession(session);
  });
```

In the existing `onMount`, after the `wakeLock` try/catch, re-arm notifications for any still-running restored timers:

```ts
    if (restored) {
      const now = Date.now();
      for (const t of timers) {
        if (t.finished || t.pausedAt !== null) continue;
        const remaining = t.durationMs - (now - t.startedAt - t.pausedAccumMs);
        if (remaining > 0) void scheduleTimerNotification(t.id, remaining, t.label, t.stepIndex);
      }
    }
```

- [ ] **Step 4: Clear the session when the cook is finalized**

In `handleEndCookSubmit`, add `clearSession(recipe.id, batch.id);` immediately before the final `await goto(navigateTo);`:

```ts
    clearSession(recipe.id, batch.id);
    await goto(navigateTo);
```

- [ ] **Step 5: Verify types, lint, unit tests**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck && bun run lint && bun test`
Expected: all green.

- [ ] **Step 6: Verify the existing cook e2e still passes**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run e2e tests/e2e/cook.e2e.ts`
Expected: PASS (the session is cleared at End Cook, so the normal flow is unaffected). Restore is exercised end-to-end in Task 10.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ui/cook/CookView.svelte
git commit -m "feat(cook): auto-save and restore the cook session

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Edit-mode toggle + `CookEditPanel`

**Files:**
- Create: `src/lib/ui/cook/CookEditPanel.svelte`
- Modify: `src/lib/ui/cook/CookTopBar.svelte`
- Modify: `src/lib/ui/cook/CookView.svelte`

- [ ] **Step 1: Create `CookEditPanel.svelte`**

Create `src/lib/ui/cook/CookEditPanel.svelte`:

```svelte
<!-- src/lib/ui/cook/CookEditPanel.svelte -->
<script lang="ts">
  import type { Recipe, VariableValue, Ingredient, Step } from '$lib/server';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';
  import IngredientEditor from '$lib/ui/IngredientEditor.svelte';
  import StepEditor from '$lib/ui/StepEditor.svelte';
  import { nextVariables, evalVariableExpression } from '$lib/ui/layout/batch-content';

  // The fork's *label* is named in the End-Cook dialog (Task 9), not here — this
  // panel edits the batch content (variables, ingredients, steps).
  let {
    recipe,
    variables = $bindable({}),
    ingredients = $bindable([]),
    steps = $bindable([]),
    onAddStep,
    onRemoveStep,
    onMoveStep,
    onRemoveIngredient
  }: {
    recipe: Recipe;
    variables?: Record<string, VariableValue>;
    ingredients?: Ingredient[];
    steps?: Step[];
    onAddStep: () => void;
    onRemoveStep: (i: number) => void;
    onMoveStep: (from: number, to: number) => void;
    onRemoveIngredient: (id: string) => void;
  } = $props();

  function setVar(name: string, raw: string, type: 'number' | 'text') {
    variables = nextVariables(variables, name, raw, type);
  }
  function evalVarOnBlur(name: string, type: 'number' | 'text', el: HTMLInputElement) {
    if (type !== 'number') return;
    const v = evalVariableExpression(el.value);
    if (v !== null && String(v) !== el.value.trim()) {
      el.value = String(v);
      variables = { ...variables, [name]: v };
    }
  }
</script>

<div class="flex flex-col gap-6 px-4 py-4" data-testid="cook-edit-panel">
  {#if recipe.variableSchema.length > 0}
    <fieldset class="flex flex-col gap-3">
      <legend class="text-label mb-1">Variables</legend>
      <div class="grid grid-cols-2 gap-3">
        {#each recipe.variableSchema as schema (schema.name)}
          {@const current = variables[schema.name]}
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-kicker">{schema.name} {schema.unit && `(${schema.unit})`}</span>
            <TextInput
              type="text"
              inputmode={schema.type === 'number' ? 'decimal' : 'text'}
              value={String(current ?? '')}
              oninput={(e) => setVar(schema.name, (e.currentTarget as HTMLInputElement).value, schema.type)}
              onblur={(e) => evalVarOnBlur(schema.name, schema.type, e.currentTarget as HTMLInputElement)}
              data-testid="var-{schema.name}"
            />
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  <IngredientEditor bind:ingredients {onRemoveIngredient} />

  <StepEditor bind:steps {ingredients} {onAddStep} {onRemoveStep} {onMoveStep} />
</div>
```

- [ ] **Step 2: Add the edit toggle to `CookTopBar.svelte`**

Replace `src/lib/ui/cook/CookTopBar.svelte` with:

```svelte
<!-- src/lib/ui/cook/CookTopBar.svelte -->
<script lang="ts">
  import type { Recipe, Batch } from '$lib/server';
  import Button from '$lib/ui/primitives/Button.svelte';
  import { resolve } from '$app/paths';

  let {
    recipe,
    batch,
    started,
    elapsedMs,
    editing,
    isDirty,
    onToggleEdit,
    onEndCook
  }: {
    recipe: Recipe;
    batch: Batch;
    started: boolean;
    elapsedMs: number;
    editing: boolean;
    isDirty: boolean;
    onToggleEdit: () => void;
    onEndCook: () => void;
  } = $props();

  const modeTag = $derived(batch.status === 'cooked' ? 'Re-cook' : 'Cooking');

  function fmtElapsed(ms: number): string {
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 60) return `${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }
</script>

<header class="sticky top-0 z-20 bg-canvas border-b border-drafting flex items-center gap-3 px-4 py-2 text-sm">
  <a href={resolve(`/recipes/${recipe.id}`)} class="text-obsidian/60 hover:text-obsidian text-xs whitespace-nowrap" aria-label="Back to recipe">
    ← {recipe.name}
  </a>
  <span class="text-obsidian/40">·</span>
  <span class="font-serif font-semibold truncate">{batch.label}</span>
  <span class="text-[10px] uppercase tracking-wider {batch.status === 'cooked' ? 'text-juniper' : 'text-ochre'}">{modeTag}</span>
  {#if isDirty}
    <span class="text-[10px] text-ochre" data-testid="cook-edited-indicator" title="You have unsaved edits — they become a new version at End Cook">● edited</span>
  {/if}
  <span class="ml-auto flex items-center gap-2">
    <Button
      variant={editing ? 'success' : 'outline'}
      size="sm"
      onclick={onToggleEdit}
      class="py-1"
      data-testid="cook-edit-toggle"
      aria-pressed={editing}
    >{editing ? 'Done' : 'Edit'}</Button>
    {#if started}
      <span class="text-[11px] font-mono text-obsidian/60" data-testid="cook-elapsed">{fmtElapsed(elapsedMs)}</span>
      <Button
        variant="success"
        size="sm"
        onclick={onEndCook}
        class="py-1"
        data-testid="end-cook-btn"
      >End Cook</Button>
    {/if}
  </span>
</header>
```

- [ ] **Step 3: Wire edit mode into `CookView.svelte`**

(a) Add imports:

```ts
  import CookEditPanel from './CookEditPanel.svelte';
  import { moveItem } from '$lib/shared/array';
  import { isContentDirty } from '../layout/batch-content';
  import { mapIndexThroughRemove, mapIndexThroughMove, checkedAfterRemove, checkedAfterMove } from './layout/remap-cook-state';
```

(b) Add `editing` state and the `isDirty` derived after the existing state declarations (after `let wasFullChecked = ...`):

```ts
  let editing = $state(false);
  const isDirty = $derived(isContentDirty(draft, batch));
```

(c) Add the structural-edit handlers (these keep `checkedSteps` and timers aligned). Add them after `handleAddManual`:

```ts
  function handleAddStep() {
    draft.steps = [...draft.steps, { text: '', uses: [] }];
  }

  function handleRemoveStep(i: number) {
    checkedSteps = checkedAfterRemove(checkedSteps, i);
    timers = timers.map((t) => {
      if (t.stepIndex < 0) return t;
      const m = mapIndexThroughRemove(t.stepIndex, i);
      return { ...t, stepIndex: m === null ? -1 : m };
    });
    draft.steps = draft.steps.filter((_, idx) => idx !== i);
  }

  function handleMoveStep(from: number, to: number) {
    if (to < 0 || to >= draft.steps.length) return;
    checkedSteps = checkedAfterMove(checkedSteps, from, to);
    timers = timers.map((t) => (t.stepIndex < 0 ? t : { ...t, stepIndex: mapIndexThroughMove(t.stepIndex, from, to) }));
    draft.steps = moveItem(draft.steps, from, to);
  }

  function handleRemoveIngredient(removedId: string) {
    draft.steps = draft.steps.map((s) => ({
      ...s,
      uses: s.uses.filter((u) => u.ingredientId !== removedId)
    }));
  }
```

(d) Update the `<CookTopBar>` usage to pass the new props:

```svelte
  <CookTopBar
    {recipe}
    {batch}
    {started}
    {elapsedMs}
    {editing}
    {isDirty}
    onToggleEdit={() => editing = !editing}
    onEndCook={() => endCookOpen = true}
  />
```

(e) Replace the `<CookIngredients>` + `<CookStepList>` block with an editing branch:

```svelte
  {#if editing}
    <CookEditPanel
      {recipe}
      bind:variables={draft.variables}
      bind:ingredients={draft.ingredients}
      bind:steps={draft.steps}
      onAddStep={handleAddStep}
      onRemoveStep={handleRemoveStep}
      onMoveStep={handleMoveStep}
      onRemoveIngredient={handleRemoveIngredient}
    />
  {:else}
    <CookIngredients
      ingredients={draft.ingredients}
      steps={draft.steps}
      {currentStepIndex}
      {checkedSteps}
      {multiplier}
      onMultiplierChange={(next) => multiplier = next}
    />

    <CookStepList
      steps={draft.steps}
      ingredients={draft.ingredients}
      {checkedSteps}
      {currentStepIndex}
      {activeTimerKeys}
      {multiplier}
      onCheck={handleCheck}
      onStartTimer={handleStartTimer}
    />
  {/if}
```

- [ ] **Step 4: Verify types, lint, unit tests**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck && bun run lint && bun test`
Expected: all green.

- [ ] **Step 5: Verify the existing cook e2e still passes**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run e2e tests/e2e/cook.e2e.ts`
Expected: PASS — the new Edit button is inert for the existing flow (it doesn't toggle in that test).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/cook/CookEditPanel.svelte src/lib/ui/cook/CookTopBar.svelte src/lib/ui/cook/CookView.svelte
git commit -m "feat(cook): add edit-mode toggle and edit panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: End-Cook reconciliation (fork on edit)

**Files:**
- Modify: `src/lib/ui/cook/EndCookDialog.svelte`
- Modify: `src/lib/ui/cook/CookView.svelte`

- [ ] **Step 1: Make `EndCookDialog` dirty-aware**

Replace `src/lib/ui/cook/EndCookDialog.svelte` with:

```svelte
<!-- src/lib/ui/cook/EndCookDialog.svelte -->
<script lang="ts">
  import Rating from '../Rating.svelte';
  import { buildEndCookPatch } from './layout/end-cook-patch';
  import type { Batch } from '$lib/server';
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import Checkbox from '$lib/ui/primitives/Checkbox.svelte';
  import Field from '$lib/ui/primitives/Field.svelte';
  import FormError from '$lib/ui/primitives/FormError.svelte';

  let {
    open = $bindable(false),
    batch,
    startedAt,
    elapsedMs,
    timersStarted,
    stepsChecked,
    stepsTotal,
    quickNotes,
    multiplier,
    isDirty,
    changeSummary,
    onSubmit
  }: {
    open?: boolean;
    batch: Batch;
    startedAt: number;
    elapsedMs: number;
    timersStarted: number;
    stepsChecked: number;
    stepsTotal: number;
    quickNotes: string[];
    multiplier: number;
    isDirty: boolean;
    changeSummary: string;
    onSubmit: (input: {
      patch: Partial<Batch>;
      forkAsDraft: boolean;
      forkLabel: string;
    }) => Promise<void>;
  } = $props();

  const mode = $derived<'first-cook' | 're-cook'>(batch.status === 'cooked' ? 're-cook' : 'first-cook');

  let outcomeNotes = $state('');
  let rating = $state<1 | 2 | 3 | 4 | 5 | null>(null);
  let forkAsDraft = $state(false);
  let forkLabel = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (open) {
      outcomeNotes = '';
      rating = batch.rating ?? null;
      forkAsDraft = false;
      forkLabel = `improvements from ${batch.label}`;
      error = null;
    }
  });

  function fmtElapsed(ms: number): string {
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 60) return `${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }

  function close() { open = false; }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      const patch = buildEndCookPatch({
        mode,
        startedAt,
        endedAt: startedAt + elapsedMs,
        outcomeNotes,
        rating,
        existingOutcomeNotes: batch.outcomeNotes,
        multiplier
      });
      // When the working copy changed, a fork is always created from it.
      await onSubmit({ patch, forkAsDraft: isDirty || forkAsDraft, forkLabel: forkLabel.trim() });
      close();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save cook';
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog
  bind:open
  title="{mode === 're-cook' ? 'End Re-cook' : 'End Cook'} · {batch.label}"
  titleId="end-cook-dialog-title"
  onClose={close}
>
  {#snippet actions()}
    <Button type="button" variant="ghost" onclick={close}>Cancel</Button>
    <Button
      type="submit"
      form="end-cook-form"
      variant="success"
      disabled={submitting}
      data-testid="end-cook-submit"
    >{submitting ? 'Saving…' : 'Save Cook'}</Button>
  {/snippet}
  <form id="end-cook-form" onsubmit={submit} data-testid="end-cook-dialog" class="flex flex-col gap-4">
    <div class="grid grid-cols-3 gap-2 text-xs border border-drafting p-2 rounded-sm" data-testid="end-cook-summary">
      <div><span class="block text-kicker">Elapsed</span><span class="font-mono">{fmtElapsed(elapsedMs)}</span></div>
      <div><span class="block text-kicker">Steps</span><span class="font-mono">{stepsChecked}/{stepsTotal}</span></div>
      <div><span class="block text-kicker">Timers</span><span class="font-mono">{timersStarted}</span></div>
    </div>

    <Field label={mode === 're-cook' ? 'Notes for this cook' : 'Outcome notes'}>
      <textarea
        bind:value={outcomeNotes}
        rows="4"
        placeholder="Crumb, crust, taste, what to change next time…"
        class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none outline-none focus:border-ochre focus:ring-1 focus:ring-ochre"
        data-testid="end-cook-notes"
      ></textarea>
    </Field>

    {#if mode === 'first-cook'}
      <Field label="Rating">
        <Rating value={rating} editable onChange={(v) => rating = v} />
      </Field>
    {/if}

    {#if isDirty}
      <div class="flex flex-col gap-2 border border-ochre/60 p-3 rounded-sm" data-testid="cook-new-version-panel">
        <span class="text-kicker">Your edits → new version</span>
        <p class="text-sm text-obsidian/70">{changeSummary}</p>
        <p class="text-[11px] text-obsidian/50">{batch.label} is recorded as cooked with its original steps; your edits are saved as a new draft.</p>
        {#if quickNotes.length > 0}
          <span class="text-[11px] text-obsidian/60">{quickNotes.length} captured note{quickNotes.length === 1 ? '' : 's'} will ride along.</span>
        {/if}
        <Field label="New version label">
          <input bind:value={forkLabel} class="border border-drafting bg-canvas px-2 py-1 rounded-sm" data-testid="cook-fork-label" />
        </Field>
      </div>
    {:else if quickNotes.length > 0}
      <div class="flex flex-col gap-2 border border-drafting/60 p-3 rounded-sm" data-testid="quick-notes-recap">
        <span class="text-kicker">Improvement ideas captured ({quickNotes.length})</span>
        <ul class="text-sm list-disc pl-5 space-y-1">
          {#each quickNotes as note (note)}
            <li>{note}</li>
          {/each}
        </ul>
        <label class="flex items-center gap-2 text-sm">
          <Checkbox bind:checked={forkAsDraft} data-testid="fork-as-draft-checkbox" />
          Carry these ideas into a new batch
        </label>
        {#if forkAsDraft}
          <Field label="New batch label">
            <input bind:value={forkLabel} class="border border-drafting bg-canvas px-2 py-1 rounded-sm" data-testid="fork-label" />
          </Field>
        {/if}
      </div>
    {/if}

    <FormError message={error} />
  </form>
</Dialog>
```

- [ ] **Step 2: Build the fork from the working copy in `CookView`**

(a) Extend the existing batch-content import (added in Task 8) to include the two new helpers, and add the validation import. Change:

```ts
  import { isContentDirty } from '../layout/batch-content';
```

to:

```ts
  import { isContentDirty, cleanBatchContent, summarizeEdits } from '../layout/batch-content';
```

and add:

```ts
  import { validateBatch } from '$lib/shared/batch-validation';
```

(b) Replace the whole `handleEndCookSubmit` function with the dirty-aware version:

```ts
  async function handleEndCookSubmit(input: {
    patch: Partial<Batch>;
    forkAsDraft: boolean;
    forkLabel: string;
  }) {
    let navigateTo = resolve(`/recipes/${recipe.id}?batch=${batch.id}`);

    // The original batch is always recorded as cooked.
    if (Object.keys(input.patch).length > 0) {
      await api.patchBatch(recipe.id, batch.id, input.patch);
    }

    // A fork is created when the working copy changed, or when the user opted to
    // carry quick notes into a new batch.
    if (input.forkAsDraft) {
      const { ingredients, steps } = cleanBatchContent({
        ingredients: draft.ingredients,
        steps: draft.steps
      });
      const variables = structuredClone(draft.variables);
      const notes = quickNotes.length > 0
        ? `Captured during cook:\n${quickNotes.map((n) => `• ${n}`).join('\n')}`
        : '';
      const issues = validateBatch({
        id: 'fork',
        recipeId: recipe.id,
        label: input.forkLabel || `improvements from ${batch.label}`,
        parentIds: [batch.id],
        status: 'draft',
        cookedAt: null,
        variables,
        ingredients,
        steps,
        outcomeNotes: notes,
        rating: null,
        createdAt: new Date().toISOString()
      });
      const newBatch = await api.createBatch(recipe.id, {
        label: input.forkLabel || `improvements from ${batch.label}`,
        parentIds: [batch.id],
        status: 'draft',
        variables,
        ingredients,
        steps,
        outcomeNotes: notes,
        inconsistencyNote: issues.length > 0 ? ' ' : ''
      });
      navigateTo = resolve(`/recipes/${recipe.id}?batch=${newBatch.id}`);
    }

    clearSession(recipe.id, batch.id);
    await goto(navigateTo);
  }
```

(c) Pass `isDirty` and a change summary to `<EndCookDialog>`. Update its usage to add:

```svelte
  {isDirty}
  changeSummary={summarizeEdits(batch, draft)}
```

(place them alongside the other props, e.g. just before `onSubmit={handleEndCookSubmit}`).

- [ ] **Step 3: Verify types, lint, unit tests**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck && bun run lint && bun test`
Expected: all green. (`buildEndCookPatch` unit tests are unaffected.)

- [ ] **Step 4: Verify the existing cook e2e still passes**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run e2e tests/e2e/cook.e2e.ts`
Expected: PASS — with no edits, `isDirty` is false and the dialog behaves exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/cook/EndCookDialog.svelte src/lib/ui/cook/CookView.svelte
git commit -m "feat(cook): fork a new draft from edits at End Cook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: End-to-end test for edit-while-cooking

**Files:**
- Create: `tests/e2e/cook-edit.e2e.ts`

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/cook-edit.e2e.ts`:

```ts
import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async ({ page }) => { await clearTestData({ page }); });

test('edit while cooking: progress survives, session restores, edits fork a new draft', async ({ page }) => {
  // Create a recipe and a V1 draft with two steps and no ingredients (so the
  // editor saves cleanly without tripping the inconsistency dialog).
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Edit While Cook');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/edit-while-cook/);

  await page.getByRole('link', { name: '+ Record V1' }).click();
  await page.getByTestId('batch-label').fill('v1');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Mix');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(1).fill('Rest 5 min');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Start cooking and check the first step.
  await page.getByTestId('cook-btn').click();
  await expect(page).toHaveURL(/\/cook$/);
  await page.getByTestId('start-cooking-btn').click();
  await expect(page.getByTestId('cook-elapsed')).toBeVisible();
  await page.getByTestId('cook-step-checkbox').nth(0).check();
  await expect(page.getByTestId('cook-step-checkbox').nth(0)).toBeChecked();

  // Toggle edit mode and make structural edits: change step 2, add an ingredient, add a step.
  await page.getByTestId('cook-edit-toggle').click();
  await expect(page.getByTestId('cook-edit-panel')).toBeVisible();
  await page.getByTestId('step-text').nth(1).fill('Rest 10 min');
  await page.getByTestId('add-ingredient-btn').click();
  await page.getByTestId('ingredient-edit-row').nth(0).getByLabel(/^Ingredient 1 name$/).fill('water');
  await page.getByTestId('ingredient-edit-row').nth(0).getByLabel(/^Ingredient 1 amount$/).fill('350');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(2).fill('Bake 40 min');
  await expect(page.getByTestId('cook-edited-indicator')).toBeVisible();

  // Back to cook mode: the step-1 checkmark must still be set.
  await page.getByTestId('cook-edit-toggle').click();
  await expect(page.getByTestId('cook-edit-panel')).toHaveCount(0);
  await expect(page.getByTestId('cook-step-checkbox').nth(0)).toBeChecked();
  await expect(page.getByTestId('cook-step-list')).toContainText('Rest 10 min');
  await expect(page.getByTestId('cook-step-list')).toContainText('Bake 40 min');

  // Reload: the session restores (cooking already started, step 1 still checked, edits intact).
  await page.reload();
  await expect(page.getByTestId('cook-elapsed')).toBeVisible();
  await expect(page.getByTestId('cook-step-checkbox').nth(0)).toBeChecked();
  await expect(page.getByTestId('cook-step-list')).toContainText('Bake 40 min');

  // End Cook → the dirty panel appears; name and save the new version.
  await page.getByTestId('end-cook-btn').click();
  await expect(page.getByTestId('cook-new-version-panel')).toBeVisible();
  await page.getByTestId('cook-fork-label').fill('v2 with water');
  await page.getByTestId('end-cook-submit').click();

  // We land on the forked draft, which carries the edits.
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('batch-detail')).toContainText('v2 with water');
  await expect(page.getByTestId('batch-detail')).toContainText('Draft');
  await expect(page.getByTestId('batch-detail')).toContainText('Bake 40 min');
  await expect(page.getByTestId('batch-detail')).toContainText('water');

  // Switch to the original v1 via its batch-graph node (BatchGraph buttons carry
  // an aria-label "Select batch <label> (<status>)"). It is preserved and recorded
  // as cooked, with its ORIGINAL steps untouched (no "Bake 40 min").
  await page.getByRole('button', { name: 'Select batch v1 (cooked)' }).click();
  await expect(page.getByTestId('batch-detail')).toContainText('Cooked');
  await expect(page.getByTestId('batch-detail')).toContainText('Rest 5 min');
  await expect(page.getByTestId('batch-detail')).not.toContainText('Bake 40 min');
});
```

- [ ] **Step 2: Run the e2e test**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run e2e tests/e2e/cook-edit.e2e.ts`
Expected: PASS. If the final picker assertions fail on selectors, fix per the selector note and re-run.

- [ ] **Step 3: Run the full e2e suite to confirm no regressions**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun run e2e`
Expected: all specs PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/cook-edit.e2e.ts
git commit -m "test(cook): e2e for edit-while-cooking and session restore

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the complete gate: `export PATH="$HOME/.bun/bin:$PATH" && bun run check && bun run e2e`
  Expected: typecheck 0 errors, lint clean, knip clean, all unit tests pass, all e2e pass.
- [ ] Manually sanity-check on device/dev (`bun run dev`): start a cook, toggle Edit, change a step + add an ingredient, confirm the "● edited" indicator, toggle back and confirm checkmarks/timers are intact, reload to confirm restore, then End Cook and confirm a new draft fork was created while the original is marked cooked.

## Spec coverage map

- Working copy driving cook rendering → Task 6.
- Edit-mode toggle + scope (label/variables/ingredients/steps) → Tasks 4, 5, 8.
- Structural-edit remap of checkmarks/timers → Tasks 2, 8.
- Device-local autosave + restore + notification re-arm → Tasks 3, 7.
- End-Cook reconciliation (original cooked + fork from working copy, quick-notes ride along, silent inconsistencyNote) → Tasks 1, 9.
- Shared-editor extraction (one source of truth) → Tasks 4, 5; `CookEditPanel` reuse → Task 8.
- Tests (remap, session, content helpers, e2e) → Tasks 1, 2, 3, 10.
- Out of scope (Paste in cook, blocking inconsistency dialog, status/schema editing, cross-device sync, contextual model) → not implemented, by design.
