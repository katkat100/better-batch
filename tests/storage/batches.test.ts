import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { createRecipe } from '../../src/lib/server/storage/recipes';
import { createBatch, readBatch, listBatches, updateBatch, deleteBatch } from '../../src/lib/server/storage/batches';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-bat-')); setDataDirForTest(dir); });
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

describe('batch storage', () => {
  it('creates a root batch (no parents)', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const b = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    expect(b.id).toMatch(/^v1/);
    expect(b.parentIds).toEqual([]);
  });

  it('creates a child batch and lists batches', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const v1 = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const v2 = await createBatch(r.id, { label: 'tweak', parentIds: [v1.id], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const all = await listBatches(r.id);
    expect(all.map(b => b.id).sort()).toEqual([v1.id, v2.id].sort());
    expect(v2.parentIds).toEqual([v1.id]);
  });

  it('disambiguates duplicate batch labels', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const a = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const b = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    expect(a.id).not.toBe(b.id);
  });

  it('updates and deletes', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const b = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const u = await updateBatch(r.id, b.id, { status: 'cooked', cookedAt: new Date().toISOString(), rating: 4 });
    expect(u.status).toBe('cooked');
    expect(u.rating).toBe(4);
    await deleteBatch(r.id, b.id);
    await expect(readBatch(r.id, b.id)).rejects.toThrow();
  });
});
