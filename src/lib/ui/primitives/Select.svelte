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

  const DEFAULT_CLASS = 'border border-drafting bg-canvas px-3 py-2 rounded-sm text-sm';
</script>

<select
  bind:value
  {disabled}
  class="{DEFAULT_CLASS} {extraClass}"
  {...rest}
>
  {@render children()}
</select>
