# Better Batch — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** This user has a saved preference of never committing or pushing without explicit approval. Each `git commit` step in this plan must pause and ask the user before running. Run the `git add` first, show the staged diff, and wait for the user to say go.

**Goal:** Stand up Better Batch's foundation — SvelteKit + Bun + Tailwind v4 scaffolding, flat-file storage layer, pure-function domain layer, and a working REST API — so that the next plan (Core UI) can be built on top with confidence.

**Architecture:** Three sharp layers. `lib/server/storage/` is the only place that touches `node:fs`. `lib/server/domain/` is pure functions over plain data. `routes/api/*` is a thin HTTP shell that calls into storage and domain. Every layer has its own unit/integration tests; no UI in this plan beyond a placeholder home page.

**Tech Stack:** SvelteKit (Svelte 5) · Bun · TypeScript · Tailwind CSS v4 · `bun:test`

Reference: spec at `docs/superpowers/specs/2026-05-04-better-batch-design.md`.

---

## File Structure

Files this plan creates:

```
better-batch/
  .gitignore
  package.json                    # Bun + SvelteKit + Tailwind
  svelte.config.js
  vite.config.ts
  tsconfig.json
  config.json                     # { dataDir: "./data" }
  src/
    app.html
    app.css                       # @import "tailwindcss"; @theme tokens; font links
    app.d.ts
    lib/
      server/
        storage/
          paths.ts                # resolve data dir, recipe path, batch path
          atomic.ts               # writeFileAtomic (temp + rename)
          recipes.ts              # CRUD for recipe.json
          batches.ts              # CRUD for batch files
          index-cache.ts          # build/read/update index.json
        domain/
          types.ts                # Recipe, Batch, VariableSchemaItem, etc.
          slug.ts                 # slugify, uniqueSlug
          graph.ts                # childrenOf, ancestorsOf, rootBatches, isMerge
          diff.ts                 # variableDiff, textArrayDiff
          merge.ts                # resolveMerge
          schema.ts               # migrateBatchesForSchemaChange
        index.ts                  # public re-exports
    routes/
      +layout.svelte
      +page.svelte                # placeholder home
      api/
        recipes/+server.ts
        recipes/[id]/+server.ts
        recipes/[id]/batches/+server.ts
        recipes/[id]/batches/[batchId]/+server.ts
  tests/
    storage/
      atomic.test.ts
      recipes.test.ts
      batches.test.ts
      index-cache.test.ts
    domain/
      slug.test.ts
      graph.test.ts
      diff.test.ts
      merge.test.ts
      schema.test.ts
    api/
      recipes.test.ts
      batches.test.ts
  data/
    .gitkeep
```

Each layer file has one responsibility and stays well under 200 lines. Each `.test.ts` file mirrors its source.

---

## Task 0: Repo init & scaffolding

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `src/app.html`, `src/app.css`, `src/app.d.ts`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`, `config.json`, `data/.gitkeep`

- [ ] **Step 1: `git init` and create `.gitignore`**

```bash
cd /Users/katieWork/Developer/better-batch
git init
```

Write `.gitignore`:

```
node_modules
.svelte-kit
build
dist
.DS_Store
data/recipes/
data/index.json
.superpowers/
```

(Note: `data/.gitkeep` keeps the folder tracked; recipes themselves are gitignored.)

- [ ] **Step 2: Initialize SvelteKit with Bun**

Run:

```bash
bun create svelte@latest .
```

Select: **Skeleton project**, **TypeScript syntax**, no Prettier/ESLint/Playwright/Vitest (we'll add `bun:test` ourselves; Playwright is in Plan 2).

Then:

```bash
bun install
bun add -D @sveltejs/adapter-node
bun add -D tailwindcss@next @tailwindcss/vite@next
```

- [ ] **Step 3: Configure Node adapter and Tailwind Vite plugin**

Edit `svelte.config.js` to use `@sveltejs/adapter-node`:

```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter() }
};
```

Edit `vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()]
});
```

- [ ] **Step 4: Write `src/app.css` with Tailwind theme tokens**

```css
@import "tailwindcss";

@theme {
  --color-canvas: #F5F2ED;
  --color-obsidian: #1A1A1A;
  --color-ochre: #A65D39;
  --color-juniper: #344E41;
  --color-drafting: #D1CDC7;
  --font-serif: "Fraunces", serif;
  --font-sans: "Inter", system-ui, sans-serif;
  --radius-sm: 4px;
}

html, body { background: var(--color-canvas); color: var(--color-obsidian); font-family: var(--font-sans); }
```

Edit `src/app.html` head to load Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400..700&display=swap" rel="stylesheet">
```

Make sure `<body>` has `class="font-sans bg-canvas text-obsidian"`.

In `src/routes/+layout.svelte`:

```svelte
<script>
  import '../app.css';
  let { children } = $props();
</script>
{@render children()}
```

In `src/routes/+page.svelte`:

```svelte
<main class="p-8">
  <h1 class="font-serif text-3xl">Better Batch</h1>
  <p class="text-sm opacity-70">Foundation scaffolding online.</p>
</main>
```

- [ ] **Step 5: Create `config.json` and `data/.gitkeep`**

```json
{ "dataDir": "./data" }
```

```bash
mkdir -p data
touch data/.gitkeep
```

- [ ] **Step 6: Verify dev server runs**

Run: `bun run dev`
Expected: server starts on `http://localhost:5173`, page renders "Better Batch" in Fraunces.

Stop the server (Ctrl-C).

- [ ] **Step 7: Commit (ASK USER FIRST)**

```bash
git add .
git status
```

Show the user the staged file list, ask permission, then:

```bash
git commit -m "chore: scaffold SvelteKit + Bun + Tailwind v4 foundation"
```

---

## Task 1: Domain types

**Files:**
- Create: `src/lib/server/domain/types.ts`

- [ ] **Step 1: Write the type definitions**

```ts
// src/lib/server/domain/types.ts
export type VariableType = 'number' | 'text';

export interface VariableSchemaItem {
  name: string;
  unit: string;        // e.g. "%", "°F", "g", "" (empty allowed)
  type: VariableType;
}

export type VariableValue = number | string | null;

export type RecipePreset = 'bread' | 'sauce' | 'braise' | 'custom';

export interface Recipe {
  id: string;                       // slug
  name: string;
  description: string;
  tags: string[];
  preset: RecipePreset;
  variableSchema: VariableSchemaItem[];
  currentBatchId: string | null;
  createdAt: string;                // ISO 8601
  updatedAt: string;
}

export type BatchStatus = 'draft' | 'cooked' | 'archived';

export interface Ingredient {
  name: string;
  amount: string;                   // free text, e.g. "500" or "1/2"
  unit: string;                     // e.g. "g", "tsp"
}

export interface Batch {
  id: string;                       // slug like "v3-longer-bulk"
  recipeId: string;
  label: string;
  parentIds: string[];              // 0 = root, 1 = normal, 2 = merge
  status: BatchStatus;
  cookedAt: string | null;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: string[];
  outcomeNotes: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  createdAt: string;
}

export interface IndexEntry {
  id: string;
  name: string;
  tags: string[];
  preset: RecipePreset;
  batchCount: number;
  lastCookedAt: string | null;
  sparklineVariable: string | null;       // schema item name, or null
  sparklineValues: (number | null)[];     // chronological, only if numeric
}
```

- [ ] **Step 2: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/domain/types.ts
git commit -m "feat(domain): add core types"
```

---

## Task 2: Slug helper

**Files:**
- Create: `src/lib/server/domain/slug.ts`
- Test: `tests/domain/slug.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/slug.test.ts
import { describe, it, expect } from 'bun:test';
import { slugify, uniqueSlug } from '../../src/lib/server/domain/slug';

describe('slugify', () => {
  it('lowercases and dashes', () => {
    expect(slugify('Sourdough Loaf')).toBe('sourdough-loaf');
  });
  it('strips punctuation', () => {
    expect(slugify("Mom's 70% bread!")).toBe('moms-70-bread');
  });
  it('collapses whitespace and dashes', () => {
    expect(slugify('   a   b---c   ')).toBe('a-b-c');
  });
  it('returns "untitled" for empty input', () => {
    expect(slugify('   ')).toBe('untitled');
  });
});

describe('uniqueSlug', () => {
  it('returns base when not taken', () => {
    expect(uniqueSlug('foo', new Set())).toBe('foo');
  });
  it('appends -2 when taken', () => {
    expect(uniqueSlug('foo', new Set(['foo']))).toBe('foo-2');
  });
  it('keeps incrementing', () => {
    expect(uniqueSlug('foo', new Set(['foo', 'foo-2', 'foo-3']))).toBe('foo-4');
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `bun test tests/domain/slug.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/server/domain/slug.ts
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `bun test tests/domain/slug.test.ts`

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/domain/slug.ts tests/domain/slug.test.ts
git commit -m "feat(domain): slugify and uniqueSlug helpers"
```

---

## Task 3: Atomic file write

**Files:**
- Create: `src/lib/server/storage/atomic.ts`
- Test: `tests/storage/atomic.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/storage/atomic.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileAtomic } from '../../src/lib/server/storage/atomic';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-atomic-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('writeFileAtomic', () => {
  it('writes the contents to the target path', async () => {
    const path = join(dir, 'a.json');
    await writeFileAtomic(path, '{"x":1}');
    expect(await readFile(path, 'utf8')).toBe('{"x":1}');
  });

  it('leaves no temp files behind on success', async () => {
    const path = join(dir, 'b.json');
    await writeFileAtomic(path, 'hello');
    const files = await readdir(dir);
    expect(files).toEqual(['b.json']);
  });

  it('creates parent directories if missing', async () => {
    const path = join(dir, 'nested/deep/file.json');
    await writeFileAtomic(path, 'ok');
    expect(await readFile(path, 'utf8')).toBe('ok');
  });
});
```

- [ ] **Step 2: Run, expect FAIL (module missing)**

Run: `bun test tests/storage/atomic.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/server/storage/atomic.ts
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, path);
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/storage/atomic.ts tests/storage/atomic.test.ts
git commit -m "feat(storage): atomic file write"
```

---

## Task 4: Storage paths

**Files:**
- Create: `src/lib/server/storage/paths.ts`

- [ ] **Step 1: Implement (no separate test — exercised through recipes/batches tests)**

```ts
// src/lib/server/storage/paths.ts
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

let cachedRoot: string | null = null;

export async function getDataDir(): Promise<string> {
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
```

- [ ] **Step 2: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/storage/paths.ts
git commit -m "feat(storage): path resolution helpers"
```

---

## Task 5: Recipe storage

**Files:**
- Create: `src/lib/server/storage/recipes.ts`
- Test: `tests/storage/recipes.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/storage/recipes.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { createRecipe, readRecipe, updateRecipe, deleteRecipe, listRecipes } from '../../src/lib/server/storage/recipes';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bb-rec-'));
  setDataDirForTest(dir);
});
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

describe('recipe storage', () => {
  it('creates and reads a recipe', async () => {
    const r = await createRecipe({ name: 'Sourdough Loaf', preset: 'bread', tags: ['bread'] });
    expect(r.id).toBe('sourdough-loaf');
    expect(r.variableSchema.length).toBeGreaterThan(0); // bread preset prefills
    const back = await readRecipe(r.id);
    expect(back.name).toBe('Sourdough Loaf');
  });

  it('disambiguates duplicate names', async () => {
    await createRecipe({ name: 'Chili', preset: 'custom', tags: [] });
    const second = await createRecipe({ name: 'Chili', preset: 'custom', tags: [] });
    expect(second.id).toBe('chili-2');
  });

  it('lists recipes', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [] });
    await createRecipe({ name: 'B', preset: 'custom', tags: [] });
    const all = await listRecipes();
    expect(all.map(r => r.name).sort()).toEqual(['A', 'B']);
  });

  it('updates and deletes', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const u = await updateRecipe(r.id, { description: 'hello' });
    expect(u.description).toBe('hello');
    expect(u.updatedAt).not.toBe(r.updatedAt);
    await deleteRecipe(r.id);
    await expect(readRecipe(r.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `bun test tests/storage/recipes.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/server/storage/recipes.ts
import { readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { writeFileAtomic } from './atomic';
import { recipesDir, recipeFile, recipeDir } from './paths';
import { slugify, uniqueSlug } from '../domain/slug';
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
  const next: Recipe = { ...current, ...patch, id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
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
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/storage/recipes.ts tests/storage/recipes.test.ts
git commit -m "feat(storage): recipe CRUD with preset schemas"
```

---

## Task 6: Batch storage

**Files:**
- Create: `src/lib/server/storage/batches.ts`
- Test: `tests/storage/batches.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/storage/batches.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { createRecipe } from '../../src/lib/server/storage/recipes';
import { createBatch, readBatch, listBatches, updateBatch, deleteBatch } from '../../src/lib/server/storage/batches';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-bat-')); setDataDirForTest(dir); });
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

describe('batch storage', () => {
  it('creates a root batch (no parents)', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const b = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    expect(b.id).toMatch(/^v1/);
    expect(b.parentIds).toEqual([]);
  });

  it('creates a child batch and lists batches', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const v1 = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const v2 = await createBatch(r.id, { label: 'tweak', parentIds: [v1.id], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const all = await listBatches(r.id);
    expect(all.map(b => b.id).sort()).toEqual([v1.id, v2.id].sort());
    expect(v2.parentIds).toEqual([v1.id]);
  });

  it('disambiguates duplicate batch labels', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const a = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const b = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    expect(a.id).not.toBe(b.id);
  });

  it('updates and deletes', async () => {
    const r = await createRecipe({ name: 'X', preset: 'custom', tags: [] });
    const b = await createBatch(r.id, { label: 'initial', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const u = await updateBatch(r.id, b.id, { status: 'cooked', cookedAt: new Date().toISOString(), rating: 4 });
    expect(u.status).toBe('cooked');
    expect(u.rating).toBe(4);
    await deleteBatch(r.id, b.id);
    await expect(readBatch(r.id, b.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/lib/server/storage/batches.ts
import { readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { writeFileAtomic } from './atomic';
import { batchesDir, batchFile } from './paths';
import { slugify, uniqueSlug } from '../domain/slug';
import type { Batch, BatchStatus, Ingredient, VariableValue } from '../domain/types';

export interface CreateBatchInput {
  label: string;
  parentIds: string[];
  status: BatchStatus;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: string[];
  outcomeNotes?: string;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  cookedAt?: string | null;
}

async function existingBatchIds(recipeId: string): Promise<Set<string>> {
  try {
    const entries = await readdir(await batchesDir(recipeId));
    return new Set(entries.filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')));
  } catch (err: any) {
    if (err.code === 'ENOENT') return new Set();
    throw err;
  }
}

function nextVersionNumber(taken: Set<string>): number {
  let max = 0;
  for (const id of taken) {
    const m = id.match(/^v(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export async function createBatch(recipeId: string, input: CreateBatchInput): Promise<Batch> {
  const taken = await existingBatchIds(recipeId);
  const v = nextVersionNumber(taken);
  const baseLabelSlug = slugify(input.label);
  const id = uniqueSlug(`v${v}-${baseLabelSlug}`, taken);
  const now = new Date().toISOString();
  const batch: Batch = {
    id, recipeId,
    label: input.label,
    parentIds: input.parentIds,
    status: input.status,
    cookedAt: input.cookedAt ?? null,
    variables: input.variables,
    ingredients: input.ingredients,
    steps: input.steps,
    outcomeNotes: input.outcomeNotes ?? '',
    rating: input.rating ?? null,
    createdAt: now
  };
  await mkdir(await batchesDir(recipeId), { recursive: true });
  await writeFileAtomic(await batchFile(recipeId, id), JSON.stringify(batch, null, 2));
  return batch;
}

export async function readBatch(recipeId: string, batchId: string): Promise<Batch> {
  const raw = await readFile(await batchFile(recipeId, batchId), 'utf8');
  return JSON.parse(raw) as Batch;
}

export async function listBatches(recipeId: string): Promise<Batch[]> {
  const ids = [...(await existingBatchIds(recipeId))];
  return Promise.all(ids.map(id => readBatch(recipeId, id)));
}

export async function updateBatch(recipeId: string, batchId: string, patch: Partial<Batch>): Promise<Batch> {
  const current = await readBatch(recipeId, batchId);
  const next: Batch = { ...current, ...patch, id: current.id, recipeId: current.recipeId, createdAt: current.createdAt };
  await writeFileAtomic(await batchFile(recipeId, batchId), JSON.stringify(next, null, 2));
  return next;
}

export async function deleteBatch(recipeId: string, batchId: string): Promise<void> {
  await rm(await batchFile(recipeId, batchId), { force: true });
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/storage/batches.ts tests/storage/batches.test.ts
git commit -m "feat(storage): batch CRUD with auto-versioning"
```

---

## Task 7: Domain — graph traversal

**Files:**
- Create: `src/lib/server/domain/graph.ts`
- Test: `tests/domain/graph.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/graph.test.ts
import { describe, it, expect } from 'bun:test';
import { childrenOf, ancestorsOf, rootBatches, isMerge } from '../../src/lib/server/domain/graph';
import type { Batch } from '../../src/lib/server/domain/types';

const mk = (id: string, parentIds: string[]): Batch => ({
  id, recipeId: 'r', label: id, parentIds,
  status: 'draft', cookedAt: null, variables: {}, ingredients: [], steps: [], outcomeNotes: '', rating: null,
  createdAt: '2026-01-01T00:00:00Z'
});

describe('graph', () => {
  const batches = [
    mk('v1', []),
    mk('v2', ['v1']),
    mk('v3a', ['v2']),
    mk('v3b', ['v2']),
    mk('v4', ['v3a', 'v3b'])
  ];

  it('rootBatches returns batches with no parents', () => {
    expect(rootBatches(batches).map(b => b.id)).toEqual(['v1']);
  });

  it('childrenOf returns direct children', () => {
    expect(childrenOf(batches, 'v2').map(b => b.id).sort()).toEqual(['v3a', 'v3b']);
    expect(childrenOf(batches, 'v4')).toEqual([]);
  });

  it('ancestorsOf returns transitive ancestors (excluding self)', () => {
    const a = ancestorsOf(batches, 'v4').map(b => b.id).sort();
    expect(a).toEqual(['v1', 'v2', 'v3a', 'v3b']);
  });

  it('isMerge detects 2+ parents', () => {
    expect(isMerge(batches[0])).toBe(false);
    expect(isMerge(batches[4])).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/lib/server/domain/graph.ts
import type { Batch } from './types';

export function rootBatches(all: Batch[]): Batch[] {
  return all.filter(b => b.parentIds.length === 0);
}

export function childrenOf(all: Batch[], parentId: string): Batch[] {
  return all.filter(b => b.parentIds.includes(parentId));
}

export function ancestorsOf(all: Batch[], batchId: string): Batch[] {
  const byId = new Map(all.map(b => [b.id, b] as const));
  const out = new Map<string, Batch>();
  const start = byId.get(batchId);
  if (!start) return [];
  const queue: string[] = [...start.parentIds];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    const b = byId.get(id);
    if (!b) continue;
    out.set(id, b);
    queue.push(...b.parentIds);
  }
  return [...out.values()];
}

export function isMerge(batch: Batch): boolean {
  return batch.parentIds.length >= 2;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/domain/graph.ts tests/domain/graph.test.ts
git commit -m "feat(domain): graph traversal helpers"
```

---

## Task 8: Domain — variable diff

**Files:**
- Create: `src/lib/server/domain/diff.ts`
- Test: `tests/domain/diff.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/diff.test.ts
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
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/lib/server/domain/diff.ts
import type { VariableSchemaItem, VariableValue } from './types';

export interface VariableDiffRow {
  name: string;
  unit: string;
  type: 'number' | 'text';
  a: VariableValue;
  b: VariableValue;
  delta: number | null;       // numeric only; null if either side null or non-numeric
  changed: boolean;
}

export function variableDiff(
  schema: VariableSchemaItem[],
  a: Record<string, VariableValue>,
  b: Record<string, VariableValue>
): VariableDiffRow[] {
  return schema.map(item => {
    const av = a[item.name] ?? null;
    const bv = b[item.name] ?? null;
    let delta: number | null = null;
    if (item.type === 'number' && typeof av === 'number' && typeof bv === 'number') {
      delta = bv - av;
    }
    return { name: item.name, unit: item.unit, type: item.type, a: av, b: bv, delta, changed: av !== bv };
  });
}

export type DiffOp = 'ctx' | 'add' | 'rem';
export interface DiffLine { op: DiffOp; text: string; }

export function textArrayDiff(a: string[], b: string[]): DiffLine[] {
  // Classic LCS, then walk back to produce edit script.
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  const out: DiffLine[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { out.push({ op: 'ctx', text: a[i - 1] }); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { out.push({ op: 'rem', text: a[i - 1] }); i--; }
    else { out.push({ op: 'add', text: b[j - 1] }); j--; }
  }
  while (i > 0) { out.push({ op: 'rem', text: a[i - 1] }); i--; }
  while (j > 0) { out.push({ op: 'add', text: b[j - 1] }); j--; }
  return out.reverse();
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/domain/diff.ts tests/domain/diff.test.ts
git commit -m "feat(domain): variable and text-array diff"
```

---

## Task 9: Domain — merge resolution

**Files:**
- Create: `src/lib/server/domain/merge.ts`
- Test: `tests/domain/merge.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/merge.test.ts
import { describe, it, expect } from 'bun:test';
import { resolveMerge } from '../../src/lib/server/domain/merge';
import type { Batch } from '../../src/lib/server/domain/types';

const a: Batch = {
  id: 'v4a', recipeId: 'r', label: 'a', parentIds: ['v3'], status: 'cooked', cookedAt: null,
  variables: { hydration: 72, bulk: 5 }, ingredients: [{ name: 'flour', amount: '500', unit: 'g' }],
  steps: ['mix', 'bake'], outcomeNotes: '', rating: null, createdAt: '2026-01-01'
};
const b: Batch = {
  ...a, id: 'v4b', label: 'b', variables: { hydration: 75, bulk: 4 },
  ingredients: [{ name: 'flour', amount: '500', unit: 'g' }, { name: 'salt', amount: '10', unit: 'g' }],
  steps: ['mix', 'rise', 'bake']
};

describe('resolveMerge', () => {
  it('applies variable picks per field', () => {
    const result = resolveMerge(a, b, {
      variables: { hydration: { from: 'b' }, bulk: { from: 'a' } },
      ingredients: { from: 'b' },
      steps: { from: 'b' }
    });
    expect(result.variables.hydration).toBe(75);
    expect(result.variables.bulk).toBe(5);
    expect(result.ingredients.length).toBe(2);
    expect(result.steps).toEqual(['mix', 'rise', 'bake']);
  });

  it('supports custom variable values', () => {
    const result = resolveMerge(a, b, {
      variables: { hydration: { from: 'custom', value: 80 }, bulk: { from: 'a' } },
      ingredients: { from: 'a' }, steps: { from: 'a' }
    });
    expect(result.variables.hydration).toBe(80);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/lib/server/domain/merge.ts
import type { Batch, Ingredient, VariableValue } from './types';

export type FieldSource =
  | { from: 'a' }
  | { from: 'b' }
  | { from: 'custom'; value: any };

export interface MergePicks {
  variables: Record<string, FieldSource>;
  ingredients: FieldSource;        // pick whole list from a or b (custom = explicit array)
  steps: FieldSource;
}

export interface MergeResult {
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: string[];
}

function pickValue<T>(a: T, b: T, src: FieldSource): T {
  if (src.from === 'a') return a;
  if (src.from === 'b') return b;
  return src.value as T;
}

export function resolveMerge(a: Batch, b: Batch, picks: MergePicks): MergeResult {
  const variables: Record<string, VariableValue> = {};
  for (const [name, src] of Object.entries(picks.variables)) {
    variables[name] = pickValue(a.variables[name] ?? null, b.variables[name] ?? null, src);
  }
  const ingredients = pickValue(a.ingredients, b.ingredients, picks.ingredients);
  const steps = pickValue(a.steps, b.steps, picks.steps);
  return { variables, ingredients, steps };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/domain/merge.ts tests/domain/merge.test.ts
git commit -m "feat(domain): merge field resolution"
```

---

## Task 10: Domain — schema migration

**Files:**
- Create: `src/lib/server/domain/schema.ts`
- Test: `tests/domain/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/schema.test.ts
import { describe, it, expect } from 'bun:test';
import { migrateBatchVariables } from '../../src/lib/server/domain/schema';
import type { VariableSchemaItem } from '../../src/lib/server/domain/types';

const oldSchema: VariableSchemaItem[] = [
  { name: 'hydration', unit: '%', type: 'number' },
  { name: 'bulk', unit: 'h', type: 'number' }
];

describe('migrateBatchVariables', () => {
  it('adds new field as null', () => {
    const newSchema: VariableSchemaItem[] = [...oldSchema, { name: 'salt', unit: 'g', type: 'number' }];
    const out = migrateBatchVariables({ hydration: 72, bulk: 5 }, oldSchema, newSchema);
    expect(out).toEqual({ hydration: 72, bulk: 5, salt: null });
  });

  it('removes deleted field', () => {
    const newSchema: VariableSchemaItem[] = [{ name: 'hydration', unit: '%', type: 'number' }];
    const out = migrateBatchVariables({ hydration: 72, bulk: 5 }, oldSchema, newSchema);
    expect(out).toEqual({ hydration: 72 });
  });

  it('renames a field by index pairing', () => {
    const newSchema: VariableSchemaItem[] = [
      { name: 'hydration_pct', unit: '%', type: 'number' },
      { name: 'bulk', unit: 'h', type: 'number' }
    ];
    const out = migrateBatchVariables({ hydration: 72, bulk: 5 }, oldSchema, newSchema);
    expect(out).toEqual({ hydration_pct: 72, bulk: 5 });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/lib/server/domain/schema.ts
import type { VariableSchemaItem, VariableValue } from './types';

/**
 * Migrate a batch's variables map from oldSchema to newSchema.
 * Pairing rule: if oldSchema[i] and newSchema[i] differ only in name (same type), value carries over (rename).
 * Otherwise: matching by name across both schemas; new names start as null; missing names drop.
 */
export function migrateBatchVariables(
  current: Record<string, VariableValue>,
  oldSchema: VariableSchemaItem[],
  newSchema: VariableSchemaItem[]
): Record<string, VariableValue> {
  const out: Record<string, VariableValue> = {};
  // First pass: name-match
  const oldNames = new Set(oldSchema.map(s => s.name));
  for (const item of newSchema) {
    if (oldNames.has(item.name)) {
      out[item.name] = current[item.name] ?? null;
    } else {
      out[item.name] = null;
    }
  }
  // Second pass: index-paired renames (same position, different name, same type, was null in newSchema)
  for (let i = 0; i < Math.min(oldSchema.length, newSchema.length); i++) {
    const o = oldSchema[i], n = newSchema[i];
    if (o.name !== n.name && o.type === n.type && out[n.name] === null && current[o.name] !== undefined) {
      out[n.name] = current[o.name];
    }
  }
  return out;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/domain/schema.ts tests/domain/schema.test.ts
git commit -m "feat(domain): batch variable schema migration"
```

---

## Task 11: Index cache

**Files:**
- Create: `src/lib/server/storage/index-cache.ts`
- Test: `tests/storage/index-cache.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/storage/index-cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { createRecipe } from '../../src/lib/server/storage/recipes';
import { createBatch, updateBatch } from '../../src/lib/server/storage/batches';
import { rebuildIndex, readIndex } from '../../src/lib/server/storage/index-cache';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-idx-')); setDataDirForTest(dir); });
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

describe('index cache', () => {
  it('rebuilds with batch counts and last-cooked dates', async () => {
    const r = await createRecipe({ name: 'X', preset: 'bread', tags: ['bread'] });
    const v1 = await createBatch(r.id, { label: 'v1', parentIds: [], status: 'draft', variables: { hydration: 70 }, ingredients: [], steps: [] });
    await updateBatch(r.id, v1.id, { status: 'cooked', cookedAt: '2026-04-01T00:00:00Z' });
    await createBatch(r.id, { label: 'v2', parentIds: [v1.id], status: 'draft', variables: { hydration: 75 }, ingredients: [], steps: [] });

    await rebuildIndex();
    const idx = await readIndex();
    expect(idx).toHaveLength(1);
    expect(idx[0].batchCount).toBe(2);
    expect(idx[0].lastCookedAt).toBe('2026-04-01T00:00:00Z');
    expect(idx[0].sparklineVariable).toBe('hydration');
    expect(idx[0].sparklineValues).toEqual([70, 75]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/lib/server/storage/index-cache.ts
import { readFile } from 'node:fs/promises';
import { writeFileAtomic } from './atomic';
import { indexFile } from './paths';
import { listRecipes } from './recipes';
import { listBatches } from './batches';
import type { IndexEntry } from '../domain/types';

export async function rebuildIndex(): Promise<IndexEntry[]> {
  const recipes = await listRecipes();
  const entries: IndexEntry[] = [];
  for (const r of recipes) {
    const batches = await listBatches(r.id);
    const sorted = [...batches].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const cooked = sorted.filter(b => b.status === 'cooked' && b.cookedAt);
    const lastCookedAt = cooked.length ? cooked[cooked.length - 1].cookedAt : null;

    const numericVar = r.variableSchema.find(v => v.type === 'number');
    const sparklineVariable = numericVar?.name ?? null;
    const sparklineValues: (number | null)[] = sparklineVariable
      ? sorted.map(b => {
          const v = b.variables[sparklineVariable];
          return typeof v === 'number' ? v : null;
        })
      : [];

    entries.push({
      id: r.id, name: r.name, tags: r.tags, preset: r.preset,
      batchCount: batches.length, lastCookedAt, sparklineVariable, sparklineValues
    });
  }
  await writeFileAtomic(await indexFile(), JSON.stringify(entries, null, 2));
  return entries;
}

export async function readIndex(): Promise<IndexEntry[]> {
  try {
    return JSON.parse(await readFile(await indexFile(), 'utf8')) as IndexEntry[];
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/storage/index-cache.ts tests/storage/index-cache.test.ts
git commit -m "feat(storage): index cache rebuild + read"
```

---

## Task 12: Public server-lib barrel

**Files:**
- Create: `src/lib/server/index.ts`

- [ ] **Step 1: Re-export the public API**

```ts
// src/lib/server/index.ts
export * from './domain/types';
export * from './domain/graph';
export * from './domain/diff';
export * from './domain/merge';
export * from './domain/schema';
export * from './domain/slug';

export * from './storage/recipes';
export * from './storage/batches';
export * from './storage/index-cache';
```

- [ ] **Step 2: Commit (ASK USER FIRST)**

```bash
git add src/lib/server/index.ts
git commit -m "feat: public server-lib barrel"
```

---

## Task 13: Recipes API

**Files:**
- Create: `src/routes/api/recipes/+server.ts`, `src/routes/api/recipes/[id]/+server.ts`
- Test: `tests/api/recipes.test.ts`

- [ ] **Step 1: Implement collection endpoint**

```ts
// src/routes/api/recipes/+server.ts
import { json, error } from '@sveltejs/kit';
import { listRecipes, createRecipe, rebuildIndex, readIndex } from '$lib/server';

export async function GET() {
  const idx = await readIndex();
  if (idx.length === 0) {
    const rebuilt = await rebuildIndex();
    return json(rebuilt);
  }
  return json(idx);
}

export async function POST({ request }) {
  const body = await request.json();
  if (!body.name || typeof body.name !== 'string') throw error(400, 'name required');
  if (!['bread', 'sauce', 'braise', 'custom'].includes(body.preset)) throw error(400, 'invalid preset');
  const recipe = await createRecipe({ name: body.name, preset: body.preset, tags: body.tags ?? [], description: body.description });
  await rebuildIndex();
  return json(recipe, { status: 201 });
}
```

- [ ] **Step 2: Implement single-recipe endpoint**

```ts
// src/routes/api/recipes/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import { readRecipe, updateRecipe, deleteRecipe, listBatches, rebuildIndex, migrateBatchVariables, updateBatch } from '$lib/server';
import type { Recipe, VariableSchemaItem } from '$lib/server';

export async function GET({ params }) {
  try {
    const recipe = await readRecipe(params.id);
    const batches = await listBatches(params.id);
    return json({ recipe, batches });
  } catch (err: any) {
    if (err.code === 'ENOENT') throw error(404, 'recipe not found');
    throw err;
  }
}

export async function PATCH({ params, request }) {
  const patch = await request.json() as Partial<Recipe>;
  let current: Recipe;
  try { current = await readRecipe(params.id); }
  catch (err: any) { if (err.code === 'ENOENT') throw error(404, 'recipe not found'); throw err; }

  if (patch.variableSchema && JSON.stringify(patch.variableSchema) !== JSON.stringify(current.variableSchema)) {
    const oldSchema = current.variableSchema;
    const newSchema = patch.variableSchema as VariableSchemaItem[];
    const batches = await listBatches(params.id);
    for (const b of batches) {
      const migrated = migrateBatchVariables(b.variables, oldSchema, newSchema);
      await updateBatch(params.id, b.id, { variables: migrated });
    }
  }

  const next = await updateRecipe(params.id, patch);
  await rebuildIndex();
  return json(next);
}

export async function DELETE({ params }) {
  await deleteRecipe(params.id);
  await rebuildIndex();
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 3: Write integration tests**

```ts
// tests/api/recipes.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { GET as listGET, POST as listPOST } from '../../src/routes/api/recipes/+server';
import { GET as oneGET, PATCH as onePATCH, DELETE as oneDELETE } from '../../src/routes/api/recipes/[id]/+server';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-api-r-')); setDataDirForTest(dir); });
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

const reqJSON = (body: any) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('recipes api', () => {
  it('POST creates, GET lists', async () => {
    const created = await (await listPOST({ request: reqJSON({ name: 'Sourdough', preset: 'bread', tags: [] }) } as any)).json();
    expect(created.id).toBe('sourdough');
    const list = await (await listGET()).json();
    expect(list.map((r: any) => r.id)).toEqual(['sourdough']);
  });

  it('GET /[id] returns 404 for missing', async () => {
    await expect(oneGET({ params: { id: 'missing' } } as any)).rejects.toMatchObject({ status: 404 });
  });

  it('DELETE removes the recipe', async () => {
    await listPOST({ request: reqJSON({ name: 'X', preset: 'custom', tags: [] }) } as any);
    await oneDELETE({ params: { id: 'x' } } as any);
    const list = await (await listGET()).json();
    expect(list).toEqual([]);
  });
});
```

- [ ] **Step 4: Run, expect PASS**

Run: `bun test tests/api/recipes.test.ts`

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/routes/api/recipes tests/api/recipes.test.ts
git commit -m "feat(api): recipes endpoints"
```

---

## Task 14: Batches API

**Files:**
- Create: `src/routes/api/recipes/[id]/batches/+server.ts`, `src/routes/api/recipes/[id]/batches/[batchId]/+server.ts`
- Test: `tests/api/batches.test.ts`

- [ ] **Step 1: Implement collection endpoint**

```ts
// src/routes/api/recipes/[id]/batches/+server.ts
import { json, error } from '@sveltejs/kit';
import { createBatch, listBatches, readRecipe, updateRecipe, rebuildIndex } from '$lib/server';

export async function GET({ params }) {
  return json(await listBatches(params.id));
}

export async function POST({ params, request }) {
  let recipe;
  try { recipe = await readRecipe(params.id); }
  catch (err: any) { if (err.code === 'ENOENT') throw error(404, 'recipe not found'); throw err; }

  const body = await request.json();
  if (!body.label || typeof body.label !== 'string') throw error(400, 'label required');
  if (!Array.isArray(body.parentIds)) throw error(400, 'parentIds must be array');
  if (!['draft', 'cooked', 'archived'].includes(body.status)) throw error(400, 'invalid status');

  // Validate parents belong to this recipe
  if (body.parentIds.length) {
    const all = await listBatches(params.id);
    const ids = new Set(all.map(b => b.id));
    for (const pid of body.parentIds) {
      if (!ids.has(pid)) throw error(409, `parent ${pid} not in recipe`);
    }
  }

  const batch = await createBatch(params.id, {
    label: body.label, parentIds: body.parentIds, status: body.status,
    variables: body.variables ?? {}, ingredients: body.ingredients ?? [], steps: body.steps ?? [],
    outcomeNotes: body.outcomeNotes, rating: body.rating ?? null,
    cookedAt: body.status === 'cooked' ? (body.cookedAt ?? new Date().toISOString()) : null
  });
  await updateRecipe(params.id, { currentBatchId: batch.id });
  await rebuildIndex();
  return json(batch, { status: 201 });
}
```

- [ ] **Step 2: Implement single-batch endpoint**

```ts
// src/routes/api/recipes/[id]/batches/[batchId]/+server.ts
import { json, error } from '@sveltejs/kit';
import { readBatch, updateBatch, deleteBatch, rebuildIndex } from '$lib/server';

export async function GET({ params }) {
  try { return json(await readBatch(params.id, params.batchId)); }
  catch (err: any) { if (err.code === 'ENOENT') throw error(404, 'batch not found'); throw err; }
}

export async function PATCH({ params, request }) {
  const patch = await request.json();
  // Auto-stamp cookedAt when flipping to cooked
  if (patch.status === 'cooked' && !patch.cookedAt) patch.cookedAt = new Date().toISOString();
  const next = await updateBatch(params.id, params.batchId, patch);
  await rebuildIndex();
  return json(next);
}

export async function DELETE({ params }) {
  await deleteBatch(params.id, params.batchId);
  await rebuildIndex();
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 3: Write integration tests**

```ts
// tests/api/batches.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDataDirForTest, clearDataDirCache } from '../../src/lib/server/storage/paths';
import { POST as recipesPOST } from '../../src/routes/api/recipes/+server';
import { GET as listGET, POST as listPOST } from '../../src/routes/api/recipes/[id]/batches/+server';
import { PATCH as onePATCH } from '../../src/routes/api/recipes/[id]/batches/[batchId]/+server';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bb-api-b-')); setDataDirForTest(dir); });
afterEach(async () => { clearDataDirCache(); await rm(dir, { recursive: true, force: true }); });

const reqJSON = (body: any) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('batches api', () => {
  it('creates root then child batch', async () => {
    await recipesPOST({ request: reqJSON({ name: 'Sourdough', preset: 'bread', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'sourdough' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) } as any)).json();
    const v2 = await (await listPOST({ params: { id: 'sourdough' }, request: reqJSON({ label: 'tweak', parentIds: [v1.id], status: 'draft' }) } as any)).json();
    expect(v2.parentIds).toEqual([v1.id]);
    const all = await (await listGET({ params: { id: 'sourdough' } } as any)).json();
    expect(all).toHaveLength(2);
  });

  it('rejects parent from a different recipe (409)', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    await expect(listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'x', parentIds: ['ghost'], status: 'draft' }) } as any))
      .rejects.toMatchObject({ status: 409 });
  });

  it('PATCH to cooked auto-stamps cookedAt', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) } as any)).json();
    const updated = await (await onePATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'cooked' }), headers: { 'content-type': 'application/json' } }) } as any)).json();
    expect(updated.status).toBe('cooked');
    expect(updated.cookedAt).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run, expect PASS**

Run: `bun test tests/api/batches.test.ts`

- [ ] **Step 5: Commit (ASK USER FIRST)**

```bash
git add src/routes/api/recipes/[id]/batches tests/api/batches.test.ts
git commit -m "feat(api): batches endpoints with parent validation"
```

---

## Task 15: Smoke test the running server

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev server**

Run: `bun run dev`

- [ ] **Step 2: Hit the API with curl**

```bash
# Create a recipe
curl -s -X POST http://localhost:5173/api/recipes \
  -H 'content-type: application/json' \
  -d '{"name":"Sourdough Loaf","preset":"bread","tags":["bread"]}' | jq

# List recipes
curl -s http://localhost:5173/api/recipes | jq

# Add V1 batch
curl -s -X POST http://localhost:5173/api/recipes/sourdough-loaf/batches \
  -H 'content-type: application/json' \
  -d '{"label":"initial","parentIds":[],"status":"draft","variables":{"hydration":70,"bulk_ferment":4,"bake_temp":475,"yield":2}}' | jq
```

Expected: 201 responses with full recipe/batch JSON. Check `data/recipes/sourdough-loaf/` exists with `recipe.json` and `batches/v1-initial.json`.

- [ ] **Step 3: Stop the server, verify all tests pass**

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 4: Commit (ASK USER FIRST)**

If anything was tweaked during smoke test, commit any fixes:

```bash
git add -A
git status
# show diff, ask user, then:
git commit -m "chore: foundation smoke test"
```

---

## Self-review notes

- **Spec coverage:** Domain model (§2 of spec) → Tasks 1, 7. Storage layout (§3) → Tasks 3–6, 11. Application architecture (§4) → Tasks 0, 12. API (§7) → Tasks 13–14. Error handling (§8) → embedded in Tasks 13–14 (404, 400, 409). Testing strategy (§9) → every task. UI surfaces (§5) and visual guardrails (§6) → deferred to Plan 2 by design (this plan only sets up theme tokens in Task 0).
- **Out of scope as intended:** No UI beyond placeholder home (Plan 2). No Playwright (Plan 2). No photos/auth/sync (out of MVP).
- **Risks:** SvelteKit endpoint test ergonomics — calling `+server.ts` handlers directly with synthetic `Request` objects works but is awkward; if it gets painful, switch to spinning up an actual server in tests. Worth revisiting after Task 13.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-better-batch-foundation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
