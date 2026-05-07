<!-- src/lib/ui/primitives/RadioGroup.svelte -->
<script lang="ts" generics="T extends string | number">
  type Option = { value: T; label: string };

  let {
    value = $bindable<T>(),
    options,
    name,
    disabled = false,
    class: extraClass = '',
    ...rest
  }: {
    value: T;
    options: Option[];
    name?: string;
    disabled?: boolean;
    class?: string;
    [key: string]: unknown;
  } = $props();

  const fallbackName = `radio-group-${Math.random().toString(36).slice(2)}`;
  const groupName = $derived(name ?? fallbackName);
</script>

<div class="flex gap-4 {extraClass}" {...rest}>
  {#each options as opt (opt.value)}
    <label class="flex items-center gap-2 cursor-pointer text-sm">
      <input
        type="radio"
        name={groupName}
        value={opt.value}
        bind:group={value}
        {disabled}
        class="accent-ochre"
      />
      {opt.label}
    </label>
  {/each}
</div>
