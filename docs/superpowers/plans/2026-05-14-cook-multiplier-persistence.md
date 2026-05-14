# Persisted cook multiplier + BatchDetail badge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the cook multiplier from a plain-text marker in `outcomeNotes` to a structured optional field `cookMultiplier?: number` on `Batch`, displayed as a small "2x" / "3x" chip on `BatchDetail`. Drop the first-cook text marker (the badge replaces it); keep the re-cook marker so per-session history still tells the per-cook story.

**Architecture:** Add the optional field through the existing optional-field pattern already used by `inconsistencyNote` (truthy-persist convention, drop on `<= 1`). `buildEndCookPatch` always sends the multiplier on the patch; the storage layer decides whether it's worth persisting. `BatchDetail` reads `batch.cookMultiplier` directly and conditionally renders an ochre-bordered chip in the header.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Bun test, Tailwind 4.

**Spec:** [`docs/superpowers/specs/2026-05-14-cook-multiplier-persistence-design.md`](../specs/2026-05-14-cook-multiplier-persistence-design.md)

---

## Task 1: Data layer (Batch type + storage + API + api-client)

Thread the optional `cookMultiplier?: number` field through types, storage create/update, the POST handler, and the api-client. No UI work yet.

**Files:**
- Modify: `src/lib/server/domain/types.ts` (Batch interface)
- Modify: `src/lib/server/storage/batches.ts` (CreateBatchInput, createBatch, updateBatch)
- Modify: `src/routes/api/recipes/[id]/batches/+server.ts` (POST handler)
- Modify: `src/lib/ui/api-client.ts` (createBatch input type)

- [ ] **Step 1: Add the optional field to `Batch`**

In `src/lib/server/domain/types.ts`, add `cookMultiplier?: number;` to the `Batch` interface, placed between `inconsistencyNote` and `createdAt`:

```ts
export interface Batch {
  id: string;
  recipeId: string;
  label: string;
  parentIds: string[];
  status: BatchStatus;
  cookedAt: string | null;
  cookDurationMs?: number;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
  outcomeNotes: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  inconsistencyNote?: string;
  cookMultiplier?: number;
  createdAt: string;
}
```

- [ ] **Step 2: Extend `CreateBatchInput` and `createBatch` storage to honor the truthy + > 1 rule**

In `src/lib/server/storage/batches.ts`, add `cookMultiplier?: number;` to the `CreateBatchInput` interface (after `inconsistencyNote?`):

```ts
interface CreateBatchInput {
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
```

In `createBatch`, add the field to the constructed `batch` object only when it's a truthy number `> 1`. Place the spread line directly after the existing `inconsistencyNote` spread:

```ts
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
  ...(input.inconsistencyNote ? { inconsistencyNote: input.inconsistencyNote } : {}),
  ...(input.cookMultiplier && input.cookMultiplier > 1 ? { cookMultiplier: input.cookMultiplier } : {}),
  createdAt: now
};
```

- [ ] **Step 3: Update `updateBatch` to drop `cookMultiplier` when patch value is falsy or <= 1**

In `src/lib/server/storage/batches.ts`, in the `updateBatch` function (around line 102), add a parallel drop rule next to the existing `inconsistencyNote` drop:

```ts
export async function updateBatch(recipeId: string, batchId: string, patch: Partial<Batch>): Promise<Batch> {
  const current = await readBatch(recipeId, batchId);
  const next: Batch = { ...current, ...patch, id: current.id, recipeId: current.recipeId, createdAt: current.createdAt };
  if ('inconsistencyNote' in patch && !patch.inconsistencyNote) {
    delete (next as Partial<Batch>).inconsistencyNote;
  }
  if ('cookMultiplier' in patch && (!patch.cookMultiplier || patch.cookMultiplier <= 1)) {
    delete (next as Partial<Batch>).cookMultiplier;
  }
  await writeFileAtomic(await batchFile(recipeId, batchId), JSON.stringify(next, null, 2));
  return next;
}
```

This handles three cases together:
- The editor sends `cookMultiplier: 1` on a clean re-cook → drop (badge disappears).
- The editor sends `cookMultiplier: 0` or `null` → drop.
- The editor sends a truthy `> 1` value → it survives the patch merge unchanged.

- [ ] **Step 4: Pass the field through the POST endpoint**

In `src/routes/api/recipes/[id]/batches/+server.ts`, extend the `createBatch` call (around line 27) to accept the new optional field. Replace the existing call with:

```ts
const batch = await createBatch(params.id, {
  label: body.label, parentIds: body.parentIds, status: body.status,
  variables: body.variables ?? {}, ingredients: body.ingredients ?? [], steps: body.steps ?? [],
  outcomeNotes: body.outcomeNotes, rating: body.rating ?? null,
  cookedAt: body.status === 'cooked' ? (body.cookedAt ?? new Date().toISOString()) : null,
  inconsistencyNote: typeof body.inconsistencyNote === 'string' ? body.inconsistencyNote : undefined,
  cookMultiplier: typeof body.cookMultiplier === 'number' ? body.cookMultiplier : undefined
});
```

- [ ] **Step 5: Add the field to the api-client `createBatch` input type**

In `src/lib/ui/api-client.ts`, extend the `createBatch` input type to declare the new field. Replace the existing input object type with:

```ts
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
```

`patchBatch` already takes `Partial<Batch>` and will accept the new optional field automatically — no change needed.

- [ ] **Step 6: Run typecheck**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Run the full test suite**

```bash
~/.bun/bin/bun test
```

Expected: all 132 tests still pass. No new tests added in this task; the storage drop rule and the optional field are exercised end-to-end in Task 2 (the buildEndCookPatch tests).

- [ ] **Step 8: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/server/domain/types.ts src/lib/server/storage/batches.ts src/routes/api/recipes/\[id\]/batches/+server.ts src/lib/ui/api-client.ts && git commit -m "$(cat <<'EOF'
feat(types): add optional Batch.cookMultiplier field

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `buildEndCookPatch` — drop first-cook marker, set `cookMultiplier`

Move the multiplier from a text marker (first-cook) to the new structured field on the patch. Keep the re-cook text marker so per-session history reads naturally. Update existing tests + add coverage for the structured field.

**Files:**
- Modify: `src/lib/ui/cook/layout/end-cook-patch.ts`
- Modify: `tests/ui/end-cook-patch.test.ts`

- [ ] **Step 1: Update the existing tests to match the new patch shape**

In `tests/ui/end-cook-patch.test.ts`, replace the three existing multiplier-aware first-cook tests with the new expectations. (Find each test by name and replace its body.)

Replace the test `first-cook prepends "Cooked at Nx" marker when multiplier > 1` (currently at line 65) with:

```ts
  it('first-cook with multiplier > 1 sets cookMultiplier and does not prepend a text marker', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 1_000,
      endedAt: 61_000,
      outcomeNotes: 'great crumb',
      rating: 4,
      existingOutcomeNotes: '',
      multiplier: 2,
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch.outcomeNotes).toBe('great crumb');
    expect(patch.cookMultiplier).toBe(2);
  });
```

Replace the test `first-cook with no user notes records just the marker at multiplier > 1` (currently at line 79) with:

```ts
  it('first-cook with no user notes and multiplier > 1 saves empty notes but sets cookMultiplier', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 0,
      endedAt: 0,
      outcomeNotes: '',
      rating: null,
      existingOutcomeNotes: '',
      multiplier: 3,
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch.outcomeNotes).toBe('');
    expect(patch.cookMultiplier).toBe(3);
  });
```

Replace the test `first-cook at multiplier 1 has no marker (existing behavior preserved)` (currently at line 93) with:

```ts
  it('first-cook at multiplier 1 sends cookMultiplier: 1 on the patch (storage drops)', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 0,
      endedAt: 0,
      outcomeNotes: 'great crumb',
      rating: null,
      existingOutcomeNotes: '',
      multiplier: 1,
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch.outcomeNotes).toBe('great crumb');
    expect(patch.cookMultiplier).toBe(1);
  });
```

Replace the test `re-cook embeds the marker inside the date-headed block` (currently at line 107) with:

```ts
  it('re-cook with multiplier > 1 keeps the text marker AND sets cookMultiplier', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: 'darker than v1',
      rating: null,
      existingOutcomeNotes: 'first cook: nice',
      multiplier: 2,
      now: new Date('2026-06-01T12:00:00Z')
    });
    expect(patch.outcomeNotes).toBe('first cook: nice\n\n— 2026-06-01:\nCooked at 2x\ndarker than v1');
    expect(patch.cookMultiplier).toBe(2);
  });
```

Replace the test `re-cook with no user notes still records the marker when multiplier > 1` (currently at line 121) with:

```ts
  it('re-cook with no user notes + multiplier > 1 keeps marker block AND sets cookMultiplier', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: '   ',
      rating: null,
      existingOutcomeNotes: 'first cook: nice',
      multiplier: 3,
      now: new Date('2026-06-01T12:00:00Z')
    });
    expect(patch.outcomeNotes).toBe('first cook: nice\n\n— 2026-06-01:\nCooked at 3x');
    expect(patch.cookMultiplier).toBe(3);
  });
```

Replace the test `re-cook at multiplier 1 with no user notes is still a no-op patch` (currently at line 135) with:

```ts
  it('re-cook at multiplier 1 with no user notes still sends cookMultiplier: 1 so storage clears any prior value', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: '   ',
      rating: null,
      existingOutcomeNotes: 'prior',
      multiplier: 1,
      now: new Date()
    });
    // outcomeNotes patch is absent (no marker, no user notes) — same as before.
    expect(patch.outcomeNotes).toBeUndefined();
    // cookMultiplier rides along so the storage drop rule clears any prior value.
    expect(patch.cookMultiplier).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
~/.bun/bin/bun test tests/ui/end-cook-patch.test.ts
```

Expected: the 6 replaced tests fail (the function still produces the old shape: prepended text marker on first-cook, no `cookMultiplier` field, empty `{}` on no-op re-cook). The 4 non-multiplier baseline tests still pass.

- [ ] **Step 3: Update `buildEndCookPatch`**

Replace the entire contents of `src/lib/ui/cook/layout/end-cook-patch.ts` with:

```ts
import type { Batch } from '$lib/server';

interface EndCookSessionState {
  mode: 'first-cook' | 're-cook';
  startedAt: number;
  endedAt: number;
  outcomeNotes: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  existingOutcomeNotes: string;
  multiplier?: number;  // optional for backward compatibility; default 1
  now?: Date;           // injectable for tests
}

function multiplierMarker(multiplier: number | undefined): string {
  if (!multiplier || multiplier === 1) return '';
  return `Cooked at ${multiplier}x`;
}

export function buildEndCookPatch(state: EndCookSessionState): Partial<Batch> {
  const now = state.now ?? new Date();
  const trimmed = state.outcomeNotes.trim();
  const marker = multiplierMarker(state.multiplier);
  // The multiplier always rides along on the patch when an end-cook submit
  // happens. Storage drops values <= 1, so callers don't need to think about
  // the persist/drop boundary themselves.
  const multiplierField = state.multiplier !== undefined
    ? { cookMultiplier: state.multiplier }
    : {};

  if (state.mode === 'first-cook') {
    // First-cook used to prepend "Cooked at Nx" to outcomeNotes; now the
    // structured cookMultiplier field is the source of truth and the badge
    // replaces the text marker.
    return {
      status: 'cooked',
      cookedAt: now.toISOString(),
      outcomeNotes: trimmed,
      rating: state.rating,
      cookDurationMs: state.endedAt - state.startedAt,
      ...multiplierField
    };
  }

  // re-cook: write a date-headed block when there's anything to record
  // (user notes OR a multiplier marker). Marker stays in the notes for
  // per-session history.
  if (!trimmed && !marker) {
    // Nothing to write into outcomeNotes, but still update cookMultiplier
    // so a re-cook at 1x clears a prior 2x badge.
    return multiplierField;
  }

  const dateLabel = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const headerBody = marker && trimmed
    ? `${marker}\n${trimmed}`
    : (marker || trimmed);
  const header = `— ${dateLabel}:\n${headerBody}`;
  const next = state.existingOutcomeNotes
    ? `${state.existingOutcomeNotes}\n\n${header}`
    : header;
  return { outcomeNotes: next, ...multiplierField };
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
~/.bun/bin/bun test tests/ui/end-cook-patch.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Run typecheck and lint**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
```

Expected: 0 errors, 0 warnings on both.

- [ ] **Step 6: Run full test suite**

```bash
~/.bun/bin/bun test
```

Expected: all 132 tests pass.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/cook/layout/end-cook-patch.ts tests/ui/end-cook-patch.test.ts && git commit -m "$(cat <<'EOF'
refactor(end-cook): emit cookMultiplier on patch; drop first-cook text marker

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: BatchDetail badge

Render a small "2x" / "3x" chip next to the status pill when `batch.cookMultiplier > 1`.

**Files:**
- Modify: `src/lib/ui/BatchDetail.svelte`

- [ ] **Step 1: Add the badge after the existing status pill block**

In `src/lib/ui/BatchDetail.svelte`, locate the end of the header's status-pill `{#if/:else if/:else}` block (which currently ends around line 147 with `{/if}` after the Archived branch). Directly after that closing `{/if}`, and still inside the outer `<div>` (around line 148), insert:

```svelte
{#if batch.cookMultiplier && batch.cookMultiplier > 1}
  <span
    class="inline-block text-[10px] uppercase tracking-wider border border-ochre text-ochre px-1.5 py-0.5 rounded-sm mt-1 ml-1"
    data-testid="cook-multiplier-badge"
    title="Cooked at this size"
  >{batch.cookMultiplier}x</span>
{/if}
```

The full surrounding section after edit should read (showing the last status-pill branch + the new badge for clarity):

```svelte
{:else}
    <p
        class="text-[11px] uppercase tracking-wider text-obsidian/40 mt-1"
    >
        Archived
    </p>
{/if}
{#if batch.cookMultiplier && batch.cookMultiplier > 1}
    <span
        class="inline-block text-[10px] uppercase tracking-wider border border-ochre text-ochre px-1.5 py-0.5 rounded-sm mt-1 ml-1"
        data-testid="cook-multiplier-badge"
        title="Cooked at this size"
    >{batch.cookMultiplier}x</span>
{/if}
```

(Notice: `mt-1 ml-1` to line up with the surrounding status pill's `mt-1` and add a small left gap from it.)

- [ ] **Step 2: Run typecheck and lint**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
```

Expected: 0 errors, 0 warnings on both.

- [ ] **Step 3: Run tests**

```bash
~/.bun/bin/bun test
```

Expected: 132/132 pass (no test changes in this task).

- [ ] **Step 4: Manual smoke check (skip if dev server is hard to reach — note in self-review)**

If the dev server is reachable:
1. `~/.bun/bin/bun run dev`.
2. Open a recipe; create a new batch and start cooking.
3. Set the multiplier to 2x, then End Cook.
4. On the resulting `BatchDetail` view, confirm a small ochre-outlined "2X" chip appears next to the "Cooked …" status pill.
5. Open a different batch that was cooked at 1x (or pre-feature) — no badge.

Stop the server when done. Skip this step if not feasible.

- [ ] **Step 5: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/BatchDetail.svelte && git commit -m "$(cat <<'EOF'
feat(detail): badge batches cooked at a non-1x multiplier

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Final verification + push

- [ ] **Step 1: Run the full pre-commit pipeline**

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

Expected: working tree clean, branch ahead of origin/main by 4 commits (one per Task 1–3, plus the spec commit `a7bf1d0` from earlier).

- [ ] **Step 3: Push**

```bash
git push
```

Expected: push succeeds.

---

## Notes for the implementer

- **Pre-commit hook** (`lefthook`) runs typecheck/lint/knip/test on commit. It needs `bun` on PATH; prepend `export PATH="$HOME/.bun/bin:$PATH" &&` to all commit commands.
- **Branch policy:** stay on `main`, do not push until Task 4.
- **Task 1 is pure plumbing.** The `cookMultiplier` field is reachable through types/storage/API/api-client but nothing emits it yet. That's intentional.
- **The storage drop rule** in Task 1 Step 3 mirrors the existing `inconsistencyNote` drop pattern. Use the same conditional style for code symmetry.
- **Task 2's `multiplierField` spread** is the single point where the patch decides whether to emit the field. It's emitted whenever `state.multiplier !== undefined`, including `multiplier === 1` — the storage layer is responsible for dropping `<= 1`. Don't pre-drop in the patch builder.
- **Re-cook no-op case (Task 2 Step 3):** the function now returns `{ cookMultiplier: 1 }` when there are no user notes AND multiplier is 1 — i.e., not strictly `{}` anymore. The storage layer drops this to a true no-op write, but the test for this case (in Step 1 of Task 2) now asserts `patch.cookMultiplier === 1` instead of `patch === {}`.
- **No e2e** added in this feature — the e2e gap for the multiplier flow is its own punch-list item to tackle separately.
