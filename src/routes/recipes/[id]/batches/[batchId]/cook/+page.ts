import { browser } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { readRecipe } from '$lib/data/recipes';
import { readBatch } from '$lib/data/batches';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  if (!browser) return { recipe: null, batch: null };
  const recipe = await readRecipe(params.id);
  const batch = await readBatch(params.id, params.batchId);
  if (!recipe || !batch) throw error(404, 'Not found');
  if (batch.status === 'archived') {
    throw redirect(303, `/recipes/${params.id}`);
  }
  return { recipe, batch };
};
