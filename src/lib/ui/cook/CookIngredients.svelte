<!-- src/lib/ui/cook/CookIngredients.svelte -->
<script lang="ts">
    import type { Ingredient, Step } from "$lib/server";
    import { SvelteSet, SvelteMap } from "svelte/reactivity";
    import MultiplierToggle, {
        type Multiplier,
    } from "../MultiplierToggle.svelte";
    import { multiplyAmount } from "../layout/multiply-amount";

    let {
        ingredients,
        steps,
        currentStepIndex,
        checkedSteps,
        multiplier,
        onMultiplierChange,
    }: {
        ingredients: Ingredient[];
        steps: Step[];
        currentStepIndex: number;
        checkedSteps: Set<number>;
        multiplier: Multiplier;
        onMultiplierChange: (next: Multiplier) => void;
    } = $props();

    const currentIds = $derived(
        new Set(
            currentStepIndex >= 0
                ? (steps[currentStepIndex]?.uses.map((u) => u.ingredientId) ??
                      [])
                : [],
        ),
    );

    const usedInCheckedIds = $derived.by(() => {
        const ids = new SvelteSet<string>();
        for (const i of checkedSteps) {
            for (const u of steps[i]?.uses ?? []) ids.add(u.ingredientId);
        }
        return ids;
    });

    type Group = { section: string | null; items: Ingredient[] };
    const groups = $derived.by<Group[]>(() => {
        const order: (string | null)[] = [];
        const map = new SvelteMap<string | null, Ingredient[]>();
        for (const ing of ingredients) {
            const key =
                ing.section && ing.section.trim() ? ing.section.trim() : null;
            if (!map.has(key)) {
                map.set(key, []);
                order.push(key);
            }
            map.get(key)!.push(ing);
        }
        const sorted = [...order].sort((a, b) => {
            if (a === null && b !== null) return -1;
            if (b === null && a !== null) return 1;
            return order.indexOf(a) - order.indexOf(b);
        });
        return sorted.map((section) => ({ section, items: map.get(section)! }));
    });

    function pillClass(ing: Ingredient): string {
        if (currentIds.has(ing.id))
            return "bg-ochre/20 border-ochre/40 text-ochre";
        if (usedInCheckedIds.has(ing.id)) return "border-drafting opacity-50";
        return "border-drafting";
    }
</script>

<section
    class="px-4 py-3 border-b border-drafting bg-canvas/60 flex flex-col gap-2"
    data-testid="cook-ingredients"
>
    <div class="flex items-center justify-between">
        <h2
            class="text-sm md:text-[10px] uppercase tracking-wider text-obsidian/50"
        >
            Ingredients
        </h2>
        {#if ingredients.length > 0}
            <MultiplierToggle
                value={multiplier}
                onChange={onMultiplierChange}
            />
        {/if}
    </div>
    {#each groups as group (group.section ?? "__none__")}
        <div class="flex flex-col gap-1">
            {#if group.section !== null}
                <span
                    class="text-xs md:text-[10px] uppercase tracking-wider text-obsidian/50"
                    >{group.section}</span
                >
            {/if}
            <div class="flex flex-col gap-1.5 text-sm md:text-xs font-mono">
                {#each group.items as ing (ing.id)}
                    <span
                        class="border px-2 py-0.5 rounded-sm transition-colors self-start {pillClass(
                            ing,
                        )}"
                        data-testid="cook-ing-pill"
                        data-ingredient-id={ing.id}
                    >
                        {multiplyAmount(ing.amount, multiplier)}{ing.unit ?? ""}
                        {ing.name}
                    </span>
                {/each}
            </div>
        </div>
    {/each}
</section>
