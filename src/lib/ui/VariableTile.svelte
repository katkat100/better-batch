<!-- src/lib/ui/VariableTile.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableValue } from '$lib/server';
  let { schema, value }: { schema: VariableSchemaItem; value: VariableValue } = $props();

  const display = $derived(
    value === null || value === undefined ? '—'
      : schema.unit ? `${value}${schema.unit}` : `${value}`
  );
</script>

<div class="border border-drafting bg-canvas p-3 flex flex-col gap-1 rounded-sm min-w-[80px]">
  <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{schema.name}</span>
  <span class="font-serif text-xl">{display}</span>
</div>
