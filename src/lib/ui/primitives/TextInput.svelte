<!-- src/lib/ui/primitives/TextInput.svelte -->
<script lang="ts">
  let {
    value = $bindable(''),
    element = $bindable<HTMLInputElement | undefined>(undefined),
    placeholder = '',
    type = 'text',
    inputmode,
    disabled = false,
    class: extraClass = '',
    oninput,
    onblur,
    ...rest
  }: {
    value?: string;
    element?: HTMLInputElement;
    placeholder?: string;
    type?: string;
    inputmode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url' | 'none';
    disabled?: boolean;
    class?: string;
    oninput?: (e: Event) => void;
    onblur?: (e: FocusEvent) => void;
    [key: string]: unknown;
  } = $props();

  const DEFAULT_CLASS = 'border border-drafting bg-canvas px-3 py-2 rounded-sm text-sm';
</script>

<input
  bind:this={element}
  bind:value
  {type}
  {inputmode}
  {placeholder}
  {disabled}
  {oninput}
  {onblur}
  class="{DEFAULT_CLASS} {extraClass}"
  {...rest}
/>
