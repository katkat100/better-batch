import { api } from '$lib/ui/api-client';

/**
 * Seeds a curated "Weekly Focaccia" recipe with three batches that
 * demonstrate the recipe → batch → fork lineage. Used by the
 * first-launch welcome panel. Returns the new recipe id.
 */
export async function loadSampleRecipe(): Promise<string> {
  const recipe = await api.createRecipe({
    name: 'Weekly Focaccia',
    preset: 'bread',
    tags: ['focaccia', 'sample'],
    description: 'A sample recipe showing how Better Batch tracks attempts.'
  });

  const baseIngredients = [
    { id: 'flour', name: 'flour', amount: '500', unit: 'g' },
    { id: 'water', name: 'water', amount: '350', unit: 'g' },
    { id: 'salt', name: 'salt', amount: '10', unit: 'g' },
    { id: 'yeast', name: 'yeast', amount: '5', unit: 'g' },
    { id: 'olive-oil', name: 'olive oil', amount: '30', unit: 'g' }
  ];

  const baseSteps = [
    { text: 'Mix flour, water, salt, and yeast in a bowl until shaggy.', uses: [] },
    { text: 'Autolyse for 30 minutes.', uses: [] },
    { text: 'Bulk ferment 4 hours, folding every 30 minutes for the first 2 hours.', uses: [] },
    { text: 'Transfer to oiled pan, dimple with olive oil, rest 45 minutes.', uses: [] },
    { text: 'Bake 25 minutes at 425°F until golden.', uses: [] }
  ];

  const baseVariables = {
    hydration: 70,
    bulk_ferment: 4,
    bake_temp: 425,
    yield: 1
  };

  // Base — draft, no cook
  const base = await api.createBatch(recipe.id, {
    label: 'Base',
    parentIds: [],
    status: 'draft',
    variables: baseVariables,
    ingredients: baseIngredients.map(i => ({ ...i })),
    steps: baseSteps.map(s => ({ ...s, uses: [...s.uses] }))
  });

  // Base.2 — cooked, 3 stars
  const base2 = await api.createBatch(recipe.id, {
    label: 'Base.2',
    parentIds: [base.id],
    status: 'draft',
    variables: { ...baseVariables },
    ingredients: baseIngredients.map(i => ({ ...i })),
    steps: baseSteps.map(s => ({ ...s, uses: [...s.uses] }))
  });
  await api.patchBatch(recipe.id, base2.id, {
    status: 'cooked',
    cookedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    outcomeNotes: 'Good crust. Pan stuck a bit — more olive oil next time.',
    rating: 3
  });

  // high-hydration variant — cooked, 4 stars, 80% hydration
  const variantIngredients = baseIngredients.map(i =>
    i.name === 'water' ? { ...i, amount: '400' } : { ...i }
  );
  const variant = await api.createBatch(recipe.id, {
    label: 'high-hydration variant',
    parentIds: [base.id],
    status: 'draft',
    variables: { ...baseVariables, hydration: 80 },
    ingredients: variantIngredients,
    steps: baseSteps.map(s => ({ ...s, uses: [...s.uses] }))
  });
  await api.patchBatch(recipe.id, variant.id, {
    status: 'cooked',
    cookedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    outcomeNotes: 'Open crumb. Slightly harder to handle.',
    rating: 4
  });

  return recipe.id;
}
