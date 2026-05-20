# Offline-first Storage Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move recipe/batch persistence from Node `fs/promises` (under `src/lib/server/storage/`) to browser IndexedDB (via the `idb` wrapper), with a one-time auto-seed from a read-only server snapshot and manual Export/Import buttons for cross-machine moves.

**Architecture:** New `src/lib/data/` directory holds an IDB-backed storage layer that mirrors the surface of the existing server storage. Universal `+page.ts` loads gate on `browser` and read from IDB on the client. `api-client.ts` becomes a passthrough that calls the data layer directly instead of `fetch`ing. One surviving API route (`/api/seed/snapshot.json`) bootstraps IDB from existing on-disk data on first run.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, `idb` (~1kb gzipped) for IndexedDB, `fake-indexeddb` for unit tests, Bun test, Playwright e2e.

**Spec:** [`docs/superpowers/specs/2026-05-20-offline-first-storage-design.md`](../specs/2026-05-20-offline-first-storage-design.md)

---

## Task 1: Bootstrap data layer (deps, db.ts, move shared modules)

Set up the new `src/lib/data/` directory, install `idb` + `fake-indexeddb`, move types and pure helpers out of `src/lib/server/`, and create the IDB connection module.

**Files:**
- Create: `src/lib/data/db.ts`
- Move (`git mv`): `src/lib/server/domain/types.ts` → `src/lib/data/types.ts`
- Move: `src/lib/server/domain/diff.ts` → `src/lib/data/diff.ts`
- Move: `src/lib/server/domain/graph.ts` → `src/lib/data/graph.ts`
- Move: `src/lib/server/domain/merge.ts` → `src/lib/data/merge.ts`
- Move: `src/lib/server/domain/schema.ts` → `src/lib/data/schema.ts`
- Modify: `src/lib/server/index.ts` (barrel re-exports)
- Modify: `src/lib/server/storage/recipes.ts` (relative import path)
- Modify: `src/lib/server/storage/batches.ts` (relative import path)
- Modify: `src/lib/server/storage/index-cache.ts` (relative import path)
- Modify: `package.json` (deps)

- [ ] **Step 1: Install dependencies**

```bash
~/.bun/bin/bun add idb
~/.bun/bin/bun add -D fake-indexeddb
```

Expected: `idb` appears under `dependencies` and `fake-indexeddb` under `devDependencies` in `package.json`. Versions are whatever bun resolves to latest.

- [ ] **Step 2: Move the shared modules to `src/lib/data/`**

```bash
mkdir -p src/lib/data
git mv src/lib/server/domain/types.ts src/lib/data/types.ts
git mv src/lib/server/domain/diff.ts src/lib/data/diff.ts
git mv src/lib/server/domain/graph.ts src/lib/data/graph.ts
git mv src/lib/server/domain/merge.ts src/lib/data/merge.ts
git mv src/lib/server/domain/schema.ts src/lib/data/schema.ts
```

The files' internal relative imports (`from './types'`) still resolve since they all move together. Verify by reading any of the moved files — the `import type { ... } from './types'` lines should still be correct after the move.

- [ ] **Step 3: Update the server barrel to re-export from the new locations**

Replace the contents of `src/lib/server/index.ts` with:

```ts
export * from '../data/types';
export * from '../data/graph';
export * from '../data/diff';
export * from '../data/merge';
export * from '../data/schema';
export * from '../shared/slug';

export * from './storage/recipes';
export * from './storage/batches';
export * from './storage/index-cache';
```

UI files that import `from '$lib/server'` keep working unchanged because the barrel still exports the same names from the new locations.

- [ ] **Step 4: Update server storage relative imports to point at the new types location**

Edit `src/lib/server/storage/recipes.ts`. Replace the relative import of types from `../domain/types` with the new path. Find:

```ts
import type { ... } from '../domain/types';
```

Replace with:

```ts
import type { ... } from '../../data/types';
```

(Keep the same imported symbols — only the path string changes.)

Repeat for `src/lib/server/storage/batches.ts` and `src/lib/server/storage/index-cache.ts`. Each file has exactly one such import; update each.

- [ ] **Step 5: Create the IndexedDB connection module**

Create `src/lib/data/db.ts`:

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Recipe, Batch, IndexEntry } from './types';

interface BetterBatchDB extends DBSchema {
  recipes: {
    key: string;
    value: Recipe;
  };
  batches: {
    key: string;
    value: Batch;
    indexes: { byRecipe: string };
  };
  index: {
    key: string;            // always 'singleton'
    value: IndexEntry[];
  };
}

const DB_NAME = 'better-batch';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BetterBatchDB>> | null = null;

export function openDb(): Promise<IDBPDatabase<BetterBatchDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BetterBatchDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('recipes')) {
          db.createObjectStore('recipes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('batches')) {
          const batchStore = db.createObjectStore('batches', { keyPath: 'id' });
          batchStore.createIndex('byRecipe', 'recipeId', { unique: false });
        }
        if (!db.objectStoreNames.contains('index')) {
          db.createObjectStore('index');  // out-of-line keys, used with key 'singleton'
        }
      }
    });
  }
  return dbPromise;
}

/**
 * Reset the cached connection. Tests call this between cases so each one
 * gets a fresh in-memory IDB via fake-indexeddb's database reset.
 */
export function _resetDbForTests(): void {
  dbPromise = null;
}
```

- [ ] **Step 6: Add the fake-indexeddb test setup**

Create `tests/data/setup.ts`:

```ts
// Bun test setup: register fake-indexeddb as the global IndexedDB
// implementation for any test file under tests/data/ that imports this module.
import 'fake-indexeddb/auto';
```

The `fake-indexeddb/auto` entry installs the polyfill globally and resets between test runs.

- [ ] **Step 7: Write a smoke test for `openDb`**

Create `tests/data/db.test.ts`:

```ts
import './setup';
import { describe, it, expect, beforeEach } from 'bun:test';
import { openDb, _resetDbForTests } from '../../src/lib/data/db';

beforeEach(() => {
  _resetDbForTests();
  indexedDB.deleteDatabase('better-batch');
});

describe('openDb', () => {
  it('creates all three object stores on first open', async () => {
    const db = await openDb();
    expect([...db.objectStoreNames].sort()).toEqual(['batches', 'index', 'recipes']);
  });

  it('declares the byRecipe index on the batches store', async () => {
    const db = await openDb();
    const tx = db.transaction('batches', 'readonly');
    const indexNames = [...tx.store.indexNames];
    expect(indexNames).toContain('byRecipe');
  });

  it('returns the same promise across calls (caches connection)', async () => {
    const a = openDb();
    const b = openDb();
    expect(a).toBe(b);
    await a;
  });
});
```

- [ ] **Step 8: Run the smoke test**

```bash
~/.bun/bin/bun test tests/data/db.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 9: Run typecheck + lint + full test suite**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun test
```

Expected: 0 errors, 0 warnings; full suite passes (the existing 132 tests stay green because `from '$lib/server'` still resolves through the barrel).

- [ ] **Step 10: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add -A && git commit -m "$(cat <<'EOF'
feat(data): scaffold IDB storage layer; move shared modules

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Recipe storage (data/recipes.ts)

Port the recipe CRUD surface from `src/lib/server/storage/recipes.ts` to IndexedDB. Mirror the public function signatures exactly so the api-client passthrough in Task 7 is mechanical.

**Files:**
- Create: `src/lib/data/recipes.ts`
- Test: `tests/data/recipes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/data/recipes.test.ts`:

```ts
import './setup';
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createRecipe,
  readRecipe,
  updateRecipe,
  deleteRecipe,
  listRecipes
} from '../../src/lib/data/recipes';
import { _resetDbForTests } from '../../src/lib/data/db';

beforeEach(() => {
  _resetDbForTests();
  indexedDB.deleteDatabase('better-batch');
});

describe('recipes data layer', () => {
  it('creates a recipe and assigns a slugged id', async () => {
    const recipe = await createRecipe({
      name: 'Snickerdoodles',
      preset: 'custom',
      tags: ['cookie'],
      description: ''
    });
    expect(recipe.id).toBe('snickerdoodles');
    expect(recipe.name).toBe('Snickerdoodles');
    expect(recipe.preset).toBe('custom');
    expect(recipe.tags).toEqual(['cookie']);
    expect(typeof recipe.createdAt).toBe('string');
  });

  it('disambiguates id when slug is already taken', async () => {
    await createRecipe({ name: 'Bread', preset: 'bread', tags: [], description: '' });
    const second = await createRecipe({ name: 'Bread', preset: 'bread', tags: [], description: '' });
    expect(second.id).toBe('bread-2');
  });

  it('reads a recipe by id', async () => {
    await createRecipe({ name: 'Sauce', preset: 'sauce', tags: [], description: '' });
    const got = await readRecipe('sauce');
    expect(got?.name).toBe('Sauce');
  });

  it('returns null when reading a missing recipe', async () => {
    expect(await readRecipe('does-not-exist')).toBeNull();
  });

  it('updates a recipe by merging patch fields', async () => {
    await createRecipe({ name: 'Sauce', preset: 'sauce', tags: [], description: '' });
    const updated = await updateRecipe('sauce', { description: 'spicy' });
    expect(updated.description).toBe('spicy');
    expect(updated.id).toBe('sauce');  // id immutable
  });

  it('throws when updating a missing recipe', async () => {
    await expect(updateRecipe('ghost', { description: 'x' })).rejects.toThrow();
  });

  it('lists all recipes', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [], description: '' });
    await createRecipe({ name: 'B', preset: 'custom', tags: [], description: '' });
    const all = await listRecipes();
    expect(all.length).toBe(2);
    expect(all.map(r => r.id).sort()).toEqual(['a', 'b']);
  });

  it('deletes a recipe', async () => {
    await createRecipe({ name: 'Bye', preset: 'custom', tags: [], description: '' });
    await deleteRecipe('bye');
    expect(await readRecipe('bye')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
~/.bun/bin/bun test tests/data/recipes.test.ts
```

Expected: all 8 tests fail with "Cannot find module" or similar.

- [ ] **Step 3: Implement the module**

Create `src/lib/data/recipes.ts`:

```ts
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
  await db.put('recipes', recipe);
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
  await db.put('recipes', next);
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
```

Note: `presetVariableSchema` may already exist in `src/lib/data/schema.ts` (moved from `src/lib/server/domain/schema.ts` in Task 1). If the exported name differs, use whatever the existing schema module exports. Check by `grep -n "export" src/lib/data/schema.ts`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
~/.bun/bin/bun test tests/data/recipes.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Run typecheck**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/data/recipes.ts tests/data/recipes.test.ts && git commit -m "$(cat <<'EOF'
feat(data): recipe CRUD on IndexedDB

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Batch storage (data/batches.ts)

Port batch CRUD to IndexedDB, including the truthy-drop rules for `inconsistencyNote` and `cookMultiplier` already in `src/lib/server/storage/batches.ts`.

**Files:**
- Create: `src/lib/data/batches.ts`
- Test: `tests/data/batches.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/data/batches.test.ts`:

```ts
import './setup';
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createBatch,
  readBatch,
  updateBatch,
  deleteBatch,
  listBatches
} from '../../src/lib/data/batches';
import { _resetDbForTests, openDb } from '../../src/lib/data/db';

beforeEach(() => {
  _resetDbForTests();
  indexedDB.deleteDatabase('better-batch');
});

describe('batches data layer', () => {
  it('creates a batch with auto-versioned id under the recipe scope', async () => {
    const b = await createBatch('r1', {
      label: 'first',
      parentIds: [],
      status: 'draft',
      variables: {},
      ingredients: [],
      steps: []
    });
    expect(b.id.startsWith('v1-')).toBe(true);
    expect(b.recipeId).toBe('r1');
    expect(b.status).toBe('draft');
  });

  it('disambiguates batch id when an earlier v1 already exists for that recipe', async () => {
    await createBatch('r1', { label: 'first', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const second = await createBatch('r1', { label: 'second', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    expect(second.id.startsWith('v2-')).toBe(true);
  });

  it('listBatches returns only batches for the given recipe', async () => {
    await createBatch('r1', { label: 'a', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    await createBatch('r2', { label: 'b', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const r1Batches = await listBatches('r1');
    expect(r1Batches.length).toBe(1);
    expect(r1Batches[0].recipeId).toBe('r1');
  });

  it('does not persist inconsistencyNote when input is empty or falsy', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      inconsistencyNote: ''
    });
    expect(b.inconsistencyNote).toBeUndefined();
  });

  it('persists inconsistencyNote when input is non-empty', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      inconsistencyNote: 'garnish-style'
    });
    expect(b.inconsistencyNote).toBe('garnish-style');
  });

  it('does not persist cookMultiplier when input is <= 1', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 1
    });
    expect(b.cookMultiplier).toBeUndefined();
  });

  it('persists cookMultiplier when input > 1', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 2
    });
    expect(b.cookMultiplier).toBe(2);
  });

  it('updateBatch drops inconsistencyNote on falsy patch value', async () => {
    const created = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      inconsistencyNote: 'kept'
    });
    const updated = await updateBatch('r1', created.id, { inconsistencyNote: '' });
    expect(updated.inconsistencyNote).toBeUndefined();
  });

  it('updateBatch drops cookMultiplier on patch value <= 1', async () => {
    const created = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 2
    });
    const updated = await updateBatch('r1', created.id, { cookMultiplier: 1 });
    expect(updated.cookMultiplier).toBeUndefined();
  });

  it('deleteBatch removes the record', async () => {
    const b = await createBatch('r1', { label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    await deleteBatch('r1', b.id);
    expect(await readBatch('r1', b.id)).toBeNull();
  });

  it('readBatch returns null for a missing batch', async () => {
    expect(await readBatch('r1', 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
~/.bun/bin/bun test tests/data/batches.test.ts
```

Expected: all 11 tests fail with "Cannot find module" or similar.

- [ ] **Step 3: Implement the module**

Create `src/lib/data/batches.ts`:

```ts
import { openDb } from './db';
import type { Batch, BatchStatus, Ingredient, IngredientUse, VariableValue, Step } from './types';
import { slugify, uniqueSlug } from '../shared/slug';

export interface CreateBatchInput {
  label: string;
  parentIds: string[];
  status: BatchStatus;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
  outcomeNotes?: string;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  cookedAt?: string | null;
  inconsistencyNote?: string;
  cookMultiplier?: number;
}

async function batchIdsForRecipe(recipeId: string): Promise<Set<string>> {
  const db = await openDb();
  const all = await db.getAllFromIndex('batches', 'byRecipe', recipeId);
  return new Set(all.map(b => b.id));
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
  const taken = await batchIdsForRecipe(recipeId);
  const v = nextVersionNumber(taken);
  const baseLabelSlug = slugify(input.label);
  const id = uniqueSlug(`v${v}-${baseLabelSlug}`, taken);
  const now = new Date().toISOString();
  const batch: Batch = {
    id,
    recipeId,
    label: input.label,
    parentIds: input.parentIds,
    status: input.status,
    cookedAt: input.cookedAt ?? null,
    variables: input.variables,
    ingredients: input.ingredients,
    steps: input.steps,
    outcomeNotes: input.outcomeNotes ?? '',
    rating: input.rating ?? null,
    ...(input.inconsistencyNote ? { inconsistencyNote: input.inconsistencyNote } : {}),
    ...(input.cookMultiplier && input.cookMultiplier > 1 ? { cookMultiplier: input.cookMultiplier } : {}),
    createdAt: now
  };
  const db = await openDb();
  await db.put('batches', batch);
  return batch;
}

export async function readBatch(_recipeId: string, batchId: string): Promise<Batch | null> {
  const db = await openDb();
  const got = await db.get('batches', batchId);
  return got ?? null;
}

export async function listBatches(recipeId: string): Promise<Batch[]> {
  const db = await openDb();
  return db.getAllFromIndex('batches', 'byRecipe', recipeId);
}

export async function updateBatch(_recipeId: string, batchId: string, patch: Partial<Batch>): Promise<Batch> {
  const db = await openDb();
  const current = await db.get('batches', batchId);
  if (!current) throw new Error(`Batch not found: ${batchId}`);
  const next: Batch = {
    ...current,
    ...patch,
    id: current.id,
    recipeId: current.recipeId,
    createdAt: current.createdAt
  };
  if ('inconsistencyNote' in patch && !patch.inconsistencyNote) {
    delete (next as Partial<Batch>).inconsistencyNote;
  }
  if ('cookMultiplier' in patch && (!patch.cookMultiplier || patch.cookMultiplier <= 1)) {
    delete (next as Partial<Batch>).cookMultiplier;
  }
  await db.put('batches', next);
  return next;
}

export async function deleteBatch(_recipeId: string, batchId: string): Promise<void> {
  const db = await openDb();
  await db.delete('batches', batchId);
}
```

The `_recipeId` parameter on `readBatch`, `updateBatch`, and `deleteBatch` is unused (batches are globally keyed by `id` in IDB), but kept in the signature for parity with the Node-fs storage so the api-client passthrough in Task 7 stays mechanical.

- [ ] **Step 4: Run tests to verify they pass**

```bash
~/.bun/bin/bun test tests/data/batches.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 5: Run typecheck + lint**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
```

Expected: 0 errors. Lint may warn about `_recipeId` unused — the leading underscore should suppress the rule; if not, prefix isn't enough for this project's lint config, in which case add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` immediately above each affected parameter.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/data/batches.ts tests/data/batches.test.ts && git commit -m "$(cat <<'EOF'
feat(data): batch CRUD on IndexedDB with truthy-drop rules

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Index cache (data/index-cache.ts)

Port the sparkline index cache to IDB. This is the recipe-list summary the home page consumes.

**Files:**
- Create: `src/lib/data/index-cache.ts`
- Test: `tests/data/index-cache.test.ts`

- [ ] **Step 1: Read the existing implementation to understand the shape**

Look at `src/lib/server/storage/index-cache.ts` for the `IndexEntry` shape, the rebuild algorithm, and whether the cache is keyed per-recipe or stored as a single array. Note the function signatures and the sparkline-variable selection rules.

```bash
cat src/lib/server/storage/index-cache.ts
```

This is for reference only — write the new module fresh against the IDB schema.

- [ ] **Step 2: Write the failing tests**

Create `tests/data/index-cache.test.ts`:

```ts
import './setup';
import { describe, it, expect, beforeEach } from 'bun:test';
import { rebuildIndex, readIndex } from '../../src/lib/data/index-cache';
import { createRecipe } from '../../src/lib/data/recipes';
import { createBatch, updateBatch } from '../../src/lib/data/batches';
import { _resetDbForTests } from '../../src/lib/data/db';

beforeEach(() => {
  _resetDbForTests();
  indexedDB.deleteDatabase('better-batch');
});

describe('index cache', () => {
  it('readIndex returns empty array when no recipes exist', async () => {
    expect(await readIndex()).toEqual([]);
  });

  it('rebuildIndex returns one IndexEntry per recipe', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: ['x'], description: '' });
    await createRecipe({ name: 'B', preset: 'custom', tags: [], description: '' });
    const built = await rebuildIndex();
    expect(built.length).toBe(2);
    expect(built.map(e => e.id).sort()).toEqual(['a', 'b']);
  });

  it('rebuildIndex includes batchCount and lastCookedAt', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [], description: '' });
    const draft = await createBatch('a', { label: '1', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    await updateBatch('a', draft.id, { status: 'cooked', cookedAt: '2026-05-01T00:00:00Z' });
    await createBatch('a', { label: '2', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const built = await rebuildIndex();
    const a = built.find(e => e.id === 'a')!;
    expect(a.batchCount).toBe(2);
    expect(a.lastCookedAt).toBe('2026-05-01T00:00:00Z');
  });

  it('readIndex returns the most recent rebuild result', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [], description: '' });
    await rebuildIndex();
    const got = await readIndex();
    expect(got.length).toBe(1);
    expect(got[0].id).toBe('a');
  });

  it('handles recipes with zero batches gracefully', async () => {
    await createRecipe({ name: 'Empty', preset: 'custom', tags: [], description: '' });
    const built = await rebuildIndex();
    const empty = built.find(e => e.id === 'empty')!;
    expect(empty.batchCount).toBe(0);
    expect(empty.lastCookedAt).toBeNull();
    expect(empty.sparklineValues).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
~/.bun/bin/bun test tests/data/index-cache.test.ts
```

Expected: 5 tests fail with module-not-found.

- [ ] **Step 4: Implement the module**

Create `src/lib/data/index-cache.ts`. The implementation mirrors the existing logic in `src/lib/server/storage/index-cache.ts` but reads from IDB:

```ts
import { openDb } from './db';
import type { Batch, IndexEntry, Recipe } from './types';

const SINGLETON_KEY = 'singleton';

function pickSparklineVariable(recipe: Recipe): string | null {
  const numeric = recipe.variableSchema.find(v => v.type === 'number');
  return numeric?.name ?? null;
}

function entryFor(recipe: Recipe, batches: Batch[]): IndexEntry {
  const sortedByCookedAt = [...batches]
    .filter(b => b.cookedAt)
    .sort((a, b) => (a.cookedAt ?? '').localeCompare(b.cookedAt ?? ''));
  const sparklineVariable = pickSparklineVariable(recipe);
  const sparklineValues: (number | null)[] = sparklineVariable
    ? sortedByCookedAt.map(b => {
        const v = b.variables[sparklineVariable];
        return typeof v === 'number' ? v : null;
      })
    : [];
  return {
    id: recipe.id,
    name: recipe.name,
    tags: recipe.tags,
    preset: recipe.preset,
    batchCount: batches.length,
    lastCookedAt: sortedByCookedAt.length ? sortedByCookedAt[sortedByCookedAt.length - 1].cookedAt : null,
    sparklineVariable,
    sparklineValues
  };
}

export async function rebuildIndex(): Promise<IndexEntry[]> {
  const db = await openDb();
  const recipes = await db.getAll('recipes');
  const allBatches = await db.getAll('batches');
  const byRecipe = new Map<string, Batch[]>();
  for (const b of allBatches) {
    if (!byRecipe.has(b.recipeId)) byRecipe.set(b.recipeId, []);
    byRecipe.get(b.recipeId)!.push(b);
  }
  const entries = recipes.map(r => entryFor(r, byRecipe.get(r.id) ?? []));
  await db.put('index', entries, SINGLETON_KEY);
  return entries;
}

export async function readIndex(): Promise<IndexEntry[]> {
  const db = await openDb();
  const got = await db.get('index', SINGLETON_KEY);
  if (got) return got;
  return rebuildIndex();
}
```

If the existing `src/lib/server/storage/index-cache.ts` has a more nuanced sparkline-selection rule (e.g., prefers the first numeric var with non-null values), copy that exactly into `pickSparklineVariable`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
~/.bun/bin/bun test tests/data/index-cache.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 6: Run typecheck + lint + full test suite**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/data/index-cache.ts tests/data/index-cache.test.ts && git commit -m "$(cat <<'EOF'
feat(data): index cache on IndexedDB

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Seed endpoint + auto seed-import

Add the read-only `/api/seed/snapshot.json` endpoint that exposes existing on-disk data, and the client-side `seedIfEmpty` that bootstraps IDB from it.

**Files:**
- Create: `src/routes/api/seed/snapshot.json/+server.ts`
- Create: `src/lib/data/seed-import.ts`
- Test: `tests/data/seed-import.test.ts`

- [ ] **Step 1: Implement the seed endpoint**

Create `src/routes/api/seed/snapshot.json/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import { listRecipes, listBatches, readIndex } from '$lib/server';
import type { Batch, IndexEntry, Recipe } from '$lib/data/types';

export const GET = async () => {
  const recipes: Recipe[] = await listRecipes();
  let allBatches: Batch[] = [];
  for (const r of recipes) {
    const b = await listBatches(r.id);
    allBatches = allBatches.concat(b);
  }
  let index: IndexEntry[] = [];
  try {
    index = await readIndex();
  } catch {
    // empty index is fine
  }
  return json({ recipes, batches: allBatches, index });
};
```

`listRecipes`, `listBatches`, `readIndex` come from `$lib/server` (the existing Node-fs-backed barrel). This endpoint is the bridge from the old storage to the new IDB during the migration.

- [ ] **Step 2: Write failing tests for seed-import**

Create `tests/data/seed-import.test.ts`:

```ts
import './setup';
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { seedIfEmpty, bulkLoad } from '../../src/lib/data/seed-import';
import { listRecipes } from '../../src/lib/data/recipes';
import { _resetDbForTests, openDb } from '../../src/lib/data/db';

beforeEach(() => {
  _resetDbForTests();
  indexedDB.deleteDatabase('better-batch');
  // Reset the global fetch mock between cases.
  globalThis.fetch = undefined as unknown as typeof fetch;
});

const SNAPSHOT = {
  recipes: [{
    id: 'a', name: 'A', description: '', tags: [], preset: 'custom' as const,
    variableSchema: [], currentBatchId: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
  }],
  batches: [{
    id: 'v1-x', recipeId: 'a', label: 'x', parentIds: [],
    status: 'draft' as const, cookedAt: null,
    variables: {}, ingredients: [], steps: [],
    outcomeNotes: '', rating: null,
    createdAt: '2026-01-02T00:00:00Z'
  }],
  index: []
};

describe('seed-import', () => {
  it('seedIfEmpty fetches the snapshot and bulk-loads it when IDB is empty', async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => SNAPSHOT
    } as Response));
    await seedIfEmpty();
    const recipes = await listRecipes();
    expect(recipes.length).toBe(1);
    expect(recipes[0].id).toBe('a');
  });

  it('seedIfEmpty no-ops when IDB already has recipes', async () => {
    const db = await openDb();
    await db.put('recipes', {
      id: 'pre-existing', name: 'P', description: '', tags: [], preset: 'custom',
      variableSchema: [], currentBatchId: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
    });
    let fetchCalled = false;
    globalThis.fetch = mock(async () => { fetchCalled = true; return new Response(); });
    await seedIfEmpty();
    expect(fetchCalled).toBe(false);
  });

  it('seedIfEmpty silently bails when fetch fails', async () => {
    globalThis.fetch = mock(async () => { throw new Error('network'); });
    await expect(seedIfEmpty()).resolves.toBeUndefined();
    const recipes = await listRecipes();
    expect(recipes.length).toBe(0);
  });

  it('seedIfEmpty silently bails when endpoint returns non-OK', async () => {
    globalThis.fetch = mock(async () => ({ ok: false, json: async () => ({}) } as Response));
    await seedIfEmpty();
    const recipes = await listRecipes();
    expect(recipes.length).toBe(0);
  });

  it('bulkLoad inserts recipes, batches, and index in one transaction', async () => {
    await bulkLoad(SNAPSHOT);
    const recipes = await listRecipes();
    expect(recipes.length).toBe(1);
    const db = await openDb();
    const batches = await db.getAll('batches');
    expect(batches.length).toBe(1);
    expect(batches[0].recipeId).toBe('a');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
~/.bun/bin/bun test tests/data/seed-import.test.ts
```

Expected: all 5 tests fail with module-not-found.

- [ ] **Step 4: Implement seed-import**

Create `src/lib/data/seed-import.ts`:

```ts
import { openDb } from './db';
import type { Batch, IndexEntry, Recipe } from './types';

export interface Snapshot {
  recipes: Recipe[];
  batches: Batch[];
  index: IndexEntry[];
}

export async function bulkLoad(snapshot: Snapshot): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['recipes', 'batches', 'index'], 'readwrite');
  await Promise.all([
    ...snapshot.recipes.map(r => tx.objectStore('recipes').put(r)),
    ...snapshot.batches.map(b => tx.objectStore('batches').put(b)),
    snapshot.index.length > 0
      ? tx.objectStore('index').put(snapshot.index, 'singleton')
      : Promise.resolve()
  ]);
  await tx.done;
}

export async function seedIfEmpty(): Promise<void> {
  const db = await openDb();
  const count = await db.count('recipes');
  if (count > 0) return;
  let snapshot: Snapshot;
  try {
    const res = await fetch('/api/seed/snapshot.json');
    if (!res.ok) return;
    snapshot = await res.json();
  } catch {
    return;  // no snapshot available (static build, offline, etc.) — fine
  }
  await bulkLoad(snapshot);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
~/.bun/bin/bun test tests/data/seed-import.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 6: Run typecheck + lint + full test suite**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/routes/api/seed/snapshot.json/+server.ts src/lib/data/seed-import.ts tests/data/seed-import.test.ts && git commit -m "$(cat <<'EOF'
feat(data): seed endpoint + auto-import on first run

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Snapshot export/import internals

Build the `dumpAllData`, `parseSnapshot`, `wipeAndReseed`, `exportSnapshot`, and `importSnapshot` functions. UI wiring comes in Task 8.

**Files:**
- Create: `src/lib/data/snapshot.ts`
- Test: `tests/data/snapshot.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/data/snapshot.test.ts`:

```ts
import './setup';
import { describe, it, expect, beforeEach } from 'bun:test';
import { dumpAllData, parseSnapshot, wipeAndReseed } from '../../src/lib/data/snapshot';
import { createRecipe } from '../../src/lib/data/recipes';
import { createBatch } from '../../src/lib/data/batches';
import { _resetDbForTests } from '../../src/lib/data/db';

beforeEach(() => {
  _resetDbForTests();
  indexedDB.deleteDatabase('better-batch');
});

describe('snapshot', () => {
  it('dumpAllData returns recipes + batches from IDB', async () => {
    await createRecipe({ name: 'A', preset: 'custom', tags: [], description: '' });
    await createBatch('a', { label: '1', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [] });
    const dump = await dumpAllData();
    expect(dump.recipes.length).toBe(1);
    expect(dump.batches.length).toBe(1);
    expect(Array.isArray(dump.index)).toBe(true);
  });

  it('parseSnapshot accepts valid input', () => {
    const parsed = parseSnapshot(JSON.stringify({ recipes: [], batches: [], index: [] }));
    expect(parsed.recipes).toEqual([]);
    expect(parsed.batches).toEqual([]);
    expect(parsed.index).toEqual([]);
  });

  it('parseSnapshot throws on missing arrays', () => {
    expect(() => parseSnapshot('{"recipes": []}')).toThrow();
    expect(() => parseSnapshot('{}')).toThrow();
    expect(() => parseSnapshot('{"recipes": "nope", "batches": [], "index": []}')).toThrow();
  });

  it('parseSnapshot throws on invalid JSON', () => {
    expect(() => parseSnapshot('not json')).toThrow();
  });

  it('wipeAndReseed clears existing data before loading snapshot', async () => {
    await createRecipe({ name: 'Old', preset: 'custom', tags: [], description: '' });
    await wipeAndReseed({
      recipes: [{
        id: 'new', name: 'New', description: '', tags: [], preset: 'custom',
        variableSchema: [], currentBatchId: null,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
      }],
      batches: [],
      index: []
    });
    const dump = await dumpAllData();
    expect(dump.recipes.length).toBe(1);
    expect(dump.recipes[0].id).toBe('new');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
~/.bun/bin/bun test tests/data/snapshot.test.ts
```

Expected: all 5 tests fail with module-not-found.

- [ ] **Step 3: Implement the module**

Create `src/lib/data/snapshot.ts`:

```ts
import { openDb } from './db';
import type { Snapshot } from './seed-import';
import { bulkLoad } from './seed-import';

export type { Snapshot };

export async function dumpAllData(): Promise<Snapshot> {
  const db = await openDb();
  const recipes = await db.getAll('recipes');
  const batches = await db.getAll('batches');
  const index = (await db.get('index', 'singleton')) ?? [];
  return { recipes, batches, index };
}

export function parseSnapshot(text: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Snapshot file is not valid JSON');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Snapshot).recipes) ||
    !Array.isArray((parsed as Snapshot).batches) ||
    !Array.isArray((parsed as Snapshot).index)
  ) {
    throw new Error('Snapshot file is missing recipes / batches / index arrays');
  }
  return parsed as Snapshot;
}

export async function wipeAndReseed(snapshot: Snapshot): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['recipes', 'batches', 'index'], 'readwrite');
  await Promise.all([
    tx.objectStore('recipes').clear(),
    tx.objectStore('batches').clear(),
    tx.objectStore('index').clear()
  ]);
  await tx.done;
  await bulkLoad(snapshot);
}

export async function exportSnapshot(): Promise<void> {
  const snapshot = await dumpAllData();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `better-batch-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importSnapshot(file: File): Promise<void> {
  const text = await file.text();
  const snapshot = parseSnapshot(text);
  const count = snapshot.recipes.length + snapshot.batches.length;
  const ok = confirm(`Import ${count} items? This will REPLACE all current data.`);
  if (!ok) return;
  await wipeAndReseed(snapshot);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
~/.bun/bin/bun test tests/data/snapshot.test.ts
```

Expected: all 5 tests pass. (Note: `exportSnapshot` and `importSnapshot` are not unit-tested — they depend on `document` and `confirm` which `fake-indexeddb` doesn't provide. They're exercised manually in Task 8.)

- [ ] **Step 5: Run typecheck + lint**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/data/snapshot.ts tests/data/snapshot.test.ts && git commit -m "$(cat <<'EOF'
feat(data): snapshot export/import internals

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: UI cutover — api-client passthrough + universal loads + layout seed runner

The atomic switch from server-fs storage to IDB. After this task, the UI no longer reaches `/api/recipes/*` and no `+page.server.ts` files remain. Keep this task as one commit to avoid a mixed read/write source-of-truth window.

**Files:**
- Modify: `src/lib/ui/api-client.ts`
- Create: `src/routes/+layout.ts`
- Rename + rewrite: every `+page.server.ts` under `src/routes/`

- [ ] **Step 1: Rewrite `api-client.ts` to passthrough to `$lib/data/`**

Replace the contents of `src/lib/ui/api-client.ts` with:

```ts
import type { Recipe, Batch, IndexEntry, RecipePreset, BatchStatus, VariableValue, Ingredient, Step } from '$lib/server';
import { createRecipe, readRecipe, updateRecipe, deleteRecipe } from '$lib/data/recipes';
import { createBatch, updateBatch, deleteBatch } from '$lib/data/batches';
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
    const { listBatches } = await import('$lib/data/batches');
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
```

The `import type` from `$lib/server` keeps working via the barrel — types only, no runtime impact. Every method calls into the data layer and rebuilds the index after any write so the home page sees current data.

- [ ] **Step 2: Add the root layout with the seed runner**

Create `src/routes/+layout.ts`:

```ts
import { browser } from '$app/environment';
import { seedIfEmpty } from '$lib/data/seed-import';

export const load = async () => {
  if (browser) await seedIfEmpty();
  return {};
};
```

This runs on every page load, in the browser only. Idempotent — `seedIfEmpty` is a fast no-op once IDB has data.

- [ ] **Step 3: Convert `src/routes/+page.server.ts` to `src/routes/+page.ts`**

```bash
git mv src/routes/+page.server.ts src/routes/+page.ts
```

Replace its contents with:

```ts
import { browser } from '$app/environment';
import { readIndex } from '$lib/data/index-cache';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  if (!browser) return { entries: [] };
  const entries = await readIndex();
  return { entries };
};
```

(Adjust the return shape if the current `+page.server.ts` returns something differently named — read it first with `git show HEAD:src/routes/+page.server.ts` to see exact field names.)

- [ ] **Step 4: Convert `src/routes/recipes/[id]/+page.server.ts`**

```bash
git mv src/routes/recipes/\[id\]/+page.server.ts src/routes/recipes/\[id\]/+page.ts
```

Replace its contents with:

```ts
import { browser } from '$app/environment';
import { readRecipe } from '$lib/data/recipes';
import { listBatches } from '$lib/data/batches';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
  if (!browser) {
    return { recipe: null, batches: [], queryBatchId: null };
  }
  const recipe = await readRecipe(params.id);
  const batches = await listBatches(params.id);
  const queryBatchId = url.searchParams.get('batch');
  return { recipe, batches, queryBatchId };
};
```

- [ ] **Step 5: Convert the compare load**

```bash
git mv src/routes/recipes/\[id\]/compare/+page.server.ts src/routes/recipes/\[id\]/compare/+page.ts
```

Replace its contents with:

```ts
import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';
import { readRecipe } from '$lib/data/recipes';
import { readBatch } from '$lib/data/batches';
import { variableDiff, ingredientDiff, stepTextDiff } from '$lib/data/diff';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
  const aId = url.searchParams.get('a');
  const bId = url.searchParams.get('b');
  if (!aId || !bId) throw error(400, 'compare requires ?a=...&b=...');
  if (!browser) {
    return { recipe: null, a: null, b: null, varRows: [], ingRows: [], stepLines: [] };
  }
  const recipe = await readRecipe(params.id);
  const a = await readBatch(params.id, aId);
  const b = await readBatch(params.id, bId);
  if (!recipe || !a || !b) throw error(404, 'Not found');
  const varRows = variableDiff(recipe.variableSchema, a.variables, b.variables);
  const ingRows = ingredientDiff(a.ingredients, b.ingredients);
  const stepLines = stepTextDiff(a.steps, b.steps);
  return { recipe, a, b, varRows, ingRows, stepLines };
};
```

- [ ] **Step 6: Convert the merge load**

```bash
git mv src/routes/recipes/\[id\]/merge/+page.server.ts src/routes/recipes/\[id\]/merge/+page.ts
```

Replace its contents with:

```ts
import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';
import { readRecipe } from '$lib/data/recipes';
import { readBatch, listBatches } from '$lib/data/batches';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
  const aId = url.searchParams.get('a');
  const bId = url.searchParams.get('b');
  if (!aId || !bId) throw error(400, 'merge requires ?a=...&b=...');
  if (!browser) {
    return { recipe: null, a: null, b: null, batches: [] };
  }
  const recipe = await readRecipe(params.id);
  const a = await readBatch(params.id, aId);
  const b = await readBatch(params.id, bId);
  if (!recipe || !a || !b) throw error(404, 'Not found');
  const batches = await listBatches(params.id);
  return { recipe, a, b, batches };
};
```

If the original `+page.server.ts` returned additional fields (read it first with `git show HEAD:src/routes/recipes/[id]/merge/+page.server.ts`), extend the return object to match — keep the same field names so the consuming `+page.svelte` continues to destructure correctly.

- [ ] **Step 7: Convert the new-batch load**

```bash
git mv src/routes/recipes/\[id\]/new-batch/+page.server.ts src/routes/recipes/\[id\]/new-batch/+page.ts
```

Read the existing file, then rewrite with the same `browser`-gated pattern. The current implementation reads the optional `?from=` query and returns the parent batch. New version:

```ts
import { browser } from '$app/environment';
import { readBatch } from '$lib/data/batches';
import { readRecipe } from '$lib/data/recipes';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
  if (!browser) return { recipe: null, parent: null };
  const recipe = await readRecipe(params.id);
  const fromId = url.searchParams.get('from');
  const parent = fromId ? await readBatch(params.id, fromId) : null;
  return { recipe, parent };
};
```

- [ ] **Step 8: Convert the batch-edit load**

```bash
git mv src/routes/recipes/\[id\]/batches/\[batchId\]/edit/+page.server.ts src/routes/recipes/\[id\]/batches/\[batchId\]/edit/+page.ts
```

Replace with:

```ts
import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';
import { readRecipe } from '$lib/data/recipes';
import { readBatch } from '$lib/data/batches';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  if (!browser) return { recipe: null, batch: null };
  const recipe = await readRecipe(params.id);
  const batch = await readBatch(params.id, params.batchId);
  if (!recipe || !batch) throw error(404, 'Not found');
  return { recipe, batch };
};
```

- [ ] **Step 9: Convert the cook load**

```bash
git mv src/routes/recipes/\[id\]/batches/\[batchId\]/cook/+page.server.ts src/routes/recipes/\[id\]/batches/\[batchId\]/cook/+page.ts
```

Replace with the same shape as Step 8 (probably identical or very close; read the original to confirm there's no extra logic):

```ts
import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';
import { readRecipe } from '$lib/data/recipes';
import { readBatch } from '$lib/data/batches';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  if (!browser) return { recipe: null, batch: null };
  const recipe = await readRecipe(params.id);
  const batch = await readBatch(params.id, params.batchId);
  if (!recipe || !batch) throw error(404, 'Not found');
  return { recipe, batch };
};
```

- [ ] **Step 10: Run typecheck**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors. If any consumer `+page.svelte` files type their `data` prop with `PageData` that came from the old server type, the move should propagate that automatically since `./$types` regenerates from the new `+page.ts`.

- [ ] **Step 11: Run lint + full test suite**

```bash
~/.bun/bin/bun run lint
~/.bun/bin/bun test
```

Expected: lint clean, all tests pass.

- [ ] **Step 12: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add -A && git commit -m "$(cat <<'EOF'
feat: UI cutover from server fs to IndexedDB

api-client now passes through to $lib/data instead of fetching API
routes. All +page.server.ts files become universal +page.ts files
that gate on browser and read from IDB. The root +layout.ts runs
seedIfEmpty so a fresh IDB bootstraps from the existing server data
on first load.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Home page Export / Import UI

Add the two buttons + hidden file input to `src/routes/+page.svelte`. Wire them to the snapshot helpers from Task 6.

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Read the current home page header to find the insertion point**

```bash
grep -n "+ New Recipe\|new-recipe-btn" src/routes/+page.svelte
```

Find the line where the "+ New Recipe" button is rendered. The new buttons go just before it.

- [ ] **Step 2: Add imports and the file-input ref**

In `src/routes/+page.svelte`, near the top of the `<script>` block, add:

```ts
import { exportSnapshot, importSnapshot } from '$lib/data/snapshot';
import { invalidateAll } from '$app/navigation';

let fileInput = $state<HTMLInputElement | null>(null);

async function handleImportFile(e: Event) {
  const file = (e.currentTarget as HTMLInputElement).files?.[0];
  if (!file) return;
  await importSnapshot(file);
  (e.currentTarget as HTMLInputElement).value = '';
  await invalidateAll();
}
```

- [ ] **Step 3: Add the buttons next to "+ New Recipe"**

Find the "+ New Recipe" button in the template. Immediately before it, insert:

```svelte
<button
  type="button"
  onclick={exportSnapshot}
  class="border border-drafting text-obsidian/70 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
  data-testid="export-snapshot-btn"
>Export</button>
<button
  type="button"
  onclick={() => fileInput?.click()}
  class="border border-drafting text-obsidian/70 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
  data-testid="import-snapshot-btn"
>Import</button>
<input
  type="file"
  accept="application/json"
  bind:this={fileInput}
  onchange={handleImportFile}
  class="hidden"
  data-testid="import-snapshot-input"
/>
```

- [ ] **Step 4: Run typecheck + lint + tests**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun test
```

Expected: 0 errors, all tests pass.

- [ ] **Step 5: Manual smoke check (skip if dev server is not feasible)**

```bash
~/.bun/bin/bun run dev
```

1. Open the home page. Confirm the Export and Import buttons appear next to "+ New Recipe".
2. Click Export — a `better-batch-YYYY-MM-DD.json` downloads.
3. Open the downloaded file in a text editor; confirm it contains `recipes`, `batches`, `index` arrays.
4. Click Import → pick the same file → confirm the dialog → confirm the home page still lists the same recipes.

Stop the server when done.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/routes/+page.svelte && git commit -m "$(cat <<'EOF'
feat: home page export/import buttons

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Delete the CRUD API routes

The four `/api/recipes/*` endpoints are no longer reachable from the UI (api-client doesn't fetch them anymore). Delete them. Keep the seed endpoint.

**Files:**
- Delete: `src/routes/api/recipes/+server.ts`
- Delete: `src/routes/api/recipes/[id]/+server.ts`
- Delete: `src/routes/api/recipes/[id]/batches/+server.ts`
- Delete: `src/routes/api/recipes/[id]/batches/[batchId]/+server.ts`

- [ ] **Step 1: Verify nothing else imports them**

```bash
grep -rln "api/recipes" src/ tests/ 2>/dev/null
```

Expected: zero or only path-string references inside `tests/e2e/` (those drive the UI, not the API directly). If any source file still imports a route handler module, stop and re-check — the api-client rewrite in Task 7 should have removed all consumers.

- [ ] **Step 2: Delete the routes**

```bash
git rm src/routes/api/recipes/+server.ts
git rm src/routes/api/recipes/\[id\]/+server.ts
git rm src/routes/api/recipes/\[id\]/batches/+server.ts
git rm src/routes/api/recipes/\[id\]/batches/\[batchId\]/+server.ts
```

If those routes have any `[id]` parent directory containing only the deleted file, SvelteKit handles empty route dirs fine — leave the directories or delete them, doesn't matter.

- [ ] **Step 3: Run typecheck + lint + knip + tests**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: all green. Knip may now flag some `src/lib/server/storage/*` functions as unused except for the seed endpoint's consumers — that's expected; those modules stick around through sub-project 2.

- [ ] **Step 4: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add -A && git commit -m "$(cat <<'EOF'
chore: drop CRUD API routes, keep seed endpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: E2E helper update + verification

The e2e suite drives the UI through real interactions. The only mechanical change is `clearTestData()` — it used to wipe the server's `data/` directory; now it also (or instead) deletes the IDB.

**Files:**
- Modify: `tests/e2e/helpers.ts`

- [ ] **Step 1: Read the current helper**

```bash
cat tests/e2e/helpers.ts
```

Locate the `clearTestData()` function. It probably hits some endpoint or wipes a directory. Either approach: now you also need to wipe IDB inside the browser context after navigating.

- [ ] **Step 2: Update `clearTestData` to wipe IDB**

The implementation pattern: take an optional `Page` parameter (already there if the helper drives Playwright). After the existing fs cleanup, evaluate inside the page:

```ts
// existing fs/server cleanup ...

// Wipe IDB inside the browser context for any test where we have a page.
if (page) {
  try {
    await page.evaluate(() => indexedDB.deleteDatabase('better-batch'));
  } catch {
    // Page may not be on a same-origin URL yet; ignore.
  }
}
```

If the existing signature doesn't take `page`, add it as an optional parameter. Update callers to pass `page` where they have one. (Most callers in `tests/e2e/*.ts` use `test.beforeEach(async ({ page }) => { await clearTestData(); })` — extend to `await clearTestData({ page });` once the signature changes.)

Inspect the existing helper file to apply this change in the minimum-disruptive way for its actual shape.

- [ ] **Step 3: Run the full e2e suite**

```bash
~/.bun/bin/bun run e2e
```

Expected: all existing e2e tests pass. If any fail because the seed-import didn't run on a fresh IDB, double-check that the seed endpoint returns the freshly written data — the storage layer is still server-fs-backed, so any test that pre-populates the server `data/` directory will be picked up by the seed-import on first navigation.

- [ ] **Step 4: If e2e fails because pre-test fs writes aren't seen**

The e2e helpers may write recipe JSON files to disk before the test navigates. Sequence:
1. Helper writes `data/recipes/foo.json`.
2. Test navigates to `/`.
3. `+layout.ts` runs `seedIfEmpty` — IDB is empty, fetches `/api/seed/snapshot.json` — sees the just-written recipe, seeds it into IDB. ✓

If a test instead expects the server to keep accepting writes (e.g., posts to `/api/recipes`), that test needs rewriting to drive the UI. Flag any such tests in the report and address them before this task closes.

- [ ] **Step 5: Run the full pre-commit pipeline**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
~/.bun/bin/bun run e2e
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add tests/e2e/helpers.ts && git commit -m "$(cat <<'EOF'
test(e2e): wipe IDB between tests via clearTestData

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final verification + push

- [ ] **Step 1: Full pipeline one last time**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
~/.bun/bin/bun run e2e
```

Expected: all green.

- [ ] **Step 2: Confirm `git status` is clean**

```bash
git status
```

Expected: working tree clean, branch ahead of origin/main by ~11 commits (one per Task 1–10, plus the spec/plan commits from earlier).

- [ ] **Step 3: Push**

```bash
git push
```

Expected: push succeeds.

---

## Notes for the implementer

- **Pre-commit hook** (`lefthook`) runs typecheck/lint/knip/test on commit. It needs `bun` on PATH; prepend `export PATH="$HOME/.bun/bin:$PATH" &&` to all commit commands.
- **Branch policy:** stay on `main`, do not push until Task 11.
- **Task 7 is the big atomic switch.** Don't try to split it across commits — between the api-client rewrite and the `+page.server.ts → +page.ts` conversions there's a window where reads and writes diverge across data sources. The 12 steps within Task 7 are bite-sized; the commit boundary is at the end of the whole task.
- **Task 4's index cache** mirrors the existing `src/lib/server/storage/index-cache.ts` logic. Read that file before implementing to catch any nuanced sparkline-selection rules that the test cases don't exercise.
- **`api-client.ts` deliberately calls `rebuildIndex()` after every write.** The server-side version did this implicitly through the API routes; the passthrough makes it explicit. Without it, the home page's recipe list would go stale after creates/updates.
- **Universal loads return `null`/`[]` on SSR**, so consumer `+page.svelte` files need to handle that shape. Most already use `{#if data.recipe}` patterns; a few may need small guards added in this work.
- **Don't delete `src/lib/server/storage/*`.** The seed endpoint still uses it. Sub-project 2 will delete it after baking the snapshot into a static asset.
- **The seed endpoint is the one place** where `src/lib/server/*` runtime code keeps running. Everything else in the new world is browser-side.
