<!-- src/lib/ui/primitives/Checkbox.svelte -->
<script lang="ts">
  let {
    checked = $bindable(false),
    disabled = false,
    class: extraClass = '',
    onchange,
    ...rest
  }: {
    checked?: boolean;
    disabled?: boolean;
    class?: string;
    onchange?: (e: Event) => void;
    [key: string]: unknown;
  } = $props();

  const DEFAULT_CLASS = 'accent-ochre cursor-pointer disabled:cursor-not-allowed';

  function handleChange(e: Event) {
    checked = (e.currentTarget as HTMLInputElement).checked;
    onchange?.(e);
  }
</script>

<input
  type="checkbox"
  checked={checked}
  {disabled}
  onchange={handleChange}
  class="{DEFAULT_CLASS} {extraClass}"
  {...rest}
/>
