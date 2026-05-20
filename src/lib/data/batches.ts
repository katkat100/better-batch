import { openDb } from './db';
import type { Batch, BatchStatus, Ingredient, VariableValue, Step } from './types';
import { slugify, uniqueSlug } from '../shared/slug';

export interface CreateBatchInput {
  label: string;
  parentIds: string[];
  status: BatchStatus;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
  outcomeNotes?: string;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  cookedAt?: string | null;
  inconsistencyNote?: string;
  cookMultiplier?: number;
}

async function batchIdsForRecipe(recipeId: string): Promise<Set<string>> {
  const db = await openDb();
  const all = await db.getAllFromIndex('batches', 'byRecipe', recipeId);
  return new Set(all.map(b => b.id));
}

function nextVersionNumber(taken: Set<string>): number {
  let max = 0;
  for (const id of taken) {
    const m = id.match(/^v(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export async function createBatch(recipeId: string, input: CreateBatchInput): Promise<Batch> {
  const taken = await batchIdsForRecipe(recipeId);
  const v = nextVersionNumber(taken);
  const baseLabelSlug = slugify(input.label);
  const id = uniqueSlug(`v${v}-${baseLabelSlug}`, taken);
  const now = new Date().toISOString();
  const batch: Batch = {
    id,
    recipeId,
    label: input.label,
    parentIds: input.parentIds,
    status: input.status,
    cookedAt: input.cookedAt ?? null,
    variables: input.variables,
    ingredients: input.ingredients,
    steps: input.steps,
    outcomeNotes: input.outcomeNotes ?? '',
    rating: input.rating ?? null,
    ...(input.inconsistencyNote ? { inconsistencyNote: input.inconsistencyNote } : {}),
    ...(input.cookMultiplier && input.cookMultiplier > 1 ? { cookMultiplier: input.cookMultiplier } : {}),
    createdAt: now
  };
  const db = await openDb();
  await db.put('batches', batch);
  return batch;
}

export async function readBatch(
  _recipeId: string,
  batchId: string
): Promise<Batch | null> {
  const db = await openDb();
  const got = await db.get('batches', batchId);
  return got ?? null;
}

export async function listBatches(recipeId: string): Promise<Batch[]> {
  const db = await openDb();
  return db.getAllFromIndex('batches', 'byRecipe', recipeId);
}

export async function updateBatch(
  _recipeId: string,
  batchId: string,
  patch: Partial<Batch>
): Promise<Batch> {
  const db = await openDb();
  const current = await db.get('batches', batchId);
  if (!current) throw new Error(`Batch not found: ${batchId}`);
  const next: Batch = {
    ...current,
    ...patch,
    id: current.id,
    recipeId: current.recipeId,
    createdAt: current.createdAt
  };
  if ('inconsistencyNote' in patch && !patch.inconsistencyNote) {
    delete (next as Partial<Batch>).inconsistencyNote;
  }
  if ('cookMultiplier' in patch && (!patch.cookMultiplier || patch.cookMultiplier <= 1)) {
    delete (next as Partial<Batch>).cookMultiplier;
  }
  await db.put('batches', next);
  return next;
}

export async function deleteBatch(
  _recipeId: string,
  batchId: string
): Promise<void> {
  const db = await openDb();
  await db.delete('batches', batchId);
}
