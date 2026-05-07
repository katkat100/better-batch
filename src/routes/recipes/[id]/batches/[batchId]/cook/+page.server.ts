import { error, redirect } from '@sveltejs/kit';
import { readRecipe, readBatch } from '$lib/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  let recipe, batch;
  try {
    recipe = await readRecipe(params.id);
    batch = await readBatch(params.id, params.batchId);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw error(404, 'Not found');
    throw err;
  }
  if (batch.status === 'archived') {
    throw redirect(303, `/recipes/${params.id}`);
  }
  return { recipe, batch };
};
