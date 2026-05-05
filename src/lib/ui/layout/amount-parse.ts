export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Mixed number: "1 1/2"
  const mixed = trimmed.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = parseInt(mixed[1], 10);
    const num = parseInt(mixed[2], 10);
    const den = parseInt(mixed[3], 10);
    if (den === 0) return null;
    return whole + (num / den) * (whole < 0 ? -1 : 1);
  }

  // Simple fraction: "1/2"
  const frac = trimmed.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    const num = parseInt(frac[1], 10);
    const den = parseInt(frac[2], 10);
    if (den === 0) return null;
    return num / den;
  }

  // Plain number: "50", "0.5"
  const n = parseFloat(trimmed);
  if (Number.isFinite(n) && /^-?\d*\.?\d+$/.test(trimmed)) return n;
  return null;
}
