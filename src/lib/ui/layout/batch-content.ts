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
  // stepObjectDiff collapses similar rem+add pairs into 'mod'; for pairs it
  // doesn't collapse (low similarity), treat them as changes too.
  const sModExplicit = count(stp, 'mod');
  const sAddRaw = count(stp, 'add'), sRemRaw = count(stp, 'rem');
  const sPaired = Math.min(sAddRaw, sRemRaw);
  const sMod = sModExplicit + sPaired;
  const sAdd = sAddRaw - sPaired;
  const sRem = sRemRaw - sPaired;
  const iMod = count(ing, 'mod'), iAdd = count(ing, 'add'), iRem = count(ing, 'rem');
  if (sMod) parts.push(`${pl(sMod, 'step')} changed`);
  if (sAdd) parts.push(`${pl(sAdd, 'step')} added`);
  if (sRem) parts.push(`${pl(sRem, 'step')} removed`);
  if (iMod) parts.push(`${pl(iMod, 'ingredient')} changed`);
  if (iAdd) parts.push(`${pl(iAdd, 'ingredient')} added`);
  if (iRem) parts.push(`${pl(iRem, 'ingredient')} removed`);
  return parts.join(' · ') || 'No changes';
}
