import { error, redirect } from '@sveltejs/kit';
import { readRecipe, readBatch } from '../../../../../../lib/server/index.js';

export async function load({ params }) {
  let recipe, batch;
  try {
    recipe = await readRecipe(params.id);
    batch = await readBatch(params.id, params.batchId);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw error(404, 'Not found');
    throw err;
  }
  if (batch.status !== 'draft') {
    throw redirect(303, `/recipes/${params.id}`);
  }
  return { recipe, batch };
}
