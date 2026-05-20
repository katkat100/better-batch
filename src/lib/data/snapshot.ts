import { openDb } from './db';
import type { Snapshot } from './seed-import';
import { bulkLoad } from './seed-import';

export type { Snapshot };

export async function dumpAllData(): Promise<Snapshot> {
  const db = await openDb();
  const recipes = await db.getAll('recipes');
  const batches = await db.getAll('batches');
  const index = (await db.get('index', 'singleton')) ?? [];
  return { recipes, batches, index };
}

export function parseSnapshot(text: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Snapshot file is not valid JSON');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Snapshot).recipes) ||
    !Array.isArray((parsed as Snapshot).batches) ||
    !Array.isArray((parsed as Snapshot).index)
  ) {
    throw new Error('Snapshot file is missing recipes / batches / index arrays');
  }
  return parsed as Snapshot;
}

export async function wipeAndReseed(snapshot: Snapshot): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['recipes', 'batches', 'index'], 'readwrite');
  await Promise.all([
    tx.objectStore('recipes').clear(),
    tx.objectStore('batches').clear(),
    tx.objectStore('index').clear()
  ]);
  await tx.done;
  await bulkLoad(snapshot);
}

export async function exportSnapshot(): Promise<void> {
  const snapshot = await dumpAllData();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `better-batch-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importSnapshot(file: File): Promise<void> {
  const text = await file.text();
  const snapshot = parseSnapshot(text);
  const count = snapshot.recipes.length + snapshot.batches.length;
  const ok = confirm(`Import ${count} items? This will REPLACE all current data.`);
  if (!ok) return;
  await wipeAndReseed(snapshot);
}
