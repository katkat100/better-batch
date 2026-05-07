# Paste Recipe in BatchEditor

**Date:** 2026-05-07
**Status:** Draft, pending implementation plan

## 1. Overview

Add a "Paste Recipe" button to `BatchEditor` that opens a textarea modal. On parse, fill the form's ingredients, steps, and recipe-schema-matched variables from the pasted text using a local heuristic parser. If the form already has content, ask the user whether to Append or Replace; if empty, apply directly.

Single-user, local-first feature: no LLM, no network, no API key. Parser is a pure module with extensive unit tests.

## 2. Architecture

```
src/lib/shared/
  recipe-paste.ts                # NEW — pure parser

tests/shared/
  recipe-paste.test.ts           # NEW — TDD coverage

src/lib/ui/
  PasteRecipeDialog.svelte       # NEW — modal: textarea + parse + preview + Append/Replace
  BatchEditor.svelte             # MODIFIED — Paste button + dialog mount + apply handler
```

The parser is pure-function, deterministic, and easy to unit-test. The dialog is the integration shell. `BatchEditor` owns the apply logic (append vs replace) so the dialog stays presentation-only.

## 3. Parser API

```ts
// src/lib/shared/recipe-paste.ts
import type { Ingredient, Step, VariableSchemaItem, VariableValue } from '$lib/server';

export interface PasteParseResult {
  ingredients: Ingredient[];   // amount/unit/name/section. id = '' (recipient assigns)
  steps: Step[];               // each: { text, uses: [] }
  variables: Record<string, VariableValue>;  // only schema-matched names
  unmatchedLines: string[];    // lines we couldn't categorize
}

export function parseRecipePaste(input: string, schema: VariableSchemaItem[]): PasteParseResult;
```

Pure: no I/O, no DOM, no globals. Returns a fresh object per call.

## 4. Heuristic rules

### Section markers (mode switches)

Lines matching (case-insensitive, on their own line, ignoring trailing colon):

- `Ingredients`, `Ingredients:` → switch to **ingredients region**.
- `Steps`, `Method`, `Directions`, `Instructions` (with optional `:`) → switch to **steps region**.

Lines before the first marker are scanned for variables (and may contain ingredient-shaped lines if no header is found at all — see §4.4 fallback).

### Ingredient lines (in ingredients region OR free-form fallback)

Strip leading bullet markers: `-`, `*`, `•`, `–`.

Match `<amount> <unit?> <name>` using:
- Amount: numeric, decimal, or fraction (e.g. `1/2`) — leverage the existing `parseAmount` helper from `src/lib/ui/layout/amount-parse.ts`. The amount portion captured is preserved verbatim as a string in `Ingredient.amount` (matches existing field shape — free-form text).
- Unit allow-list: `g`, `kg`, `ml`, `l`, `oz`, `lb`, `lbs`, `cup`, `cups`, `tsp`, `tbsp`, `tablespoon`, `tablespoons`, `teaspoon`, `teaspoons`. Captured in `Ingredient.unit`.
- Name: rest of the line after amount/unit.

If the line has no recognizable amount, store it whole as `name` with empty `amount` and `unit` — still becomes an ingredient.

### Section headers within ingredients

Inside the ingredients region: a line that has no bullet, has no amount-like prefix, is short (< 30 chars), and is followed by at least one ingredient-shaped line is treated as a section header (e.g., `Levain`, `Final Dough`). The next ingredients get `section: <that header>`. Section persists until the next section header or the end of the ingredients region.

### Step lines (in steps region)

A line starting with `1.`, `1)`, `Step 1:`, or any `\d+[.):]?` prefix opens a new step. Subsequent non-numbered, non-blank lines until the next numbered line or end-of-region are concatenated to the current step's `text` (joined with a single space, trimmed).

If no numbered lines but the steps region exists, treat each non-blank line as a separate step.

Each parsed step has `uses: []` (linkage is out of scope).

### Variables (before first section marker)

Match `<Name>[:|=|-|–|—]\s*<value>` patterns. Normalize `<Name>` to lowercase with `_`/space-stripped (e.g. `Bake Temp` → `baketemp`). Match against each `schema[i].name` after the same normalization. On match:

- If `schema[i].type === 'number'`, run `parseAmount` on `<value>`; if it returns a finite number, use that; else skip (don't fall back to string for number-typed variables).
- Else (`text`), use `<value>` trimmed as the string.

Only schema-matched variables appear in the result. Unmatched `Name: value` lines go to `unmatchedLines`.

### Free-form fallback (no Ingredients/Steps markers)

If neither section marker appears in the input, scan every non-blank line:

- If it has a leading bullet OR matches the `<amount> <unit?> <name>` shape → ingredient.
- Else → step (one per line).

This handles paste blobs without explicit section structure.

### `unmatchedLines`

Collects anything that wasn't placed into ingredients/steps/variables. Shown to the user as "Couldn't categorize."

## 5. Dialog UX (`PasteRecipeDialog.svelte`)

Props:
```ts
{
  open: boolean (bindable),
  schema: VariableSchemaItem[],
  formHasContent: boolean,
  onApply: (result: PasteParseResult, mode: 'append' | 'replace') => void
}
```

Layout:
1. Header: `Paste Recipe`. Subtitle: `Paste a recipe and we'll fill in what we can.`
2. Body: a large `<textarea rows="12">` for the paste, `placeholder="Paste your recipe here…"`.
3. Below the textarea: a `Parse` button.
4. After Parse, show:
   - Summary line: `<N> ingredients · <M> steps · <V> variables filled` (where V is the count of `Object.keys(result.variables).length`).
   - If `result.unmatchedLines.length > 0`: a collapsible `Couldn't categorize (N)` block listing the lines.
5. Action buttons (after a successful parse):
   - If `formHasContent`: `Append` / `Replace` / `Cancel`.
   - Else: `Apply` / `Cancel`.

Uses the existing `Dialog` and `Button` primitives.

`data-testid` attributes:
- `paste-recipe-dialog`, `paste-recipe-textarea`, `paste-recipe-parse-btn`
- `paste-recipe-summary`, `paste-recipe-unmatched`
- `paste-recipe-append-btn`, `paste-recipe-replace-btn`, `paste-recipe-apply-btn`, `paste-recipe-cancel-btn`

## 6. BatchEditor wiring

Add a "Paste Recipe" trigger button at the top of the form, above the Label field.

```svelte
<Button
  type="button"
  variant="outline"
  size="sm"
  onclick={() => pasteOpen = true}
  data-testid="paste-recipe-btn"
>Paste Recipe</Button>
```

State:
```ts
let pasteOpen = $state(false);

const formHasContent = $derived(
  ingredients.length > 0 ||
  steps.length > 0 ||
  Object.values(variables).some(v => v !== null && v !== '' && v !== undefined)
);

function applyPaste(result: PasteParseResult, mode: 'append' | 'replace') {
  if (mode === 'replace') {
    ingredients = result.ingredients;
    steps = result.steps;
    variables = { ...variables, ...result.variables };
  } else {
    // append
    ingredients = [...ingredients, ...result.ingredients];
    steps = [...steps, ...result.steps];
    for (const [k, v] of Object.entries(result.variables)) {
      const cur = variables[k];
      if (cur === null || cur === undefined || cur === '') {
        variables[k] = v;
      }
    }
  }
  pasteOpen = false;
}
```

Mount the dialog (after the existing `<form>` or as a sibling at the bottom of the file):
```svelte
<PasteRecipeDialog
  bind:open={pasteOpen}
  schema={recipe.variableSchema}
  formHasContent={formHasContent}
  onApply={applyPaste}
/>
```

## 7. Out of scope

- LLM-based parsing.
- Step-to-ingredient `uses` linkage detection (manual after paste).
- URL paste / web scraping.
- Image / OCR.
- Markdown or structured JSON formats.
- Unit conversion or normalization.
- Persisting paste templates.

## 8. Testing

### Unit tests (TDD)

Cover the parser thoroughly. Required cases (≥12):

1. **Standard format with headers and bullets** — `Ingredients:\n- 500g flour\n- 100g water\n\nSteps:\n1. Mix\n2. Bake`.
2. **No bullets, headers present** — `Ingredients:\n500g flour\n100g water\nSteps:\n1. Mix`.
3. **Free-form, no headers** — recipe text with mixed ingredients and steps; ingredient-shaped lines go to ingredients, others to steps.
4. **Section headers within ingredients** — `Levain` and `Final Dough` blocks. Resulting ingredients have correct `section`.
5. **Multi-line steps** — `1. Mix the flour\nand water\nthoroughly\n2. Knead.` — first step's text contains all three lines joined.
6. **Variables matched against schema** — `Hydration: 75%` → variables.hydration = 75 if schema type is number; `Bake Temp = 450°F` → variables.bake_temp = 450 with name normalization.
7. **Variables non-numeric for number-typed schema** — `Hydration: high` → not in result.variables (skipped); should land in unmatchedLines.
8. **Variables for non-existent schema names** — `Stirring: vigorously` with no schema match → unmatchedLines.
9. **Empty input** — returns `{ ingredients: [], steps: [], variables: {}, unmatchedLines: [] }`.
10. **Pure junk** — random prose with no recognizable structure → all lines in unmatchedLines.
11. **Different bullet markers** — `-`, `*`, `•`, `–` — all stripped.
12. **Numbered step variants** — `1.`, `1)`, `Step 1:` all open new steps.
13. **Fraction amounts** — `1/2 tsp salt` parses correctly via `parseAmount`.
14. **No amount, just name** — `salt to taste` becomes ingredient with empty amount/unit, name="salt to taste".

### E2E

Optional, not strictly required. The dialog UX is straightforward and integration is mostly state shuffling. Pasting a recipe end-to-end can be a manual visual check.

### Stable counts

`~/.bun/bin/bun test` should grow to roughly 91 + ~14 = 105 pass. svelte-check 0/0. E2E 6/6 unchanged.

## 9. Risks

- **Heuristic limits:** real-world recipes vary wildly; a non-trivial fraction won't parse cleanly. Mitigation: `unmatchedLines` is the user's safety net, plus the Append flow lets them top up after a partial parse.
- **Variable name normalization edge cases:** schemas with names like `pH` or `°F` get edge cases. Acceptable; unmatched goes to unmatchedLines.
- **Existing `parseAmount` semantics:** the parser depends on `parseAmount` from `src/lib/ui/layout/amount-parse.ts`. Re-using existing logic is good, but if `parseAmount` rejects something the heuristic expected to accept, the ingredient becomes nameless. Mitigation: tests cover the common paste patterns.
- **Append's "is this slot empty" check on variables:** uses `null`/`undefined`/`''`. A user-entered `0` would be considered "set" and not overwritten. That's correct semantics — `0` is a valid value the user typed.
