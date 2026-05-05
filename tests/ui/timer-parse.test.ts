import { describe, it, expect } from 'bun:test';
import { parseTimers } from '../../src/lib/ui/cook/layout/timer-parse';

describe('parseTimers', () => {
  it('parses "rest 45 min" with label', () => {
    const m = parseTimers('rest 45 min');
    expect(m).toEqual([{ start: 5, end: 11, durationMs: 45 * 60_000, label: 'rest' }]);
  });

  it('parses seconds and hours and compound', () => {
    expect(parseTimers('30 seconds')[0].durationMs).toBe(30_000);
    expect(parseTimers('1 hour')[0].durationMs).toBe(3_600_000);
    expect(parseTimers('1 hour 30 min')[0].durationMs).toBe(90 * 60_000);
  });

  it('extracts up to 4 preceding words for label', () => {
    const m = parseTimers('Bulk ferment with stretch folds 5 hours');
    expect(m[0].label).toBe('ferment with stretch folds');
  });

  it('matches multiple timers in a single string', () => {
    const m = parseTimers('Bake 25 minutes covered, then 20 minutes open');
    expect(m.length).toBe(2);
    expect(m[0].durationMs).toBe(25 * 60_000);
    expect(m[1].durationMs).toBe(20 * 60_000);
    expect(m[1].label).toBe('then');
  });

  it('skips temperatures', () => {
    const m = parseTimers('Bake at 475°F for 25 minutes');
    expect(m.length).toBe(1);
    expect(m[0].durationMs).toBe(25 * 60_000);
  });

  it('returns empty array for no matches', () => {
    expect(parseTimers('Mix until shaggy')).toEqual([]);
  });

  it('treats sentence-start match label as "timer"', () => {
    const m = parseTimers('45 min rest');
    expect(m[0].label).toBe('timer');
  });
});
