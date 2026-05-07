import { describe, it, expect } from 'bun:test';
import { validateBatch } from '../../src/lib/shared/batch-validation';
import type { Batch } from '../../src/lib/server/domain/types';

const mk = (over: Partial<Batch> = {}): Batch => ({
  id: 'b1', recipeId: 'r1', label: 'b1', parentIds: [],
  status: 'draft', cookedAt: null, variables: {},
  ingredients: [], steps: [], outcomeNotes: '', rating: null,
  createdAt: '2026-05-07T00:00:00Z',
  ...over
});

describe('validateBatch', () => {
  it('empty batch has no issues', () => {
    expect(validateBatch(mk())).toEqual([]);
  });

  it('flags an ingredient that is not referenced in any step', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'salt', name: 'Salt', amount: 'to taste', unit: '' }],
      steps: [{ text: 'Mix', uses: [] }]
    }));
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'unreferenced', ingredientId: 'salt', ingredientName: 'Salt' })
    ]);
  });

  it('passes when sum of uses equals numeric master', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [{ ingredientId: 'flour', amount: 500 }] }]
    }));
    expect(issues).toEqual([]);
  });

  it('flags sum-mismatch when sum < master (under-allocation)', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [{ ingredientId: 'flour', amount: 480 }] }]
    }));
    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'sum-mismatch', ingredientId: 'flour', sum: 480, master: 500, unit: 'g'
      })
    ]);
  });

  it('flags sum-mismatch when sum > master (over-allocation)', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [{ ingredientId: 'flour', amount: 520 }] }]
    }));
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'sum-mismatch', sum: 520, master: 500 })
    ]);
  });

  it('skips math check when master is non-numeric', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'salt', name: 'Salt', amount: 'to taste', unit: '' }],
      steps: [{ text: 'Season', uses: [{ ingredientId: 'salt', amount: 0 }] }]
    }));
    expect(issues).toEqual([]);
  });

  it('still flags unreferenced when master is non-numeric', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'salt', name: 'Salt', amount: 'to taste', unit: '' }],
      steps: [{ text: 'Mix', uses: [] }]
    }));
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'unreferenced', ingredientId: 'salt' })
    ]);
  });

  it('aggregates uses across multiple steps', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [
        { text: 'Pre-ferment', uses: [{ ingredientId: 'flour', amount: 100 }] },
        { text: 'Final dough', uses: [{ ingredientId: 'flour', amount: 400 }] }
      ]
    }));
    expect(issues).toEqual([]);
  });

  it('garnish-style 0 use against numeric master fires sum-mismatch but not unreferenced', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'crisp', name: 'Snowflake crisp', amount: '100', unit: 'g' }],
      steps: [{ text: 'Dust', uses: [{ ingredientId: 'crisp', amount: 0 }] }]
    }));
    expect(issues.map(i => i.kind)).toEqual(['sum-mismatch']);
  });

  it('returns both kinds for one ingredient with unreferenced first', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [] }]
    }));
    expect(issues.map(i => i.kind)).toEqual(['unreferenced', 'sum-mismatch']);
  });

  it('ignores step uses whose ingredientId no longer matches any ingredient', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [
        { ingredientId: 'flour', amount: 500 },
        { ingredientId: 'ghost', amount: 999 }
      ] }]
    }));
    expect(issues).toEqual([]);
  });

  it('orders issues by ingredient list order', () => {
    const issues = validateBatch(mk({
      ingredients: [
        { id: 'a', name: 'A', amount: '100', unit: 'g' },
        { id: 'b', name: 'B', amount: '100', unit: 'g' }
      ],
      steps: [{ text: 'Mix', uses: [
        { ingredientId: 'b', amount: 50 },
        { ingredientId: 'a', amount: 50 }
      ] }]
    }));
    expect(issues.map(i => i.ingredientId)).toEqual(['a', 'b']);
  });
});
