/** New index of an item after the item at `removed` is deleted. null if it was the removed item. */
export function mapIndexThroughRemove(index: number, removed: number): number | null {
  if (index === removed) return null;
  return index > removed ? index - 1 : index;
}

/** New index of an item after moveItem(arr, from, to). Mirrors the splice permutation. */
export function mapIndexThroughMove(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < to) return index > from && index <= to ? index - 1 : index;
  return index >= to && index < from ? index + 1 : index;
}

export function checkedAfterRemove(checked: Set<number>, removed: number): Set<number> {
  const next = new Set<number>();
  for (const i of checked) {
    const m = mapIndexThroughRemove(i, removed);
    if (m !== null) next.add(m);
  }
  return next;
}

export function checkedAfterMove(checked: Set<number>, from: number, to: number): Set<number> {
  const next = new Set<number>();
  for (const i of checked) next.add(mapIndexThroughMove(i, from, to));
  return next;
}
