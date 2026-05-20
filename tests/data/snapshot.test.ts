import './setup';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deleteDB } from 'idb';
import { dumpAllData, parseSnapshot, wipeAndReseed, exportSnapshot, importSnapshot } from '../../src/lib/data/snapshot';
import { createRecipe } from '../../src/lib/data/recipes';
import { createBatch } from '../../src/lib/data/batches';
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

describe('snapshot', () => {
  it('dumpAllData returns recipes + batches from IDB', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [], description: '' });
    await createBatch('a', { label: '1', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const dump = await dumpAllData();
    expect(dump.recipes.length).toBe(1);
    expect(dump.batches.length).toBe(1);
    expect(Array.isArray(dump.index)).toBe(true);
  });

  it('parseSnapshot accepts valid input', () => {
    const parsed = parseSnapshot(JSON.stringify({ recipes: [], batches: [], index: [] }));
    expect(parsed.recipes).toEqual([]);
    expect(parsed.batches).toEqual([]);
    expect(parsed.index).toEqual([]);
  });

  it('parseSnapshot throws on missing arrays', () => {
    expect(() => parseSnapshot('{"recipes": []}')).toThrow();
    expect(() => parseSnapshot('{}')).toThrow();
    expect(() => parseSnapshot('{"recipes": "nope", "batches": [], "index": []}')).toThrow();
  });

  it('parseSnapshot throws on invalid JSON', () => {
    expect(() => parseSnapshot('not json')).toThrow();
  });

  it('wipeAndReseed clears existing data before loading snapshot', async () => {
    await createRecipe({ name: 'Old', preset: 'custom', tags: [], description: '' });
    await wipeAndReseed({
      recipes: [{
        id: 'new', name: 'New', description: '', tags: [], preset: 'custom',
        variableSchema: [], currentBatchId: null,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
      }],
      batches: [],
      index: []
    });
    const dump = await dumpAllData();
    expect(dump.recipes.length).toBe(1);
    expect(dump.recipes[0].id).toBe('new');
  });

  it('exportSnapshot and importSnapshot are exported', () => {
    expect(typeof exportSnapshot).toBe('function');
    expect(typeof importSnapshot).toBe('function');
  });
});
