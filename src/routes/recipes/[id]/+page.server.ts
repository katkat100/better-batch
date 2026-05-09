import { error } from '@sveltejs/kit';
import { readRecipe, listBatches } from '../../../lib/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  try {
    const recipe = await readRecipe(params.id);
    const batches = await listBatches(params.id);
    const queryBatchId = url.searchParams.get('batch');
    return { recipe, batches, queryBatchId };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw error(404, 'Recipe not found');
    throw err;
  }
};
