// Display-time helpers for variable units.

const SINGULARS: Record<string, string> = {
  loaves: 'loaf',
  cups: 'cup',
};

/**
 * Returns the unit string to display for a given numeric value.
 * For known plural-only units (e.g. "loaves"), returns the singular form
 * when count === 1.
 */
export function displayUnit(unit: string, count: number): string {
  if (count === 1 && SINGULARS[unit]) return SINGULARS[unit];
  return unit;
}
