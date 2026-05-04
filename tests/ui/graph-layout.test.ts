import { describe, it, expect } from 'bun:test';
import { layoutGraph } from '../../src/lib/ui/layout/graph-layout';
import type { Batch } from '../../src/lib/server/domain/types';

const mk = (id: string, parentIds: string[], createdAt = '2026-01-01T00:00:00Z'): Batch => ({
  id, recipeId: 'r', label: id, parentIds,
  status: 'draft', cookedAt: null, variables: {}, ingredients: [], steps: [],
  outcomeNotes: '', rating: null, createdAt
});

describe('layoutGraph', () => {
  it('returns empty layout for empty input', () => {
    const out = layoutGraph([]);
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('places single root at column 0, row 0', () => {
    const out = layoutGraph([mk('v1', [])]);
    expect(out.nodes).toEqual([{ id: 'v1', col: 0, row: 0, x: 0, y: 0 }]);
    expect(out.edges).toEqual([]);
  });

  it('linear chain stacks vertically', () => {
    const out = layoutGraph([mk('v1', []), mk('v2', ['v1']), mk('v3', ['v2'])]);
    expect(out.nodes.map(n => [n.id, n.row])).toEqual([['v1', 0], ['v2', 1], ['v3', 2]]);
    expect(out.nodes.every(n => n.col === 0)).toBe(true);
    expect(out.edges).toEqual([
      { from: 'v1', to: 'v2' },
      { from: 'v2', to: 'v3' }
    ]);
  });

  it('siblings get separate columns', () => {
    const out = layoutGraph([
      mk('v1', []),
      mk('v2a', ['v1'], '2026-01-02T00:00:00Z'),
      mk('v2b', ['v1'], '2026-01-03T00:00:00Z')
    ]);
    const cols = Object.fromEntries(out.nodes.map(n => [n.id, n.col]));
    expect(cols.v2a).not.toBe(cols.v2b);
    expect(out.nodes.find(n => n.id === 'v1')!.row).toBe(0);
    expect(out.nodes.find(n => n.id === 'v2a')!.row).toBe(1);
    expect(out.nodes.find(n => n.id === 'v2b')!.row).toBe(1);
  });

  it('merge node has both parent edges and depth = max(parent depth) + 1', () => {
    const batches = [
      mk('v1', []),
      mk('v2a', ['v1']),
      mk('v2b', ['v1']),
      mk('v3', ['v2a', 'v2b'])
    ];
    const out = layoutGraph(batches);
    const v3 = out.nodes.find(n => n.id === 'v3')!;
    expect(v3.row).toBe(2);
    expect(out.edges).toContainEqual({ from: 'v2a', to: 'v3' });
    expect(out.edges).toContainEqual({ from: 'v2b', to: 'v3' });
  });

  it('returns total width and height in pixels', () => {
    const out = layoutGraph([mk('v1', []), mk('v2', ['v1'])], { colWidth: 60, rowHeight: 50 });
    expect(out.height).toBe(50); // 2 rows → height = (rows - 1) * rowHeight
    expect(out.width).toBe(0); // 1 column → width = (cols - 1) * colWidth
  });
});
