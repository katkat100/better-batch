<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import { App } from '@capacitor/app';
  import { StatusBar, Style } from '@capacitor/status-bar';
  import { popTop } from '$lib/ui/dismissable-stack';

  let { children } = $props();

  onMount(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (Capacitor.getPlatform() === 'android') {
      void StatusBar.setOverlaysWebView({ overlay: false });
      void StatusBar.setBackgroundColor({ color: '#F5F2ED' });
      void StatusBar.setStyle({ style: Style.Dark });
    }

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
  class="sr-only focus:not-sr-only fixed top-[max(0.5rem,env(safe-area-inset-top))] left-2 z-50 bg-canvas border border-obsidian px-3 py-2 rounded-sm text-sm focus:outline-2 focus:outline-ochre"
>Skip to content</a>

<main
  id="app-main"
  class="pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
>
  {@render children()}
</main>
