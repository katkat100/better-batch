# Adapter-static swap (sub-project 2 of 3)

**Status:** Design approved 2026-05-20.
**Owner:** Katie.
**Part of:** Three-step path to an Android phone app via Capacitor.
Sub-project 1 (storage rewrite) is shipped. This sub-project switches
the SvelteKit adapter to `adapter-static` so the build output is a
fully static SPA — no Node runtime required at request time. Sub-project
3 will wrap that static bundle in Capacitor for Android.

## Summary

Replace `@sveltejs/adapter-node` with `@sveltejs/adapter-static`,
disable SSR globally, and add a build-time prebuild step that bakes
the existing on-disk recipe/batch data into `static/seed/snapshot.json`.
The runtime seed endpoint goes away; its job is taken over by a plain
static file served at the same path-shape. The app continues to run
as a normal web app in dev (Vite dev server) and produces a static
SPA bundle on `bun run build` that can be served from any static host
or wrapped in a WebView.

## Motivation

To run inside Capacitor's Android `WebView`, the build output must be
a static file bundle — there is no Node runtime to serve API endpoints
or run server load functions. After sub-project 1, the app already
reads and writes through IndexedDB in the browser; only the seed
endpoint still required a Node server. Swapping the adapter and
moving the seed to a build-time bake completes the "no server"
transition while preserving the user's existing data as a one-time
bootstrap for fresh installs.

## Behavior

### From the user's perspective

- `bun run dev` works identically to today: Vite dev server, hot
  reload, IDB-backed CRUD. Vite serves the `static/` directory at the
  root, so `/seed/snapshot.json` is reachable in dev too.
- `bun run build` runs the prebuild script (which dumps the current
  on-disk data into `static/seed/snapshot.json`) then runs
  `vite build` — produces a fully static SPA in `build/`.
- `bun run preview` serves the static build locally for smoke
  testing.
- First load on a fresh IDB: the existing `seedIfEmpty()` fetches the
  static file (now at `/seed/snapshot.json`) and bulk-loads it into
  IDB. Same behavior as today; only the URL changed.
- Existing IDB is preserved across the adapter swap. Users with data
  in their browser see no change.

### What stays the same

- Every UI feature works as before. The change is invisible at the
  feature level.
- E2E tests run against `bun run dev` (Vite dev server), so they
  continue to exercise the same code paths.

## Architecture

### Adapter swap + SvelteKit config

`package.json`: drop `@sveltejs/adapter-node` from dependencies, add
`@sveltejs/adapter-static`. Both packages are first-party SvelteKit
adapters with stable APIs; the swap is a one-line change in the
manifest plus a config update.

`svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter({ fallback: 'index.html' }) }
};
```

`fallback: 'index.html'` tells the adapter to emit `build/index.html`
as the catch-all entry point for any URL that isn't a prerendered
route. Dynamic routes like `/recipes/foo`, `/recipes/foo/cook`,
`/recipes/foo/batches/v1-x/edit` all resolve to this shell, then
SvelteKit's client-side router takes over inside the browser.

### Global SSR disable + prerender

`src/routes/+layout.ts` gains two top-level exports:

```ts
export const prerender = true;
export const ssr = false;
```

`ssr = false`: SvelteKit skips server rendering for every route. The
adapter still emits an HTML shell, but it's the unrendered template,
not a server-executed render. Since every load function in
sub-project 1 already returns null/empty shells on the server, SSR
adds zero useful output today.

`prerender = true`: SvelteKit walks the route tree and emits a static
HTML file for each known route at build time. With `ssr = false`,
each prerendered page is the same skeleton shell; this is fine and
slightly faster than the runtime fallback path.

### Build-time snapshot bake

A new script `scripts/build-seed-snapshot.ts`:

```ts
import { writeFile, mkdir } from 'node:fs/promises';
import { listRecipes, listBatches, readIndex } from '../src/lib/server';

const recipes = await listRecipes();
const batches = (await Promise.all(
  recipes.map(r => listBatches(r.id))
)).flat();
let index;
try {
  index = await readIndex();
} catch {
  index = [];
}

await mkdir('static/seed', { recursive: true });
await writeFile(
  'static/seed/snapshot.json',
  JSON.stringify({ recipes, batches, index })
);
console.log(`Wrote seed snapshot: ${recipes.length} recipes, ${batches.length} batches`);
```

The script runs in Node, so it freely uses the existing Node-fs
storage modules. It's a build-time tool — never bundled into the
client.

`package.json` `scripts` updates:

```json
"build": "bun run build-seed && vite build",
"build-seed": "bun scripts/build-seed-snapshot.ts"
```

`bun run dev` does **not** trigger the bake. Reasoning: re-baking
on every dev start would overwrite the seed file with whatever was
last on disk, which conflicts with the user's IDB state if they've
edited recipes in the browser since the last build. The user can
run `bun run build-seed` manually if they want to refresh the seed
without a full build.

### Seed endpoint deletion + URL update

`src/routes/api/seed/snapshot.json/+server.ts` is deleted — its job
moves to the static file at `static/seed/snapshot.json`. Vite serves
the `static/` directory at the root, so the file is accessible at
`/seed/snapshot.json` in both dev and the static build.

`src/lib/data/seed-import.ts` updates its fetch URL from
`/api/seed/snapshot.json` to `/seed/snapshot.json`. One line.

The test for `seedIfEmpty()` (mocks `fetch`) doesn't care about the
URL, so no test changes needed.

## Files touched

**New:**
- `scripts/build-seed-snapshot.ts`

**Modified:**
- `package.json` — swap adapter dep, add `build-seed` script, chain
  it into `build`.
- `svelte.config.js` — `adapter-static` with `fallback: 'index.html'`.
- `src/routes/+layout.ts` — add `prerender = true; ssr = false`.
- `src/lib/data/seed-import.ts` — fetch URL changes to
  `/seed/snapshot.json`.

**Deleted:**
- `src/routes/api/seed/snapshot.json/+server.ts`

**Kept (used only by the build-time script):**
- `src/lib/server/storage/*`
- `src/lib/server/index.ts` (barrel)
- `src/lib/server/domain/` (whatever's left there after sub-project 1
  — if it's empty after the moves, remove the directory; otherwise
  leave it)

The `$lib/server` modules never get bundled into the client output
because SvelteKit's bundler convention treats `$lib/server` as
server-only at compile time. The build script accesses them at build
time via standard Node module resolution, not via the bundler.

## Testing

**Unit tests** (`bun test`) — no changes needed. The seed-import test
mocks `fetch`, so URL changes are invisible to it. The data layer
tests are unaffected.

**E2E tests** (`bun run e2e`) — no changes needed. Playwright drives
against `bun run dev`, which still serves the app via Vite. The
seed-import call in the layout now hits `/seed/snapshot.json` (a
file in `static/` instead of an API route), which Vite serves the
same way it served any other static file. The e2e helper's IDB wipe
continues to work.

**Manual build smoke:**

1. `bun run build` — confirm prebuild logs the snapshot counts, then
   Vite emits a `build/` directory.
2. `bun run preview` — confirm the served bundle loads on localhost,
   data appears after IDB seeds.
3. `cat build/index.html` — confirm it contains the SvelteKit
   shell with the expected client bundle script tags.

**Build environment:** the prebuild script reads from the local
`data/` directory. On a fresh checkout with no data, the script
emits an empty snapshot — that's fine; the seed-import code paths
already handle empty snapshots.

## Out of scope

- Capacitor scaffold + Android target (sub-project 3).
- Deleting `src/lib/server/storage/*` and the barrel. They stay
  alive for the build script. Sub-project 3 can decide whether to
  inline the script's needs and delete the directory, or keep it as
  a build-only dependency.
- Replacing `import type { ... } from '$lib/server'` in UI components
  with imports from `$lib/data/types`. The current setup works; the
  find-replace is cosmetic and lands more naturally alongside other
  cleanups in sub-project 3 or later.
- Deploying the static bundle anywhere (no production host configured
  yet; the user runs locally for now).
- Auto-re-baking the seed during dev. The manual `bun run build-seed`
  escape hatch is enough.

## Open questions

None at design approval time.
