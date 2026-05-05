import { describe, it, expect } from 'bun:test';
import { variableDiff, textArrayDiff, ingredientDiff, stepTextDiff, stepObjectDiff } from '../../src/lib/server/domain/diff';
import type { VariableSchemaItem, Ingredient, Step } from '../../src/lib/server/domain/types';

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

describe('ingredientDiff', () => {
  const ing = (id: string, name: string, amount: string, unit = 'g'): Ingredient => ({ id, name, amount, unit });

  it('marks identical entries as ctx', () => {
    const rows = ingredientDiff(
      [ing('flour', 'flour', '500')],
      [ing('flour', 'flour', '500')]
    );
    expect(rows).toEqual([{ op: 'ctx', a: ing('flour', 'flour', '500'), b: ing('flour', 'flour', '500') }]);
  });

  it('marks added entries as add', () => {
    const rows = ingredientDiff([], [ing('salt', 'salt', '10')]);
    expect(rows).toEqual([{ op: 'add', b: ing('salt', 'salt', '10') }]);
  });

  it('marks removed entries as rem', () => {
    const rows = ingredientDiff([ing('salt', 'salt', '10')], []);
    expect(rows).toEqual([{ op: 'rem', a: ing('salt', 'salt', '10') }]);
  });

  it('marks changed entries as mod', () => {
    const rows = ingredientDiff(
      [ing('flour', 'flour', '500')],
      [ing('flour', 'flour', '550')]
    );
    expect(rows).toEqual([{
      op: 'mod',
      a: ing('flour', 'flour', '500'),
      b: ing('flour', 'flour', '550')
    }]);
  });

  it('preserves order: A entries first in their order, then B-only added at the end', () => {
    const rows = ingredientDiff(
      [ing('flour', 'flour', '500'), ing('water', 'water', '350')],
      [ing('water', 'water', '375'), ing('flour', 'flour', '500'), ing('salt', 'salt', '10')]
    );
    expect(rows.map(r => [r.op, r.a?.id ?? r.b?.id])).toEqual([
      ['ctx', 'flour'],
      ['mod', 'water'],
      ['add', 'salt']
    ]);
  });
});

describe('stepTextDiff', () => {
  const s = (text: string): Step => ({ text, uses: [] });

  it('produces line-level edit script of step texts', () => {
    const ops = stepTextDiff([s('mix'), s('rise'), s('bake')], [s('mix'), s('rise long'), s('bake')]);
    expect(ops).toEqual([
      { op: 'ctx', text: 'mix' },
      { op: 'rem', text: 'rise' },
      { op: 'add', text: 'rise long' },
      { op: 'ctx', text: 'bake' }
    ]);
  });
});

describe('stepObjectDiff', () => {
  const s = (text: string, uses: { ingredientId: string; amount: number }[] = []): Step => ({ text, uses });

  it('marks identical steps as ctx and preserves uses', () => {
    const a = [s('mix', [{ ingredientId: 'flour', amount: 100 }])];
    const b = [s('mix', [{ ingredientId: 'flour', amount: 100 }])];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([{ op: 'ctx', step: a[0] }]);
  });

  it('marks A-only steps as rem with full step object', () => {
    const a = [s('one', [{ ingredientId: 'flour', amount: 50 }])];
    const b: Step[] = [];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([{ op: 'rem', step: a[0] }]);
  });

  it('marks B-only steps as add with full step object', () => {
    const a: Step[] = [];
    const b = [s('two', [{ ingredientId: 'salt', amount: 5 }])];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([{ op: 'add', step: b[0] }]);
  });

  it('aligns inserted steps in B without misaligning later ones', () => {
    const a = [s('mix'), s('bake')];
    const b = [s('mix'), s('rise'), s('bake')];
    const rows = stepObjectDiff(a, b);
    expect(rows.map(r => [r.op, r.op === 'mod' ? r.a.text : r.step.text])).toEqual([
      ['ctx', 'mix'],
      ['add', 'rise'],
      ['ctx', 'bake']
    ]);
  });

  it('different uses with same text are still ctx (text-only matching)', () => {
    const a = [s('mix', [{ ingredientId: 'flour', amount: 100 }])];
    const b = [s('mix', [{ ingredientId: 'flour', amount: 50 }])];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([{ op: 'ctx', step: a[0] }]);
  });

  it('collapses adjacent rem+add with similar text into a single mod row', () => {
    const a = [s('coil fold gently into the greased pan')];
    const b = [s('Coil fold gently into the greased pan')];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([{ op: 'mod', a: a[0], b: b[0] }]);
  });

  it('does not collapse rem+add with dissimilar text', () => {
    const a = [s('mix the dough thoroughly')];
    const b = [s('bake at high heat')];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([
      { op: 'rem', step: a[0] },
      { op: 'add', step: b[0] }
    ]);
  });
});
