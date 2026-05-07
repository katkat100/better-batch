import { describe, it, expect } from 'bun:test';
import { parseRecipePaste } from '../../src/lib/shared/recipe-paste';
import type { VariableSchemaItem } from '../../src/lib/server';

const breadSchema: VariableSchemaItem[] = [
  { name: 'hydration', unit: '%', type: 'number' },
  { name: 'bake_temp', unit: '°F', type: 'number' },
  { name: 'yield', unit: 'loaves', type: 'number' },
  { name: 'flavor', unit: '', type: 'text' }
];

describe('parseRecipePaste', () => {
  it('parses standard format with headers and bullets', () => {
    const input = `Ingredients:
- 500g flour
- 100g water

Steps:
1. Mix flour and water
2. Bake at 425F`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.ingredients[0]).toMatchObject({ amount: '500', unit: 'g', name: 'flour' });
    expect(r.ingredients[1]).toMatchObject({ amount: '100', unit: 'g', name: 'water' });
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].text).toBe('Mix flour and water');
    expect(r.steps[1].text).toBe('Bake at 425F');
  });

  it('parses no-bullet format with headers', () => {
    const input = `Ingredients:
500g flour
100g water
Steps:
1. Mix`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].text).toBe('Mix');
  });

  it('parses free-form (no headers): ingredient-shaped lines become ingredients, others become steps', () => {
    const input = `500g flour
100g water
Mix everything together
Knead for 10 minutes`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].text).toBe('Mix everything together');
    expect(r.steps[1].text).toBe('Knead for 10 minutes');
  });

  it('parses section headers within ingredients', () => {
    const input = `Ingredients:
Levain
- 50g flour
- 50g water

Final Dough
- 500g flour
- 350g water

Steps:
1. Mix`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(4);
    expect(r.ingredients[0].section).toBe('Levain');
    expect(r.ingredients[1].section).toBe('Levain');
    expect(r.ingredients[2].section).toBe('Final Dough');
    expect(r.ingredients[3].section).toBe('Final Dough');
  });

  it('joins multi-line steps', () => {
    const input = `Steps:
1. Mix the flour
and water
thoroughly
2. Knead.`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].text).toBe('Mix the flour and water thoroughly');
    expect(r.steps[1].text).toBe('Knead.');
  });

  it('parses variables matched against schema (name normalization, number coercion)', () => {
    const input = `Hydration: 75%
Bake Temp = 450°F
Yield - 2 loaves

Ingredients:
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.variables.hydration).toBe(75);
    expect(r.variables.bake_temp).toBe(450);
    expect(r.variables.yield).toBe(2);
  });

  it('skips number-typed variables that do not parse to a number', () => {
    const input = `Hydration: high

Ingredients:
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.variables.hydration).toBeUndefined();
    expect(r.unmatchedLines).toContain('Hydration: high');
  });

  it('puts unmatched Name: value patterns into unmatchedLines', () => {
    const input = `Stirring: vigorously

Ingredients:
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.variables.stirring).toBeUndefined();
    expect(r.unmatchedLines).toContain('Stirring: vigorously');
  });

  it('returns empty result on empty input', () => {
    const r = parseRecipePaste('', breadSchema);
    expect(r).toEqual({ ingredients: [], steps: [], variables: {}, unmatchedLines: [] });
  });

  it('puts pure-junk content into unmatchedLines or steps depending on shape', () => {
    const input = `lorem ipsum dolor
the quick brown fox jumps`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(0);
    expect(r.steps.length).toBeGreaterThan(0);
  });

  it('strips different bullet markers', () => {
    const input = `Ingredients:
- 500g flour
* 100g water
• 5g salt
– 2g yeast

Steps:
1. Mix`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(4);
    expect(r.ingredients.map(i => i.name)).toEqual(['flour', 'water', 'salt', 'yeast']);
  });

  it('handles numbered step variants (1. 1) Step 1:)', () => {
    const input = `Steps:
1. Mix
2) Knead
Step 3: Bake`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.steps).toHaveLength(3);
    expect(r.steps.map(s => s.text)).toEqual(['Mix', 'Knead', 'Bake']);
  });

  it('handles fraction amounts via parseAmount', () => {
    const input = `Ingredients:
- 1/2 tsp salt
- 1 1/2 cups water`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.ingredients[0]).toMatchObject({ amount: '1/2', unit: 'tsp', name: 'salt' });
    expect(r.ingredients[1]).toMatchObject({ amount: '1 1/2', unit: 'cups', name: 'water' });
  });

  it('keeps lines with no recognizable amount as nameless ingredients', () => {
    const input = `Ingredients:
- salt to taste
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients).toHaveLength(2);
    expect(r.ingredients[0]).toMatchObject({ amount: '', unit: '', name: 'salt to taste' });
    expect(r.ingredients[1]).toMatchObject({ amount: '500', unit: 'g', name: 'flour' });
  });

  it('all ingredients have id="" and section is undefined when no section header', () => {
    const input = `Ingredients:
- 500g flour`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.ingredients[0].id).toBe('');
    expect(r.ingredients[0].section).toBeUndefined();
  });

  it('all steps have empty uses array', () => {
    const input = `Steps:
1. Mix`;
    const r = parseRecipePaste(input, breadSchema);
    expect(r.steps[0].uses).toEqual([]);
  });
});
