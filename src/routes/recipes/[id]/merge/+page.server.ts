// src/routes/recipes/[id]/merge/+page.server.ts
import { error } from '@sveltejs/kit';
import { readRecipe, readBatch } from '$lib/server';

export async function load({ params, url }) {
  const aId = url.searchParams.get('a');
  const bId = url.searchParams.get('b');
  if (!aId || !bId) throw error(400, 'merge requires ?a=...&b=...');

  let recipe, a, b;
  try {
    recipe = await readRecipe(params.id);
    a = await readBatch(params.id, aId);
    b = await readBatch(params.id, bId);
  } catch (err: any) {
    if (err.code === 'ENOENT') throw error(404, 'Not found');
    throw err;
  }

  return { recipe, a, b };
}
