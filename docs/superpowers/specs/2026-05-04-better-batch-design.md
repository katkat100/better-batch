# Better Batch — Design Spec

**Date:** 2026-05-04
**Status:** Draft, pending implementation plan

## 1. Overview

Better Batch is a local, single-user iterative recipe site. Recipes are living documents that evolve through numbered "batches" (V1, V2, V3 …). Batches form a directed acyclic graph: a batch can have one parent (a normal iteration) or two parents (a merge), enabling branching experiments and recombination. The product's distinctive feature is comparing and merging batches by structured variable, not by text diff.

Aesthetic and voice are defined in `Better_Batch_Design_Spec.pdf`: warm off-white canvas, sharp 4px-max edges, Fraunces serif titles + Inter UI sans, Burnt Ochre primary accent, Deep Juniper for success/final states, hairline Drafting Ink borders. Voice is objective and direct ("Record, Analyze, Refine, Archive").

This spec defines the MVP. Items in §11 are explicitly out of scope.

## 2. Domain model

Three entities.

### Recipe
Parent object. One folder on disk.

| Field | Type | Notes |
|---|---|---|
| `id` | string (slug) | Stable; filename-safe |
| `name` | string | Display name |
| `description` | string | Optional |
| `tags` | string[] | Free-form, used for filtering |
| `preset` | `"bread" \| "sauce" \| "braise" \| "custom"` | Drives the default variable schema on creation |
| `variableSchema` | `{ name, unit, type }[]` | User-defined, recipe-level. `type` is `"number" \| "text"` for MVP |
| `currentBatchId` | string \| null | The active "tip" — purely a UI selection pointer; mutating it does not alter history |
| `createdAt`, `updatedAt` | ISO 8601 strings | |

### Batch
A node in the version graph. One file on disk.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable id, e.g. `v3-longer-bulk` |
| `recipeId` | string | |
| `label` | string | Free text, e.g. "longer bulk" |
| `parentIds` | string[] | 0 entries = root (V1). 1 = normal child. 2 = merge |
| `status` | `"draft" \| "cooked" \| "archived"` | Orthogonal to graph structure |
| `cookedAt` | ISO 8601 \| null | Set when status flips to `cooked` |
| `variables` | `Record<string, number \| string \| null>` | Keys must match recipe's `variableSchema`. Missing schema entries treated as `null` |
| `ingredients` | `{ name, amount, unit }[]` | |
| `steps` | string[] | One element per step |
| `outcomeNotes` | string | Free text. Filled after cooking |
| `rating` | 1\|2\|3\|4\|5 \| null | |
| `createdAt` | ISO 8601 | |

### Tag
Just strings on the recipe. No separate entity in MVP.

### Graph rules
- `parentIds` is the source of truth. Children are computed by scanning a recipe's batches.
- Schema additions backfill as `null` on older batches.
- A batch's variables map is keyed by names that exist in the schema *now*. If a schema field is renamed, the storage layer migrates batch keys in lockstep.
- Merges: a new batch with `parentIds: [a, b]` and field values chosen via the three-pane merge picker (§5.5).

## 3. Storage layout

Flat files under a configurable `data/` directory. Self-contained per recipe.

```
data/
  recipes/
    sourdough-loaf/
      recipe.json              # Recipe object
      batches/
        v1-initial.json        # Batch object
        v2-plus-hydration.json
        v3-longer-bulk.json
        v4a-whole-wheat.json
        v4b-cold-proof.json
        v5-final.json
    weeknight-chili/
      recipe.json
      batches/...
  index.json                   # Derived cache for fast home page
```

- All ids inside JSON are canonical; filenames are slugs derived from id + label for human readability.
- `index.json` caches per-recipe summaries: id, name, tags, batch count, last-cooked date, latest values for the first 1–2 schema variables (for the home-page sparkline). Rebuilt on every write; can be regenerated from a full scan if drift is detected.
- All writes go through the server. The client never reads or writes disk directly.
- Atomic writes: write to a temp file in the same directory, then rename, to survive crashes mid-write.
- Settings (data dir path, defaults) live in `config.json` at the project root.

JSON over YAML/Markdown because batches contain structured arrays and typed variables; JSON is the lowest-friction serialization.

## 4. Application architecture

**Stack:** SvelteKit + Bun + Tailwind CSS v4. One project, server + frontend together. Bun runs the server and bundles the client.

```
better-batch/
  src/
    lib/
      server/
        storage/        # pure file I/O — read/write recipe.json, batch files, index.json
        domain/         # pure logic — graph traversal, merge resolution, schema ops, diffs
        index-cache.ts  # rebuild + read index.json
      ui/
        components/     # NotecardGrid, BatchGraph, VariableTable, MergePicker, Diff, etc.
        stores/         # ephemeral selection state (compare picks, merge draft)
    app.css             # @import "tailwindcss"; @theme { tokens }; font links
    routes/
      +page.svelte                              # home — recipe grid
      recipes/[recipeId]/
        +page.server.ts                         # load recipe + batches via lib/server
        +page.svelte                            # detail view (DAG + batch detail)
        compare/+page.svelte                    # ?a=v3&b=v5
        merge/+page.svelte                      # ?a=v4a&b=v4b
      api/
        recipes/+server.ts                      # GET list, POST create
        recipes/[id]/+server.ts                 # GET / PATCH / DELETE
        recipes/[id]/batches/+server.ts         # POST new batch (incl. merges)
        recipes/[id]/batches/[batchId]/+server.ts
  data/                                         # storage root, gitignored by default
  static/icons/                                 # SVG icons only
```

**Boundaries:**

- `lib/server/storage/` is the only place `node:fs` is touched. Everything else takes plain data structures.
- `lib/server/domain/` is pure functions: graph queries, variable diff, merge field resolution, schema migrations. Independently testable.
- The UI never imports `node:fs` directly — it goes through `+page.server.ts` loaders or `/api` endpoints.
- Stores in `lib/ui/stores/` are ephemeral only (current compare pair, merge draft). Persistent state lives on disk.

Each focused component (BatchGraph SVG, VariableTable, MergePicker) should stay under ~200 lines. If one grows past that, split it.

## 5. Key UI surfaces

### 5.1 Home — notecard grid (`/`)
Grid of 4×6 portrait cards on the canvas background. Each card shows: recipe name (Fraunces), latest batch chip ("V5 · final" — Juniper if cooked, Ochre if draft), batch count, last-cooked date, a thin SVG sparkline of the first variable in the schema. Click → recipe detail.

Top toolbar (slim, hairline-bordered): name search, tag filter, status filter (`all` / `has-cooked` / `drafts only`), sort (`last cooked` / `name` / `batch count`). Top-right: **+ New Recipe**.

### 5.2 Recipe detail (`/recipes/[id]`)
Two-pane layout. Left ~38%: SVG-rendered DAG. Right: detail of selected batch.

**DAG rendering:** circles for nodes, hairline curves for edges. Current selection ringed in Ochre. Cooked batches filled Juniper, drafts hollow with Obsidian outline, archived dimmed Drafting Ink. Merge nodes have two inbound edges; branches show as forks. Layout: simple top-down, columns for sibling branches. Click a node → loads batch into the right pane. Shift-click two nodes → activates Compare action.

**Right pane:** variable strip (4–6 stat tiles showing schema variables with values), then ingredients, then steps, then outcome notes (if cooked) and rating. Top action bar: **+ New Batch**, **Compare**, **Merge**, **Mark as cooked** (only on drafts), **Archive**.

### 5.3 New batch flow
"+ New Batch" from focused batch X opens an editor pre-filled with X's content. Edits to variables surface inline as Ochre callouts ("from V_X: 72% → 75%"). On save: pick label, pick status (default `draft`). Writes batch with `parentIds: [X.id]`. Recipe's `currentBatchId` updates to the new batch.

### 5.4 Compare (`/recipes/[id]/compare?a=...&b=...`)
Read-only. Variable table on top with explicit deltas:

| Variable | V3 | V5 | Δ |
|---|---|---|---|
| Hydration | 72% | 75% | +3% |
| Bulk ferment | 5h | 4.5h | −30m |

Identical rows render with `—`. Numeric variables show signed deltas in absolute units; text variables show "changed" / "—". Below the table: unified text diff of ingredients and steps (removed in Ochre, added in Juniper, context in Obsidian).

### 5.5 Merge (`/recipes/[id]/merge?a=...&b=...`)
Three-pane picker. Left: parent A's full batch. Right: parent B's full batch. Center: the result, initialized empty. Click any row in left or right pane to send that value into the result column. Result column rows are also editable directly (custom value escape hatch). Identical fields between the two parents auto-fill the result with that value.

Variable rows and ingredient/step rows both pick the same way. On commit: prompt for label and status, then write a new batch with `parentIds: [a.id, b.id]`.

### 5.6 Mark as cooked
"Mark as cooked" on a draft batch:
1. Sets status to `cooked`.
2. Sets `cookedAt` to now.
3. Opens an inline form for `outcomeNotes` (multi-line) and `rating` (1–5 stars).

The batch IS the cook log — there is no separate cook-event entity.

## 6. Visual & voice guardrails

**Tailwind v4 theme** — tokens defined once in `app.css` via `@theme`:

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
```

This produces utilities `bg-canvas`, `text-obsidian`, `border-drafting`, `font-serif`, `font-sans`, `rounded-sm`. **No raw hex codes anywhere outside this block.** No `rounded-lg` or larger — ever.

Fraunces (variable, weights 400–700) and Inter (variable) loaded via `<link>` from Google Fonts in `app.html`.

**Surface rules:**
- All borders 1px in `border-drafting`.
- Note-taking text areas (`steps`, `outcomeNotes`) use a 1px graph-paper background SVG.
- Icons: thin-line SVG only, sourced from a single inline icon set or hand-rolled. No PNGs, no emoji.

**Voice rules — applied to all user-facing strings:**
- Verbs: Record, Analyze, Refine, Archive. Buttons use these.
- Quantitative phrasing: "+5% hydration" not "a bit more water".
- No bloggy filler in empty states or toasts. "No batches yet" not "Looks like you haven't cooked anything!"

## 7. Server API

All endpoints return JSON. Errors return `{ error: string }` with appropriate HTTP status.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/recipes` | List from index.json |
| POST | `/api/recipes` | Create recipe (body: name, preset, tags) |
| GET | `/api/recipes/:id` | Recipe + all batches |
| PATCH | `/api/recipes/:id` | Edit recipe metadata, tags, schema (with batch migration) |
| DELETE | `/api/recipes/:id` | Delete recipe folder |
| POST | `/api/recipes/:id/batches` | New batch (body includes `parentIds`, `status`, content) |
| GET | `/api/recipes/:id/batches/:batchId` | Single batch |
| PATCH | `/api/recipes/:id/batches/:batchId` | Edit batch (status flip, outcome notes, rating, content while still draft) |
| DELETE | `/api/recipes/:id/batches/:batchId` | Delete (warn if has children) |

Schema mutations (renames, adds, deletes) are handled on the recipe PATCH and migrate every batch file in lockstep before returning.

## 8. Error handling

- File system errors: surface as 500 with the OS error message in dev, generic in prod.
- 404 for missing recipe/batch ids.
- 409 if you try to create a batch whose `parentIds` reference batches in a different recipe.
- Schema validation errors: 400, with field-level messages.
- Index drift detection: on server boot, validate that every recipe folder appears in `index.json` and vice versa. If drift, rebuild silently and log a warning.

## 9. Testing strategy

- **Domain unit tests** (Bun test): graph traversal (children of, ancestors of, is-merge), variable diff, merge field resolution, schema migration. No filesystem needed — pure functions.
- **Storage tests:** read/write/rename round-trips against a temp directory. Atomic write under simulated mid-write failure.
- **API integration tests:** spin up SvelteKit server against a temp `data/` dir; exercise each endpoint.
- **UI:** Playwright smoke tests for the three core flows: create recipe → add batch → mark as cooked; compare two batches; merge two batches.

## 10. Out of scope for MVP

- Photos per batch (and any image storage).
- Export/import beyond manual folder copy.
- Multi-user, auth, sync.
- Cloud DB or any network storage.
- Named branches as moving pointers (batch labels suffice).
- Variable history charts beyond the home-page sparkline.
- Public sharing or publish view.
- Real `git init` of the data folder (the storage layout supports it; we just don't ship that integration).
- Mobile-specific layouts (desktop-first; should not break on tablet but no phone optimization).

## 11. Open questions / risks

- **Three-pane merge at scale:** if a recipe's variable schema grows past ~8 fields, the three-pane picker may feel cramped on smaller screens. Acceptable for MVP; revisit if it becomes painful.
- **Index cache invalidation:** rebuilding on every write is fine at hundreds of recipes; if performance degrades we can move to incremental updates.
- **Batch id collisions:** id is derived from label slug; collisions resolved by suffixing. Verify in storage layer.
