import { browser } from '$app/environment';
import { readBatch, listBatches } from '$lib/data/batches';
import { readRecipe } from '$lib/data/recipes';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
  if (!browser) return { recipe: null, parent: null };
  const recipe = await readRecipe(params.id);
  const fromId = url.searchParams.get('from');
  let parent = fromId ? await readBatch(params.id, fromId) : null;
  if (!parent) {
    const batches = await listBatches(params.id);
    parent = batches[0] ?? null;
  }
  return { recipe, parent };
};
