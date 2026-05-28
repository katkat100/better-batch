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
      // Embrace edge-to-edge: WebView draws under system bars. The
      // status bar background is transparent so the canvas-colored
      // content shows through. Style.Light = dark icons (the plugin's
      // enum is named after the *bar's appearance*, not the icons),
      // which read on the light canvas background. WindowInsets is
      // forwarded from MainActivity.java as --bb-safe-top /
      // --bb-safe-bottom CSS custom properties.
      void StatusBar.setBackgroundColor({ color: '#00000000' });
      void StatusBar.setStyle({ style: Style.Light });
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
  class="sr-only focus:not-sr-only fixed top-[max(0.5rem,var(--bb-safe-top,env(safe-area-inset-top)))] left-2 z-50 bg-canvas border border-obsidian px-3 py-2 rounded-sm text-sm focus:outline-2 focus:outline-ochre"
>Skip to content</a>

<main
  id="app-main"
  class="pt-[var(--bb-safe-top,env(safe-area-inset-top))] pb-[var(--bb-safe-bottom,env(safe-area-inset-bottom))]"
>
  {@render children()}
</main>
