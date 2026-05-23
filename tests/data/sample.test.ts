import './setup';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deleteDB } from 'idb';
import { loadSampleRecipe } from '../../src/lib/data/sample';
import { api } from '../../src/lib/ui/api-client';
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

describe('loadSampleRecipe', () => {
  it('creates the Weekly Focaccia recipe with the bread preset schema', async () => {
    const id = await loadSampleRecipe();
    const { recipe } = await api.getRecipe(id);
    expect(recipe.name).toBe('Weekly Focaccia');
    expect(recipe.variableSchema.map(v => v.name).sort()).toEqual(
      ['bake_temp', 'bulk_ferment', 'hydration', 'yield']
    );
  });

  it('creates three batches: 1 draft, 2 cooked', async () => {
    const id = await loadSampleRecipe();
    const { batches } = await api.getRecipe(id);
    expect(batches.length).toBe(3);
    expect(batches.filter(b => b.status === 'cooked').length).toBe(2);
    expect(batches.filter(b => b.status === 'draft').length).toBe(1);
  });

  it('wires up parent/child lineage from Base to the two children', async () => {
    const id = await loadSampleRecipe();
    const { batches } = await api.getRecipe(id);
    const base = batches.find(b => b.label === 'Base')!;
    const base2 = batches.find(b => b.label === 'Base.2')!;
    const variant = batches.find(b => b.label === 'high-hydration variant')!;
    expect(base).toBeDefined();
    expect(base2).toBeDefined();
    expect(variant).toBeDefined();
    expect(base.parentIds).toEqual([]);
    expect(base2.parentIds).toEqual([base.id]);
    expect(variant.parentIds).toEqual([base.id]);
  });

  it('sets a high-hydration water amount on the variant', async () => {
    const id = await loadSampleRecipe();
    const { batches } = await api.getRecipe(id);
    const variant = batches.find(b => b.label === 'high-hydration variant')!;
    const water = variant.ingredients.find(i => i.name === 'water');
    expect(water).toBeDefined();
    expect(water!.amount).toBe('400');
  });
});
