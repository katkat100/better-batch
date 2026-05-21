import type { Batch } from '../data/types';
import { parseAmount } from '../ui/layout/amount-parse';

export interface IngredientIssue {
  kind: 'unreferenced' | 'sum-mismatch' | 'orphan-use';
  ingredientId: string;
  ingredientName: string;
  sum?: number;
  master?: number;
  unit?: string;
  stepIndex?: number;  // populated only for orphan-use
}

export function validateBatch(batch: Batch): IngredientIssue[] {
  const ingredientIndex = new Map(batch.ingredients.map((ing, idx) => [ing.id, idx]));
  const sums = new Map<string, number>();
  const refCounts = new Map<string, number>();
  const orphanIssues: IngredientIssue[] = [];

  for (let stepIdx = 0; stepIdx < batch.steps.length; stepIdx++) {
    const step = batch.steps[stepIdx];
    for (const use of step.uses) {
      if (!ingredientIndex.has(use.ingredientId)) {
        orphanIssues.push({
          kind: 'orphan-use',
          ingredientId: use.ingredientId,
          ingredientName: '',
          stepIndex: stepIdx
        });
        continue;
      }
      sums.set(use.ingredientId, (sums.get(use.ingredientId) ?? 0) + use.amount);
      refCounts.set(use.ingredientId, (refCounts.get(use.ingredientId) ?? 0) + 1);
    }
  }

  const ingredientIssues: IngredientIssue[] = [];
  for (const ing of batch.ingredients) {
    const refs = refCounts.get(ing.id) ?? 0;
    if (refs === 0) {
      ingredientIssues.push({ kind: 'unreferenced', ingredientId: ing.id, ingredientName: ing.name });
    }
    const master = parseAmount(ing.amount);
    if (master !== null) {
      const sum = sums.get(ing.id) ?? 0;
      if (sum !== master) {
        ingredientIssues.push({
          kind: 'sum-mismatch',
          ingredientId: ing.id,
          ingredientName: ing.name,
          sum,
          master,
          unit: ing.unit
        });
      }
    }
  }

  return [...ingredientIssues, ...orphanIssues];
}
