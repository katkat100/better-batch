<!-- src/lib/ui/primitives/FormError.svelte -->
<script lang="ts">
  let {
    message,
    ...rest
  }: {
    message: string | null | undefined;
    [key: string]: unknown;
  } = $props();
</script>

{#if message}
  <p role="alert" aria-live="polite" class="text-ochre text-sm" {...rest}>{message}</p>
{/if}
