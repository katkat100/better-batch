// src/routes/recipes/[id]/batches/[batchId]/cook/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import { readRecipe, readBatch } from '$lib/server';

export async function load({ params }) {
  let recipe, batch;
  try {
    recipe = await readRecipe(params.id);
    batch = await readBatch(params.id, params.batchId);
  } catch (err: any) {
    if (err.code === 'ENOENT') throw error(404, 'Not found');
    throw err;
  }
  if (batch.status === 'archived') {
    throw redirect(303, `/recipes/${params.id}`);
  }
  return { recipe, batch };
}
