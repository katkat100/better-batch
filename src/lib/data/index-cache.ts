import { openDb } from './db';
import type { Batch, IndexEntry, Recipe } from './types';

const SINGLETON_KEY = 'singleton';

function pickSparklineVariable(recipe: Recipe): string | null {
  const numeric = recipe.variableSchema.find(v => v.type === 'number');
  return numeric?.name ?? null;
}

function entryFor(recipe: Recipe, batches: Batch[]): IndexEntry {
  // Sort all batches by createdAt for sparkline values
  const sorted = [...batches].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Filter cooked batches for lastCookedAt calculation
  const cooked = sorted.filter(b => b.status === 'cooked' && b.cookedAt);
  const lastCookedAt = cooked.length ? cooked[cooked.length - 1].cookedAt : null;

  const sparklineVariable = pickSparklineVariable(recipe);
  const sparklineValues: (number | null)[] = sparklineVariable
    ? sorted.map(b => {
        const v = b.variables[sparklineVariable];
        return typeof v === 'number' ? v : null;
      })
    : [];

  return {
    id: recipe.id,
    name: recipe.name,
    tags: recipe.tags,
    preset: recipe.preset,
    batchCount: batches.length,
    lastCookedAt,
    sparklineVariable,
    sparklineValues
  };
}

export async function rebuildIndex(): Promise<IndexEntry[]> {
  const db = await openDb();
  const recipes = await db.getAll('recipes');
  const allBatches = await db.getAll('batches');
  const byRecipe = new Map<string, Batch[]>();
  for (const b of allBatches) {
    if (!byRecipe.has(b.recipeId)) byRecipe.set(b.recipeId, []);
    byRecipe.get(b.recipeId)!.push(b);
  }
  const entries = recipes.map(r => entryFor(r, byRecipe.get(r.id) ?? []));
  await db.put('index', entries, SINGLETON_KEY);
  return entries;
}

export async function readIndex(): Promise<IndexEntry[]> {
  const db = await openDb();
  const got = await db.get('index', SINGLETON_KEY);
  if (got) return got;
  return rebuildIndex();
}
