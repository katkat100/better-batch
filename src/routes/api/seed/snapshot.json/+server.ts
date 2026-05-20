import { json } from '@sveltejs/kit';
import { listRecipes, listBatches, readIndex } from '$lib/server';
import type { Batch, IndexEntry, Recipe } from '$lib/data/types';

export const GET = async () => {
  const recipes: Recipe[] = await listRecipes();
  let allBatches: Batch[] = [];
  for (const r of recipes) {
    const b = await listBatches(r.id);
    allBatches = allBatches.concat(b);
  }
  let index: IndexEntry[] = [];
  try {
    index = await readIndex();
  } catch {
    // empty index is fine
  }
  return json({ recipes, batches: allBatches, index });
};
