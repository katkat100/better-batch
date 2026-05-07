# Paste Recipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Add a "Paste Recipe" flow to `BatchEditor` that opens a textarea modal, parses the pasted text into ingredients/steps/variables via a local heuristic, and applies the result to the form (Append or Replace if existing content).

**Architecture:** Pure-function parser at `src/lib/shared/recipe-paste.ts` (TDD). Presentation `PasteRecipeDialog.svelte` for input + preview. `BatchEditor.svelte` gets a trigger button + apply handler. No LLM, no network.

**Tech Stack:** Svelte 5 runes · TypeScript · `bun:test` · Tailwind v4

Reference spec: `docs/superpowers/specs/2026-05-07-paste-recipe.md`.

---

## File Structure

```
src/lib/shared/
  recipe-paste.ts                # NEW — pure parser

tests/shared/
  recipe-paste.test.ts           # NEW — TDD coverage

src/lib/ui/
  PasteRecipeDialog.svelte       # NEW — modal
  BatchEditor.svelte             # MODIFIED — Paste button + dialog mount + applyPaste
```

---

## Task 1: `parseRecipePaste` parser (TDD)

**Files:**
- Create: `src/lib/shared/recipe-paste.ts`
- Create: `tests/shared/recipe-paste.test.ts`

The parser is pure-function, runs entirely in-process, no I/O. TDD: write tests first, run-fail, implement to pass.

- [ ] **Step 1: Write the test file with all 14 cases.**

Create `tests/shared/recipe-paste.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { parseRecipePaste } from '../../src/lib/shared/recipe-paste';
import type { VariableSchemaItem } from '../../src/lib/server';

const breadSchema: VariableSchemaItem[] = [
  { name: 'hydration', unit: '%', type: 'number' },
  { name: 'bake_temp', unit: '°F', type: 'number' },
  { name: 'yield', unit: 'loaves', type: 'number' },
  { name: 'flavor', unit: '', type: 'text' }
];

describe('parseRecipePaste', () => {
  it('parses standard format with headers and bullets', () => {
    const input = `Ingredients:
- 500g flour
- 100g water

Steps:
1. Mix flour and water
2. Bake at 425F`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.ingredients[0]).toMatchObject({ amount: '500', unit: 'g', name: 'flour' });
    expect(r.ingredients[1]).toMatchObject({ amount: '100', unit: 'g', name: 'water' });
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].text).toBe('Mix flour and water');
    expect(r.steps[1].text).toBe('Bake at 425F');
  });

  it('parses no-bullet format with headers', () => {
    const input = `Ingredients:
500g flour
100g water
Steps:
1. Mix`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].text).toBe('Mix');
  });

  it('parses free-form (no headers): ingredient-shaped lines become ingredients, others become steps', () => {
    const input = `500g flour
100g water
Mix everything together
Knead for 10 minutes`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].text).toBe('Mix everything together');
    expect(r.steps[1].text).toBe('Knead for 10 minutes');
  });

  it('parses section headers within ingredients', () => {
    const input = `Ingredients:
Levain
- 50g flour
- 50g water

Final Dough
- 500g flour
- 350g water

Steps:
1. Mix`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(4);
    expect(r.ingredients[0].section).toBe('Levain');
    expect(r.ingredients[1].section).toBe('Levain');
    expect(r.ingredients[2].section).toBe('Final Dough');
    expect(r.ingredients[3].section).toBe('Final Dough');
  });

  it('joins multi-line steps', () => {
    const input = `Steps:
1. Mix the flour
and water
thoroughly
2. Knead.`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].text).toBe('Mix the flour and water thoroughly');
    expect(r.steps[1].text).toBe('Knead.');
  });

  it('parses variables matched against schema (name normalization, number coercion)', () => {
    const input = `Hydration: 75%
Bake Temp = 450°F
Yield - 2 loaves

Ingredients:
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.variables.hydration).toBe(75);
    expect(r.variables.bake_temp).toBe(450);
    expect(r.variables.yield).toBe(2);
  });

  it('skips number-typed variables that do not parse to a number', () => {
    const input = `Hydration: high

Ingredients:
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.variables.hydration).toBeUndefined();
    expect(r.unmatchedLines).toContain('Hydration: high');
  });

  it('puts unmatched Name: value patterns into unmatchedLines', () => {
    const input = `Stirring: vigorously

Ingredients:
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.variables.stirring).toBeUndefined();
    expect(r.unmatchedLines).toContain('Stirring: vigorously');
  });

  it('returns empty result on empty input', () => {
    const r = parseRecipePaste('', breadSchema);
    expect(r).toEqual({ ingredients: [], steps: [], variables: {}, unmatchedLines: [] });
  });

  it('puts pure-junk content into unmatchedLines or steps depending on shape', () => {
    const input = `lorem ipsum dolor
the quick brown fox jumps`;
    const r = parseRecipePaste(input, breadSchema);
    // No ingredient-shaped lines → these go to steps in the free-form fallback
    expect(r.ingredients).toHaveLength(0);
    expect(r.steps.length).toBeGreaterThan(0);
  });

  it('strips different bullet markers', () => {
    const input = `Ingredients:
- 500g flour
* 100g water
• 5g salt
– 2g yeast

Steps:
1. Mix`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(4);
    expect(r.ingredients.map(i => i.name)).toEqual(['flour', 'water', 'salt', 'yeast']);
  });

  it('handles numbered step variants (1. 1) Step 1:)', () => {
    const input = `Steps:
1. Mix
2) Knead
Step 3: Bake`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.steps).toHaveLength(3);
    expect(r.steps.map(s => s.text)).toEqual(['Mix', 'Knead', 'Bake']);
  });

  it('handles fraction amounts via parseAmount', () => {
    const input = `Ingredients:
- 1/2 tsp salt
- 1 1/2 cups water`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.ingredients[0]).toMatchObject({ amount: '1/2', unit: 'tsp', name: 'salt' });
    expect(r.ingredients[1]).toMatchObject({ amount: '1 1/2', unit: 'cups', name: 'water' });
  });

  it('keeps lines with no recognizable amount as nameless ingredients', () => {
    const input = `Ingredients:
- salt to taste
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.ingredients[0]).toMatchObject({ amount: '', unit: '', name: 'salt to taste' });
    expect(r.ingredients[1]).toMatchObject({ amount: '500', unit: 'g', name: 'flour' });
  });

  it('all ingredients have id="" and section is undefined when no section header', () => {
    const input = `Ingredients:
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients[0].id).toBe('');
    expect(r.ingredients[0].section).toBeUndefined();
  });

  it('all steps have empty uses array', () => {
    const input = `Steps:
1. Mix`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.steps[0].uses).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL.**

Run: `~/.bun/bin/bun test tests/shared/recipe-paste.test.ts 2>&1 | tail -10`
Expected: tests fail with `Cannot find module '.../recipe-paste'` or similar.

- [ ] **Step 3: Implement the parser.**

Create `src/lib/shared/recipe-paste.ts`:

```ts
import type { Ingredient, Step, VariableSchemaItem, VariableValue } from '$lib/server';
import { parseAmount } from '$lib/ui/layout/amount-parse';

export interface PasteParseResult {
  ingredients: Ingredient[];
  steps: Step[];
  variables: Record<string, VariableValue>;
  unmatchedLines: string[];
}

const SECTION_RE = /^(ingredients|steps|method|directions|instructions)\s*:?\s*$/i;
const STEP_NUMBER_RE = /^(?:step\s+)?(\d+)\s*[.:)]\s*(.*)$/i;
const BULLET_RE = /^[-*•–]\s+/;
const VARIABLE_RE = /^([^:=\-–—]+?)\s*[:=\-–—]\s*(.+)$/;
const UNITS = [
  'g', 'kg', 'mg',
  'ml', 'l',
  'oz', 'lb', 'lbs',
  'cup', 'cups',
  'tsp', 'tbsp',
  'tablespoon', 'tablespoons',
  'teaspoon', 'teaspoons'
];
const UNIT_RE = new RegExp(`^(${UNITS.join('|')})\\b`, 'i');
// Matches a leading amount: numeric, decimal, fraction, mixed fraction, possibly with unit fused (e.g., "500g")
const AMOUNT_PREFIX_RE = /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+\.?\d*))/;

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, '');
}

type Region = 'preamble' | 'ingredients' | 'steps';

function detectRegionSwitch(line: string): Region | null {
  const m = line.match(SECTION_RE);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  if (tag === 'ingredients') return 'ingredients';
  return 'steps';
}

function tryParseIngredient(rawLine: string): Ingredient | null {
  const stripped = rawLine.replace(BULLET_RE, '').trim();
  if (!stripped) return null;
  const amtMatch = stripped.match(AMOUNT_PREFIX_RE);
  if (!amtMatch) {
    // No amount; whole line is name
    return { id: '', amount: '', unit: '', name: stripped };
  }
  const amount = amtMatch[1];
  let rest = stripped.slice(amount.length).trimStart();
  let unit = '';
  const unitMatch = rest.match(UNIT_RE);
  if (unitMatch) {
    unit = unitMatch[1];
    rest = rest.slice(unitMatch[0].length).trimStart();
  }
  const name = rest.trim();
  return { id: '', amount, unit, name };
}

function looksLikeIngredient(line: string): boolean {
  const stripped = line.replace(BULLET_RE, '').trim();
  if (!stripped) return false;
  if (BULLET_RE.test(line)) return true;
  // Has leading amount
  return AMOUNT_PREFIX_RE.test(stripped);
}

function tryParseSectionHeader(line: string, nextLineLooksLikeIngredient: boolean): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (BULLET_RE.test(line)) return null;
  if (AMOUNT_PREFIX_RE.test(trimmed)) return null;
  if (trimmed.length >= 30) return null;
  if (!nextLineLooksLikeIngredient) return null;
  return trimmed;
}

function tryParseVariable(
  line: string,
  schema: VariableSchemaItem[]
): { name: string; value: VariableValue } | null {
  const m = line.match(VARIABLE_RE);
  if (!m) return null;
  const rawName = m[1].trim();
  const rawValue = m[2].trim();
  const norm = normalizeName(rawName);
  const schemaMatch = schema.find(s => normalizeName(s.name) === norm);
  if (!schemaMatch) return null;
  if (schemaMatch.type === 'number') {
    // Strip unit suffix from value before parseAmount (e.g., "75%", "450°F", "2 loaves")
    const numericPart = rawValue.match(/^(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+\.?\d*)/);
    if (!numericPart) return null;
    const n = parseAmount(numericPart[0]);
    if (n === null || !Number.isFinite(n)) return null;
    return { name: schemaMatch.name, value: n };
  }
  return { name: schemaMatch.name, value: rawValue };
}

export function parseRecipePaste(
  input: string,
  schema: VariableSchemaItem[]
): PasteParseResult {
  const lines = input.split(/\r?\n/);
  const result: PasteParseResult = {
    ingredients: [],
    steps: [],
    variables: {},
    unmatchedLines: []
  };

  // Detect whether any region markers are present
  const hasMarker = lines.some(l => detectRegionSwitch(l) !== null);

  let region: Region = 'preamble';
  let currentSection: string | undefined;
  let currentStep: Step | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    // Region switch
    const switched = detectRegionSwitch(line);
    if (switched) {
      region = switched;
      currentSection = undefined;
      currentStep = null;
      continue;
    }

    if (region === 'preamble') {
      // Try variable
      const varMatch = tryParseVariable(line, schema);
      if (varMatch) {
        result.variables[varMatch.name] = varMatch.value;
      } else if (line.match(VARIABLE_RE)) {
        // Looked like a variable but didn't match schema or wasn't numeric
        result.unmatchedLines.push(line);
      } else if (!hasMarker) {
        // Free-form fallback: try ingredient or step
        if (looksLikeIngredient(raw)) {
          const ing = tryParseIngredient(raw);
          if (ing) result.ingredients.push(ing);
        } else {
          result.steps.push({ text: line, uses: [] });
        }
      } else {
        // Markers exist but we're before them; preserve as unmatched
        result.unmatchedLines.push(line);
      }
      continue;
    }

    if (region === 'ingredients') {
      // Try section header (only if not bulleted/amount and next line looks like ingredient)
      const nextLooksIngredient =
        i + 1 < lines.length && looksLikeIngredient(lines[i + 1]);
      const sec = tryParseSectionHeader(raw, nextLooksIngredient);
      if (sec) {
        currentSection = sec;
        continue;
      }
      const ing = tryParseIngredient(raw);
      if (ing) {
        if (currentSection) ing.section = currentSection;
        result.ingredients.push(ing);
      } else {
        result.unmatchedLines.push(line);
      }
      continue;
    }

    if (region === 'steps') {
      const numMatch = line.match(STEP_NUMBER_RE);
      if (numMatch) {
        currentStep = { text: numMatch[2].trim(), uses: [] };
        result.steps.push(currentStep);
      } else if (currentStep) {
        currentStep.text = (currentStep.text + ' ' + line).trim();
      } else {
        result.steps.push({ text: line, uses: [] });
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests, expect PASS.**

Run: `~/.bun/bin/bun test tests/shared/recipe-paste.test.ts 2>&1 | tail -10`
Expected: 16 pass (the 14 cases above plus the two trailing assertions in the section-headers + uses tests count as separate `it()` blocks).

If any fail, debug iteratively. Likely failure modes:
- Section header detection misfires when `nextLooksIngredient` window is wrong.
- Free-form fallback puts ingredient-shaped lines into steps. Check `looksLikeIngredient`.
- Variable normalization collides (e.g., `Bake Temp` matching multiple schema entries). Tests use distinct names to avoid this.

- [ ] **Step 5: Run full unit suite — confirm no regressions.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 prior + 16 new = ~107 pass.

- [ ] **Step 6: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 7 (commit) — SKIP. Controller commits after Task 3.**

---

## Task 2: `PasteRecipeDialog.svelte`

**Files:**
- Create: `src/lib/ui/PasteRecipeDialog.svelte`

- [ ] **Step 1: Create the dialog component.**

Create `src/lib/ui/PasteRecipeDialog.svelte`:

```svelte
<!-- src/lib/ui/PasteRecipeDialog.svelte -->
<script lang="ts">
  import type { VariableSchemaItem } from '$lib/server';
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import { parseRecipePaste, type PasteParseResult } from '$lib/shared/recipe-paste';

  let {
    open = $bindable(false),
    schema,
    formHasContent,
    onApply
  }: {
    open?: boolean;
    schema: VariableSchemaItem[];
    formHasContent: boolean;
    onApply: (result: PasteParseResult, mode: 'append' | 'replace') => void;
  } = $props();

  let pasteText = $state('');
  let parsed = $state<PasteParseResult | null>(null);
  let unmatchedOpen = $state(false);

  $effect(() => {
    if (open) {
      pasteText = '';
      parsed = null;
      unmatchedOpen = false;
    }
  });

  function handleParse() {
    parsed = parseRecipePaste(pasteText, schema);
  }

  function close() {
    open = false;
  }

  function apply(mode: 'append' | 'replace') {
    if (!parsed) return;
    onApply(parsed, mode);
    close();
  }
</script>

<Dialog
  bind:open
  title="Paste Recipe"
  titleId="paste-recipe-dialog-title"
  subtitle="Paste a recipe and we'll fill in what we can."
  class="max-w-2xl"
  onClose={close}
>
  <div class="flex flex-col gap-4" data-testid="paste-recipe-dialog">
    <textarea
      bind:value={pasteText}
      rows="12"
      placeholder="Paste your recipe here…"
      class="border border-drafting bg-canvas px-3 py-2 rounded-sm text-sm font-mono resize-y"
      data-testid="paste-recipe-textarea"
    ></textarea>

    {#if parsed === null}
      <div class="flex justify-end gap-2 pt-2 border-t border-drafting">
        <Button type="button" variant="ghost" onclick={close} data-testid="paste-recipe-cancel-btn">Cancel</Button>
        <Button
          type="button"
          variant={pasteText.trim() ? 'primary' : 'outline'}
          disabled={!pasteText.trim()}
          onclick={handleParse}
          data-testid="paste-recipe-parse-btn"
        >Parse</Button>
      </div>
    {:else}
      <p class="text-sm text-obsidian/70" data-testid="paste-recipe-summary">
        {parsed.ingredients.length} ingredient{parsed.ingredients.length === 1 ? '' : 's'}
        · {parsed.steps.length} step{parsed.steps.length === 1 ? '' : 's'}
        · {Object.keys(parsed.variables).length} variable{Object.keys(parsed.variables).length === 1 ? '' : 's'} filled
      </p>

      {#if parsed.unmatchedLines.length > 0}
        <div class="flex flex-col gap-1 border border-drafting/50 rounded-sm p-2">
          <button
            type="button"
            class="text-left text-xs uppercase tracking-wider text-obsidian/60 hover:text-obsidian"
            onclick={() => unmatchedOpen = !unmatchedOpen}
          >Couldn't categorize ({parsed.unmatchedLines.length}) {unmatchedOpen ? '▼' : '▶'}</button>
          {#if unmatchedOpen}
            <ul class="text-xs text-obsidian/60 font-mono pl-3" data-testid="paste-recipe-unmatched">
              {#each parsed.unmatchedLines as line, i (i)}
                <li>{line}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      <div class="flex justify-end gap-2 pt-2 border-t border-drafting">
        <Button type="button" variant="ghost" onclick={close} data-testid="paste-recipe-cancel-btn">Cancel</Button>
        {#if formHasContent}
          <Button type="button" variant="outline" onclick={() => apply('append')} data-testid="paste-recipe-append-btn">Append</Button>
          <Button type="button" variant="primary" onclick={() => apply('replace')} data-testid="paste-recipe-replace-btn">Replace</Button>
        {:else}
          <Button type="button" variant="primary" onclick={() => apply('replace')} data-testid="paste-recipe-apply-btn">Apply</Button>
        {/if}
      </div>
    {/if}
  </div>
</Dialog>
```

- [ ] **Step 2: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 3 (commit) — SKIP.**

---

## Task 3: Wire `PasteRecipeDialog` into `BatchEditor`

**Files:** Modify `src/lib/ui/BatchEditor.svelte`.

- [ ] **Step 1: Add imports + state + apply function.**

In `src/lib/ui/BatchEditor.svelte`, find the existing imports near the top of `<script lang="ts">`. Add:

```ts
  import PasteRecipeDialog from './PasteRecipeDialog.svelte';
  import type { PasteParseResult } from '$lib/shared/recipe-paste';
```

(Place after the existing primitive imports.)

Then find the existing state declarations (after the `let ingredients = $state(...)` and `let steps = $state(...)` lines). Add:

```ts
  let pasteOpen = $state(false);

  const formHasContent = $derived(
    ingredients.length > 0 ||
    steps.length > 0 ||
    Object.values(variables).some(v => v !== null && v !== undefined && v !== '')
  );

  function applyPaste(result: PasteParseResult, mode: 'append' | 'replace') {
    if (mode === 'replace') {
      ingredients = result.ingredients;
      steps = result.steps;
      variables = { ...variables, ...result.variables };
    } else {
      ingredients = [...ingredients, ...result.ingredients];
      steps = [...steps, ...result.steps];
      for (const [k, v] of Object.entries(result.variables)) {
        const cur = variables[k];
        if (cur === null || cur === undefined || cur === '') {
          variables[k] = v;
        }
      }
    }
  }
```

- [ ] **Step 2: Add the trigger button.**

Find the existing Label field block:

```svelte
  <label class="flex flex-col gap-1 text-sm">
    <span class="text-[11px] uppercase tracking-wider">Label</span>
    <TextInput bind:value={label} required data-testid="batch-label" />
  </label>
```

Insert this BEFORE that label block:

```svelte
  <div class="flex justify-end">
    <Button
      type="button"
      variant="outline"
      size="sm"
      onclick={() => pasteOpen = true}
      data-testid="paste-recipe-btn"
    >Paste Recipe</Button>
  </div>
```

- [ ] **Step 3: Mount the dialog at the bottom of the file.**

At the end of the file (after the form's closing tag), add:

```svelte
<PasteRecipeDialog
  bind:open={pasteOpen}
  schema={recipe.variableSchema}
  {formHasContent}
  onApply={applyPaste}
/>
```

- [ ] **Step 4: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 5: Run E2E suite.**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -10`
Expected: 6 passed. The new feature isn't covered by E2E; existing tests stay green.

- [ ] **Step 6: Run unit suite.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: ~107 pass (91 + 16).

- [ ] **Step 7: Quick dev-server compile check + manual sanity.**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200, no errors. Controller will eyeball the paste flow in a real browser session.

- [ ] **Step 8 (commit) — SKIP. Controller commits.**

---

## Self-review notes

**Spec coverage:**
- Spec §3 parser API → Task 1 Step 3 (signature, return shape).
- Spec §4 heuristic rules (section markers, ingredient lines, sections, steps, variables, free-form fallback, unmatchedLines) → Task 1 Step 1 (tests cover each rule) + Step 3 (implementation).
- Spec §5 dialog UX (textarea, parse, summary, unmatched collapsible, append/replace/cancel/apply) → Task 2 Step 1.
- Spec §6 BatchEditor wiring (trigger button, state, applyPaste, mount) → Task 3 Steps 1-3.
- Spec §7 out of scope (LLM, uses linkage, URL, OCR, etc.) → respected; nothing in plan addresses these.
- Spec §8 testing (≥12 unit cases) → Task 1 Step 1 includes 16 cases.
- Spec §9 risks → tolerated; mitigations in place.

**Placeholder scan:** none. All code blocks are concrete and complete.

**Type consistency:**
- `PasteParseResult` shape used in parser (Task 1), dialog props (Task 2), and apply handler (Task 3).
- `VariableSchemaItem[]` schema prop consistent across all three.
- `Ingredient`, `Step`, `VariableValue` imports use the existing `$lib/server` re-exports.

**Risks during implementation:**
- The `tryParseIngredient` `AMOUNT_PREFIX_RE` ordering is critical: mixed fraction (`\d+\s+\d+/\d+`) must be tried before plain fraction (`\d+/\d+`) before plain number. Already encoded in the alternation order.
- `STEP_NUMBER_RE` uses a non-greedy match for the optional `step ` prefix. `(?:step\s+)?` is non-capturing; the captured group is the trailing text after the number.
- Section-header detection's `nextLooksIngredient` peek uses `lines[i + 1]` which may be blank; the implementation handles that via the inner `looksLikeIngredient` blank check.
- The variable type-skip rule: if the schema is `number` and the value can't be coerced, the variable is dropped AND the line goes to unmatchedLines. The test `skips number-typed variables that do not parse to a number` verifies both halves.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-07-paste-recipe.md`. 3 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
