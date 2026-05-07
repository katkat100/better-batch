<!-- src/lib/ui/primitives/Select.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    value = $bindable(),
    disabled = false,
    class: extraClass = '',
    children,
    ...rest
  }: {
    value?: unknown;
    disabled?: boolean;
    class?: string;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  const DEFAULT_CLASS = 'appearance-none border border-drafting bg-canvas pl-3 pr-8 py-2 rounded-sm text-sm bg-no-repeat bg-[right_0.75rem_center] bg-[length:12px_8px]';
  const CHEVRON_STYLE = `background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%231A1A1A' stroke-width='1.5'><path d='M2 2l4 4 4-4'/></svg>");`;
</script>

<select
  bind:value
  {disabled}
  class="{DEFAULT_CLASS} {extraClass}"
  style={CHEVRON_STYLE}
  {...rest}
>
  {@render children()}
</select>
