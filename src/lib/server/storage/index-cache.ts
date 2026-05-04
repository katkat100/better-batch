import { readFile } from 'node:fs/promises';
import { writeFileAtomic } from './atomic';
import { indexFile } from './paths';
import { listRecipes } from './recipes';
import { listBatches } from './batches';
import type { IndexEntry } from '../domain/types';

export async function rebuildIndex(): Promise<IndexEntry[]> {
  const recipes = await listRecipes();
  const entries: IndexEntry[] = [];
  for (const r of recipes) {
    const batches = await listBatches(r.id);
    const sorted = [...batches].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const cooked = sorted.filter(b => b.status === 'cooked' && b.cookedAt);
    const lastCookedAt = cooked.length ? cooked[cooked.length - 1].cookedAt : null;

    const numericVar = r.variableSchema.find(v => v.type === 'number');
    const sparklineVariable = numericVar?.name ?? null;
    const sparklineValues: (number | null)[] = sparklineVariable
      ? sorted.map(b => {
          const v = b.variables[sparklineVariable];
          return typeof v === 'number' ? v : null;
        })
      : [];

    entries.push({
      id: r.id, name: r.name, tags: r.tags, preset: r.preset,
      batchCount: batches.length, lastCookedAt, sparklineVariable, sparklineValues
    });
  }
  await writeFileAtomic(await indexFile(), JSON.stringify(entries, null, 2));
  return entries;
}

export async function readIndex(): Promise<IndexEntry[]> {
  try {
    return JSON.parse(await readFile(await indexFile(), 'utf8')) as IndexEntry[];
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}
