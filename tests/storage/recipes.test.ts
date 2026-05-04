import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { createRecipe, readRecipe, updateRecipe, deleteRecipe, listRecipes } from '../../src/lib/server/storage/recipes';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bb-rec-'));
  setDataDirForTest(dir);
});
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

describe('recipe storage', () => {
  it('creates and reads a recipe', async () => {
    const r = await createRecipe({ name: 'Sourdough Loaf', preset: 'bread', tags: ['bread'] });
    expect(r.id).toBe('sourdough-loaf');
    expect(r.variableSchema.length).toBeGreaterThan(0); // bread preset prefills
    const back = await readRecipe(r.id);
    expect(back.name).toBe('Sourdough Loaf');
  });

  it('disambiguates duplicate names', async () => {
    await createRecipe({ name: 'Chili', preset: 'custom', tags: [] });
    const second = await createRecipe({ name: 'Chili', preset: 'custom', tags: [] });
    expect(second.id).toBe('chili-2');
  });

  it('lists recipes', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [] });
    await createRecipe({ name: 'B', preset: 'custom', tags: [] });
    const all = await listRecipes();
    expect(all.map(r => r.name).sort()).toEqual(['A', 'B']);
  });

  it('updates and deletes', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const u = await updateRecipe(r.id, { description: 'hello' });
    expect(u.description).toBe('hello');
    expect(u.updatedAt).not.toBe(r.updatedAt);
    await deleteRecipe(r.id);
    await expect(readRecipe(r.id)).rejects.toThrow();
  });
});
