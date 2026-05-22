# Better Batch — User Guide

A notebook for cooks who treat recipes as a science project. Track every iteration, see what changed between attempts, and learn from your last cook before you start the next one.

## The big idea

Most recipe apps treat a recipe as a fixed thing. Better Batch treats a recipe as a **family of attempts** — each one is a *batch*, with its own ingredients, steps, and variables. You cook a batch, write down what you learned, and fork the next attempt from it. Over time the lineage becomes a tree of experiments you can compare and merge.

```
Weekly Focaccia (recipe)
├── Base (cooked ★★★)
│   ├── Base.2 (draft)
│   └── base-high-hydration (cooked ★★★★)
│       └── from base-high-hydration (cooked ★★★★★ ← your current best)
└── merge of base + high-hyd (archived)
```

## Concepts

| Term | What it is |
|---|---|
| **Recipe** | The dish itself, e.g. "Weekly Focaccia". Holds the *variable schema* (what numbers you tune) and the tree of batches. |
| **Batch** | One specific attempt of the recipe: a labeled snapshot of ingredients, steps, and variable values. Has a status — *draft*, *cooked*, or *archived*. |
| **Variable** | A numeric or text dial defined on the recipe (e.g. "hydration", "salt %", "bake temp"). Each batch sets its own values. |
| **Use** | An ingredient referenced inside a step. Lets you track which step consumes which ingredient — and how much. |
| **Multiplier** | A scaling factor (0.5×, 0.75×, 1×, 2×, 3×) applied when you cook. Lets you make a half or double recipe without editing the batch. |
| **Inconsistency** | A validation warning — an ingredient that's never used, a step that references a deleted ingredient, or amounts that don't add up. |

## Getting started

### 1. Make a recipe

From the home page, tap **+ New Recipe**. Give it a name, pick a preset, optionally add tags + a description.

**Presets** seed the variable schema with sensible starting numbers:

- **Custom** — no variables; you'll add your own.
- **Bread** — hydration %, bulk ferment time, bake temp, yield.
- **Sauce** — simmer time, yield.
- **Braise** — braise time, oven temp.

You can always edit variables later via **Edit Variables** on the recipe page.

### 2. Make your first batch

On the recipe page, tap **+ New Batch**. The batch editor lets you fill in:

- **Label** — usually "initial" or "Base" for the first batch; e.g. "high-hydration variant" for a fork.
- **Variables** — values for each schema variable.
- **Ingredients** — name, amount, unit, optional section (e.g. "Dough", "Toppings"). Use **▲ / ▼** to reorder, **×** to remove.
- **Steps** — the instructions. Inside a step, mention an ingredient and Better Batch tracks the *use* automatically.

When you save, the batch lands as a **draft**.

### 3. Cook it

From the batch page, tap **Cook**. The cook view gives you:

- **Multiplier toggle** — pick the scale (1×, 2×, 3×; or 0.5×, 0.75× via the ⋯ menu). All amounts displayed in steps and the ingredient list scale automatically.
- **Step list** — check each step off as you complete it. The current step is highlighted.
- **Timer triggers** — any duration mentioned in step text (e.g. "rest 45 min", "bake 25 minutes") shows up as a clickable button. Tap it to start a countdown.
- **Cook timer dock** — pinned at the bottom; shows every active timer with remaining time. Timers fire a chime + vibration when they finish, plus an OS-level notification if you're on Android and have notifications on.
- **Quick notes** (📝 button) — capture "things to change next time" while you cook. They're saved with the batch.

### 4. End the cook

Tap **End Cook** when you're done. The dialog asks for:

- **Outcome notes** — what worked, what didn't.
- **Rating** — 1 to 5 stars (first cook only).
- **Carry ideas forward** — if you captured quick notes, you can fork a new draft batch with those notes pre-filled.

The batch is now **cooked** and frozen (only outcome notes + rating remain editable).

## Iterating

### Fork from a cooked batch

On any batch page, tap **+ New Batch** to create a fork. The new draft inherits the parent's ingredients, steps, and variables — change what you want to try differently.

### Compare two batches

From a batch's **…** menu, pick **Compare with…**, then choose another batch. The compare view shows side-by-side variables, ingredients, and steps with diffs called out.

### Merge two batches

Same menu, **Merge with…**. The merge view lets you walk through every difference and pick A, B, or a custom value per row. The result is a brand-new draft batch with explicit lineage to both parents.

### Re-cook

A cooked batch's **Cook** button becomes **Re-cook**. End-cook adds outcome notes to the batch's history without creating a new lineage entry.

### Archive

Old or rejected branches can be archived from the more-actions menu (or marked-as-archived during end-cook). Archived batches grey out in the graph but stay searchable.

## Inconsistency warnings

If a batch has ingredient issues, a **⚠ badge** appears next to the batch label and on the graph node. Click the badge to see:

- *Ingredient X: never referenced in any step* — you listed it but never used it.
- *Step N: references a deleted ingredient* — a step still mentions an ingredient you removed.
- *Ingredient X: used 600g, more than the 500g listed* — the per-step `use` amounts don't sum to the ingredient's total.

You can fix these in the editor, OR save anyway and add a one-line override note explaining why the discrepancy is intentional (handy for "I added more salt at the end" notes).

## Notifications

On Android, cook timers fire OS-level notifications even with the app backgrounded or the device locked. Toggle them on/off from the cook view's 🔔 button (you'll be asked to grant notification permission the first time).

The web build uses standard browser notifications when the tab is in the background.

## Tips

- **Variables are dimensions, not ingredients.** Use them for the dials you actually tweak across batches (hydration, salt %, bake temp). Don't put "flour" in there — that's an ingredient.
- **Sections group ingredients visually.** Tap the section dropdown when adding an ingredient to bucket it under "Dough" / "Toppings" / etc.
- **Use the multiplier instead of editing the batch** when you're just doing a half/double. The batch keeps its canonical amounts; the cook view scales the display.
- **The cook view is read-only on the batch itself.** Mid-cook changes go into the quick-notes panel and become a new fork at the end.
- **Compare before merge.** The compare view shows you the diff without committing; merge actually creates a new draft.
- **The graph is your friend.** When a recipe has many batches, the tree view shows you where each one came from at a glance. A ⚠ on a node means that batch has inconsistencies worth checking.

## Offline-first

Everything is stored locally in your browser (or device, on Android). There is no account, no server sync. To back up, export the recipe from the recipe list page; to restore on another device, import the JSON snapshot.

## Privacy

Better Batch never phones home. The only network calls the app makes are for the initial code/assets download. Fonts, recipes, batches, photos, and notes all stay on your device.
