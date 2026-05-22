# Better Batch — Onboarding

Recipe-versioning app. Track recipes, fork into batches, compare and merge variants, run a cook view with timers. Ships as a SvelteKit web app and a Capacitor Android shell.

## Stack

- **SvelteKit 2** + **Svelte 5** (runes, snippets, `$state` / `$derived` / `$effect` / `$bindable`).
- **Tailwind v4** with `@theme` tokens and a small `@layer components` set of shared text utilities (`.text-label`, `.text-caption`, `.text-kicker`, `.text-placeholder`, `.sr-only`).
- **Bun** for the test runner (`bun:test`) and as the install / script runner. The binary lives at `~/.bun/bin/bun` — prepend it to `$PATH` before running any `bun ...` command.
- **Playwright** for e2e (`tests/e2e/*.e2e.ts`).
- **IndexedDB** for offline storage via the `idb` package. The data layer lives in `src/lib/data/`.
- **Capacitor** + `@capacitor/android` + `@capacitor/local-notifications` for the Android shell. Source assets in `resources/`; generated density variants under `android/app/src/main/res/`.
- **Tailwind fonts** are bundled locally via `@fontsource-variable/fraunces` and `@fontsource-variable/inter` (imported in `src/app.css`). We do not hit Google Fonts at runtime.

## Layout

```
src/
  app.css           # theme tokens, .sr-only, .text-* utilities, font imports
  app.html          # root document
  routes/           # SvelteKit pages
    +layout.svelte  # wraps every route in <main id="app-main">
    +page.svelte    # recipe list
    recipes/[id]/   # recipe detail, batches, cook, compare, merge
  lib/
    data/           # IndexedDB layer (idb wrappers)
    server/         # types + server-side helpers
    shared/         # pure logic shared between client and server
    ui/             # all Svelte components
      primitives/   # reusable building blocks (see below)

docs/
  superpowers/
    specs/          # design specs (one per feature/refactor)
    plans/          # implementation plans (one per spec)

tests/
  domain/  shared/  storage/  ui/   # unit/integration (bun:test)
  e2e/                              # playwright

resources/   # icon + splash source PNGs for @capacitor/assets
android/     # generated Android project (Capacitor)
```

## Primitives

`src/lib/ui/primitives/` is the small reusable layer. Compose pages from these instead of hand-rolling:

| Primitive | Use for |
|---|---|
| `Button.svelte` | Standard button. Variants: `primary`, `outline`, `ghost`, `dashed`, `danger`, `success`, `menuitem`. Sizes: `sm` / `md`. |
| `IconButton.svelte` | Icon-only buttons (×, ▲, ▼). Requires `aria-label`. 44×44 hit area via `p-2.5`. |
| `TextInput.svelte` | Text input with ochre focus ring. Bind via `bind:value` and optional `bind:element`. |
| `Select.svelte` | Native select styled to match the theme. |
| `Checkbox.svelte` | Native checkbox. |
| `RadioGroup.svelte` | Radio group with `options` prop. |
| `Dialog.svelte` | Modal dialog. Portals to `<body>` and inerts `<main>` while open. Exposes `actions` snippet for footer buttons. |
| `Field.svelte` | Wraps a labeled input. Provides the `<label>` + dim caption + optional hint/error. |
| `Card.svelte` | Bordered content container with `pad="none"|"sm"|"md"`. |
| `SectionHeading.svelte` | Serif heading with `size="lg"|"xl"|"2xl"`. |
| `FormError.svelte` | Form-level error rendered with `role="alert" aria-live="polite"`. |

When you need a recurring style not yet primitive-ized, prefer a Tailwind component class in `app.css` for pure text patterns, or a small Svelte component for anything structural (wrapper + content).

## Commands

Always export bun on the PATH first: `export PATH="$HOME/.bun/bin:$PATH"`.

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server (default `http://localhost:5173`). |
| `bun run build` | Builds the seed snapshot and the static site (`adapter-static`). |
| `bun run preview` | Serves the built site. |
| `bun test` | Runs unit + integration tests (`bun:test`). |
| `bun run e2e` | Runs Playwright e2e tests. If `build/` is stale, pre-build with `bun run build` to avoid the 60s `webServer` start timeout. |
| `bun run typecheck` | `svelte-kit sync && svelte-check`. |
| `bun run lint` | ESLint. |
| `bunx knip` | Unused files / exports check. |
| `bun run check` | Typecheck + lint + knip + tests (matches the pre-commit hook). |
| `bun run android` | Build + `cap sync` + open Android Studio. |
| `bunx @capacitor/assets generate --android` | Regenerate icon + splash density variants from `resources/`. |

The pre-commit hook (lefthook) runs typecheck / lint / knip / tests on every commit. If a hook fails, fix the issue and create a NEW commit — never `--amend` after a hook failure, since the commit didn't happen.

## Conventions

- **Theme** lives in `src/app.css` under `@theme`:
  - `--color-canvas` `#f5f2ed` (page background)
  - `--color-obsidian` `#1a1a1a` (body text)
  - `--color-ochre` `#8e4a2a` (warm accent — used for borders, focus rings, "active" states; passes WCAG AA on canvas)
  - `--color-juniper` `#344e41` (success / cooked state)
  - `--color-drafting` `#d1cdc7` (muted borders / dividers)
  - Fonts: `--font-serif` Fraunces, `--font-sans` Inter.

- **Text utility classes** (in `app.css`, used across the app):
  - `.text-label` — `text-[11px] uppercase tracking-wider` (form labels, section headers)
  - `.text-caption` — `text-[11px] uppercase tracking-wider text-obsidian/70` (dim section caption)
  - `.text-kicker` — `text-[10px] uppercase tracking-wider text-obsidian/70` (smaller eyebrow)
  - `.text-placeholder` — `text-sm text-obsidian/60 italic` (italic empty-state text)
  - Prefer these over inline duplication when 3+ sites share the pattern.

- **Knip** rejects unused source files. New primitives must ship together with at least one consumer in the same commit, or knip will block the pre-commit hook.

- **Capacitor splash background** is set both via the splash drawable (with `#F5F2ED` baked in at the `resources/splash.png` level) and via `windowSplashScreenBackground` in `android/app/src/main/res/values/styles.xml` (referencing `@color/splash_bg` in `colors.xml`). Regenerate density variants with `bunx @capacitor/assets generate --android` after editing the source PNGs.

- **Accessibility:**
  - Every interactive control needs a visible focus ring. Use the `Button` and `IconButton` primitives — they include `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre`. Anchor-styled-as-button strings should append the same three classes.
  - Every dialog uses the `Dialog` primitive, which portals to `<body>`, inerts `<main id="app-main">` while open, and restores focus on close.
  - Icon-only buttons MUST use the `IconButton` primitive (required `aria-label`).
  - Form errors should render with `<FormError message={…} />` (sets `role="alert"` and `aria-live="polite"`).
  - Each route page sets a meaningful `<svelte:head><title>…</title></svelte:head>`.

## Workflow

The project uses the `superpowers` plugin's brainstorming → spec → plan → subagent-driven execution flow for non-trivial work. Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.

Recent work threads (good context for what's "normal" in this codebase):

- `2026-05-21-style-deduplication.md` — primitives + utility classes for repeated styles.
- `2026-05-22-a11y-phase-1.md` / `phase-2.md` / `phase-3.md` — three rounds of accessibility fixes culminating in focus trap, IconButton, contrast bumps, ARIA cleanup.

Less formal one-off changes (mobile fixes, single-component tweaks, splash color, etc.) skip the spec/plan flow and just land directly with a clear commit message.

### Commit style

- Conventional-commit prefixes: `feat(ui):`, `fix(a11y):`, `style(theme):`, `refactor(ui):`, `docs:`, `chore:`.
- One commit per logical change. Frequent commits over big batches.
- Pre-commit hook is the truth: if it fails, fix the issue and create a new commit.
- The user controls when commits get pushed — never push without an explicit ask.

## What's worth knowing

- The data layer is **fully offline-first**. Recipes and batches live in IndexedDB; there is no server API for user data. The `lib/server/` directory holds types and SvelteKit-side helpers, not a backend.
- **Cook timers** trigger OS-level notifications on Android via `@capacitor/local-notifications`. The web fallback uses the standard `Notification` API. Background-fired notifications are gated by `document.visibilityState` so the foreground tab doesn't cancel them on JS resume.
- **BatchGraph** renders the recipe's batch tree as an SVG with HTML `<button>` elements inside `<foreignObject>` per node (for real screen-reader semantics).
- **Tests are mostly unit** (`bun:test`). The Playwright suite is 10 end-to-end flows covering recipe creation, batch editing, cook, compare/merge, multiplier, inconsistency dialog, and delete confirmation.
- **Knip** is opinionated about unused files. If you create a primitive, ship a consumer in the same commit. If you create a `+page.svelte`, link to it somehow.
