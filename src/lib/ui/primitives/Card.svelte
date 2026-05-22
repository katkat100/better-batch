<!-- src/lib/ui/primitives/Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  type Pad = 'none' | 'sm' | 'md';

  let {
    pad = 'md',
    class: extraClass = '',
    children
  }: {
    pad?: Pad;
    class?: string;
    children: Snippet;
  } = $props();

  const PAD: Record<Pad, string> = { none: '', sm: 'p-2', md: 'p-3' };
</script>

<div class="border border-drafting bg-canvas rounded-sm {PAD[pad]} {extraClass}">
  {@render children()}
</div>
