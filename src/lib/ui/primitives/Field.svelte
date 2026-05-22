<!-- src/lib/ui/primitives/Field.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    hint,
    error,
    htmlFor,
    children
  }: {
    label: string;
    hint?: string;
    error?: string | null;
    htmlFor?: string;
    children: Snippet;
  } = $props();
</script>

<label class="flex flex-col gap-1 text-sm" for={htmlFor}>
  <span class="text-label">{label}</span>
  {@render children()}
  {#if hint && !error}
    <span class="text-xs text-obsidian/50">{hint}</span>
  {/if}
  {#if error}
    <span class="text-xs text-ochre">{error}</span>
  {/if}
</label>
