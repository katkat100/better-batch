import './setup';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deleteDB } from 'idb';
import { openDb, _resetDbForTests } from '../../src/lib/data/db';

let lastDb: Awaited<ReturnType<typeof openDb>> | null = null;

beforeEach(async () => {
  if (lastDb) {
    lastDb.close();
    lastDb = null;
  }
  _resetDbForTests();
  await deleteDB('better-batch');
});

afterEach(() => {
  if (lastDb) {
    lastDb.close();
    lastDb = null;
  }
});

describe('openDb', () => {
  it('creates all three object stores on first open', async () => {
    lastDb = await openDb();
    expect([...lastDb.objectStoreNames].sort()).toEqual(['batches', 'index', 'recipes']);
  });

  it('declares the byRecipe index on the batches store', async () => {
    lastDb = await openDb();
    const tx = lastDb.transaction('batches', 'readonly');
    const indexNames = [...tx.store.indexNames];
    expect(indexNames).toContain('byRecipe');
  });

  it('returns the same promise across calls (caches connection)', async () => {
    const a = openDb();
    const b = openDb();
    expect(a).toBe(b);
    lastDb = await a;
  });
});
