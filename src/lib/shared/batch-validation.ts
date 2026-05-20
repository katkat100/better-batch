import type { Batch } from '../data/types';
import { parseAmount } from '../ui/layout/amount-parse';

export interface IngredientIssue {
  kind: 'unreferenced' | 'sum-mismatch';
  ingredientId: string;
  ingredientName: string;
  sum?: number;
  master?: number;
  unit?: string;
}

export function validateBatch(batch: Batch): IngredientIssue[] {
  const ingredientIndex = new Map(batch.ingredients.map((ing, idx) => [ing.id, idx]));
  const sums = new Map<string, number>();
  const refCounts = new Map<string, number>();

  for (const step of batch.steps) {
    for (const use of step.uses) {
      if (!ingredientIndex.has(use.ingredientId)) continue;
      sums.set(use.ingredientId, (sums.get(use.ingredientId) ?? 0) + use.amount);
      refCounts.set(use.ingredientId, (refCounts.get(use.ingredientId) ?? 0) + 1);
    }
  }

  const issues: IngredientIssue[] = [];
  for (const ing of batch.ingredients) {
    const refs = refCounts.get(ing.id) ?? 0;
    if (refs === 0) {
      issues.push({ kind: 'unreferenced', ingredientId: ing.id, ingredientName: ing.name });
    }
    const master = parseAmount(ing.amount);
    if (master !== null) {
      const sum = sums.get(ing.id) ?? 0;
      if (sum !== master) {
        issues.push({
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
  return issues;
}
