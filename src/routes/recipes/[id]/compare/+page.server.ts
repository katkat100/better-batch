import { error } from '@sveltejs/kit';
import {
  readRecipe, readBatch,
  variableDiff, ingredientDiff, stepTextDiff
} from '$lib/server/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const aId = url.searchParams.get('a');
  const bId = url.searchParams.get('b');
  if (!aId || !bId) throw error(400, 'compare requires ?a=...&b=...');

  let recipe, a, b;
  try {
    recipe = await readRecipe(params.id);
    a = await readBatch(params.id, aId);
    b = await readBatch(params.id, bId);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw error(404, 'Not found');
    throw err;
  }

  const varRows = variableDiff(recipe.variableSchema, a.variables, b.variables);
  const ingRows = ingredientDiff(a.ingredients, b.ingredients);
  const stepLines = stepTextDiff(a.steps, b.steps);

  return { recipe, a, b, varRows, ingRows, stepLines };
};
