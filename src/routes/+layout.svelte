<script lang="ts">
    import "../app.css";
    import { onMount } from "svelte";
    import { Capacitor } from "@capacitor/core";
    import { App } from "@capacitor/app";
    import { StatusBar } from "@capacitor/status-bar";
    import { popTop } from "$lib/ui/dismissable-stack";

    let { children } = $props();

    onMount(() => {
        if (!Capacitor.isNativePlatform()) return;

        // Hide the system status bar entirely so the app runs fullscreen
        // and nothing overlaps the toolbar. With the bar gone the native
        // --bb-safe-top inset reports 0, so the top padding collapses and
        // content sits flush at the top edge.
        void StatusBar.hide();

        const pending = App.addListener("backButton", ({ canGoBack }) => {
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
    >Skip to content</a
>

<main
    id="app-main"
    class="pt-(--bb-safe-top,env(safe-area-inset-top)) pb-(--bb-safe-bottom,env(safe-area-inset-bottom))"
>
    {@render children()}
</main>
