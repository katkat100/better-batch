import { describe, it, expect } from 'bun:test';
import { parseAmount } from '../../src/lib/ui/layout/amount-parse';

describe('parseAmount', () => {
  it('parses plain numbers', () => {
    expect(parseAmount('50')).toBe(50);
    expect(parseAmount('0.5')).toBe(0.5);
    expect(parseAmount('100.25')).toBe(100.25);
  });

  it('parses simple fractions', () => {
    expect(parseAmount('1/2')).toBe(0.5);
    expect(parseAmount('3/4')).toBe(0.75);
    expect(parseAmount('1/3')).toBeCloseTo(0.333, 3);
  });

  it('parses mixed numbers', () => {
    expect(parseAmount('1 1/2')).toBe(1.5);
    expect(parseAmount('2 3/4')).toBe(2.75);
  });

  it('trims whitespace', () => {
    expect(parseAmount('  50  ')).toBe(50);
    expect(parseAmount(' 1/2 ')).toBe(0.5);
  });

  it('evaluates arithmetic expressions', () => {
    expect(parseAmount('397 + 100')).toBe(497);
    expect(parseAmount('100-25')).toBe(75);
    expect(parseAmount('2*3')).toBe(6);
    expect(parseAmount('(1+2)*3')).toBe(9);
    expect(parseAmount('100/2 + 50')).toBe(100);
  });

  it('returns null for invalid input', () => {
    expect(parseAmount('')).toBe(null);
    expect(parseAmount('abc')).toBe(null);
    expect(parseAmount('1/0')).toBe(null);
    expect(parseAmount('1/')).toBe(null);
    expect(parseAmount('alert(1)')).toBe(null);  // no identifiers
    expect(parseAmount('5 + abc')).toBe(null);
  });
});
