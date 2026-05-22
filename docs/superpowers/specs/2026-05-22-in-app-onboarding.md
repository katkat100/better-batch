# In-app onboarding: welcome panel + sample recipe

**Status:** Design approved 2026-05-22.
**Owner:** Katie.

## Summary

First-launch users land on an empty recipe list with no idea what
Better Batch does. Add a welcome panel that explains the
recipe → batch → fork model in three sentences and offers two CTAs:
"Create your first recipe" (opens the existing NewRecipeDialog) and
"Load sample recipe" (seeds a curated Weekly Focaccia recipe with
three batches that demonstrates the full lineage flow).

The panel auto-shows when the recipe list is empty and the user
hasn't dismissed it. A small `?` button in the home header lets
returning users re-open it as a refresher.

## Motivation

Better Batch's mental model — that a recipe is a *family of
attempts* rather than a single fixed thing — is not obvious from the
empty home page (currently just "No recipes match."). New users have
no on-ramp into the conceptual shift.

The full conceptual reference exists in `USER_GUIDE.md` at the repo
root, but it's outside the app. This work brings the minimum
necessary explanation in-app, plus a hands-on sample database so the
graph view, batch editor, and cook flow all have content to explore
before the user commits to creating their own first recipe.

## Behavior

### Welcome panel

A new `src/lib/ui/WelcomePanel.svelte` component renders as a
centered card on the home page (NOT a modal — the page chrome stays
reachable). Layout:

- Serif `<SectionHeading text="Welcome to Better Batch" size="2xl" />`.
- Three short sentences explaining the model. Suggested copy:
  > Better Batch tracks each cook as a *batch* under its recipe.
  > Fork from your best batch, change one thing, and cook it again —
  > the app remembers everything so you can compare attempts side by side.
- Two primary CTAs side-by-side (or stacked on mobile):
  - **"+ Create your first recipe"** — `<Button variant="primary">`
  - **"Load sample recipe"** — `<Button variant="outline">`
- A small `×` IconButton in the top-right of the card for explicit dismiss.

Props:

```ts
type Props = {
  onCreateRecipe: () => void;
  onLoadSample: () => Promise<void>;
  onDismiss: () => void;
};
```

The "Load sample recipe" CTA enters a loading state (button text
swaps to "Loading sample…", disabled) until the awaited promise
resolves. Errors during loading surface via the existing `FormError`
primitive rendered below the CTAs.

Both CTAs implicitly dismiss the panel after success — the panel's
parent calls `onDismiss` after CTA action completes. The explicit `×`
also calls `onDismiss`.

ESC key dismisses the panel (matches the rest of the app's popover
behavior). Click-outside does NOT dismiss — the panel takes over the
empty home and there's no meaningful "outside" to click.

### Sample recipe seeding

New file: `src/lib/data/sample.ts`. Exports one function:

```ts
export async function loadSampleRecipe(): Promise<string>;
```

Behavior:
1. Calls `api.createRecipe(...)` with name "Weekly Focaccia", preset
   "bread", tags `['focaccia', 'sample']`, and a description.
2. Calls `api.createBatch` three times to create the lineage below.
3. For the cooked batches, calls `api.patchBatch` to set
   `status: 'cooked'`, `cookedAt`, `outcomeNotes`, and `rating`.
4. Returns the new recipe id.

The three batches:

| Label | Status | Parent | Variables | Outcome / rating |
|---|---|---|---|---|
| `Base` | draft | (root) | hydration 70, bulk 4, bake temp 220, yield 4 | — |
| `Base.2` | cooked | Base | hydration 70, bulk 4, bake temp 220, yield 4 | "Good crust. Pan stuck a bit — more oil next time." / ★★★ |
| `high-hydration variant` | cooked | Base | hydration 80, bulk 4, bake temp 220, yield 4 | "Open crumb. Slightly harder to handle." / ★★★★ |

Ingredients (same skeleton across all three; the high-hydration
variant just bumps water):

- 500 g flour
- 350 g water *(400 g in the high-hydration variant)*
- 10 g salt
- 5 g yeast
- 30 g olive oil

Steps (free text — the cook view's timer-trigger parser will pick up
the durations automatically):

1. Mix flour, water, salt, and yeast in a bowl until shaggy.
2. Autolyse for 30 minutes.
3. Bulk ferment 4 hours, folding every 30 minutes for the first 2 hours.
4. Transfer to oiled pan, dimple with oil, rest 45 minutes.
5. Bake 25 minutes at the variable bake temp.

`cookedAt` for cooked batches is set to a deterministic
near-past date (e.g. 2 days ago / 7 days ago) so the sample looks
"recently used" without hard-coding a literal timestamp that ages
poorly. Implementation: `new Date(Date.now() - 2 * 86400_000).toISOString()`.

### Trigger logic

In `src/routes/+page.svelte`:

```ts
let welcomeOpen = $state(false);

$effect(() => {
  if (typeof localStorage === 'undefined') return;
  if (data.index.length > 0) return;
  if (localStorage.getItem('bb_welcome_dismissed') === '1') return;
  welcomeOpen = true;
});

function dismiss() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('bb_welcome_dismissed', '1');
  }
  welcomeOpen = false;
}
```

The `typeof localStorage` guards are belt-and-suspenders against SSR
prerendering (the adapter-static build prerenders `/`).

### Help button in header

The existing `+page.svelte` header renders Export, Import, and
`+ New Recipe` buttons. Insert an `IconButton` between Import and the
new-recipe trigger:

```svelte
<IconButton
  aria-label="Show welcome guide"
  onclick={() => welcomeOpen = true}
  data-testid="welcome-help-btn"
>?</IconButton>
```

Clicking always re-opens the panel, regardless of the dismissed
flag.

### CTA wiring

- **"+ Create your first recipe"** — calls `onCreateRecipe`. Parent
  sets `welcomeOpen = false`, then sets `dialogOpen = true` (the
  existing NewRecipeDialog) AND calls `dismiss()` to persist the
  flag. The dialog handles its own submit + navigation.
- **"Load sample recipe"** — calls `onLoadSample`. Parent awaits
  `loadSampleRecipe()`, navigates to `/recipes/{newId}` via the
  SvelteKit `goto` helper, and calls `dismiss()`.
- **`×` dismiss / ESC** — calls `onDismiss`. Parent calls `dismiss()`.

## Architecture

### File changes

**Added:**
- `src/lib/ui/WelcomePanel.svelte` — the welcome card component.
- `src/lib/data/sample.ts` — `loadSampleRecipe()` and the inline sample data.
- `tests/data/sample.test.ts` — unit test for `loadSampleRecipe()`.
- `tests/e2e/welcome.e2e.ts` — e2e test for the first-launch + load-sample flow.

**Modified:**
- `src/routes/+page.svelte` — add `welcomeOpen` state, the `$effect`, the `dismiss` helper, the help button, and the conditional render of `<WelcomePanel>`.

The panel renders inside the same page wrapper as the existing recipe
grid. When `welcomeOpen` is true AND `data.index.length === 0`, it
replaces the "No recipes match." empty-state paragraph. When the user
has any recipe, the grid renders normally and the help button still
opens the panel on demand (panel overlays as a centered card with a
backdrop dimming the grid behind).

To handle both rendering modes without duplicating markup, the panel
itself is always conditionally mounted by `welcomeOpen`. When the
list is empty its position is "in flow"; when not, it sits on a fixed
backdrop so it doesn't disrupt the grid. The backdrop is only added
in the "list is not empty" case via a wrapper div in the parent.

### Persistence

`localStorage` key `bb_welcome_dismissed`. Value `'1'` means
dismissed. Any other value or absence means show on next launch.

We deliberately don't put this in IndexedDB because it's a UI
preference, not a data record. localStorage is synchronous on read
which keeps the `$effect` simple.

## Testing

### Unit — `tests/data/sample.test.ts`

Three assertions inside one `describe('loadSampleRecipe')`:

```ts
it('creates one recipe with the bread preset variable schema', async () => {
  const id = await loadSampleRecipe();
  const recipe = await api.getRecipe(id);
  expect(recipe.name).toBe('Weekly Focaccia');
  expect(recipe.variableSchema.map(v => v.name).sort()).toEqual(
    ['bake temp', 'bulk', 'hydration', 'yield'].sort()
  );
});

it('creates three batches: 1 draft, 2 cooked', async () => {
  const id = await loadSampleRecipe();
  const batches = await api.listBatches(id);
  expect(batches.length).toBe(3);
  expect(batches.filter(b => b.status === 'cooked').length).toBe(2);
  expect(batches.filter(b => b.status === 'draft').length).toBe(1);
});

it('sets up parent/child lineage', async () => {
  const id = await loadSampleRecipe();
  const batches = await api.listBatches(id);
  const base = batches.find(b => b.label === 'Base')!;
  const base2 = batches.find(b => b.label === 'Base.2')!;
  const variant = batches.find(b => b.label === 'high-hydration variant')!;
  expect(base.parentIds).toEqual([]);
  expect(base2.parentIds).toEqual([base.id]);
  expect(variant.parentIds).toEqual([base.id]);
});
```

The exact `api.*` method names and signatures should match what
currently exists in `src/lib/ui/api-client.ts` or wherever the
data-access helpers live; the implementer should match those.

### E2E — `tests/e2e/welcome.e2e.ts`

One test:

```ts
test('first-launch welcome flow with sample recipe', async ({ page }) => {
  await page.goto('/');
  // Welcome panel visible on empty index
  await expect(page.getByTestId('welcome-panel')).toBeVisible();
  // Click "Load sample recipe"
  await page.getByTestId('welcome-load-sample-btn').click();
  // Lands on the recipe detail page
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
  // Returning to home shows the recipe in the grid, no welcome panel
  await page.goto('/');
  await expect(page.getByTestId('welcome-panel')).toHaveCount(0);
  await expect(page.getByText('Weekly Focaccia')).toBeVisible();
});
```

`data-testid` values needed:
- `welcome-panel` on the panel root.
- `welcome-load-sample-btn` on the sample CTA.
- (existing) `welcome-help-btn` on the `?` button for a future "re-show" test if desired.

The test runs against the same `tests/e2e/.tmp-data/` IndexedDB
setup that the other e2e tests use — the harness's beforeEach already
clears state.

### Manual spot checks

- Fresh database (clear localStorage + IndexedDB), reload `/`.
  Welcome panel appears.
- Click "Create your first recipe". Welcome dismisses, NewRecipeDialog
  opens.
- Reload `/`. Welcome no longer auto-shows.
- Click `?` button. Welcome re-opens.
- Click "Load sample recipe" from re-open. Sample lands, navigates,
  reloading `/` shows just the grid (no welcome).
- Set `prefers-reduced-motion: reduce`. Panel still appears (no
  animations in this design).

## Out of scope

- Tooltips / coach marks on first interaction inside the batch editor,
  cook view, or compare/merge views.
- Multi-step modal tour. The panel is one screen.
- Multiple sample recipes (one per preset). Just Weekly Focaccia.
- Multi-language content. English only.
- Analytics / telemetry on CTA clicks.
- Server-side / shared dismissal — the flag is per-device, per-browser.
- Re-syncing the welcome panel content when `USER_GUIDE.md` is
  updated. The panel's copy is independent.
- An in-app render of `USER_GUIDE.md`. The panel covers the minimum;
  the full guide lives at the repo root.

## Open questions

None at design approval time.
