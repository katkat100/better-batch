# Persisted cook multiplier + BatchDetail badge

**Status:** Design approved 2026-05-14.
**Owner:** Katie.
**Builds on:** [Cook-time batch multiplier (2026-05-08)](./2026-05-08-batch-multiplier-design.md).

## Summary

Promote the cook-time multiplier from a plain-text marker in
`outcomeNotes` to a structured optional field `cookMultiplier?: number`
on `Batch`. Surface it on `BatchDetail` as a small "2x" / "3x" chip
next to the status pill. The text marker in `outcomeNotes` is dropped
on first-cook (the badge replaces it) but kept inside re-cook
date-headed blocks (so per-session history still tells you which cook
session was at which size).

## Motivation

The plain-text marker shipped in 2026-05-08 works, but the multiplier
is data, not prose — it should be queryable and displayable without
parsing notes. Surfacing it as a badge on the read view makes the
batch size obvious at a glance instead of buried in the outcome-notes
paragraph, and gives us a typed field future features can rely on
(e.g. comparison of two batches across sizes).

## Behavior

### `cookMultiplier` field

```ts
interface Batch {
  // ... existing fields ...
  inconsistencyNote?: string;
  cookMultiplier?: number;
  createdAt: string;
}
```

Semantics:

- `undefined` (absent) means either the batch has never been cooked,
  or every cook session so far has been at 1x. The two cases are
  indistinguishable from this field alone; the existing `cookedAt`
  and `outcomeNotes` distinguish them.
- A positive number `> 1` means the **most recent** cook session was
  at that size. The field reflects the latest cook only — the same
  semantic as `rating` and `cookDurationMs`.

The field is **opt-in for new cook sessions.** Existing batches saved
before this feature keep their plain-text markers in `outcomeNotes`
but do not get a `cookMultiplier`, and therefore show no badge. We
will not parse old notes to retroactively populate the field.

### Storage convention

Both `createBatch` and `updateBatch` enforce the same drop rule
already used for `inconsistencyNote`: a value `<= 1` (or any falsy
value) is *not persisted*. Only `cookMultiplier > 1` is written to
disk. This keeps the JSON files clean and means a re-cook at 1x after
a prior 2x cook clears the field automatically.

Caller-facing: the editor (in cook view) always passes
`cookMultiplier: multiplier` on save; storage handles the persist-vs-drop
decision.

### `buildEndCookPatch` changes

The pure function in `src/lib/ui/cook/layout/end-cook-patch.ts` gains
one responsibility and loses one:

**First-cook path:**
- *Loses:* the prepended `"Cooked at Nx\n\n"` line on `outcomeNotes`.
  The badge replaces this; the notes themselves stay focused on user
  prose.
- *Gains:* sets `cookMultiplier: state.multiplier` in the returned
  patch. (Storage drops if = 1, so 1x first-cooks behave exactly as
  before.)

**Re-cook path:**
- *Unchanged:* the date-headed block still includes the
  `"— {date}:\nCooked at Nx\n{notes}"` text marker, so per-session
  history records what size each cook was. Notes themselves are the
  per-session record; the structured field is the latest-cook
  summary.
- *Gains:* sets `cookMultiplier: state.multiplier` so the badge
  reflects the latest cook.

**Short-circuit:** the existing re-cook "return `{}` when no notes
and no marker" stays as-is. The structured field updates ride
alongside the existing patch behavior — they don't need to gate the
short-circuit because storage drops on `cookMultiplier <= 1` either
way, so an empty re-cook at 1x writes nothing meaningful regardless.

### BatchDetail badge

In `BatchDetail.svelte`'s header `<div>` (around line 82, between the
status pill and the existing inconsistency badge), insert:

```svelte
{#if batch.cookMultiplier && batch.cookMultiplier > 1}
  <span
    class="text-[10px] uppercase tracking-wider border border-ochre text-ochre px-1.5 py-0.5 rounded-sm self-center"
    data-testid="cook-multiplier-badge"
    title="Cooked at this size"
  >{batch.cookMultiplier}x</span>
{/if}
```

Visual: ochre outline, ochre text, no fill, small uppercase chip
sitting inline with the existing "Cooked X days ago" / "Draft" /
"Archived" status pill. The reading order on a cooked-at-2x batch
with an inconsistency override becomes:

```
v3-better-crumb
Cooked 3 days ago    2x    ⚠
```

The badge is purely decorative — no click handler, just a tooltip via
`title`.

## Files touched

**Modified:**
- `src/lib/server/domain/types.ts` — add `cookMultiplier?: number` to
  the `Batch` interface, between `inconsistencyNote` and `createdAt`.
- `src/lib/server/storage/batches.ts`:
  - `CreateBatchInput` gains `cookMultiplier?: number`.
  - `createBatch` only writes the field when `input.cookMultiplier
    > 1`.
  - `updateBatch` drops `cookMultiplier` from the persisted record
    when the patch contains the key with a falsy or `<= 1` value.
- `src/routes/api/recipes/[id]/batches/+server.ts` — POST handler
  validates `body.cookMultiplier` as a number, passes through to
  `createBatch` (or `undefined` if not a number).
- `src/lib/ui/api-client.ts` — extend the `createBatch` input type with
  `cookMultiplier?: number`. `patchBatch` already accepts
  `Partial<Batch>`, no change needed.
- `src/lib/ui/cook/layout/end-cook-patch.ts`:
  - First-cook path: stop prepending the text marker; instead set
    `cookMultiplier` on the patch.
  - Re-cook path: keep the date-headed text marker; also set
    `cookMultiplier` on the patch.
- `tests/ui/end-cook-patch.test.ts`:
  - Update the 3 existing first-cook multiplier tests to expect the
    structured field and no text-marker prepend.
  - Update the 2 existing re-cook multiplier tests to additionally
    assert `cookMultiplier` is in the patch.
  - Add 2 new tests: re-cook at multiplier 1 after a prior cook
    sends `cookMultiplier: 1` in the patch (so the storage layer
    drops the field); first-cook at 1x produces no `cookMultiplier`
    in the saved record (the marker-removed change shouldn't change
    the visible behavior here either).
- `src/lib/ui/BatchDetail.svelte` — render the badge described above.

**No new files. No new e2e** — e2e coverage for the multiplier flow
remains its own punch-list item.

## Testing

**Unit tests for `buildEndCookPatch`** (modifications + additions in
`tests/ui/end-cook-patch.test.ts`):

Existing first-cook-with-multiplier tests change shape: they no
longer expect `outcomeNotes` to be `"Cooked at 2x\n\ngreat crumb"`
— they expect:
- `patch.outcomeNotes === "great crumb"` (user notes only, no marker)
- `patch.cookMultiplier === 2`

Existing first-cook-no-user-notes test (multiplier 3): the old
expectation was `outcomeNotes === "Cooked at 3x"`. The new
expectation:
- `patch.outcomeNotes === ""` (empty, no marker)
- `patch.cookMultiplier === 3`

Existing re-cook tests keep their `outcomeNotes` expectations
unchanged (date-headed block with marker) and gain a
`patch.cookMultiplier === 2` (or 3) assertion.

New tests:
- First-cook at multiplier 1 with notes → `patch.cookMultiplier === 1`
  (storage drops, but the patch carries it).
- Re-cook at multiplier 1 with notes after prior 2x cook →
  `patch.cookMultiplier === 1` is on the patch (storage drops, badge
  disappears).

**No new tests for storage or for the badge itself.** The drop rule
in `createBatch` already has the `inconsistencyNote` parallel for
which we trust the same pattern; the badge is one conditional
`{#if}` block with no logic to verify beyond manual inspection.

## Migration

None required. The new field is optional. Existing batch JSON files
that lack it continue to load unchanged via the storage layer's
existing `migrateBatchOnRead`. Their plain-text `"Cooked at Nx"`
markers in `outcomeNotes` remain as historical record but do not
drive UI.

## Out of scope

- Parsing old `outcomeNotes` to retroactively populate
  `cookMultiplier` for pre-feature batches.
- Showing the badge on `BatchGraph` nodes (considered, deferred — the
  graph is already dense).
- Showing the badge on `NotecardCard` (home page) — overkill for
  v1.
- A history view of every cook session's multiplier (the latest is
  enough; per-session record lives in re-cook notes).
- Comparing batches across multipliers (e.g. side-by-side at 2x vs 3x)
  — separate feature.

## Open questions

None at design approval time.
