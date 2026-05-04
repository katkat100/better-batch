import { json, error } from '@sveltejs/kit';
import { readBatch, updateBatch, deleteBatch, rebuildIndex } from '../../../../../../lib/server/index.js';

export async function GET({ params }: { params: { id: string; batchId: string } }) {
  try { return json(await readBatch(params.id, params.batchId)); }
  catch (err: any) { if (err.code === 'ENOENT') throw error(404, 'batch not found'); throw err; }
}

export async function PATCH({ params, request }: { params: { id: string; batchId: string }; request: Request }) {
  const patch = await request.json();
  // Auto-stamp cookedAt when flipping to cooked
  if (patch.status === 'cooked' && !patch.cookedAt) patch.cookedAt = new Date().toISOString();
  const next = await updateBatch(params.id, params.batchId, patch);
  await rebuildIndex();
  return json(next);
}

export async function DELETE({ params }: { params: { id: string; batchId: string } }) {
  await deleteBatch(params.id, params.batchId);
  await rebuildIndex();
  return new Response(null, { status: 204 });
}
