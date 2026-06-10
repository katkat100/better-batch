<script lang="ts">
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { untrack } from "svelte";
    import { api } from "./api-client";
    import { moveItem } from "$lib/shared/array";
    import UsesEditor from "./UsesEditor.svelte";
    import Button from "./primitives/Button.svelte";
    import IconButton from "$lib/ui/primitives/IconButton.svelte";
    import Field from "$lib/ui/primitives/Field.svelte";
    import RadioGroup from "./primitives/RadioGroup.svelte";
    import TextInput from "./primitives/TextInput.svelte";
    import type {
        Recipe,
        Batch,
        Ingredient,
        VariableValue,
        BatchStatus,
        Step,
    } from "$lib/server";
    import PasteRecipeDialog from "./PasteRecipeDialog.svelte";
    import type { PasteParseResult } from "$lib/shared/recipe-paste";
    import {
        validateBatch,
        type IngredientIssue,
    } from "$lib/shared/batch-validation";
    import InconsistencyDialog from "./InconsistencyDialog.svelte";
    import FormError from "$lib/ui/primitives/FormError.svelte";
    import IngredientEditor from './IngredientEditor.svelte';
    import { cleanBatchContent, nextVariables, evalVariableExpression } from './layout/batch-content';

    let {
        recipe,
        parent,
        mode = "create",
        existing = null,
    }: {
        recipe: Recipe;
        parent: Batch | null;
        mode?: "create" | "edit";
        existing?: Batch | null;
    } = $props();

    let label = $state(
        untrack(() =>
            mode === "edit" && existing
                ? existing.label
                : parent
                  ? `from ${parent.label}`
                  : "initial",
        ),
    );
    let status = $state<BatchStatus>(
        untrack(() =>
            mode === "edit" && existing ? existing.status : "draft",
        ),
    );
    let variables = $state<Record<string, VariableValue>>(
        untrack(() =>
            mode === "edit" && existing
                ? { ...existing.variables }
                : Object.fromEntries(
                      recipe.variableSchema.map((s) => [
                          s.name,
                          parent?.variables[s.name] ?? null,
                      ]),
                  ),
        ),
    );
    let ingredients = $state<Ingredient[]>(
        untrack(() =>
            mode === "edit" && existing
                ? existing.ingredients.map((i) => ({ ...i }))
                : parent
                  ? parent.ingredients.map((i) => ({ ...i }))
                  : [],
        ),
    );
    let steps = $state<Step[]>(
        untrack(() =>
            mode === "edit" && existing
                ? existing.steps.map((s) => ({
                      text: s.text,
                      uses: s.uses.map((u) => ({ ...u })),
                  }))
                : parent
                  ? parent.steps.map((s) => ({
                        text: s.text,
                        uses: s.uses.map((u) => ({ ...u })),
                    }))
                  : [],
        ),
    );

    let submitting = $state(false);
    let error = $state<string | null>(null);
    let showUnreferencedHighlights = $state(false);
    let inconsistencyDialogOpen = $state(false);
    let pendingSubmit = $state<((note: string | null) => Promise<void>) | null>(
        null,
    );

    let pasteOpen = $state(false);

    const formHasContent = $derived(
        ingredients.length > 0 ||
            steps.length > 0 ||
            Object.values(variables).some(
                (v) => v !== null && v !== undefined && v !== "",
            ),
    );

    function applyPaste(result: PasteParseResult, mode: "append" | "replace") {
        if (mode === "replace") {
            ingredients = result.ingredients;
            steps = result.steps;
            variables = { ...variables, ...result.variables };
        } else {
            ingredients = [...ingredients, ...result.ingredients];
            steps = [...steps, ...result.steps];
            for (const [k, v] of Object.entries(result.variables)) {
                const cur = variables[k];
                if (cur === null || cur === undefined || cur === "") {
                    variables[k] = v;
                }
            }
        }
    }

    const allUses = $derived(steps.flatMap((s) => s.uses));

    // Ingredient validation only kicks in once the user has started writing
    // steps. With zero meaningful steps every ingredient looks "unreferenced"
    // and every numeric ingredient shows a sum-mismatch — pure noise during
    // the "I'm typing my ingredients" phase of editing.
    const hasMeaningfulStep = $derived(
        steps.some((s) => s.text.trim() !== "" || s.uses.length > 0),
    );

    const liveIssues = $derived<IngredientIssue[]>(
        hasMeaningfulStep
            ? validateBatch({
                  id: existing?.id ?? "draft",
                  recipeId: recipe.id,
                  label: label.trim() || "draft",
                  parentIds: existing?.parentIds ?? (parent ? [parent.id] : []),
                  status,
                  cookedAt: existing?.cookedAt ?? null,
                  variables,
                  ingredients,
                  steps,
                  outcomeNotes: existing?.outcomeNotes ?? "",
                  rating: existing?.rating ?? null,
                  createdAt: existing?.createdAt ?? new Date().toISOString(),
              })
            : [],
    );

    const sumMismatchIds = $derived(
        new Set(
            liveIssues
                .filter((i) => i.kind === "sum-mismatch")
                .map((i) => i.ingredientId),
        ),
    );

    function addStep() {
        steps = [...steps, { text: "", uses: [] }];
    }
    function removeStep(i: number) {
        steps = steps.filter((_, idx) => idx !== i);
    }

    function setVariable(name: string, raw: string, type: "number" | "text") {
        variables = nextVariables(variables, name, raw, type);
    }

    // On blur of a number-type variable, eval arithmetic expressions and replace input.
    function evalVariableOnBlur(
        name: string,
        type: "number" | "text",
        el: HTMLInputElement,
    ) {
        if (type !== "number") return;
        const evaluated = evalVariableExpression(el.value);
        if (evaluated !== null && String(evaluated) !== el.value.trim()) {
            el.value = String(evaluated);
            variables = { ...variables, [name]: evaluated };
        }
    }

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (!label.trim()) {
            error = "Label required";
            return;
        }

        if (liveIssues.length > 0) {
            pendingSubmit = (note: string | null) => doSave(note);
            inconsistencyDialogOpen = true;
            return;
        }
        await doSave(null);
    }

    async function doSave(noteOverride: string | null): Promise<void> {
        submitting = true;
        error = null;
        try {
            const { ingredients: cleanIngredients, steps: cleanSteps } = cleanBatchContent({ ingredients, steps });

            // Recompute against the cleaned data we're actually about to save.
            const cleanedSnapshot = {
                id: existing?.id ?? "draft",
                recipeId: recipe.id,
                label: label.trim(),
                parentIds: existing?.parentIds ?? (parent ? [parent.id] : []),
                status,
                cookedAt: existing?.cookedAt ?? null,
                variables,
                ingredients: cleanIngredients,
                steps: cleanSteps,
                outcomeNotes: existing?.outcomeNotes ?? "",
                rating: existing?.rating ?? null,
                createdAt: existing?.createdAt ?? new Date().toISOString(),
            };
            const cleanedIssues = validateBatch(cleanedSnapshot);

            // finalNote convention (matches storage rule from Task 2):
            //   '' (empty)         → clear any prior note (auto-clear on clean save)
            //   ' ' (single space) → user overrode with no note text (badge still shows)
            //   real string        → user's note
            let finalNote: string;
            if (cleanedIssues.length === 0) {
                finalNote = "";
            } else {
                finalNote = (noteOverride ?? "").trim() || " ";
            }

            let result: Batch;
            if (mode === "edit" && existing) {
                result = await api.patchBatch(recipe.id, existing.id, {
                    label: label.trim(),
                    status,
                    variables,
                    ingredients: cleanIngredients,
                    steps: cleanSteps,
                    inconsistencyNote: finalNote,
                });
            } else {
                result = await api.createBatch(recipe.id, {
                    label: label.trim(),
                    parentIds: parent ? [parent.id] : [],
                    status,
                    variables,
                    ingredients: cleanIngredients,
                    steps: cleanSteps,
                    inconsistencyNote: finalNote,
                });
            }
            goto(resolve(`/recipes/${recipe.id}?batch=${result.id}`));
        } catch (err) {
            error = err instanceof Error ? err.message : "Failed to save batch";
        } finally {
            submitting = false;
            inconsistencyDialogOpen = false;
            pendingSubmit = null;
        }
    }

    function handleIngredientRemoved(removedId: string) {
        steps = steps.map((s) => ({
            ...s,
            uses: s.uses.filter((u) => u.ingredientId !== removedId)
        }));
    }

    function handleFixIt() {
        showUnreferencedHighlights = true;
        inconsistencyDialogOpen = false;
        pendingSubmit = null;
    }

    async function handleSaveAnyway(note: string) {
        if (submitting) return;
        showUnreferencedHighlights = true;
        const fn = pendingSubmit;
        pendingSubmit = null;
        inconsistencyDialogOpen = false;
        if (fn) await fn(note);
    }
</script>

<form
    onsubmit={submit}
    class="flex flex-col gap-6 max-w-3xl"
    data-testid="batch-editor"
>
    <header class="flex flex-col gap-1">
        <h1 class="font-serif text-2xl">
            {#if mode === "edit"}
                Edit {existing?.label}
            {:else if parent}
                New batch from {parent.label}
            {:else}
                Record V1
            {/if}
        </h1>
        <p class="text-sm text-obsidian/60">{recipe.name}</p>
    </header>

    <div class="flex justify-end">
        <Button
            type="button"
            variant="outline"
            size="sm"
            onclick={() => (pasteOpen = true)}
            data-testid="paste-recipe-btn">Paste Recipe</Button
        >
    </div>

    <Field label="Label">
        <TextInput bind:value={label} required data-testid="batch-label" />
    </Field>

    <fieldset class="flex flex-col gap-1 text-sm">
        <legend class="text-label mb-2">Status</legend>
        <RadioGroup
            bind:value={status}
            options={[
                { value: "draft", label: "Draft" },
                { value: "cooked", label: "Cooked" },
            ]}
            name="status"
        />
    </fieldset>

    {#if recipe.variableSchema.length > 0}
        <fieldset class="flex flex-col gap-3">
            <legend class="text-label mb-1">Variables</legend>
            <div class="grid grid-cols-2 gap-3">
                {#each recipe.variableSchema as schema (schema.name)}
                    {@const current = variables[schema.name]}
                    <label class="flex flex-col gap-1 text-sm">
                        <span class="text-kicker"
                            >{schema.name}
                            {schema.unit && `(${schema.unit})`}</span
                        >
                        <TextInput
                            type="text"
                            inputmode={schema.type === "number"
                                ? "decimal"
                                : "text"}
                            value={String(current ?? "")}
                            oninput={(e) =>
                                setVariable(
                                    schema.name,
                                    (e.currentTarget as HTMLInputElement).value,
                                    schema.type,
                                )}
                            onblur={(e) =>
                                evalVariableOnBlur(
                                    schema.name,
                                    schema.type,
                                    e.currentTarget as HTMLInputElement,
                                )}
                            data-testid="var-{schema.name}"
                        />
                    </label>
                {/each}
            </div>
        </fieldset>
    {/if}

    <IngredientEditor
        bind:ingredients
        issues={liveIssues}
        {showUnreferencedHighlights}
        onRemoveIngredient={handleIngredientRemoved}
    />

    <fieldset class="flex flex-col gap-3">
        <legend class="text-label">Steps</legend>
        {#each steps as step, i (i)}
            <div
                class="flex flex-col gap-2 border border-drafting/50 p-3 rounded-sm"
                data-testid="step-edit-row"
            >
                <div class="flex gap-2 items-start">
                    <div class="flex flex-col w-5 shrink-0 pt-1">
                        <IconButton
                            aria-label="Move step {i + 1} up"
                            onclick={() => {
                                steps = moveItem(steps, i, i - 1);
                            }}
                            disabled={i === 0}
                            class="text-[10px]"
                            data-testid="step-move-up">▲</IconButton
                        >
                        <IconButton
                            aria-label="Move step {i + 1} down"
                            onclick={() => {
                                steps = moveItem(steps, i, i + 1);
                            }}
                            disabled={i === steps.length - 1}
                            class="text-[10px]"
                            data-testid="step-move-down">▼</IconButton
                        >
                    </div>
                    <span class="font-mono text-xs text-obsidian/60 pt-2"
                        >{i + 1}.</span
                    >
                    <textarea
                        bind:value={step.text}
                        rows="2"
                        aria-label="Step {i + 1} text"
                        class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm resize-none outline-none focus:border-ochre focus:ring-1 focus:ring-ochre"
                        data-testid="step-text"
                    ></textarea>
                    <IconButton
                        aria-label="Remove step {i + 1}"
                        onclick={() => removeStep(i)}
                        class="pt-2">×</IconButton
                    >
                </div>
                <UsesEditor
                    bind:uses={step.uses}
                    ingredients={ingredients.filter(
                        (ing) => ing.id && ing.name,
                    )}
                    {allUses}
                    mismatchedIds={sumMismatchIds}
                />
            </div>
        {/each}
        <Button
            type="button"
            onclick={addStep}
            variant="dashed"
            class="text-sm normal-case tracking-normal"
            data-testid="add-step-btn">+ Add step</Button
        >
    </fieldset>

    <FormError message={error} />

    <div class="flex justify-end gap-2 border-t border-drafting pt-4">
        <a
            href={resolve(`/recipes/${recipe.id}`)}
            class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian"
            >Cancel</a
        >
        <Button
            type="submit"
            variant="outline"
            disabled={submitting}
            data-testid="batch-submit"
            >{submitting
                ? "Saving…"
                : mode === "edit"
                  ? "Save Changes"
                  : "Record Batch"}</Button
        >
    </div>
</form>

<PasteRecipeDialog
    bind:open={pasteOpen}
    schema={recipe.variableSchema}
    {formHasContent}
    onApply={applyPaste}
/>

<InconsistencyDialog
    bind:open={inconsistencyDialogOpen}
    issues={liveIssues}
    onFix={handleFixIt}
    onSaveAnyway={handleSaveAnyway}
/>
