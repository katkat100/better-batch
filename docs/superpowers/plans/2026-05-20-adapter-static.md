# Adapter-static Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch SvelteKit from `adapter-node` to `adapter-static` so the build output is a self-contained SPA suitable for Capacitor's Android WebView, replacing the runtime seed endpoint with a build-time static snapshot.

**Architecture:** A new `scripts/build-seed-snapshot.ts` runs at build time, reads from the existing `src/lib/server/storage/*` modules, and writes the snapshot to `static/seed/snapshot.json`. The runtime API endpoint is deleted; `src/lib/data/seed-import.ts` fetches the static file instead. `+layout.ts` disables SSR globally and enables prerendering. The build script chains the prebuild before `vite build`.

**Tech Stack:** SvelteKit 2, `@sveltejs/adapter-static`, Vite, Bun.

**Spec:** [`docs/superpowers/specs/2026-05-20-adapter-static-design.md`](../specs/2026-05-20-adapter-static-design.md)

---

## Task 1: Build-time snapshot bake + URL update

Add the prebuild script that dumps the current on-disk data into `static/seed/snapshot.json`, update `seed-import.ts` to fetch the new URL, and delete the runtime endpoint. After this task, the seed flow runs against a static file even on `bun run dev` — but the adapter is still `adapter-node` until Task 2.

**Files:**
- Create: `scripts/build-seed-snapshot.ts`
- Modify: `package.json` (add `build-seed` script, chain into `build`)
- Modify: `src/lib/data/seed-import.ts` (fetch URL changes to `/seed/snapshot.json`)
- Delete: `src/routes/api/seed/snapshot.json/+server.ts`
- Add to `.gitignore`: `static/seed/snapshot.json` (build artifact, not committed)

- [ ] **Step 1: Create the prebuild script**

Create `scripts/build-seed-snapshot.ts`:

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

- [ ] **Step 2: Run the prebuild script manually to verify**

```bash
~/.bun/bin/bun scripts/build-seed-snapshot.ts
```

Expected: a console message like `Wrote seed snapshot: N recipes, M batches`, and a `static/seed/snapshot.json` file exists with the expected structure.

Verify the file:

```bash
ls -la static/seed/snapshot.json
~/.bun/bin/bun -e 'const s = await Bun.file("static/seed/snapshot.json").json(); console.log({ recipes: s.recipes.length, batches: s.batches.length, index: s.index.length });'
```

Expected: matches the counts from the script output.

- [ ] **Step 3: Add the static-snapshot path to `.gitignore`**

The seed snapshot is a build artifact derived from `data/`. Don't commit it. Append to `.gitignore`:

```bash
echo "static/seed/snapshot.json" >> .gitignore
```

If `.gitignore` already has a `static/` rule, skip this step. Check first:

```bash
grep -n "static" .gitignore
```

If `static/` is wildcarded, no change needed. If not, add the specific path.

- [ ] **Step 4: Wire the prebuild into `package.json`'s build script**

Read the current `build` script:

```bash
grep -A 2 '"build"' package.json
```

Update the `scripts` section to add `build-seed` and chain it before the existing build:

```json
"build-seed": "bun scripts/build-seed-snapshot.ts",
"build": "bun run build-seed && vite build"
```

(If the existing `build` was just `"build": "vite build"`, the change is exactly the prefix. If it had other steps like `svelte-kit sync && vite build`, keep them: `"build": "bun run build-seed && svelte-kit sync && vite build"`.)

- [ ] **Step 5: Update `seed-import.ts` fetch URL**

Edit `src/lib/data/seed-import.ts`. Find:

```ts
const res = await fetch('/api/seed/snapshot.json');
```

Replace with:

```ts
const res = await fetch('/seed/snapshot.json');
```

One-line change.

- [ ] **Step 6: Delete the runtime seed endpoint**

```bash
git rm src/routes/api/seed/snapshot.json/+server.ts
```

If the `src/routes/api/seed/snapshot.json/` directory is now empty, git will not delete the directory itself — but SvelteKit doesn't care about empty directories. Leave them or `rm -rf src/routes/api/seed` if you want a clean tree. Either way works.

- [ ] **Step 7: Run typecheck + lint + tests**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun test
```

Expected: 0 errors, all 158 tests pass. The `seed-import.test.ts` mocks `fetch` so the URL change is invisible to it.

- [ ] **Step 8: Manual smoke check with dev server (skip if not feasible)**

```bash
~/.bun/bin/bun run dev
```

1. In another shell, clear browser IndexedDB for `localhost`. The fastest way: open the app, open DevTools → Application → IndexedDB → `better-batch` → Delete.
2. Reload the page.
3. Confirm recipes appear (the seed-import flow fetched `/seed/snapshot.json` from the static directory and bulk-loaded into IDB).

Stop the server when done. Skip if dev server isn't reachable.

- [ ] **Step 9: Run e2e to confirm no regressions**

```bash
~/.bun/bin/bun run e2e
```

Expected: 8/8 pass. (The e2e tests run against `bun run dev`. The static file is served at `/seed/snapshot.json` in dev too because Vite serves the `static/` directory at the root.)

- [ ] **Step 10: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add -A && git commit -m "$(cat <<'EOF'
feat(build): bake seed snapshot at build time

Replace the runtime /api/seed/snapshot.json endpoint with a static
file written at build time. Adds a scripts/build-seed-snapshot.ts
that the build script runs before vite build. The seed-import flow
now fetches /seed/snapshot.json (a plain static file) instead of an
API route. One step closer to the static-only build needed for
Capacitor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Adapter swap + SSR disable

Swap the SvelteKit adapter to `adapter-static`, configure the fallback for SPA-style dynamic routing, and disable SSR globally so the build produces a single index.html shell that hydrates client-side.

**Files:**
- Modify: `package.json` (adapter dependency)
- Modify: `svelte.config.js` (adapter import + config)
- Modify: `src/routes/+layout.ts` (add `ssr = false; prerender = true`)

- [ ] **Step 1: Swap the adapter dependency**

```bash
~/.bun/bin/bun remove @sveltejs/adapter-node
~/.bun/bin/bun add -D @sveltejs/adapter-static
```

Expected: `@sveltejs/adapter-node` disappears from `package.json` dependencies; `@sveltejs/adapter-static` appears under `devDependencies`. (Or under `dependencies` if `bun add` defaults that way — either is fine; SvelteKit only needs it at build time.)

- [ ] **Step 2: Update `svelte.config.js`**

Read the current file:

```bash
cat svelte.config.js
```

Replace its contents with:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter({ fallback: 'index.html' }) }
};
```

The `fallback: 'index.html'` option tells adapter-static to emit
`build/index.html` as the catch-all for any URL that isn't a
prerendered route. Dynamic routes (`/recipes/[id]`, `/recipes/[id]/batches/[batchId]/cook`, etc.) all resolve to this shell and SvelteKit's client router handles them in the browser.

- [ ] **Step 3: Disable SSR + enable prerender in the root layout**

Edit `src/routes/+layout.ts`. The current file contains the `load` function that calls `seedIfEmpty`. Add two exports at the top of the file (anywhere in the module scope before or after the load — convention is at the top):

```ts
export const prerender = true;
export const ssr = false;
```

Final file shape:

```ts
import { browser } from '$app/environment';
import { seedIfEmpty } from '$lib/data/seed-import';

export const prerender = true;
export const ssr = false;

export const load = async () => {
  if (browser) await seedIfEmpty();
  return {};
};
```

- [ ] **Step 4: Run typecheck + lint + tests**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun test
```

Expected: 0 errors, all 158 tests pass.

- [ ] **Step 5: Run the static build**

```bash
~/.bun/bin/bun run build
```

Expected output:
1. The prebuild script logs the snapshot counts.
2. Vite builds the SvelteKit app.
3. The build emits a `build/` directory containing `index.html` and assets.

If the build fails with a prerender error (e.g., complaints about a route that can't be prerendered because it depends on `$app/state` or similar), the universal load on that route may still try to read query params at prerender time. The fix: confirm the page's load function gates on `browser` first. All loads from sub-project 1 already do this, so this error is unlikely — but if it appears, identify the offending route in the error message and verify its `+page.ts` has the `if (!browser) return ...` guard.

- [ ] **Step 6: Inspect the build output**

```bash
ls -la build/
cat build/index.html | head -40
```

Expected: `build/index.html` exists. The file content is a SvelteKit shell with `<script>` tags pointing at hashed JS bundle paths. There should be no Node-specific output (no `server/` directory, no `handler.js`).

```bash
ls build/seed/
```

Expected: `snapshot.json` exists — copied from `static/seed/` into the build output by adapter-static.

- [ ] **Step 7: Smoke-check with preview server (skip if not feasible)**

```bash
~/.bun/bin/bun run preview
```

1. Open localhost (the URL preview prints).
2. Confirm the home page loads, recipes appear.
3. Click into a recipe. Confirm `/recipes/<id>` works (this exercises the `fallback: 'index.html'` route).
4. Reload `/recipes/<id>` directly. Confirm it still loads (the fallback serves the SPA shell for direct URL visits).

Stop the preview when done. Skip if not feasible.

- [ ] **Step 8: Run e2e**

```bash
~/.bun/bin/bun run e2e
```

Expected: 8/8 pass. E2E runs against `bun run dev`, which still works the same way — the adapter only affects `bun run build` output.

- [ ] **Step 9: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add -A && git commit -m "$(cat <<'EOF'
feat(build): switch to adapter-static + disable SSR

Replace @sveltejs/adapter-node with @sveltejs/adapter-static and
configure fallback: 'index.html' so dynamic routes work as a SPA.
Disable SSR globally via the root +layout.ts so every page is a
static shell that hydrates from IndexedDB on the client. Output is
a fully self-contained build/ directory with no Node runtime
requirement at request time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Final verification + push

- [ ] **Step 1: Full pipeline**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
~/.bun/bin/bun run e2e
```

Expected: all green. If knip flags the build script as unused (because nothing imports it as a module, only the package.json script invokes it), add an entry to `knip.json` allowing it. To check the existing config:

```bash
cat knip.json
```

If the script is flagged, add to knip's `entry` array:

```json
"entry": ["scripts/build-seed-snapshot.ts", ...existing entries]
```

- [ ] **Step 2: Confirm `git status` is clean**

```bash
git status
```

Expected: working tree clean; branch ahead of origin/main by 3 commits (one per Task 1–2, plus the spec/plan commits from earlier).

- [ ] **Step 3: Run the static build one more time end-to-end**

```bash
~/.bun/bin/bun run build
```

Expected: clean build, no warnings about unprerenderable routes.

- [ ] **Step 4: Push**

```bash
git push
```

Expected: push succeeds.

---

## Notes for the implementer

- **Pre-commit hook** (`lefthook`) runs typecheck/lint/knip/test on commit (not e2e — run e2e separately). Use `export PATH="$HOME/.bun/bin:$PATH" &&` before commits.
- **Branch policy:** stay on `main`, do not push until Task 3.
- **The prebuild script reads from `src/lib/server/storage/*` at build time.** Those modules remain in the repo as build-time tools, never bundled into the client output. Don't delete them in this sub-project.
- **Static file path vs URL:** files in `static/seed/snapshot.json` are served at `/seed/snapshot.json` (root-relative, no `/api` prefix). Vite serves the entire `static/` directory at the root in both dev and the production static build.
- **Order matters in Task 1.** Create the script, run it manually first (Step 2) so you have the artifact when Step 7's tests run — `seedIfEmpty` may try to fetch the file on first hit.
- **If Task 2's build fails with a prerender error**, the most common cause is a `+page.ts` that doesn't gate on `browser`. All sub-project 1 loads already do; if a new one was added since, fix the guard there.
