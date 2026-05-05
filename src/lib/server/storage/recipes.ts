import { readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { writeFileAtomic } from './atomic';
import { recipesDir, recipeFile, recipeDir } from './paths';
import { slugify, uniqueSlug } from '../../shared/slug';
import type { Recipe, RecipePreset, VariableSchemaItem } from '../domain/types';

const PRESET_SCHEMAS: Record<RecipePreset, VariableSchemaItem[]> = {
  bread: [
    { name: 'hydration', unit: '%', type: 'number' },
    { name: 'bulk_ferment', unit: 'h', type: 'number' },
    { name: 'bake_temp', unit: '°F', type: 'number' },
    { name: 'yield', unit: 'loaves', type: 'number' }
  ],
  sauce: [
    { name: 'simmer_time', unit: 'min', type: 'number' },
    { name: 'yield', unit: 'cups', type: 'number' }
  ],
  braise: [
    { name: 'braise_time', unit: 'h', type: 'number' },
    { name: 'oven_temp', unit: '°F', type: 'number' }
  ],
  custom: []
};

export interface CreateRecipeInput {
  name: string;
  description?: string;
  preset: RecipePreset;
  tags: string[];
}

async function existingRecipeIds(): Promise<Set<string>> {
  try {
    const entries = await readdir(await recipesDir(), { withFileTypes: true });
    return new Set(entries.filter(e => e.isDirectory()).map(e => e.name));
  } catch (err: any) {
    if (err.code === 'ENOENT') return new Set();
    throw err;
  }
}

export async function createRecipe(input: CreateRecipeInput): Promise<Recipe> {
  const taken = await existingRecipeIds();
  const id = uniqueSlug(slugify(input.name), taken);
  const now = new Date().toISOString();
  const recipe: Recipe = {
    id, name: input.name,
    description: input.description ?? '',
    tags: input.tags,
    preset: input.preset,
    variableSchema: PRESET_SCHEMAS[input.preset],
    currentBatchId: null,
    createdAt: now, updatedAt: now
  };
  await mkdir(await recipeDir(id), { recursive: true });
  await writeFileAtomic(await recipeFile(id), JSON.stringify(recipe, null, 2));
  return recipe;
}

export async function readRecipe(id: string): Promise<Recipe> {
  const raw = await readFile(await recipeFile(id), 'utf8');
  return JSON.parse(raw) as Recipe;
}

export async function updateRecipe(id: string, patch: Partial<Recipe>): Promise<Recipe> {
  const current = await readRecipe(id);
  let nextUpdatedAt = new Date().toISOString();
  if (nextUpdatedAt <= current.updatedAt) {
    nextUpdatedAt = new Date(new Date(current.updatedAt).getTime() + 1).toISOString();
  }
  const next: Recipe = { ...current, ...patch, id: current.id, createdAt: current.createdAt, updatedAt: nextUpdatedAt };
  await writeFileAtomic(await recipeFile(id), JSON.stringify(next, null, 2));
  return next;
}

export async function deleteRecipe(id: string): Promise<void> {
  await rm(await recipeDir(id), { recursive: true, force: true });
}

export async function listRecipes(): Promise<Recipe[]> {
  const ids = [...(await existingRecipeIds())];
  return Promise.all(ids.map(id => readRecipe(id)));
}
