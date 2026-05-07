import { readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { writeFileAtomic } from './atomic';
import { batchesDir, batchFile } from './paths';
import { slugify, uniqueSlug } from '../../shared/slug';
import type { Batch, BatchStatus, Ingredient, IngredientUse, VariableValue, Step } from '../domain/types';

interface CreateBatchInput {
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
}

async function existingBatchIds(recipeId: string): Promise<Set<string>> {
  try {
    const entries = await readdir(await batchesDir(recipeId));
    return new Set(entries.filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw err;
  }
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
  const taken = await existingBatchIds(recipeId);
  const v = nextVersionNumber(taken);
  const baseLabelSlug = slugify(input.label);
  const id = uniqueSlug(`v${v}-${baseLabelSlug}`, taken);
  const now = new Date().toISOString();
  const batch: Batch = {
    id, recipeId,
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
    createdAt: now
  };
  await mkdir(await batchesDir(recipeId), { recursive: true });
  await writeFileAtomic(await batchFile(recipeId, id), JSON.stringify(batch, null, 2));
  return batch;
}

interface LegacyIngredient { id?: string; name: string; amount: string; unit: string; section?: string; }
type RawStep = string | { text: string; uses?: IngredientUse[] };

function migrateBatchOnRead(raw: Record<string, unknown>): Batch {
  // Ingredients: ensure id, leave section as-is (undefined if absent)
  const taken = new Set<string>();
  const ingredients: Ingredient[] = ((raw.ingredients as LegacyIngredient[] | undefined) ?? []).map((ing) => {
    let id = ing.id;
    if (!id) {
      id = uniqueSlug(slugify(ing.name || 'ingredient'), taken);
    }
    taken.add(id);
    return { id, name: ing.name, amount: ing.amount, unit: ing.unit, section: ing.section };
  });

  // Steps: string → { text, uses: [] }; object passes through (with empty uses default)
  const steps: Step[] = ((raw.steps as RawStep[] | undefined) ?? []).map((s) => {
    if (typeof s === 'string') return { text: s, uses: [] };
    return { text: s.text, uses: s.uses ?? [] };
  });

  return {
    ...raw,
    ingredients,
    steps
  } as Batch;
}

export async function readBatch(recipeId: string, batchId: string): Promise<Batch> {
  const raw = JSON.parse(await readFile(await batchFile(recipeId, batchId), 'utf8'));
  return migrateBatchOnRead(raw);
}

export async function listBatches(recipeId: string): Promise<Batch[]> {
  const ids = [...(await existingBatchIds(recipeId))];
  return Promise.all(ids.map(id => readBatch(recipeId, id)));
}

export async function updateBatch(recipeId: string, batchId: string, patch: Partial<Batch>): Promise<Batch> {
  const current = await readBatch(recipeId, batchId);
  const next: Batch = { ...current, ...patch, id: current.id, recipeId: current.recipeId, createdAt: current.createdAt };
  if ('inconsistencyNote' in patch && !patch.inconsistencyNote) {
    delete (next as Partial<Batch>).inconsistencyNote;
  }
  await writeFileAtomic(await batchFile(recipeId, batchId), JSON.stringify(next, null, 2));
  return next;
}

export async function deleteBatch(recipeId: string, batchId: string): Promise<void> {
  await rm(await batchFile(recipeId, batchId), { force: true });
}
