<!-- src/routes/recipes/[id]/merge/+page.svelte -->
<script lang="ts">
    import MergePicker from "$lib/ui/MergePicker.svelte";
    import { api } from "$lib/ui/api-client";
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import type {
        Recipe,
        Batch,
        VariableValue,
        Ingredient,
        Step,
        VariableDiffRow,
        IngredientDiffRow,
        StepObjectDiffRow,
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
            stepRows: StepObjectDiffRow[];
        };
    } = $props();

    async function handleSubmit(input: {
        label: string;
        variables: Record<string, VariableValue>;
        ingredients: Ingredient[];
        steps: Step[];
    }) {
        // Defensive: strip step.uses references to ingredients absent from the chosen set.
        const ingredientIds = new Set(input.ingredients.map((i) => i.id));
        const finalSteps = input.steps.map((s) => ({
            text: s.text,
            uses: s.uses.filter((u) => ingredientIds.has(u.ingredientId)),
        }));

        const batch = await api.createBatch(data.recipe.id, {
            label: input.label,
            parentIds: [data.a.id, data.b.id],
            status: "draft",
            variables: input.variables,
            ingredients: input.ingredients,
            steps: finalSteps,
        });
        goto(resolve(`/recipes/${data.recipe.id}?batch=${batch.id}`));
    }
</script>

<div class="max-w-5xl mx-auto p-4 md:p-6 flex flex-col gap-4">
    <nav class="flex items-center gap-2 text-sm">
        <a
            href={resolve(`/recipes/${data.recipe.id}`)}
            class="text-obsidian/60 hover:text-obsidian">← {data.recipe.name}</a
        >
    </nav>

    <MergePicker
        recipe={data.recipe}
        a={data.a}
        b={data.b}
        varRows={data.varRows}
        ingRows={data.ingRows}
        stepRows={data.stepRows}
        onSubmit={handleSubmit}
    />
</div>
