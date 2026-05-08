import { parseAmount } from './amount-parse';

/**
 * Display-only scaling for an ingredient master amount.
 * Numeric strings are scaled; non-numeric strings (e.g. "to taste") are
 * returned unchanged. Float-rounding artifacts are mitigated via toFixed(4).
 */
export function multiplyAmount(amount: string, multiplier: number): string {
  if (multiplier === 1) return amount;
  const parsed = parseAmount(amount);
  if (parsed === null) return amount;
  const scaled = parseFloat((parsed * multiplier).toFixed(4));
  return String(scaled);
}
