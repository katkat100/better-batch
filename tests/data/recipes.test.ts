import './setup';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createRecipe,
  readRecipe,
  updateRecipe,
  deleteRecipe,
  listRecipes
} from '../../src/lib/data/recipes';
import { _resetDbForTests, openDb } from '../../src/lib/data/db';

let lastDb: Awaited<ReturnType<typeof openDb>> | null = null;

beforeEach(async () => {
  if (lastDb) {
    lastDb.close();
    lastDb = null;
  }
  _resetDbForTests();
  indexedDB.deleteDatabase('better-batch');
});

afterEach(() => {
  if (lastDb) {
    lastDb.close();
    lastDb = null;
  }
});

describe('recipes data layer', () => {
  it('creates a recipe and assigns a slugged id', async () => {
    const recipe = await createRecipe({
      name: 'Snickerdoodles',
      preset: 'custom',
      tags: ['cookie'],
      description: ''
    });
    lastDb = await openDb();
    expect(recipe.id).toBe('snickerdoodles');
    expect(recipe.name).toBe('Snickerdoodles');
    expect(recipe.preset).toBe('custom');
    expect(recipe.tags).toEqual(['cookie']);
    expect(typeof recipe.createdAt).toBe('string');
  });

  it('disambiguates id when slug is already taken', async () => {
    await createRecipe({ name: 'Bread', preset: 'bread', tags: [], description: '' });
    const second = await createRecipe({ name: 'Bread', preset: 'bread', tags: [], description: '' });
    lastDb = await openDb();
    expect(second.id).toBe('bread-2');
  });

  it('reads a recipe by id', async () => {
    await createRecipe({ name: 'Sauce', preset: 'sauce', tags: [], description: '' });
    const got = await readRecipe('sauce');
    lastDb = await openDb();
    expect(got?.name).toBe('Sauce');
  });

  it('returns null when reading a missing recipe', async () => {
    const got = await readRecipe('does-not-exist');
    lastDb = await openDb();
    expect(got).toBeNull();
  });

  it('updates a recipe by merging patch fields', async () => {
    await createRecipe({ name: 'Sauce', preset: 'sauce', tags: [], description: '' });
    const updated = await updateRecipe('sauce', { description: 'spicy' });
    lastDb = await openDb();
    expect(updated.description).toBe('spicy');
    expect(updated.id).toBe('sauce');  // id immutable
  });

  it('throws when updating a missing recipe', async () => {
    lastDb = await openDb();
    await expect(updateRecipe('ghost', { description: 'x' })).rejects.toThrow();
  });

  it('lists all recipes', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [], description: '' });
    await createRecipe({ name: 'B', preset: 'custom', tags: [], description: '' });
    const all = await listRecipes();
    lastDb = await openDb();
    expect(all.length).toBe(2);
    expect(all.map(r => r.id).sort()).toEqual(['a', 'b']);
  });

  it('deletes a recipe', async () => {
    await createRecipe({ name: 'Bye', preset: 'custom', tags: [], description: '' });
    await deleteRecipe('bye');
    const gone = await readRecipe('bye');
    lastDb = await openDb();
    expect(gone).toBeNull();
  });
});
