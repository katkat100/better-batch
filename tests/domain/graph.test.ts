import { describe, it, expect } from 'bun:test';
import { childrenOf, ancestorsOf, rootBatches, isMerge } from '../../src/lib/server/domain/graph';
import type { Batch } from '../../src/lib/server/domain/types';

const mk = (id: string, parentIds: string[]): Batch => ({
  id, recipeId: 'r', label: id, parentIds,
  status: 'draft', cookedAt: null, variables: {}, ingredients: [], steps: [], outcomeNotes: '', rating: null,
  createdAt: '2026-01-01T00:00:00Z'
});

describe('graph', () => {
  const batches = [
    mk('v1', []),
    mk('v2', ['v1']),
    mk('v3a', ['v2']),
    mk('v3b', ['v2']),
    mk('v4', ['v3a', 'v3b'])
  ];

  it('rootBatches returns batches with no parents', () => {
    expect(rootBatches(batches).map(b => b.id)).toEqual(['v1']);
  });

  it('childrenOf returns direct children', () => {
    expect(childrenOf(batches, 'v2').map(b => b.id).sort()).toEqual(['v3a', 'v3b']);
    expect(childrenOf(batches, 'v4')).toEqual([]);
  });

  it('ancestorsOf returns transitive ancestors (excluding self)', () => {
    const a = ancestorsOf(batches, 'v4').map(b => b.id).sort();
    expect(a).toEqual(['v1', 'v2', 'v3a', 'v3b']);
  });

  it('isMerge detects 2+ parents', () => {
    expect(isMerge(batches[0])).toBe(false);
    expect(isMerge(batches[4])).toBe(true);
  });
});
