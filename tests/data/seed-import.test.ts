import './setup';
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { deleteDB } from 'idb';
import { seedIfEmpty, bulkLoad } from '../../src/lib/data/seed-import';
import { listRecipes } from '../../src/lib/data/recipes';
import { _resetDbForTests, openDb } from '../../src/lib/data/db';

let activeDb: Awaited<ReturnType<typeof openDb>> | null = null;

beforeEach(async () => {
  if (activeDb) { activeDb.close(); activeDb = null; }
  _resetDbForTests();
  await deleteDB('better-batch');
  activeDb = await openDb();
  // Reset the global fetch mock between cases.
  globalThis.fetch = undefined as unknown as typeof fetch;
});

afterEach(() => {
  if (activeDb) { activeDb.close(); activeDb = null; }
});

const SNAPSHOT = {
  recipes: [{
    id: 'a', name: 'A', description: '', tags: [], preset: 'custom' as const,
    variableSchema: [], currentBatchId: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
  }],
  batches: [{
    id: 'v1-x', recipeId: 'a', label: 'x', parentIds: [],
    status: 'draft' as const, cookedAt: null,
    variables: {}, ingredients: [], steps: [],
    outcomeNotes: '', rating: null,
    createdAt: '2026-01-02T00:00:00Z'
  }],
  index: []
};

describe('seed-import', () => {
  it('seedIfEmpty fetches the snapshot and bulk-loads it when IDB is empty', async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => SNAPSHOT
    } as Response)) as unknown as typeof fetch;
    await seedIfEmpty();
    const recipes = await listRecipes();
    expect(recipes.length).toBe(1);
    expect(recipes[0].id).toBe('a');
  });

  it('seedIfEmpty no-ops when IDB already has recipes', async () => {
    const db = await openDb();
    await db.put('recipes', {
      id: 'pre-existing', name: 'P', description: '', tags: [], preset: 'custom',
      variableSchema: [], currentBatchId: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
    });
    let fetchCalled = false;
    globalThis.fetch = mock(async () => { fetchCalled = true; return new Response(); }) as unknown as typeof fetch;
    await seedIfEmpty();
    expect(fetchCalled).toBe(false);
  });

  it('seedIfEmpty silently bails when fetch fails', async () => {
    globalThis.fetch = mock(async () => { throw new Error('network'); }) as unknown as typeof fetch;
    await expect(seedIfEmpty()).resolves.toBeUndefined();
    const recipes = await listRecipes();
    expect(recipes.length).toBe(0);
  });

  it('seedIfEmpty silently bails when endpoint returns non-OK', async () => {
    globalThis.fetch = mock(async () => ({ ok: false, json: async () => ({}) } as Response)) as unknown as typeof fetch;
    await seedIfEmpty();
    const recipes = await listRecipes();
    expect(recipes.length).toBe(0);
  });

  it('bulkLoad inserts recipes, batches, and index in one transaction', async () => {
    await bulkLoad(SNAPSHOT);
    const recipes = await listRecipes();
    expect(recipes.length).toBe(1);
    const db = await openDb();
    const batches = await db.getAll('batches');
    expect(batches.length).toBe(1);
    expect(batches[0].recipeId).toBe('a');
  });
});
