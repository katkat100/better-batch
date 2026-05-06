<!-- src/lib/ui/VariableTile.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableValue } from '$lib/server';
  import { displayUnit } from '$lib/shared/unit';
  let { schema, value }: { schema: VariableSchemaItem; value: VariableValue } = $props();

  const display = $derived.by(() => {
    if (value === null || value === undefined) return '—';
    if (!schema.unit) return String(value);
    const u = typeof value === 'number' ? displayUnit(schema.unit, value) : schema.unit;
    return `${value}${u}`;
  });
</script>

<div class="border border-drafting bg-canvas p-3 flex flex-col gap-1 rounded-sm min-w-[80px]">
  <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{schema.name}</span>
  <span class="font-serif text-xl">{display}</span>
</div>
