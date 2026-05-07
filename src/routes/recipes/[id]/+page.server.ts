import { error } from '@sveltejs/kit';
import { readRecipe, listBatches } from '../../../lib/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const recipe = await readRecipe(params.id);
    const batches = await listBatches(params.id);
    return { recipe, batches };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw error(404, 'Recipe not found');
    throw err;
  }
};
