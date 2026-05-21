import { openDb } from './db';
import type { Batch, IndexEntry, Recipe } from './types';

export interface Snapshot {
  recipes: Recipe[];
  batches: Batch[];
  index: IndexEntry[];
}

export async function bulkLoad(snapshot: Snapshot): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['recipes', 'batches', 'index'], 'readwrite');
  await Promise.all([
    ...snapshot.recipes.map(r => tx.objectStore('recipes').put(r)),
    ...snapshot.batches.map(b => tx.objectStore('batches').put(b)),
    snapshot.index.length > 0
      ? tx.objectStore('index').put(snapshot.index, 'singleton')
      : Promise.resolve()
  ]);
  await tx.done;
}

export async function seedIfEmpty(): Promise<void> {
  const db = await openDb();
  const count = await db.count('recipes');
  if (count > 0) return;
  let snapshot: Snapshot;
  try {
    const res = await fetch('/seed/snapshot.json');
    if (!res.ok) return;
    snapshot = await res.json();
  } catch {
    return;  // no snapshot available (static build, offline, etc.) — fine
  }
  await bulkLoad(snapshot);
}
