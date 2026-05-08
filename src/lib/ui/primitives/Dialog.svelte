<!-- src/lib/ui/primitives/Dialog.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

  let {
    open = $bindable(false),
    title,
    titleId,
    subtitle,
    size = 'md',
    class: extraClass = '',
    onClose,
    children
  }: {
    open?: boolean;
    title: string;
    titleId?: string;
    subtitle?: string;
    size?: Size;
    class?: string;
    onClose?: () => void;
    children: Snippet;
  } = $props();

  const autoId = `dialog-title-${Math.random().toString(36).slice(2)}`;
  const headingId = $derived(titleId ?? autoId);

  function close() {
    open = false;
    onClose?.();
  }

  function backdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  // Single max-width per size — applied as the only `max-w-*` on the card so
  // there's no class-ordering collision when consumers pass extra classes.
  const SIZE_CLASS: Record<Size, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl'
  };
  const sizeClass = $derived(SIZE_CLASS[size]);
  const CARD_BASE = 'bg-canvas border border-obsidian p-6 w-full flex flex-col gap-4 rounded-sm max-h-[90vh] overflow-auto';
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50"
    onclick={backdropClick}
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="dialog"
    aria-modal="true"
    aria-labelledby={headingId}
    tabindex="-1"
  >
    <div class="{CARD_BASE} {sizeClass} {extraClass}">
      <div>
        <h2 id={headingId} class="font-serif text-xl">{title}</h2>
        {#if subtitle}<p class="text-sm text-obsidian/60 mt-1">{subtitle}</p>{/if}
      </div>
      {@render children()}
    </div>
  </div>
{/if}
