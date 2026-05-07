# Select Chevron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Replace the native `<select>` arrow on `Select.svelte` with a Drafting-Ink chevron painted via background-image, so the existing right padding finally takes effect.

**Architecture:** One-line change to `DEFAULT_CLASS` in `src/lib/ui/primitives/Select.svelte`. Adds `appearance-none`, splits left/right padding, adds an inline-SVG chevron background. Native dropdown panel is unchanged.

**Tech Stack:** Svelte 5 · Tailwind v4

Reference spec: `docs/superpowers/specs/2026-05-07-select-chevron.md`.

---

## File Structure

```
src/lib/ui/primitives/Select.svelte    # MODIFIED — DEFAULT_CLASS only
```

---

## Task 1: Update Select's DEFAULT_CLASS

**Files:** Modify `src/lib/ui/primitives/Select.svelte`.

- [ ] **Step 1: Replace the `DEFAULT_CLASS` constant.**

Find the line:

```ts
  const DEFAULT_CLASS = 'border border-drafting bg-canvas px-3 py-2 rounded-sm text-sm';
```

Replace with:

```ts
  const DEFAULT_CLASS = "appearance-none border border-drafting bg-canvas pl-3 pr-8 py-2 rounded-sm text-sm bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%231A1A1A' stroke-width='1.5'><path d='M2 2l4 4 4-4'/></svg>\")] bg-no-repeat bg-[right_0.75rem_center]";
```

Note: outer string switches from `'...'` to `"..."` so the inner SVG can use `'` without escaping.

Three concrete changes vs the original:
1. Add `appearance-none` (suppresses native arrow).
2. `px-3` → `pl-3 pr-8` (right padding grows to 32px to leave room for the chevron).
3. New `bg-[url(...)] bg-no-repeat bg-[right_0.75rem_center]` paints the inline-SVG chevron 12px from the right edge, vertically centered. Stroke color is `%231A1A1A` (URL-encoded `#1A1A1A`, the project's `obsidian` palette token).

- [ ] **Step 2: Run svelte-check.**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 3: Run E2E suite.**

Run: `~/.bun/bin/bun run e2e 2>&1 | tail -10`
Expected: 6 passed. The E2E exercises Selects via `new-recipe-dialog`, `var-type`, `ingredient-section`, etc.

- [ ] **Step 4: Run unit suite.**

Run: `~/.bun/bin/bun test 2>&1 | tail -3`
Expected: 91 pass.

- [ ] **Step 5: Quick dev-server compile check + visual sanity.**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200 and no errors in `/tmp/bb-dev.log`. The controller will eyeball the chevron in a real browser session.

- [ ] **Step 6 (commit) — SKIP. Controller commits after review.**

---

## Self-review notes

**Spec coverage:**
- Spec §2 (the three concrete changes — `appearance-none`, padding split, inline-SVG chevron) → Step 1.
- Spec §3 out of scope (no custom dropdown, no disabled/hover/focus chevron variants) → respected; only the constant changes.
- Spec §4 testing (svelte-check + E2E + unit) → Steps 2-4.
- Spec §5 risks (browser support, disabled cosmetic mismatch, SVG escaping) → escaping is addressed by switching the outer-string quotes; others are tolerated.

**Placeholder scan:** none. The replacement string is concrete.

**Type consistency:** N/A — no types changed.

**Implementation risk:** the SVG-in-Tailwind-class string is fragile to copy-paste. The implementer should paste the entire DEFAULT_CLASS line as a unit rather than incrementally adding pieces. If svelte-check or the dev server fails, the most likely cause is a broken string quote.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-07-select-chevron.md`. 1 task.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
