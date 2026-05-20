import './setup';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deleteDB } from 'idb';
import { rebuildIndex, readIndex } from '../../src/lib/data/index-cache';
import { createRecipe } from '../../src/lib/data/recipes';
import { createBatch, updateBatch } from '../../src/lib/data/batches';
import { _resetDbForTests, openDb } from '../../src/lib/data/db';

let activeDb: Awaited<ReturnType<typeof openDb>> | null = null;

beforeEach(async () => {
  if (activeDb) { activeDb.close(); activeDb = null; }
  _resetDbForTests();
  await deleteDB('better-batch');
  activeDb = await openDb();
});

afterEach(() => {
  if (activeDb) { activeDb.close(); activeDb = null; }
});

describe('index cache', () => {
  it('readIndex returns empty array when no recipes exist', async () => {
    expect(await readIndex()).toEqual([]);
  });

  it('rebuildIndex returns one IndexEntry per recipe', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: ['x'], description: '' });
    await createRecipe({ name: 'B', preset: 'custom', tags: [], description: '' });
    const built = await rebuildIndex();
    expect(built.length).toBe(2);
    expect(built.map(e => e.id).sort()).toEqual(['a', 'b']);
  });

  it('rebuildIndex includes batchCount and lastCookedAt', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [], description: '' });
    const draft = await createBatch('a', { label: '1', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    await updateBatch('a', draft.id, { status: 'cooked', cookedAt: '2026-05-01T00:00:00Z' });
    await createBatch('a', { label: '2', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const built = await rebuildIndex();
    const a = built.find(e => e.id === 'a')!;
    expect(a.batchCount).toBe(2);
    expect(a.lastCookedAt).toBe('2026-05-01T00:00:00Z');
  });

  it('readIndex returns the most recent rebuild result', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [], description: '' });
    await rebuildIndex();
    const got = await readIndex();
    expect(got.length).toBe(1);
    expect(got[0].id).toBe('a');
  });

  it('handles recipes with zero batches gracefully', async () => {
    await createRecipe({ name: 'Empty', preset: 'custom', tags: [], description: '' });
    const built = await rebuildIndex();
    const empty = built.find(e => e.id === 'empty')!;
    expect(empty.batchCount).toBe(0);
    expect(empty.lastCookedAt).toBeNull();
    expect(empty.sparklineValues).toEqual([]);
  });
});
