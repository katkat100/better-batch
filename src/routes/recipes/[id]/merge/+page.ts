import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';
import { readRecipe } from '$lib/data/recipes';
import { readBatch } from '$lib/data/batches';
import { variableDiff, ingredientDiff, stepObjectDiff } from '$lib/data/diff';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
  const aId = url.searchParams.get('a');
  const bId = url.searchParams.get('b');
  if (!aId || !bId) throw error(400, 'merge requires ?a=...&b=...');
  if (!browser) {
    return { recipe: null, a: null, b: null, varRows: [], ingRows: [], stepRows: [] };
  }
  const recipe = await readRecipe(params.id);
  const a = await readBatch(params.id, aId);
  const b = await readBatch(params.id, bId);
  if (!recipe || !a || !b) throw error(404, 'Not found');
  const varRows = variableDiff(recipe.variableSchema, a.variables, b.variables);
  const ingRows = ingredientDiff(a.ingredients, b.ingredients);
  const stepRows = stepObjectDiff(a.steps, b.steps);
  return { recipe, a, b, varRows, ingRows, stepRows };
};
