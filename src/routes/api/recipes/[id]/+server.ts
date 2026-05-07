import { json, error } from '@sveltejs/kit';
import { readRecipe, updateRecipe, deleteRecipe, listBatches, rebuildIndex, migrateBatchVariables, updateBatch } from '../../../../lib/server/index.js';
import type { Recipe, VariableSchemaItem } from '../../../../lib/server/index.js';

export async function GET({ params }: { params: { id: string } }) {
  try {
    const recipe = await readRecipe(params.id);
    const batches = await listBatches(params.id);
    return json({ recipe, batches });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw error(404, 'recipe not found');
    throw err;
  }
}

export async function PATCH({ params, request }: { params: { id: string }; request: Request }) {
  const patch = await request.json() as Partial<Recipe>;
  let current: Recipe;
  try { current = await readRecipe(params.id); }
  catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw error(404, 'recipe not found'); throw err; }

  if (patch.variableSchema && JSON.stringify(patch.variableSchema) !== JSON.stringify(current.variableSchema)) {
    const oldSchema = current.variableSchema;
    const newSchema = patch.variableSchema as VariableSchemaItem[];
    const batches = await listBatches(params.id);
    for (const b of batches) {
      const migrated = migrateBatchVariables(b.variables, oldSchema, newSchema);
      await updateBatch(params.id, b.id, { variables: migrated });
    }
  }

  const next = await updateRecipe(params.id, patch);
  await rebuildIndex();
  return json(next);
}

export async function DELETE({ params }: { params: { id: string } }) {
  await deleteRecipe(params.id);
  await rebuildIndex();
  return new Response(null, { status: 204 });
}
