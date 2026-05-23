<script lang="ts">
    import NotecardCard from "$lib/ui/NotecardCard.svelte";
    import Toolbar from "$lib/ui/Toolbar.svelte";
    import NewRecipeDialog from "$lib/ui/NewRecipeDialog.svelte";
    import Button from "$lib/ui/primitives/Button.svelte";
    import type { IndexEntry } from "$lib/server";
    import { exportSnapshot, importSnapshot } from "$lib/data/snapshot";
    import { goto, invalidateAll } from "$app/navigation";
    import { resolve } from "$app/paths";
    import WelcomePanel from "$lib/ui/WelcomePanel.svelte";
    import IconButton from "$lib/ui/primitives/IconButton.svelte";
    import { loadSampleRecipe } from "$lib/data/sample";

    let { data }: { data: { index: IndexEntry[] } } = $props();

    let search = $state("");
    let tag = $state("");
    let status = $state<"all" | "has_cooked" | "drafts_only">("all");
    let sort = $state<"last_cooked" | "name" | "batch_count">("last_cooked");
    let dialogOpen = $state(false);
    let fileInput = $state<HTMLInputElement | null>(null);
    let welcomeOpen = $state(false);

    $effect(() => {
        if (typeof localStorage === "undefined") return;
        if (data.index.length > 0) return;
        if (localStorage.getItem("bb_welcome_dismissed") === "1") return;
        welcomeOpen = true;
    });

    function dismissWelcome() {
        if (typeof localStorage !== "undefined") {
            localStorage.setItem("bb_welcome_dismissed", "1");
        }
        welcomeOpen = false;
    }

    function handleWelcomeCreate() {
        dismissWelcome();
        dialogOpen = true;
    }

    async function handleWelcomeSample() {
        const id = await loadSampleRecipe();
        await invalidateAll();
        dismissWelcome();
        await goto(resolve(`/recipes/${id}`));
    }

    async function handleImportFile(e: Event) {
        const file = (e.currentTarget as HTMLInputElement).files?.[0];
        if (!file) return;
        await importSnapshot(file);
        (e.currentTarget as HTMLInputElement).value = "";
        await invalidateAll();
    }

    const allTags = $derived(
        [...new Set(data.index.flatMap((e) => e.tags))].sort(),
    );

    const filtered = $derived.by(() => {
        let out = data.index;
        if (search) {
            const q = search.toLowerCase();
            out = out.filter((e) => e.name.toLowerCase().includes(q));
        }
        if (tag) out = out.filter((e) => e.tags.includes(tag));
        if (status === "has_cooked")
            out = out.filter((e) => e.lastCookedAt !== null);
        else if (status === "drafts_only")
            out = out.filter((e) => e.lastCookedAt === null);

        const sorted = [...out];
        if (sort === "name")
            sorted.sort((a, b) => a.name.localeCompare(b.name));
        else if (sort === "batch_count")
            sorted.sort((a, b) => b.batchCount - a.batchCount);
        else
            sorted.sort((a, b) =>
                (b.lastCookedAt ?? "").localeCompare(a.lastCookedAt ?? ""),
            );
        return sorted;
    });
</script>

<svelte:head><title>Better Batch</title></svelte:head>

<div class="max-w-6xl mx-auto p-4 md:p-8 flex flex-col gap-6">
    <header
        class="flex md:items-end justify-between flex-col md:flex-row md:gap-1 gap-3"
    >
        <div>
            <h1 class="font-serif text-4xl">Better Batch</h1>
            <p class="text-sm text-obsidian/60 font-sans">
                Record. Analyze. Refine. Archive.
            </p>
        </div>
        <div class="flex items-center gap-3">
            <button
                type="button"
                onclick={exportSnapshot}
                class="border border-drafting text-obsidian/70 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
                data-testid="export-snapshot-btn">Export</button
            >
            <button
                type="button"
                onclick={() => fileInput?.click()}
                class="border border-drafting text-obsidian/70 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
                data-testid="import-snapshot-btn">Import</button
            >
            <input
                type="file"
                accept="application/json"
                bind:this={fileInput}
                onchange={handleImportFile}
                class="hidden"
                data-testid="import-snapshot-input"
            />
            <IconButton
                aria-label="Show welcome guide"
                onclick={() => (welcomeOpen = true)}
                data-testid="welcome-help-btn">?</IconButton>
            <Button
                variant="outline"
                onclick={() => (dialogOpen = true)}
                data-testid="new-recipe-btn">+ New Recipe</Button
            >
        </div>
    </header>

    <Toolbar bind:search bind:tag bind:status bind:sort {allTags} />

    {#if welcomeOpen}
        <WelcomePanel
            onCreateRecipe={handleWelcomeCreate}
            onLoadSample={handleWelcomeSample}
            onDismiss={dismissWelcome}
        />
    {/if}

    {#if filtered.length === 0}
        <p class="text-sm text-obsidian/50 py-12 text-center">
            No recipes match.
        </p>
    {:else}
        <div
            class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            data-testid="recipe-grid"
        >
            {#each filtered as entry (entry.id)}
                <NotecardCard {entry} />
            {/each}
        </div>
    {/if}
</div>

<NewRecipeDialog bind:open={dialogOpen} />
