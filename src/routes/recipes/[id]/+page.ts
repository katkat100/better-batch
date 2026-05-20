import { browser } from '$app/environment';
import { readRecipe } from '$lib/data/recipes';
import { listBatches } from '$lib/data/batches';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
  if (!browser) {
    return { recipe: null, batches: [], queryBatchId: null };
  }
  const recipe = await readRecipe(params.id);
  const batches = await listBatches(params.id);
  const queryBatchId = url.searchParams.get('batch');
  return { recipe, batches, queryBatchId };
};
