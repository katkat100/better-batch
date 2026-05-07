import { error } from '@sveltejs/kit';
import { readRecipe, listBatches } from '../../../../lib/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  try {
    const recipe = await readRecipe(params.id);
    const batches = await listBatches(params.id);
    const fromId = url.searchParams.get('from');
    const parent = fromId ? batches.find(b => b.id === fromId) ?? null : (batches[0] ?? null);
    return { recipe, parent };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw error(404, 'Recipe not found');
    throw err;
  }
};
