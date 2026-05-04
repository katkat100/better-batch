import { json, error } from '@sveltejs/kit';
import { createBatch, listBatches, readRecipe, updateRecipe, rebuildIndex } from '../../../../../lib/server/index.js';

export async function GET({ params }: { params: { id: string } }) {
  return json(await listBatches(params.id));
}

export async function POST({ params, request }: { params: { id: string }; request: Request }) {
  let recipe;
  try { recipe = await readRecipe(params.id); }
  catch (err: any) { if (err.code === 'ENOENT') throw error(404, 'recipe not found'); throw err; }

  const body = await request.json();
  if (!body.label || typeof body.label !== 'string') throw error(400, 'label required');
  if (!Array.isArray(body.parentIds)) throw error(400, 'parentIds must be array');
  if (!['draft', 'cooked', 'archived'].includes(body.status)) throw error(400, 'invalid status');

  // Validate parents belong to this recipe
  if (body.parentIds.length) {
    const all = await listBatches(params.id);
    const ids = new Set(all.map((b: any) => b.id));
    for (const pid of body.parentIds) {
      if (!ids.has(pid)) throw error(409, `parent ${pid} not in recipe`);
    }
  }

  const batch = await createBatch(params.id, {
    label: body.label, parentIds: body.parentIds, status: body.status,
    variables: body.variables ?? {}, ingredients: body.ingredients ?? [], steps: body.steps ?? [],
    outcomeNotes: body.outcomeNotes, rating: body.rating ?? null,
    cookedAt: body.status === 'cooked' ? (body.cookedAt ?? new Date().toISOString()) : null
  });
  await updateRecipe(params.id, { currentBatchId: batch.id });
  await rebuildIndex();
  return json(batch, { status: 201 });
}
