import type { Batch } from '../../server/domain/types';

interface LayoutNode { id: string; col: number; row: number; x: number; y: number; }
interface LayoutEdge { from: string; to: string; }
export interface Layout { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number; }

interface LayoutOptions { colWidth?: number; rowHeight?: number; }

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

  // Group by row
  const byRow = new Map<number, Batch[]>();
  for (const b of batches) {
    const r = depth.get(b.id)!;
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r)!.push(b);
  }

  // Assign columns row-by-row, anchoring each child to its parent's column.
  // Target col = avg of parent cols (0 for roots). Sort by target (then createdAt
  // as tiebreaker), then place sequentially: each node lands at its target unless
  // that would collide with the previous node, in which case it shifts right.
  // This keeps children directly beneath their parents and prevents crossings
  // between siblings drawn from different parent columns.
  const colOf = new Map<string, number>();
  const sortedRows = [...byRow.keys()].sort((a, b) => a - b);
  for (const r of sortedRows) {
    const list = byRow.get(r)!;
    const targets = new Map<string, number>();
    for (const b of list) {
      if (b.parentIds.length === 0) {
        targets.set(b.id, 0);
      } else {
        const pcols = b.parentIds
          .map(p => colOf.get(p))
          .filter((c): c is number => c !== undefined);
        const avg = pcols.length ? pcols.reduce((s, c) => s + c, 0) / pcols.length : 0;
        targets.set(b.id, avg);
      }
    }
    list.sort((a, b) => {
      const ta = targets.get(a.id)!;
      const tb = targets.get(b.id)!;
      return ta - tb || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
    let prevCol = -Infinity;
    for (const b of list) {
      const col = Math.max(targets.get(b.id)!, prevCol + 1);
      colOf.set(b.id, col);
      prevCol = col;
    }
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
