import type { Recipe, Batch, IndexEntry, RecipePreset, BatchStatus, VariableValue, Ingredient, Step } from '$lib/server';
import { createRecipe, readRecipe, updateRecipe, deleteRecipe } from '$lib/data/recipes';
import { createBatch, updateBatch, deleteBatch, listBatches } from '$lib/data/batches';
import { readIndex, rebuildIndex } from '$lib/data/index-cache';

export const api = {
  async listRecipes(): Promise<IndexEntry[]> {
    return readIndex();
  },

  async createRecipe(input: { name: string; preset: RecipePreset; tags: string[]; description?: string }): Promise<Recipe> {
    const recipe = await createRecipe(input);
    await rebuildIndex();
    return recipe;
  },

  async getRecipe(id: string): Promise<{ recipe: Recipe; batches: Batch[] }> {
    const recipe = await readRecipe(id);
    if (!recipe) throw new Error(`Recipe not found: ${id}`);
    const batches = await listBatches(id);
    return { recipe, batches };
  },

  async createBatch(recipeId: string, input: {
    label: string;
    parentIds: string[];
    status: BatchStatus;
    variables: Record<string, VariableValue>;
    ingredients: Ingredient[];
    steps: Step[];
    outcomeNotes?: string;
    rating?: 1 | 2 | 3 | 4 | 5 | null;
    inconsistencyNote?: string;
    cookMultiplier?: number;
  }): Promise<Batch> {
    const batch = await createBatch(recipeId, input);
    await rebuildIndex();
    return batch;
  },

  async patchBatch(recipeId: string, batchId: string, patch: Partial<Batch>): Promise<Batch> {
    const batch = await updateBatch(recipeId, batchId, patch);
    await rebuildIndex();
    return batch;
  },

  async deleteRecipe(id: string): Promise<void> {
    await deleteRecipe(id);
    await rebuildIndex();
  },

  async patchRecipe(id: string, patch: Partial<Recipe>): Promise<Recipe> {
    const recipe = await updateRecipe(id, patch);
    await rebuildIndex();
    return recipe;
  },

  async deleteBatch(recipeId: string, batchId: string): Promise<void> {
    await deleteBatch(recipeId, batchId);
    await rebuildIndex();
  }
};
