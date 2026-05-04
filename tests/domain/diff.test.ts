import { describe, it, expect } from 'bun:test';
import { variableDiff, textArrayDiff } from '../../src/lib/server/domain/diff';
import type { VariableSchemaItem } from '../../src/lib/server/domain/types';

const schema: VariableSchemaItem[] = [
  { name: 'hydration', unit: '%', type: 'number' },
  { name: 'bake_temp', unit: '°F', type: 'number' },
  { name: 'note', unit: '', type: 'text' }
];

describe('variableDiff', () => {
  it('reports numeric deltas with sign', () => {
    const rows = variableDiff(schema, { hydration: 72, bake_temp: 475, note: 'a' }, { hydration: 75, bake_temp: 475, note: 'a' });
    expect(rows.find(r => r.name === 'hydration')).toEqual({ name: 'hydration', unit: '%', type: 'number', a: 72, b: 75, delta: 3, changed: true });
    expect(rows.find(r => r.name === 'bake_temp')!.changed).toBe(false);
  });

  it('handles null on either side', () => {
    const rows = variableDiff(schema, { hydration: null, bake_temp: 475, note: null }, { hydration: 70, bake_temp: 475, note: 'x' });
    expect(rows.find(r => r.name === 'hydration')!.delta).toBe(null);
    expect(rows.find(r => r.name === 'note')!.changed).toBe(true);
  });
});

describe('textArrayDiff', () => {
  it('returns op-tagged lines for steps', () => {
    const ops = textArrayDiff(['mix', 'rise', 'bake'], ['mix', 'rise long', 'bake']);
    expect(ops).toEqual([
      { op: 'ctx', text: 'mix' },
      { op: 'rem', text: 'rise' },
      { op: 'add', text: 'rise long' },
      { op: 'ctx', text: 'bake' }
    ]);
  });
});
