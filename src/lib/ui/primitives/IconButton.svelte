<!-- src/lib/ui/primitives/IconButton.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    'aria-label': ariaLabel,
    onclick,
    disabled = false,
    class: extraClass = '',
    children,
    ...rest
  }: {
    'aria-label': string;
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    class?: string;
    children: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<button
  type="button"
  aria-label={ariaLabel}
  {disabled}
  {onclick}
  class="p-2.5 leading-none text-obsidian/60 hover:text-obsidian disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre {extraClass}"
  {...rest}
>
  {@render children()}
</button>
