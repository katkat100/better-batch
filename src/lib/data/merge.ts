import type { Batch, Ingredient, Step, VariableValue } from './types';

type FieldSource =
  | { from: 'a' }
  | { from: 'b' }
  | { from: 'custom'; value: unknown };

interface MergePicks {
  variables: Record<string, FieldSource>;
  ingredients: FieldSource;        // pick whole list from a or b (custom = explicit array)
  steps: FieldSource;
}

interface MergeResult {
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
}

function pickValue<T>(a: T, b: T, src: FieldSource): T {
  if (src.from === 'a') return a;
  if (src.from === 'b') return b;
  return src.value as T;
}

export function resolveMerge(a: Batch, b: Batch, picks: MergePicks): MergeResult {
  const variables: Record<string, VariableValue> = {};
  for (const [name, src] of Object.entries(picks.variables)) {
    variables[name] = pickValue(a.variables[name] ?? null, b.variables[name] ?? null, src);
  }
  const ingredients = pickValue(a.ingredients, b.ingredients, picks.ingredients);
  const steps = pickValue(a.steps, b.steps, picks.steps);
  return { variables, ingredients, steps };
}
