<!-- src/lib/ui/BatchDetail.svelte -->
<script lang="ts">
    import VariableTile from "./VariableTile.svelte";
    import IngredientList from "./IngredientList.svelte";
    import StepsList from "./StepsList.svelte";
    import Rating from "./Rating.svelte";
    import BatchPickerDropdown from "./BatchPickerDropdown.svelte";
    import { goto, invalidateAll } from "$app/navigation";
    import { resolve } from "$app/paths";
    import ConfirmDeleteDialog from "./ConfirmDeleteDialog.svelte";
    import { api } from "./api-client";
    import type { Recipe, Batch } from "$lib/server";
    import Button from "$lib/ui/primitives/Button.svelte";
    import { validateBatch, formatIngredientIssue, type IngredientIssue } from '$lib/shared/batch-validation';
    import MultiplierToggle, { type Multiplier } from './MultiplierToggle.svelte';

    let {
        recipe,
        batch,
        batches,
        onMarkCooked = () => {},
        onEditOutcome = () => {},
        onSelectBatch = (_batchId: string) => {},
    }: {
        recipe: Recipe;
        batch: Batch;
        batches: Batch[];
        onMarkCooked?: () => void;
        onEditOutcome?: () => void;
        onSelectBatch?: (batchId: string) => void;
    } = $props();

    const cookParent = $derived(
        batch.outcomeNotes.startsWith("Captured during cook:") &&
            batch.parentIds.length === 1
            ? (batches.find((b) => b.id === batch.parentIds[0]) ?? null)
            : null,
    );

    const noteBody = $derived(
        cookParent
            ? batch.outcomeNotes.replace(/^Captured during cook:\s*\n?/, "")
            : batch.outcomeNotes,
    );

    const cookedDateLabel = $derived(
        batch.cookedAt ? new Date(batch.cookedAt).toLocaleDateString() : null,
    );

    const childCount = $derived(
        batches.filter((b) => b.parentIds.includes(batch.id)).length,
    );
    const canDelete = $derived(childCount === 0);

    const detailIssues = $derived<IngredientIssue[]>(validateBatch(batch));
    const hasInconsistency = $derived(
        detailIssues.length > 0 || (batch.inconsistencyNote !== undefined && batch.inconsistencyNote !== '')
    );
    let popoverOpen = $state(false);
    let multiplier = $state<Multiplier>(1);

    let deleteOpen = $state(false);

    async function handleDelete() {
        await api.deleteBatch(recipe.id, batch.id);
        await invalidateAll();
    }

    let compareOpen = $state(false);
    let mergeOpen = $state(false);
    let moreOpen = $state(false);

    function handleCompareWith(otherId: string) {
        goto(resolve(`/recipes/${recipe.id}/compare?a=${batch.id}&b=${otherId}`));
    }
    function handleMergeWith(otherId: string) {
        goto(resolve(`/recipes/${recipe.id}/merge?a=${batch.id}&b=${otherId}`));
    }

</script>

<article
    class="flex flex-col gap-5"
    data-testid="batch-detail"
    data-batch-id={batch.id}
>
    <header
        class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-2 border-b border-drafting pb-3 pt-3 lg:pt-0"
    >
        <div>
            <h2 class="font-serif text-2xl">{batch.label}</h2>
            {#if hasInconsistency}
                <button
                    type="button"
                    class="text-ochre text-sm align-middle ml-1 relative"
                    aria-label="Show ingredient inconsistencies"
                    onclick={() => popoverOpen = !popoverOpen}
                    data-testid="inconsistency-badge"
                >⚠
                    {#if popoverOpen}
                        <span
                            role="dialog"
                            class="absolute left-0 top-full mt-1 z-10 w-72 bg-canvas border border-drafting rounded-sm shadow-md p-3 text-left"
                            data-testid="inconsistency-popover"
                        >
                            {#if detailIssues.length > 0}
                                <ul class="font-mono text-xs space-y-1">
                                    {#each detailIssues as issue (issue.ingredientId + ':' + issue.kind + ':' + (issue.stepIndex ?? ''))}
                                        <li class="text-ochre">⚠ {formatIngredientIssue(issue)}</li>
                                    {/each}
                                </ul>
                            {/if}
                            {#if batch.inconsistencyNote && batch.inconsistencyNote.trim()}
                                <p class="text-xs text-obsidian/70 whitespace-pre-wrap mt-2 pt-2 border-t border-drafting">
                                    <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Note:</span>
                                    {batch.inconsistencyNote}
                                </p>
                            {/if}
                        </span>
                    {/if}
                </button>
            {/if}
            {#if batch.status === "cooked" && cookedDateLabel}
                <p
                    class="text-[11px] uppercase tracking-wider text-juniper mt-1"
                >
                    Cooked {cookedDateLabel}
                </p>
            {:else if batch.status === "draft"}
                <p class="text-[11px] uppercase tracking-wider text-ochre mt-1">
                    Draft
                </p>
            {:else}
                <p
                    class="text-[11px] uppercase tracking-wider text-obsidian/40 mt-1"
                >
                    Archived
                </p>
            {/if}
            {#if batch.cookMultiplier !== undefined && batch.cookMultiplier !== 1}
                <span
                    class="inline-block text-[10px] uppercase tracking-wider border border-ochre text-ochre px-1.5 py-0.5 rounded-sm mt-1 ml-1"
                    data-testid="cook-multiplier-badge"
                    title="Cooked at this size"
                >{batch.cookMultiplier}x</span>
            {/if}
        </div>
        <div
            class="flex flex-wrap lg:flex-nowrap gap-2 items-start lg:justify-end"
        >
            <a
                href={resolve(`/recipes/${recipe.id}/new-batch?from=${batch.id}`)}
                class="border border-ochre whitespace-nowrap text-center text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm"
                data-testid="new-batch-btn">+ New Batch</a
            >

            {#if batch.status !== "archived"}
                <a
                    href={resolve(`/recipes/${recipe.id}/batches/${batch.id}/cook`)}
                    class="border border-juniper bg-juniper text-canvas px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-canvas hover:text-juniper rounded-sm"
                    data-testid="cook-btn">Cook</a
                >
            {/if}
            {#if batch.status === "cooked"}
                <button
                    type="button"
                    onclick={onEditOutcome}
                    class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
                    data-testid="edit-outcome-btn">Edit Outcome</button
                >
            {/if}

            <div class="relative">
                <button
                    type="button"
                    onclick={() => {
                        moreOpen = !moreOpen;
                        compareOpen = false;
                        mergeOpen = false;
                    }}
                    class="relative z-40 border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
                    aria-label="More actions"
                    data-testid="more-actions-btn">…</button
                >
                {#if moreOpen || mergeOpen || compareOpen}
                    <button
                        class="fixed bg-transparent inset-0 z-20"
                        type="button"
                        onclick={() => {
                            moreOpen = false;
                            compareOpen = false;
                            mergeOpen = false;
                        }}
                        aria-label="close actions menu"
                    ></button>
                {/if}
                {#if moreOpen}
                    <div
                        class="absolute right-0 top-full mt-1 w-44 bg-canvas border border-obsidian rounded-sm shadow-lg z-30 flex flex-col py-1"
                        data-testid="more-actions-menu"
                    >
                        <Button
                            variant="menuitem"
                            size="sm"
                            class="py-2"
                            onclick={() => {
                                moreOpen = false;
                                compareOpen = true;
                            }}
                            data-testid="compare-btn">Compare with…</Button
                        >
                        <Button
                            variant="menuitem"
                            size="sm"
                            class="py-2"
                            onclick={() => {
                                moreOpen = false;
                                mergeOpen = true;
                            }}
                            data-testid="merge-btn">Merge with…</Button
                        >
                        {#if batch.status === "draft"}
                            <!-- raw: anchor menu item -->
                            <a
                                href={resolve(`/recipes/${recipe.id}/batches/${batch.id}/edit`)}
                                class="text-left px-3 py-2 text-xs uppercase tracking-wider hover:bg-drafting/40"
                                data-testid="edit-batch-btn">Edit</a
                            >
                        {/if}
                        {#if batch.status === "draft"}
                            <Button
                                variant="menuitem"
                                size="sm"
                                class="py-2"
                                onclick={() => {
                                    moreOpen = false;
                                    onMarkCooked();
                                }}
                                data-testid="mark-cooked-btn"
                                >Mark as Cooked</Button
                            >
                        {/if}
                        <div class="h-px bg-drafting my-1"></div>
                        <Button
                            variant="menuitem"
                            size="sm"
                            class="py-2 text-ochre hover:bg-ochre/10 hover:text-ochre"
                            onclick={() => {
                                moreOpen = false;
                                if (canDelete) deleteOpen = true;
                            }}
                            disabled={!canDelete}
                            title={canDelete
                                ? ""
                                : `Delete child batches first (${childCount} child${childCount === 1 ? "" : "ren"})`}
                            data-testid="delete-batch-btn"
                            >Delete{!canDelete
                                ? ` (${childCount} child${childCount === 1 ? "" : "ren"})`
                                : ""}</Button
                        >
                    </div>
                {/if}
                <BatchPickerDropdown
                    label="Compare with"
                    candidates={batches}
                    excludeId={batch.id}
                    bind:open={compareOpen}
                    onPick={handleCompareWith}
                />
                <BatchPickerDropdown
                    label="Merge with"
                    candidates={batches}
                    excludeId={batch.id}
                    bind:open={mergeOpen}
                    onPick={handleMergeWith}
                />
            </div>
        </div>
    </header>

    {#if recipe.variableSchema.length > 0}
        <section class="flex flex-wrap gap-2" data-testid="variable-strip">
            {#each recipe.variableSchema as schema (schema.name)}
                <VariableTile
                    {schema}
                    value={batch.variables[schema.name] ?? null}
                />
            {/each}
        </section>
    {/if}

    <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
            <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">
                Ingredients
            </h3>
            {#if batch.ingredients.length > 0}
                <MultiplierToggle
                    value={multiplier}
                    onChange={(next) => multiplier = next}
                />
            {/if}
        </div>
        <IngredientList ingredients={batch.ingredients} {multiplier} />
    </section>

    <section class="flex flex-col gap-2">
        <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">
            Steps
        </h3>
        <StepsList steps={batch.steps} ingredients={batch.ingredients} {multiplier} />
    </section>

    {#if batch.status === "cooked"}
        <section class="flex flex-col gap-2 border-t border-drafting pt-4">
            <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">
                Outcome
            </h3>
            {#if batch.outcomeNotes}
                <p class="text-sm whitespace-pre-wrap">{batch.outcomeNotes}</p>
            {:else}
                <p class="text-sm text-obsidian/40 italic">
                    No notes recorded.
                </p>
            {/if}
            <Rating value={batch.rating} />
        </section>
    {:else if batch.outcomeNotes}
        <section class="flex flex-col gap-2 border-t border-drafting pt-4">
            <h3
                class="text-[11px] uppercase tracking-wider text-obsidian/50 flex items-baseline gap-2 flex-wrap"
            >
                {#if cookParent}
                    <span>Captured during cook</span>
                    <span class="text-obsidian/40">·</span>
                    <button
                        type="button"
                        onclick={() => onSelectBatch(cookParent.id)}
                        class="text-ochre hover:underline normal-case tracking-normal"
                        data-testid="captured-from-link"
                        >{cookParent.label}</button
                    >
                {:else}
                    <span>Notes</span>
                {/if}
            </h3>
            <p class="text-sm whitespace-pre-wrap">{noteBody}</p>
        </section>
    {/if}
</article>

<ConfirmDeleteDialog
    bind:open={deleteOpen}
    title="Delete {batch.label}?"
    body="Permanently deletes this batch. This can't be undone."
    confirmLabel="Delete Batch"
    mode="simple"
    onConfirm={handleDelete}
/>
