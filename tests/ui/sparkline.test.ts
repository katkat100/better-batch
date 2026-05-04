import { describe, it, expect } from 'bun:test';
import { sparklinePath } from '../../src/lib/ui/layout/sparkline-path';

describe('sparklinePath', () => {
  it('returns empty string for fewer than 2 points', () => {
    expect(sparklinePath([], 100, 20)).toBe('');
    expect(sparklinePath([5], 100, 20)).toBe('');
  });

  it('renders a flat horizontal line at y-mid for constant values', () => {
    const path = sparklinePath([5, 5, 5], 100, 20);
    // 3 points → x: 0, 50, 100; y: midline (10) for all
    expect(path).toBe('M 0 10 L 50 10 L 100 10');
  });

  it('maps min to bottom (y=height) and max to top (y=0) with 1px inset', () => {
    const path = sparklinePath([0, 10], 100, 20);
    // inset = 1 → max y = 1, min y = 19
    expect(path).toBe('M 0 19 L 100 1');
  });

  it('skips null points by drawing line through gaps', () => {
    const path = sparklinePath([1, null, 3], 100, 20);
    // null skipped: 2 valid points at x=0 and x=100
    expect(path).toBe('M 0 19 L 100 1');
  });
});
