import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

let cachedRoot: string | null = null;

async function getDataDir(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  const override = process.env.BB_DATA_DIR;
  if (override) { cachedRoot = resolve(override); return cachedRoot; }
  try {
    const cfg = JSON.parse(await readFile('config.json', 'utf8'));
    cachedRoot = resolve(cfg.dataDir ?? './data');
  } catch {
    cachedRoot = resolve('./data');
  }
  return cachedRoot;
}

export function setDataDirForTest(dir: string): void { cachedRoot = resolve(dir); }
export function clearDataDirCache(): void { cachedRoot = null; }

export async function recipesDir(): Promise<string> {
  return join(await getDataDir(), 'recipes');
}
export async function recipeDir(recipeId: string): Promise<string> {
  return join(await recipesDir(), recipeId);
}
export async function recipeFile(recipeId: string): Promise<string> {
  return join(await recipeDir(recipeId), 'recipe.json');
}
export async function batchesDir(recipeId: string): Promise<string> {
  return join(await recipeDir(recipeId), 'batches');
}
export async function batchFile(recipeId: string, batchId: string): Promise<string> {
  return join(await batchesDir(recipeId), `${batchId}.json`);
}
export async function indexFile(): Promise<string> {
  return join(await getDataDir(), 'index.json');
}
