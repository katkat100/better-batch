<!-- src/lib/ui/primitives/SectionHeading.svelte -->
<script lang="ts">
  type Size = 'lg' | 'xl' | '2xl';

  let {
    text,
    size = '2xl',
    class: extraClass = ''
  }: { text: string; size?: Size; class?: string } = $props();

  const SIZE: Record<Size, string> = {
    lg: 'font-serif text-lg',
    xl: 'font-serif text-xl',
    '2xl': 'font-serif text-2xl'
  };
</script>

<h2 class="{SIZE[size]} {extraClass}">{text}</h2>
