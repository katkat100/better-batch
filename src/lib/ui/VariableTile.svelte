<!-- src/lib/ui/VariableTile.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableValue } from '$lib/server';
  import { displayUnit } from '$lib/shared/unit';
  import Card from '$lib/ui/primitives/Card.svelte';
  let { schema, value }: { schema: VariableSchemaItem; value: VariableValue } = $props();

  const display = $derived.by(() => {
    if (value === null || value === undefined) return '—';
    if (!schema.unit) return String(value);
    const u = typeof value === 'number' ? displayUnit(schema.unit, value) : schema.unit;
    return `${value}${u}`;
  });
</script>

<Card class="flex flex-col gap-1 min-w-[80px]">
  <span class="text-kicker">{schema.name}</span>
  <span class="font-serif text-xl">{display}</span>
</Card>
