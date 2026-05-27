<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import { App } from '@capacitor/app';
  import { popTop } from '$lib/ui/dismissable-stack';

  let { children } = $props();

  onMount(() => {
    if (!Capacitor.isNativePlatform()) return;
    const pending = App.addListener('backButton', ({ canGoBack }) => {
      if (popTop()) return;
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
    return () => {
      pending.then((h) => h.remove());
    };
  });
</script>

<a
  href="#app-main"
  class="sr-only focus:not-sr-only fixed top-2 left-2 z-50 bg-canvas border border-obsidian px-3 py-2 rounded-sm text-sm focus:outline-2 focus:outline-ochre"
>Skip to content</a>

<main id="app-main">
  {@render children()}
</main>
