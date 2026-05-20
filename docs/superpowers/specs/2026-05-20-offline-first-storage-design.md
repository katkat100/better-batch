# Offline-first storage rewrite (sub-project 1 of 3)

**Status:** Design approved 2026-05-20.
**Owner:** Katie.
**Part of:** Three-step path to an Android phone app via Capacitor. This
sub-project produces a working browser-only web app whose data lives in
IndexedDB instead of the Node server's filesystem. Sub-project 2 swaps
the SvelteKit adapter to `adapter-static`. Sub-project 3 adds the
Capacitor scaffold and Android target.

## Summary

Move recipe and batch persistence from `src/lib/server/storage/*.ts`
(Node `fs/promises`) into the browser via IndexedDB (using the `idb`
wrapper). Convert every `+page.server.ts` load to a universal `+page.ts`
that reads from the new client-side store. Rewrite `api-client.ts` so
its public methods call the local store directly instead of `fetch`ing
SvelteKit API routes. Delete every CRUD API route. Keep exactly one
server endpoint — `/api/seed/snapshot.json` — that exposes the existing
on-disk data as a one-time bootstrap source.

Add Export / Import buttons on the home page so the user can move their
data between machines manually, since browser IndexedDB is per-profile.

## Motivation

To run the recipe-versioning app inside an Android `WebView` (Capacitor's
runtime), it must work without a Node server. The current
`src/lib/server/storage/*.ts` modules use Node `fs/promises` to
read/write `data/recipes/*.json` and `data/batches/*/*.json` — that
entire pattern is unavailable in a browser/WebView. The data layer must
be ported to a browser-side store before the adapter swap (sub-project
2) and the Capacitor scaffold (sub-project 3) make sense.

Doing the storage rewrite first, in isolation, keeps the app runnable
as a normal web app throughout. The intermediate state (after this
sub-project, before sub-project 2) is a fully functional web app that
happens to keep its data in the browser instead of on the server.

## Behavior

### From the user's perspective

- First load after this sub-project lands: the app sees an empty
  IndexedDB, automatically calls `/api/seed/snapshot.json`, and bulk-loads
  the user's existing on-disk recipes/batches into IndexedDB. The
  loading state is brief; data appears as before.
- Every subsequent load: IndexedDB already has data; the seed runner
  skips. Pages render the same as today.
- Per-browser data: opening the app in a different browser, a different
  profile, or after clearing site data presents an empty store. The
  user can manually move data via the new Export / Import buttons.
- "Export" downloads a dated JSON snapshot of the entire local store.
- "Import" prompts for a `.json` file, then a confirmation dialog
  ("Import N items? This will replace all current data."), then wipes
  and re-seeds.

### What stays the same

- The visual UI is unchanged. Every feature (multipliers, ingredient
  checks, cook view, comparisons, merges, etc.) works as before.
- Existing recipe data on disk is read once at seed time; from then
  on, the source of truth is IndexedDB.
- The pre-commit hook, the test suite, the e2e tests — all keep
  working. A small helper update in `tests/e2e/helpers.ts` is the only
  visible test infrastructure change.

## Architecture

### Module structure

New `src/lib/data/` directory mirrors the surface of the current
`src/lib/server/storage/` but is browser-only:

```
src/lib/data/
  db.ts             — IndexedDB connection + schema + upgrade callbacks
  recipes.ts        — createRecipe, readRecipe, updateRecipe, deleteRecipe, listRecipeEntries
  batches.ts        — createBatch, readBatch, updateBatch, deleteBatch, listBatches
  index-cache.ts    — rebuildIndex, readIndex (sparkline cache)
  seed-import.ts    — seedIfEmpty(), bulkLoad(snapshot), wipeAndReseed(snapshot)
  snapshot.ts       — exportSnapshot(), importSnapshot(file), parseSnapshot(text), dumpAllData()
  types.ts          — Recipe, Batch, Ingredient, Step, IngredientUse, IndexEntry, etc. (moved from server)
  diff.ts           — variable and text-array diff (moved from src/lib/server/domain/)
  graph.ts          — graph traversal (moved)
  merge.ts          — merge field resolution (moved)
  slug.ts           — slugify, uniqueSlug (already in src/lib/shared/slug.ts; left in place)
```

Public surface mirrors the existing storage modules so the api-client
rewrite is a one-line-per-method swap.

### IndexedDB schema

One database named `better-batch`, version 1, with three object stores
declared in the `upgrade` callback:

| Store     | Key             | Indexes        | Holds                  |
|-----------|-----------------|----------------|------------------------|
| recipes   | keyPath `id`    | —              | full `Recipe` object   |
| batches   | keyPath `id`    | `byRecipe` (recipeId) | full `Batch` object |
| index     | out-of-line key `'singleton'` | — | `IndexEntry[]` array |

`listBatches(recipeId)` uses `store.index('byRecipe').getAll(recipeId)`
— single index lookup, O(matching batches).

Schema version 1 is the only version at the time of this sub-project.
Future schema changes (e.g., adding a new index) bump the version and
add an `upgrade` branch.

### Universal loads (SSR change)

Every `+page.server.ts` becomes `+page.ts`. The load function gates on
`browser` from `$app/environment`:

```ts
import { browser } from '$app/environment';
import { readRecipe, listBatches } from '$lib/data/recipes';

export const load = async ({ params, url }) => {
  if (!browser) {
    return { recipe: null, batches: [], queryBatchId: null };
  }
  const recipe = await readRecipe(params.id);
  const batches = await listBatches(params.id);
  const queryBatchId = url.searchParams.get('batch');
  return { recipe, batches, queryBatchId };
};
```

On SSR the loader returns an empty shell. On client hydration, the
loader runs again and populates from IndexedDB. The visible UX is a
brief flash of empty state on first paint, then the real content.
Acceptable for an offline-first app with no SEO target and a sub-10ms
IndexedDB read.

Components that today rely on `data.recipe` being defined need to
handle the `null` placeholder gracefully — most already do via `{#if
data.recipe}` patterns; the rest get small guards.

### `api-client.ts` rewrite

The public surface (`api.listRecipes()`, `api.createRecipe(input)`,
etc.) stays identical so call sites in UI components don't change.
Each method becomes a thin passthrough:

```ts
import { listRecipeEntries, createRecipe, ... } from '$lib/data/recipes';

export const api = {
  async listRecipes(): Promise<IndexEntry[]> {
    return readIndex();
  },
  async createRecipe(input): Promise<Recipe> {
    return createRecipe(input);
  },
  // ... all other methods analogous
};
```

No more `fetch`. No more JSON serialization round-trip. Errors surface
as thrown `Error` objects with the same shape consumers already
handle.

### Seed-import (auto on first run)

A small module `src/lib/data/seed-import.ts`:

```ts
export async function seedIfEmpty(): Promise<void> {
  const db = await openDb();
  if ((await db.count('recipes')) > 0) return;
  let snapshot: Snapshot;
  try {
    const res = await fetch('/api/seed/snapshot.json');
    if (!res.ok) return;
    snapshot = await res.json();
  } catch {
    return;  // no snapshot endpoint (e.g. static build, Android) — fine
  }
  await bulkLoad(snapshot);
}
```

Called once from the new root `src/routes/+layout.ts`:

```ts
import { browser } from '$app/environment';
import { seedIfEmpty } from '$lib/data/seed-import';

export const load = async () => {
  if (browser) await seedIfEmpty();
  return {};
};
```

`bulkLoad` opens a single read-write transaction over all three stores
and `put`s every record. It is idempotent against itself but does not
wipe — the empty-store guard in `seedIfEmpty` prevents accidental
re-seeds.

### Seed endpoint (the one surviving API route)

`src/routes/api/seed/snapshot.json/+server.ts`:

```ts
export const GET = async () => {
  const recipes = await listAllRecipes();        // from src/lib/server/storage/recipes
  const batches = await listAllBatchesAcrossRecipes();
  const index = await readIndex();
  return json({ recipes, batches, index });
};
```

Read-only. No auth (single-user dev tool). Returns the full snapshot
as one JSON document. This is the only consumer of
`src/lib/server/storage/*` after this sub-project; sub-project 2 will
delete the endpoint and bake the snapshot into a static file at build
time.

### Export / Import UI

A new module `src/lib/data/snapshot.ts` exposes:

- `exportSnapshot()` — produces a dump from IndexedDB, packages it as a
  Blob, triggers a download with filename
  `better-batch-YYYY-MM-DD.json`.
- `importSnapshot(file)` — reads the file, validates the top-level
  shape, shows a `window.confirm()` dialog, then wipes IndexedDB and
  re-seeds.
- `parseSnapshot(text)` — JSON-parses + shape-checks
  (`recipes`/`batches`/`index` arrays present); throws on malformed
  input.
- `dumpAllData()` — internal helper that reads all three stores and
  returns the snapshot object.
- `wipeAndReseed(snapshot)` — internal helper that opens a
  read-write transaction, `clear()`s each store, then bulk-puts.

The home page (`src/routes/+page.svelte`) gains two small buttons in
the header, alongside the existing "New Recipe" button:

```svelte
<button onclick={exportSnapshot} class="border border-drafting ...">Export</button>
<button onclick={triggerImport}  class="border border-drafting ...">Import</button>
<input type="file" accept="application/json" bind:this={fileInput} class="hidden"
       onchange={(e) => importSnapshot(e.currentTarget.files?.[0])} />
```

`triggerImport` clicks the hidden file input. Confirmation lives inside
`importSnapshot` so the home page doesn't carry the dialog state.

### Snapshot format

The same shape used by the seed endpoint and the export download:

```ts
interface Snapshot {
  recipes: Recipe[];
  batches: Batch[];
  index: IndexEntry[];
}
```

No version field in v1. If we add one later, we'll prepend a
`version: 1` to existing exports and the import path will branch on it.

## Files touched

**New:**
- `src/lib/data/db.ts`
- `src/lib/data/recipes.ts`
- `src/lib/data/batches.ts`
- `src/lib/data/index-cache.ts`
- `src/lib/data/seed-import.ts`
- `src/lib/data/snapshot.ts`
- `src/lib/data/types.ts`         (moved from `src/lib/server/domain/types.ts`)
- `src/lib/data/diff.ts`          (moved from `src/lib/server/domain/diff.ts`)
- `src/lib/data/graph.ts`         (moved from `src/lib/server/domain/graph.ts`)
- `src/lib/data/merge.ts`         (moved from `src/lib/server/domain/merge.ts`)
- `src/routes/api/seed/snapshot.json/+server.ts`
- `src/routes/+layout.ts`
- `tests/data/db.test.ts`
- `tests/data/recipes.test.ts`
- `tests/data/batches.test.ts`
- `tests/data/index-cache.test.ts`
- `tests/data/seed-import.test.ts`
- `tests/data/snapshot.test.ts`

**Renamed (`+page.server.ts` → `+page.ts`, body rewritten to call
`src/lib/data/*`):**
- `src/routes/+page.server.ts`
- `src/routes/recipes/[id]/+page.server.ts`
- `src/routes/recipes/[id]/compare/+page.server.ts`
- `src/routes/recipes/[id]/merge/+page.server.ts`
- `src/routes/recipes/[id]/new-batch/+page.server.ts`
- Any other `+page.server.ts` files under `src/routes/`

**Modified:**
- `src/lib/ui/api-client.ts` — every method passes through to
  `src/lib/data/*`. Same exported surface, no `fetch`.
- `src/routes/+page.svelte` — header gets Export / Import buttons.
- All UI components that import types from `$lib/server` switch to
  `$lib/data` (mechanical find-replace).
- `tests/e2e/helpers.ts` — `clearTestData()` adds an IndexedDB delete
  via `page.evaluate(() => indexedDB.deleteDatabase('better-batch'))`.
- `package.json` — adds `idb` (runtime dep) and `fake-indexeddb` (dev
  dep).
- `svelte.config.js` — no change yet (`adapter-node` stays; the seed
  endpoint still needs server runtime).

**Deleted:**
- `src/routes/api/recipes/+server.ts`
- `src/routes/api/recipes/[id]/+server.ts`
- `src/routes/api/recipes/[id]/batches/+server.ts`
- `src/routes/api/recipes/[id]/batches/[batchId]/+server.ts`
- (Any other CRUD API routes under `src/routes/api/recipes/`. The seed
  endpoint at `src/routes/api/seed/...` stays.)

**Kept for now (deleted in sub-project 2):**
- `src/lib/server/storage/*` — used only by the seed endpoint. Its
  relative imports to `../domain/types` are updated to point at
  `../../data/types` so they resolve after the move. The server
  storage's `import type` statements remain zero-runtime, so the
  cross-directory reach is purely a compile-time concern.
- `src/lib/server/index.ts` (barrel) — keeps re-exporting from server
  storage for the seed endpoint's convenience. Its re-exports of
  *types* are updated to forward from `src/lib/data/types` so the
  removed `src/lib/server/domain/types.ts` location is no longer
  referenced.

## Testing

**Unit tests** (new, in `tests/data/`):

- `db.test.ts` — opens a fresh DB via `fake-indexeddb`, verifies the
  three object stores exist with the right keyPath and `byRecipe`
  index.
- `recipes.test.ts` — full CRUD: create writes to the store with the
  expected key, read returns it back, list returns the index cache,
  update merges fields, delete removes the record + cascades to
  batches.
- `batches.test.ts` — full CRUD plus the truthy-drop rules for
  `inconsistencyNote` and `cookMultiplier` (mirrors the existing
  server-storage rules).
- `index-cache.test.ts` — `rebuildIndex` produces the same shape the
  current server-side cache rebuild produces, given the same input.
- `seed-import.test.ts` — `seedIfEmpty` no-ops when stores are
  non-empty; populates when empty; silently succeeds when the snapshot
  fetch fails.
- `snapshot.test.ts` — `exportSnapshot` produces the snapshot shape
  from current data; `parseSnapshot` accepts good input and throws on
  bad shapes; `wipeAndReseed` replaces existing data fully.

The new tests use `fake-indexeddb` (set up in a small `tests/data/setup.ts`
that registers the polyfill globally for these tests).

**Existing server-storage unit tests:**
- Stay until sub-project 2 — they exercise the storage modules used by
  the seed endpoint.
- No changes needed; they test the same code paths that are still
  reachable.

**E2E tests:**
- `tests/e2e/helpers.ts`'s `clearTestData()` adds an IndexedDB wipe:
  ```ts
  await page.evaluate(() => indexedDB.deleteDatabase('better-batch'));
  ```
  This runs in the browser context after the existing fs cleanup.
- Existing e2e specs are otherwise unchanged. They drive the UI
  through real interactions; the storage backend swap is invisible to
  them.

**Typecheck, lint, knip** continue to gate every commit via the
existing lefthook hook.

## Out of scope

- The `adapter-node → adapter-static` swap (sub-project 2).
- Capacitor scaffold and Android target (sub-project 3).
- Deleting `src/lib/server/storage/*` and `src/lib/server/domain/types.ts`
  — these stay alive in this sub-project because the seed endpoint
  reads from them. Sub-project 2 deletes them after baking the
  snapshot into a static file.
- Automatic cross-device sync (Hybrid model means manual export/import
  only — no real-time sync, no conflict resolution).
- A versioned snapshot format. v1 is unversioned; we'll add `version:
  1` to exports the moment we ship a breaking format change.
- Schema migration logic in IndexedDB beyond the version-1 initial
  setup. Future schema bumps will add `upgrade` branches in their own
  sub-project.
- Export filtering ("export only this recipe"). Whole-store dump only.

## Open questions

None at design approval time.
