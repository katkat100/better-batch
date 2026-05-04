export function sparklinePath(values: (number | null)[], width: number, height: number): string {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter(p => typeof p.v === 'number') as { v: number; i: number }[];
  if (points.length < 2) return '';

  const xs = points.map(p => p.i);
  const ys = points.map(p => p.v);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const inset = 1;

  const coords = points.map(p => {
    const x = ((p.i - xMin) / xRange) * width;
    const y = yMax === yMin
      ? height / 2
      : (1 - (p.v - yMin) / yRange) * (height - 2 * inset) + inset;
    return `${x} ${y}`;
  });
  return `M ${coords[0]} ` + coords.slice(1).map(c => `L ${c}`).join(' ');
}
