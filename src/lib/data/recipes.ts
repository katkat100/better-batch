import { openDb } from './db';
import type { Recipe, RecipePreset } from './types';
import { slugify, uniqueSlug } from '../shared/slug';
import { presetVariableSchema } from './schema';

export interface CreateRecipeInput {
  name: string;
  preset: RecipePreset;
  tags: string[];
  description?: string;
}

async function existingRecipeIds(): Promise<Set<string>> {
  const db = await openDb();
  const all = await db.getAllKeys('recipes');
  return new Set(all as string[]);
}

export async function createRecipe(input: CreateRecipeInput): Promise<Recipe> {
  const taken = await existingRecipeIds();
  const id = uniqueSlug(slugify(input.name) || 'recipe', taken);
  const now = new Date().toISOString();
  const recipe: Recipe = {
    id,
    name: input.name,
    description: input.description ?? '',
    tags: input.tags,
    preset: input.preset,
    variableSchema: presetVariableSchema(input.preset),
    currentBatchId: null,
    createdAt: now,
    updatedAt: now
  };
  const db = await openDb();
  // Deep-clone via JSON round-trip to strip any Svelte $state Proxy wrappers,
  // which cannot be structured-cloned by IndexedDB.
  await db.put('recipes', JSON.parse(JSON.stringify(recipe)));
  return recipe;
}

export async function readRecipe(id: string): Promise<Recipe | null> {
  const db = await openDb();
  const got = await db.get('recipes', id);
  return got ?? null;
}

export async function updateRecipe(id: string, patch: Partial<Recipe>): Promise<Recipe> {
  const db = await openDb();
  const current = await db.get('recipes', id);
  if (!current) throw new Error(`Recipe not found: ${id}`);
  const next: Recipe = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };
  // Deep-clone via JSON round-trip to strip any Svelte $state Proxy wrappers,
  // which cannot be structured-cloned by IndexedDB.
  await db.put('recipes', JSON.parse(JSON.stringify(next)));
  return next;
}

export async function listRecipes(): Promise<Recipe[]> {
  const db = await openDb();
  return db.getAll('recipes');
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await openDb();
  await db.delete('recipes', id);
}
