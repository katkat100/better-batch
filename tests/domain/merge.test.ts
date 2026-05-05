import { describe, it, expect } from 'bun:test';
import { resolveMerge } from '../../src/lib/server/domain/merge';
import type { Batch } from '../../src/lib/server/domain/types';

const a: Batch = {
  id: 'v4a', recipeId: 'r', label: 'a', parentIds: ['v3'], status: 'cooked', cookedAt: null,
  variables: { hydration: 72, bulk: 5 }, ingredients: [{ id: 'flour', name: 'flour', amount: '500', unit: 'g' }],
  steps: [{ text: 'mix', uses: [] }, { text: 'bake', uses: [] }], outcomeNotes: '', rating: null, createdAt: '2026-01-01'
};
const b: Batch = {
  ...a, id: 'v4b', label: 'b', variables: { hydration: 75, bulk: 4 },
  ingredients: [{ id: 'flour', name: 'flour', amount: '500', unit: 'g' }, { id: 'salt', name: 'salt', amount: '10', unit: 'g' }],
  steps: [{ text: 'mix', uses: [] }, { text: 'rise', uses: [] }, { text: 'bake', uses: [] }]
};

describe('resolveMerge', () => {
  it('applies variable picks per field', () => {
    const result = resolveMerge(a, b, {
      variables: { hydration: { from: 'b' }, bulk: { from: 'a' } },
      ingredients: { from: 'b' },
      steps: { from: 'b' }
    });
    expect(result.variables.hydration).toBe(75);
    expect(result.variables.bulk).toBe(5);
    expect(result.ingredients.length).toBe(2);
    expect(result.steps).toEqual([{ text: 'mix', uses: [] }, { text: 'rise', uses: [] }, { text: 'bake', uses: [] }]);
  });

  it('supports custom variable values', () => {
    const result = resolveMerge(a, b, {
      variables: { hydration: { from: 'custom', value: 80 }, bulk: { from: 'a' } },
      ingredients: { from: 'a' }, steps: { from: 'a' }
    });
    expect(result.variables.hydration).toBe(80);
  });
});
