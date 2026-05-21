import './setup';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deleteDB } from 'idb';
import {
  createBatch,
  readBatch,
  updateBatch,
  deleteBatch,
  listBatches
} from '../../src/lib/data/batches';
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

describe('batches data layer', () => {
  it('creates a batch with auto-versioned id under the recipe scope', async () => {
    const b = await createBatch('r1', {
      label: 'first',
      parentIds: [],
      status: 'draft',
      variables: {},
      ingredients: [],
      steps: []
    });
    expect(b.id.startsWith('v1-')).toBe(true);
    expect(b.recipeId).toBe('r1');
    expect(b.status).toBe('draft');
  });

  it('disambiguates batch id when an earlier v1 already exists for that recipe', async () => {
    await createBatch('r1', { label: 'first', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const second = await createBatch('r1', { label: 'second', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    expect(second.id.startsWith('v2-')).toBe(true);
  });

  it('listBatches returns only batches for the given recipe', async () => {
    await createBatch('r1', { label: 'a', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    await createBatch('r2', { label: 'b', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const r1Batches = await listBatches('r1');
    expect(r1Batches.length).toBe(1);
    expect(r1Batches[0].recipeId).toBe('r1');
  });

  it('does not persist inconsistencyNote when input is empty or falsy', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      inconsistencyNote: ''
    });
    expect(b.inconsistencyNote).toBeUndefined();
  });

  it('persists inconsistencyNote when input is non-empty', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      inconsistencyNote: 'garnish-style'
    });
    expect(b.inconsistencyNote).toBe('garnish-style');
  });

  it('does not persist cookMultiplier when input is 1', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 1
    });
    expect(b.cookMultiplier).toBeUndefined();
  });

  it('persists cookMultiplier when input > 1', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 2
    });
    expect(b.cookMultiplier).toBe(2);
  });

  it('updateBatch drops inconsistencyNote on falsy patch value', async () => {
    const created = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      inconsistencyNote: 'kept'
    });
    const updated = await updateBatch('r1', created.id, { inconsistencyNote: '' });
    expect(updated.inconsistencyNote).toBeUndefined();
  });

  it('updateBatch drops cookMultiplier on patch value 1', async () => {
    const created = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 2
    });
    const updated = await updateBatch('r1', created.id, { cookMultiplier: 1 });
    expect(updated.cookMultiplier).toBeUndefined();
  });

  it('persists cookMultiplier when input is 0.5', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 0.5
    });
    expect(b.cookMultiplier).toBe(0.5);
  });

  it('persists cookMultiplier when input is 0.75', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 0.75
    });
    expect(b.cookMultiplier).toBe(0.75);
  });

  it('updateBatch persists cookMultiplier when patch value is 0.5', async () => {
    const created = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 2
    });
    const updated = await updateBatch('r1', created.id, { cookMultiplier: 0.5 });
    expect(updated.cookMultiplier).toBe(0.5);
  });

  it('deleteBatch removes the record', async () => {
    const b = await createBatch('r1', { label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    await deleteBatch('r1', b.id);
    expect(await readBatch('r1', b.id)).toBeNull();
  });

  it('readBatch returns null for a missing batch', async () => {
    expect(await readBatch('r1', 'nope')).toBeNull();
  });
});
