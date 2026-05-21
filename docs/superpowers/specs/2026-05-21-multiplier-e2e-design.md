# Multiplier e2e coverage

**Status:** Design approved 2026-05-21.
**Owner:** Katie.

## Summary

Add a Playwright e2e spec covering the cook-time multiplier round-trip:
toggling 2x during cook scales the ingredient pills, persists
`cookMultiplier` on the batch, and surfaces a `2X` badge on
BatchDetail without leaving a `"Cooked at 2x"` text marker in the
outcome notes. Plus a control test verifying that cooking at 1x
leaves no badge.

## Motivation

The multiplier feature ships across several layers — UI toggle,
`multiplyAmount` helper, `buildEndCookPatch`, storage drop rule, the
`cookMultiplier` field, and the BatchDetail badge. Each layer has
unit-test coverage. What's missing is an integration test that walks
the full flow through the actual UI: drive the cook view, end the
cook at 2x, navigate to the saved batch, assert the badge. That's
the contract a future refactor (e.g., changing how the patch is
composed, swapping the badge component, splitting the storage layer)
could silently break.

## Behavior covered

**Test 1 — "Cooking at 2x sets badge and no text marker"** drives:

1. Recipe creation (Custom preset).
2. New batch with one ingredient ("Flour" 500g) and one step
   ("Mix everything") referencing 500g of flour.
3. Click Cook → Start Cooking.
4. Click the **2x** option on the multiplier toggle.
5. Assert the cook ingredient pill renders the doubled amount
   (`1000g`).
6. Check the step's checkbox → End Cook dialog opens.
7. Submit with no user notes (rating + notes empty).
8. On the resulting BatchDetail page:
   - The badge `[data-testid="cook-multiplier-badge"]` is visible
     and shows `2X`.
   - The saved outcomeNotes do NOT contain the literal text
     `"Cooked at 2x"` (the first-cook marker was dropped when
     `cookMultiplier` became the structured source of truth).

**Test 2 — "Cooking at 1x leaves no badge"** drives:

1. Same recipe + batch setup as Test 1.
2. Cook without touching the multiplier (stays at 1x).
3. Check the step → End Cook → submit.
4. On BatchDetail, `[data-testid="cook-multiplier-badge"]` is not
   visible.

## Architecture

Single file: `tests/e2e/multiplier.e2e.ts`. Follows the pattern of
the existing specs (`cook.e2e.ts`, `ingredient-inconsistency.e2e.ts`).

Setup uses the existing `clearTestData({ page })` from
`tests/e2e/helpers.ts` to wipe both the temp fs directory and the
browser's IndexedDB. Each test runs in isolation.

Both tests use Playwright's auto-waiting assertions (`toBeVisible`,
`toContainText`, `not.toBeVisible`) rather than `waitForTimeout`.

## What's deliberately out of scope

- **BatchDetail read-side toggle.** The same `MultiplierToggle`
  component appears on the saved-batch page for preview-only display.
  Its scaling math is covered by `multiplyAmount` unit tests; an e2e
  for it would be "click button, assert DOM text changed" — low
  value.
- **Re-cook at a different multiplier.** Requires a cooked-batch
  starting state and an extra click path. The behavior (badge
  updates on re-cook, drop-rule clears on re-cook-at-1x) is unit-
  tested in `tests/ui/end-cook-patch.test.ts`. Worth adding later if
  the re-cook UX changes meaningfully.
- **Web Audio chime / vibration / native notification.** Browser
  test environment can't reliably verify these.
- **Background timer notifications.** Native feature, requires a
  device.

## Files touched

**New:**
- `tests/e2e/multiplier.e2e.ts`

**No source changes.** This is pure test addition.

## Testing

The new tests run under the existing `bun run e2e` command. Both
should run in under 5 seconds each on a warm cache. The full e2e
suite goes from 8 to 10 tests.

Pre-commit hook (`lefthook`) does not run e2e — the implementer
runs `bun run e2e` explicitly before commit, the same flow used for
the existing e2e specs.

## Open questions

None at design approval time.
