# Select primitive — custom chevron arrow

**Date:** 2026-05-07
**Status:** Draft, pending implementation plan

## 1. Overview

Replace the native browser dropdown arrow on `src/lib/ui/primitives/Select.svelte` with a custom Drafting-Ink chevron. The native dropdown panel stays — only the visual arrow on the trigger changes. Fixes the issue where the existing `px-3` right padding is ignored by the browser-native arrow (the arrow renders outside the padding box).

## 2. Change

In `src/lib/ui/primitives/Select.svelte`, replace the `DEFAULT_CLASS` constant with:

```ts
const DEFAULT_CLASS = "appearance-none border border-drafting bg-canvas pl-3 pr-8 py-2 rounded-sm text-sm bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%231A1A1A' stroke-width='1.5'><path d='M2 2l4 4 4-4'/></svg>\")] bg-no-repeat bg-[right_0.75rem_center]";
```

Three concrete changes:
1. `appearance-none` — suppresses the browser-native dropdown arrow.
2. `px-3` → `pl-3 pr-8` — splits left/right padding; right grows to leave space for the chevron.
3. New `bg-[url(...)]` + `bg-no-repeat` + `bg-[right_0.75rem_center]` — paints a 12×8 obsidian-stroked down chevron at the right edge.

The SVG uses `%231A1A1A` (URL-encoded `#1A1A1A`, the project's `obsidian` palette token) as the stroke. 1.5px stroke width matches the Drafting Ink visual weight.

## 3. Out of scope

- Custom dropdown panel — we explicitly chose to keep the native browser dropdown for accessibility and mobile UX.
- Disabled-state chevron color change. The chevron stays obsidian when disabled.
- Hover/focus state arrow color change.
- A `Select` with rich (icon, sublabel) options.

## 4. Testing

- All three suites stay green: `~/.bun/bin/bun x svelte-check --threshold warning` (0/0), `~/.bun/bin/bun run e2e` (6 passed), `~/.bun/bin/bun test` (91 passed).
- **Manual visual check** in the browser:
  - Toolbar (home page) tag/status/sort filters — chevron visible, properly spaced.
  - EditVariablesDialog type select on each variable row.
  - BatchEditor section select on each ingredient row.
  - NewRecipeDialog preset select.
  - MergePicker, UsesEditor ingredient select.
  - Click each: native dropdown still opens.

## 5. Risks

- **Browser support:** `appearance: none` on `<select>` is universally supported in evergreen browsers. Tailwind's `appearance-none` emits the necessary `-webkit-appearance` prefix for older Safari.
- **`disabled` state cosmetic mismatch:** chevron color is fixed; if the disabled `<select>` already had a faded look from elsewhere, the chevron stays bold. Acceptable.
- **SVG escaping in Tailwind class:** the `bg-[url("...")]` arbitrary-value syntax accepts data URIs but requires careful quoting. The class string above uses `\"` escapes inside the JS string and `'` quotes inside the SVG markup so nesting works.
