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

  it('migrates legacy ingredients (no id, no section) on read', async () => {
    const r = await createRecipe({ name: 'Legacy', preset: 'custom', tags: [] });
    // Hand-write a legacy-shape batch file
    const { writeFileAtomic } = await import('../../src/lib/server/storage/atomic');
    const { batchFile, batchesDir } = await import('../../src/lib/server/storage/paths');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(await batchesDir(r.id), { recursive: true });
    const legacy = {
      id: 'v1-legacy', recipeId: r.id, label: 'legacy', parentIds: [],
      status: 'draft', cookedAt: null,
      variables: {},
      ingredients: [
        { name: 'Flour', amount: '500', unit: 'g' },
        { name: 'Flour', amount: '100', unit: 'g' }, // duplicate name
        { name: 'Salt', amount: '10', unit: 'g' }
      ],
      steps: ['Mix flour and water', 'Bake'],
      outcomeNotes: '', rating: null,
      createdAt: '2026-01-01T00:00:00Z'
    };
    await writeFileAtomic(await batchFile(r.id, 'v1-legacy'), JSON.stringify(legacy, null, 2));

    const { readBatch } = await import('../../src/lib/server/storage/batches');
    const back = await readBatch(r.id, 'v1-legacy');

    // Ingredients have stable, unique ids
    expect(back.ingredients[0].id).toBe('flour');
    expect(back.ingredients[1].id).toBe('flour-2');
    expect(back.ingredients[2].id).toBe('salt');
    // Section is undefined when missing
    expect(back.ingredients[0].section).toBeUndefined();
    // Steps migrated to objects
    expect(back.steps).toEqual([
      { text: 'Mix flour and water', uses: [] },
      { text: 'Bake', uses: [] }
    ]);
  });

  it('migration is idempotent (read → write → read produces identical structure)', async () => {
    const r = await createRecipe({ name: 'Idempotent', preset: 'custom', tags: [] });
    const b = await createBatch(r.id, {
      label: 'v1',
      parentIds: [],
      status: 'draft',
      variables: {},
      ingredients: [
        { id: 'flour', name: 'Flour', amount: '500', unit: 'g', section: 'Final Dough' }
      ],
      steps: [{ text: 'Mix', uses: [{ ingredientId: 'flour', amount: 250 }] }],
    });
    const first = await readBatch(r.id, b.id);
    await updateBatch(r.id, b.id, {});
    const second = await readBatch(r.id, b.id);
    expect(second).toEqual(first);
  });
});
