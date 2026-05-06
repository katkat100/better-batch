<!-- src/lib/ui/primitives/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'outline' | 'ghost' | 'dashed' | 'danger' | 'success' | 'menuitem';
  type Size = 'sm' | 'md';

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    class: extraClass = '',
    onclick,
    children,
    ...rest
  }: {
    variant?: Variant;
    size?: Size;
    type?: 'button' | 'submit';
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  const VARIANT_CLASS: Record<Variant, string> = {
    primary: 'border border-ochre bg-ochre text-canvas hover:bg-ochre/90',
    danger: 'border border-ochre bg-ochre text-canvas hover:bg-ochre/90',
    outline: 'border border-ochre text-ochre hover:bg-ochre hover:text-canvas',
    ghost: 'text-obsidian/60 hover:text-obsidian',
    dashed: 'border border-dashed border-drafting text-obsidian/60 hover:border-ochre hover:text-ochre',
    success: 'border border-juniper text-juniper hover:bg-juniper hover:text-canvas',
    menuitem: 'text-obsidian hover:bg-drafting/40 text-left w-full'
  };

  const SIZE_CLASS: Record<Size, string> = {
    md: 'px-4 py-2 text-sm uppercase tracking-wider rounded-sm',
    sm: 'px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm'
  };

  const COMMON = 'disabled:opacity-50 disabled:cursor-not-allowed';
</script>

<button
  {type}
  {disabled}
  {onclick}
  class="{VARIANT_CLASS[variant]} {SIZE_CLASS[size]} {COMMON} {extraClass}"
  {...rest}
>
  {@render children()}
</button>
