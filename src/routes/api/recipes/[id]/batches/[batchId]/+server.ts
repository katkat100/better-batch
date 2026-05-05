import { json, error } from '@sveltejs/kit';
import { readBatch, updateBatch, deleteBatch, rebuildIndex } from '../../../../../../lib/server/index.js';
import type { Batch, Step } from '../../../../../../lib/server/index.js';

const FROZEN_FIELDS = new Set(['ingredients', 'steps', 'variables', 'label', 'parentIds']);

export async function GET({ params }: { params: { id: string; batchId: string } }) {
  try { return json(await readBatch(params.id, params.batchId)); }
  catch (err: any) { if (err.code === 'ENOENT') throw error(404, 'batch not found'); throw err; }
}

export async function PATCH({ params, request }: { params: { id: string; batchId: string }; request: Request }) {
  const patch = await request.json();
  let current: Batch;
  try { current = await readBatch(params.id, params.batchId); }
  catch (err: any) { if (err.code === 'ENOENT') throw error(404, 'batch not found'); throw err; }

  // Frozen-field check for cooked/archived batches
  if (current.status === 'cooked' || current.status === 'archived') {
    const touchedFrozen = Object.keys(patch).filter(k => FROZEN_FIELDS.has(k));
    if (touchedFrozen.length > 0) {
      throw error(403, `Cannot edit ${touchedFrozen.join(', ')} on a ${current.status} batch`);
    }
  }

  // Auto-stamp cookedAt when flipping to cooked
  if (patch.status === 'cooked' && !patch.cookedAt) patch.cookedAt = new Date().toISOString();

  // Referential integrity for step.uses
  const ingredients = (patch.ingredients ?? current.ingredients) as Batch['ingredients'];
  const ingredientIds = new Set(ingredients.map((i: { id: string }) => i.id));
  const steps = (patch.steps ?? current.steps) as Step[];
  for (let i = 0; i < steps.length; i++) {
    for (const use of steps[i].uses ?? []) {
      if (!ingredientIds.has(use.ingredientId)) {
        throw error(400, `Step ${i + 1} references unknown ingredient '${use.ingredientId}'`);
      }
    }
  }

  const next = await updateBatch(params.id, params.batchId, patch);
  await rebuildIndex();
  return json(next);
}

export async function DELETE({ params }: { params: { id: string; batchId: string } }) {
  await deleteBatch(params.id, params.batchId);
  await rebuildIndex();
  return new Response(null, { status: 204 });
}
