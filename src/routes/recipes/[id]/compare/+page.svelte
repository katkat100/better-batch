<!-- src/routes/recipes/[id]/compare/+page.svelte -->
<script lang="ts">
    import CompareView from "$lib/ui/CompareView.svelte";
    import { resolve } from "$app/paths";
    import type {
        Recipe,
        Batch,
        VariableDiffRow,
        IngredientDiffRow,
        DiffLine,
    } from "$lib/server";

    let {
        data,
    }: {
        data: {
            recipe: Recipe;
            a: Batch;
            b: Batch;
            varRows: VariableDiffRow[];
            ingRows: IngredientDiffRow[];
            stepLines: DiffLine[];
        };
    } = $props();
</script>

<svelte:head><title>Compare · {data.recipe.name}</title></svelte:head>

<div class="max-w-5xl mx-auto p-4 md:p-6 flex flex-col gap-4">
    <nav class="flex items-center gap-2 text-sm">
        <a
            href={resolve(`/recipes/${data.recipe.id}`)}
            class="text-obsidian/60 hover:text-obsidian">← {data.recipe.name}</a
        >
    </nav>

    <CompareView
        recipe={data.recipe}
        a={data.a}
        b={data.b}
        varRows={data.varRows}
        ingRows={data.ingRows}
        stepLines={data.stepLines}
    />
</div>
