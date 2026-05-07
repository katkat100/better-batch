import type { VariableSchemaItem, VariableValue, Ingredient, Step } from './types';

export interface VariableDiffRow {
  name: string;
  unit: string;
  type: 'number' | 'text';
  a: VariableValue;
  b: VariableValue;
  delta: number | null;       // numeric only; null if either side null or non-numeric
  changed: boolean;
}

export function variableDiff(
  schema: VariableSchemaItem[],
  a: Record<string, VariableValue>,
  b: Record<string, VariableValue>
): VariableDiffRow[] {
  return schema.map(item => {
    const av = a[item.name] ?? null;
    const bv = b[item.name] ?? null;
    let delta: number | null = null;
    if (item.type === 'number' && typeof av === 'number' && typeof bv === 'number') {
      delta = bv - av;
    }
    return { name: item.name, unit: item.unit, type: item.type, a: av, b: bv, delta, changed: av !== bv };
  });
}

type DiffOp = 'ctx' | 'add' | 'rem';
export interface DiffLine { op: DiffOp; text: string; }

export function textArrayDiff(a: string[], b: string[]): DiffLine[] {
  // Classic LCS, then walk back to produce edit script.
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  const out: DiffLine[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { out.push({ op: 'ctx', text: a[i - 1] }); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) { out.push({ op: 'rem', text: a[i - 1] }); i--; }
    else { out.push({ op: 'add', text: b[j - 1] }); j--; }
  }
  while (i > 0) { out.push({ op: 'rem', text: a[i - 1] }); i--; }
  while (j > 0) { out.push({ op: 'add', text: b[j - 1] }); j--; }
  return out.reverse();
}

type IngredientDiffOp = 'ctx' | 'add' | 'rem' | 'mod';
export interface IngredientDiffRow {
  op: IngredientDiffOp;
  a?: Ingredient;
  b?: Ingredient;
}

function ingredientsEqual(a: Ingredient, b: Ingredient): boolean {
  return a.name === b.name
    && a.amount === b.amount
    && a.unit === b.unit
    && (a.section ?? '') === (b.section ?? '');
}

export function ingredientDiff(a: Ingredient[], b: Ingredient[]): IngredientDiffRow[] {
  const bById = new Map(b.map(ing => [ing.id, ing] as const));
  const seenInB = new Set<string>();
  const rows: IngredientDiffRow[] = [];
  for (const ai of a) {
    const bi = bById.get(ai.id);
    if (!bi) {
      rows.push({ op: 'rem', a: ai });
    } else {
      seenInB.add(ai.id);
      if (ingredientsEqual(ai, bi)) rows.push({ op: 'ctx', a: ai, b: bi });
      else rows.push({ op: 'mod', a: ai, b: bi });
    }
  }
  for (const bi of b) {
    if (!seenInB.has(bi.id)) rows.push({ op: 'add', b: bi });
  }
  return rows;
}

export function stepTextDiff(a: Step[], b: Step[]): DiffLine[] {
  return textArrayDiff(a.map(s => s.text), b.map(s => s.text));
}

export type StepObjectDiffRow =
  | { op: 'ctx'; step: Step }
  | { op: 'add'; step: Step }
  | { op: 'rem'; step: Step }
  | { op: 'mod'; a: Step; b: Step };

const STEP_SIMILARITY_THRESHOLD = 0.5;

function levenshtein(a: string, b: string): number {
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev: number[] = new Array(m + 1);
  let curr: number[] = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export function stepObjectDiff(a: Step[], b: Step[]): StepObjectDiffRow[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1].text === b[j - 1].text
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const raw: StepObjectDiffRow[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1].text === b[j - 1].text) { raw.push({ op: 'ctx', step: a[i - 1] }); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) { raw.push({ op: 'rem', step: a[i - 1] }); i--; }
    else { raw.push({ op: 'add', step: b[j - 1] }); j--; }
  }
  while (i > 0) { raw.push({ op: 'rem', step: a[i - 1] }); i--; }
  while (j > 0) { raw.push({ op: 'add', step: b[j - 1] }); j--; }
  raw.reverse();

  // Post-LCS: collapse adjacent rem+add (or add+rem) whose texts are similar
  // into a single `mod` row — catches edits where a step was rephrased.
  const out: StepObjectDiffRow[] = [];
  let k = 0;
  while (k < raw.length) {
    const cur = raw[k];
    const next = raw[k + 1];
    if (next && cur.op === 'rem' && next.op === 'add' &&
        similarity(cur.step.text, next.step.text) >= STEP_SIMILARITY_THRESHOLD) {
      out.push({ op: 'mod', a: cur.step, b: next.step });
      k += 2;
    } else if (next && cur.op === 'add' && next.op === 'rem' &&
               similarity(cur.step.text, next.step.text) >= STEP_SIMILARITY_THRESHOLD) {
      out.push({ op: 'mod', a: next.step, b: cur.step });
      k += 2;
    } else {
      out.push(cur);
      k++;
    }
  }
  return out;
}
