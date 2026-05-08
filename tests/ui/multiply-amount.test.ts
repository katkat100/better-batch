import { describe, it, expect } from 'bun:test';
import { multiplyAmount } from '../../src/lib/ui/layout/multiply-amount';

describe('multiplyAmount', () => {
  it('returns the input untouched at multiplier 1', () => {
    expect(multiplyAmount('500', 1)).toBe('500');
    expect(multiplyAmount('to taste', 1)).toBe('to taste');
    expect(multiplyAmount('', 1)).toBe('');
  });

  it('scales whole numbers', () => {
    expect(multiplyAmount('500', 2)).toBe('1000');
    expect(multiplyAmount('250', 3)).toBe('750');
  });

  it('scales fractions parsed by parseAmount', () => {
    expect(multiplyAmount('1/2', 2)).toBe('1');
    expect(multiplyAmount('1/4', 3)).toBe('0.75');
  });

  it('avoids float artifacts', () => {
    expect(multiplyAmount('0.1', 3)).toBe('0.3');
  });

  it('returns non-numeric amounts unchanged regardless of multiplier', () => {
    expect(multiplyAmount('to taste', 2)).toBe('to taste');
    expect(multiplyAmount('a pinch', 3)).toBe('a pinch');
  });

  it('returns empty string unchanged', () => {
    expect(multiplyAmount('', 2)).toBe('');
  });
});
