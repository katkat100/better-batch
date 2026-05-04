import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { createRecipe } from '../../src/lib/server/storage/recipes';
import { createBatch, updateBatch } from '../../src/lib/server/storage/batches';
import { rebuildIndex, readIndex } from '../../src/lib/server/storage/index-cache';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-idx-')); setDataDirForTest(dir); });
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

describe('index cache', () => {
  it('rebuilds with batch counts and last-cooked dates', async () => {
    const r = await createRecipe({ name: 'X', preset: 'bread', tags: ['bread'] });
    const v1 = await createBatch(r.id, { label: 'v1', parentIds: [], status: 'draft', variables: { hydration: 70 }, ingredients: [], steps: [] });
    await updateBatch(r.id, v1.id, { status: 'cooked', cookedAt: '2026-04-01T00:00:00Z' });
    await createBatch(r.id, { label: 'v2', parentIds: [v1.id], status: 'draft', variables: { hydration: 75 }, ingredients: [], steps: [] });

    await rebuildIndex();
    const idx = await readIndex();
    expect(idx).toHaveLength(1);
    expect(idx[0].batchCount).toBe(2);
    expect(idx[0].lastCookedAt).toBe('2026-04-01T00:00:00Z');
    expect(idx[0].sparklineVariable).toBe('hydration');
    expect(idx[0].sparklineValues).toEqual([70, 75]);
  });
});
