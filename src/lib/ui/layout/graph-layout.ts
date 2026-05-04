import type { Batch } from '../../server/domain/types';

export interface LayoutNode { id: string; col: number; row: number; x: number; y: number; }
export interface LayoutEdge { from: string; to: string; }
export interface Layout { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number; }

export interface LayoutOptions { colWidth?: number; rowHeight?: number; }

export function layoutGraph(batches: Batch[], opts: LayoutOptions = {}): Layout {
  if (batches.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };
  const colWidth = opts.colWidth ?? 60;
  const rowHeight = opts.rowHeight ?? 50;

  const byId = new Map(batches.map(b => [b.id, b] as const));

  // Compute depth (longest path from any root)
  const depth = new Map<string, number>();
  function computeDepth(id: string, stack = new Set<string>()): number {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0; // cycle guard (shouldn't happen)
    stack.add(id);
    const b = byId.get(id);
    if (!b || b.parentIds.length === 0) { depth.set(id, 0); return 0; }
    const d = 1 + Math.max(...b.parentIds.map(p => computeDepth(p, stack)));
    depth.set(id, d);
    return d;
  }
  batches.forEach(b => computeDepth(b.id));

  // Group by row, sort each row by createdAt for deterministic columns
  const byRow = new Map<number, Batch[]>();
  for (const b of batches) {
    const r = depth.get(b.id)!;
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r)!.push(b);
  }
  for (const list of byRow.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  // Assign columns: simple sequential within each row
  const colOf = new Map<string, number>();
  for (const [, list] of byRow) {
    list.forEach((b, i) => colOf.set(b.id, i));
  }

  const nodes: LayoutNode[] = batches.map(b => {
    const col = colOf.get(b.id)!;
    const row = depth.get(b.id)!;
    return { id: b.id, col, row, x: col * colWidth, y: row * rowHeight };
  });

  const edges: LayoutEdge[] = batches.flatMap(b => b.parentIds.map(p => ({ from: p, to: b.id })));

  const maxCol = Math.max(...nodes.map(n => n.col));
  const maxRow = Math.max(...nodes.map(n => n.row));
  return {
    nodes, edges,
    width: maxCol * colWidth,
    height: maxRow * rowHeight
  };
}
