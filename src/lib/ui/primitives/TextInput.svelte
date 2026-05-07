<!-- src/lib/ui/primitives/TextInput.svelte -->
<script lang="ts">
  let {
    value = $bindable<string | undefined>(''),
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
    value?: string | undefined;
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

  function handleInput(e: Event) {
    value = (e.currentTarget as HTMLInputElement).value;
    oninput?.(e);
  }
</script>

<input
  bind:this={element}
  value={value ?? ''}
  {type}
  {inputmode}
  {placeholder}
  {disabled}
  oninput={handleInput}
  {onblur}
  class="{DEFAULT_CLASS} {extraClass}"
  {...rest}
/>
