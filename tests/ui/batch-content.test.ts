import { describe, it, expect } from 'bun:test';
import {
  cleanBatchContent,
  nextVariables,
  evalVariableExpression,
  isContentDirty,
  summarizeEdits
} from '../../src/lib/ui/layout/batch-content';
import type { Ingredient, Step } from '../../src/lib/data/types';

const ing = (id: string, name: string, amount = '0', unit = '', section?: string): Ingredient =>
  ({ id, name, amount, unit, ...(section ? { section } : {}) });
const step = (text: string, uses: { ingredientId: string; amount: number }[] = []): Step => ({ text, uses });

describe('cleanBatchContent', () => {
  it('drops empty-name ingredients, trims steps, drops empty steps, drops invalid uses', () => {
    const out = cleanBatchContent({
      ingredients: [ing('flour', 'flour', '500', 'g'), ing('', '', '', '')],
      steps: [
        step('  Mix  ', [{ ingredientId: 'flour', amount: 500 }, { ingredientId: 'ghost', amount: 1 }]),
        step('   ')
      ]
    });
    expect(out.ingredients).toEqual([ing('flour', 'flour', '500', 'g')]);
    expect(out.steps).toEqual([step('Mix', [{ ingredientId: 'flour', amount: 500 }])]);
  });
});

describe('nextVariables', () => {
  it('empty string clears to null', () => {
    expect(nextVariables({ hydration: 70 }, 'hydration', '', 'number')).toEqual({ hydration: null });
  });
  it('number type parses, keeps raw string when not finite', () => {
    expect(nextVariables({}, 'hydration', '72', 'number')).toEqual({ hydration: 72 });
    expect(nextVariables({}, 'hydration', 'abc', 'number')).toEqual({ hydration: 'abc' });
  });
  it('text type keeps the raw string', () => {
    expect(nextVariables({}, 'note', 'soft', 'text')).toEqual({ note: 'soft' });
  });
});

describe('evalVariableExpression', () => {
  it('evaluates arithmetic and returns null on garbage', () => {
    expect(evalVariableExpression('397 + 100')).toBe(497);
    expect(evalVariableExpression('not a number')).toBeNull();
  });
});

describe('isContentDirty', () => {
  const base = {
    label: 'v1',
    variables: { hydration: 70 },
    ingredients: [ing('flour', 'flour', '500', 'g')],
    steps: [step('Mix', [{ ingredientId: 'flour', amount: 500 }])]
  };
  it('is false for identical content', () => {
    expect(isContentDirty(structuredClone(base), base)).toBe(false);
  });
  it('ignores a trailing blank ingredient row', () => {
    const draft = structuredClone(base);
    draft.ingredients.push(ing('', '', '', ''));
    expect(isContentDirty(draft, base)).toBe(false);
  });
  it('is true on label, variable, ingredient amount, or added step', () => {
    expect(isContentDirty({ ...structuredClone(base), label: 'v2' }, base)).toBe(true);
    expect(isContentDirty({ ...structuredClone(base), variables: { hydration: 72 } }, base)).toBe(true);
    const dAmt = structuredClone(base); dAmt.ingredients[0].amount = '550';
    expect(isContentDirty(dAmt, base)).toBe(true);
    const dStep = structuredClone(base); dStep.steps.push(step('Bake'));
    expect(isContentDirty(dStep, base)).toBe(true);
  });
});

describe('summarizeEdits', () => {
  const base = {
    label: 'v1', variables: {},
    ingredients: [ing('flour', 'flour', '500', 'g')],
    steps: [step('Mix'), step('Rest')]
  };
  it('reports no changes', () => {
    expect(summarizeEdits(base, structuredClone(base))).toBe('No changes');
  });
  it('counts changed steps and added ingredients', () => {
    const draft = structuredClone(base);
    draft.steps[0].text = 'Mix well';
    draft.ingredients.push(ing('water', 'water', '350', 'g'));
    expect(summarizeEdits(base, draft)).toBe('1 step changed · 1 ingredient added');
  });
});
