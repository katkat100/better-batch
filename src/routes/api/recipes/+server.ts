import { json, error } from '@sveltejs/kit';
import { createRecipe, rebuildIndex, readIndex } from '../../../lib/server/index.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const idx = await readIndex();
  if (idx.length === 0) {
    const rebuilt = await rebuildIndex();
    return json(rebuilt);
  }
  return json(idx);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  if (!body.name || typeof body.name !== 'string') throw error(400, 'name required');
  if (!['bread', 'sauce', 'braise', 'custom'].includes(body.preset)) throw error(400, 'invalid preset');
  const recipe = await createRecipe({ name: body.name, preset: body.preset, tags: body.tags ?? [], description: body.description });
  await rebuildIndex();
  return json(recipe, { status: 201 });
};
