import type { Batch } from './types';

export function rootBatches(all: Batch[]): Batch[] {
  return all.filter(b => b.parentIds.length === 0);
}

export function childrenOf(all: Batch[], parentId: string): Batch[] {
  return all.filter(b => b.parentIds.includes(parentId));
}

export function ancestorsOf(all: Batch[], batchId: string): Batch[] {
  const byId = new Map(all.map(b => [b.id, b] as const));
  const out = new Map<string, Batch>();
  const start = byId.get(batchId);
  if (!start) return [];
  const queue: string[] = [...start.parentIds];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    const b = byId.get(id);
    if (!b) continue;
    out.set(id, b);
    queue.push(...b.parentIds);
  }
  return [...out.values()];
}

export function isMerge(batch: Batch): boolean {
  return batch.parentIds.length >= 2;
}
