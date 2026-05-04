// src/routes/recipes/[id]/+page.server.ts
import { error } from '@sveltejs/kit';
import { readRecipe, listBatches } from '../../../lib/server';

export async function load({ params }) {
  try {
    const recipe = await readRecipe(params.id);
    const batches = await listBatches(params.id);
    return { recipe, batches };
  } catch (err: any) {
    if (err.code === 'ENOENT') throw error(404, 'Recipe not found');
    throw err;
  }
}
