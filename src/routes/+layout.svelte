<script>
  import '../app.css';
  let { children } = $props();
</script>

<a
  href="#app-main"
  class="sr-only focus:not-sr-only fixed top-2 left-2 z-50 bg-canvas border border-obsidian px-3 py-2 rounded-sm text-sm focus:outline-2 focus:outline-ochre"
>Skip to content</a>

<main id="app-main">
  {@render children()}
</main>
