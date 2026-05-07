import type { Recipe, Batch, IndexEntry, RecipePreset, BatchStatus, VariableValue, Ingredient, Step } from '$lib/server';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async listRecipes(): Promise<IndexEntry[]> {
    return jsonOrThrow(await fetch('/api/recipes'));
  },

  async createRecipe(input: { name: string; preset: RecipePreset; tags: string[]; description?: string }): Promise<Recipe> {
    return jsonOrThrow(await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    }));
  },

  async getRecipe(id: string): Promise<{ recipe: Recipe; batches: Batch[] }> {
    return jsonOrThrow(await fetch(`/api/recipes/${id}`));
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
  }): Promise<Batch> {
    return jsonOrThrow(await fetch(`/api/recipes/${recipeId}/batches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    }));
  },

  async patchBatch(recipeId: string, batchId: string, patch: Partial<Batch>): Promise<Batch> {
    return jsonOrThrow(await fetch(`/api/recipes/${recipeId}/batches/${batchId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    }));
  },

  async deleteRecipe(id: string): Promise<void> {
    const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
  },

  async patchRecipe(id: string, patch: Partial<Recipe>): Promise<Recipe> {
    return jsonOrThrow(await fetch(`/api/recipes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    }));
  },

  async deleteBatch(recipeId: string, batchId: string): Promise<void> {
    const res = await fetch(`/api/recipes/${recipeId}/batches/${batchId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
  }
};
