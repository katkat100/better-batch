<script lang="ts">
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { SvelteSet } from "svelte/reactivity";
    import { untrack } from "svelte";
    import { api } from "./api-client";
    import { slugify, uniqueSlug } from "$lib/shared/slug";
    import { moveItem } from "$lib/shared/array";
    import { parseAmount } from "./layout/amount-parse";
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

    const sectionOptions = $derived.by<string[]>(() => {
        const set = new SvelteSet<string>();
        for (const ing of ingredients) {
            if (ing.section && ing.section.trim()) set.add(ing.section.trim());
        }
        return [...set];
    });

    // When user picks "+ New section…", prompt for a name and apply it.
    $effect(() => {
        for (let i = 0; i < ingredients.length; i++) {
            if (ingredients[i].section === "__new__") {
                const name = window.prompt("New section name:");
                ingredients[i].section =
                    name && name.trim() ? name.trim() : undefined;
            }
        }
    });

    // Reactively assign a stable id to any ingredient that has a name but no id yet.
    // Once assigned, the id is permanent for that row (renaming the ingredient does not change it).
    $effect(() => {
        for (let i = 0; i < ingredients.length; i++) {
            const ing = ingredients[i];
            if (!ing.id && ing.name && ing.name.trim()) {
                const taken = new Set(
                    ingredients.map((x) => x.id).filter(Boolean),
                );
                ingredients[i].id = uniqueSlug(slugify(ing.name), taken);
            }
        }
    });

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

    const unreferencedIds = $derived(
        new Set(
            liveIssues
                .filter((i) => i.kind === "unreferenced")
                .map((i) => i.ingredientId),
        ),
    );

    function addIngredient() {
        ingredients = [
            ...ingredients,
            { id: "", name: "", amount: "", unit: "" },
        ];
    }
    function removeIngredient(i: number) {
        const removedId = ingredients[i].id;
        ingredients = ingredients.filter((_, idx) => idx !== i);
        // Drop any uses that referenced the removed ingredient
        steps = steps.map((s) => ({
            ...s,
            uses: s.uses.filter((u) => u.ingredientId !== removedId),
        }));
    }
    function addStep() {
        steps = [...steps, { text: "", uses: [] }];
    }
    function removeStep(i: number) {
        steps = steps.filter((_, idx) => idx !== i);
    }

    function setVariable(name: string, raw: string, type: "number" | "text") {
        if (raw === "") {
            variables = { ...variables, [name]: null };
            return;
        }
        if (type === "number") {
            const n = parseFloat(raw);
            variables = { ...variables, [name]: Number.isFinite(n) ? n : raw };
        } else {
            variables = { ...variables, [name]: raw };
        }
    }

    // On blur of a number-type variable, eval arithmetic expressions and replace input.
    function evalVariableOnBlur(
        name: string,
        type: "number" | "text",
        el: HTMLInputElement,
    ) {
        if (type !== "number") return;
        const evaluated = parseAmount(el.value);
        if (evaluated !== null && String(evaluated) !== el.value.trim()) {
            el.value = String(evaluated);
            variables = { ...variables, [name]: evaluated };
        }
    }

    // On blur of an ingredient amount input, eval arithmetic expressions and update.
    function evalIngredientAmountOnBlur(i: number) {
        const evaluated = parseAmount(ingredients[i].amount);
        if (
            evaluated !== null &&
            String(evaluated) !== ingredients[i].amount.trim()
        ) {
            ingredients[i].amount = String(evaluated);
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
            const cleanIngredients = ingredients.filter((i) => i.name.trim());
            const validIds = new Set(cleanIngredients.map((i) => i.id));
            const cleanSteps: Step[] = steps
                .filter((s) => s.text.trim())
                .map((s) => ({
                    text: s.text.trim(),
                    uses: s.uses.filter((u) => validIds.has(u.ingredientId)),
                }));

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

    <fieldset class="flex flex-col gap-2">
        <legend class="text-label">Ingredients</legend>
        {#each ingredients as ing, i (i)}
            <div
                class="flex gap-2 items-start md:items-center {sumMismatchIds.has(
                    ing.id,
                ) ||
                (showUnreferencedHighlights && unreferencedIds.has(ing.id))
                    ? 'border border-ochre rounded-sm p-1 -m-1'
                    : ''}"
                data-testid="ingredient-edit-row"
                data-ingredient-issue={sumMismatchIds.has(ing.id)
                    ? "sum-mismatch"
                    : showUnreferencedHighlights && unreferencedIds.has(ing.id)
                      ? "unreferenced"
                      : undefined}
            >
                <div class="flex flex-col w-5 shrink-0 pt-1 md:pt-0">
                    <IconButton
                        aria-label="Move ingredient {i + 1} up"
                        onclick={() => {
                            ingredients = moveItem(ingredients, i, i - 1);
                        }}
                        disabled={i === 0}
                        class="text-[10px]"
                        data-testid="ingredient-move-up">▲</IconButton
                    >
                    <IconButton
                        aria-label="Move ingredient {i + 1} down"
                        onclick={() => {
                            ingredients = moveItem(ingredients, i, i + 1);
                        }}
                        disabled={i === ingredients.length - 1}
                        class="text-[10px]"
                        data-testid="ingredient-move-down">▼</IconButton
                    >
                </div>

                <div
                    class="flex-1 min-w-0 flex flex-col gap-2 md:flex-row md:items-center md:gap-2"
                >
                    <TextInput
                        bind:value={ing.name}
                        placeholder="Ingredient"
                        aria-label="Ingredient {i + 1} name"
                        class="px-2 py-1.5 md:flex-1"
                    />
                    <div class="flex gap-2 min-w-0 md:contents">
                        <TextInput
                            bind:value={ing.amount}
                            onblur={() => evalIngredientAmountOnBlur(i)}
                            placeholder="Amount"
                            aria-label="Ingredient {i + 1} amount"
                            class="flex-1 md:flex-none w-1/2 flex md:w-24 px-2 py-1.5"
                        />
                        <TextInput
                            bind:value={ing.unit}
                            placeholder="Unit"
                            aria-label="Ingredient {i + 1} unit"
                            class="flex-1 md:flex-none w-1/2 flex md:w-20 px-2 py-1.5"
                            autocapitalize="none"
                        />
                    </div>
                    <select
                        value={ing.section ?? "__none__"}
                        onchange={(e) => {
                            const val = (e.currentTarget as HTMLSelectElement)
                                .value;
                            ing.section = val === "__none__" ? undefined : val;
                        }}
                        aria-label="Ingredient {i + 1} section"
                        class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm text-sm w-full md:w-32"
                        data-testid="ingredient-section"
                    >
                        <option value="__none__">(no section)</option>
                        {#each sectionOptions as sec (sec)}
                            <option value={sec}>{sec}</option>
                        {/each}
                        <option value="__new__">+ New section…</option>
                    </select>
                    {#if sumMismatchIds.has(ing.id)}
                        {@const issue = liveIssues.find(
                            (x) =>
                                x.kind === "sum-mismatch" &&
                                x.ingredientId === ing.id,
                        )!}
                        <span
                            class="text-[10px] text-ochre whitespace-nowrap md:self-center"
                            data-testid="ingredient-sum-warning"
                            data-ingredient-id={ing.id}
                            >⚠ used {issue.sum}/{issue.master}{issue.unit ??
                                ""}</span
                        >
                    {/if}
                    {#if showUnreferencedHighlights && unreferencedIds.has(ing.id) && !sumMismatchIds.has(ing.id)}
                        <span
                            class="text-[10px] text-ochre whitespace-nowrap md:self-center"
                            data-testid="ingredient-unreferenced-warning"
                            data-ingredient-id={ing.id}>⚠ never used</span
                        >
                    {/if}
                </div>

                <IconButton
                    aria-label="Remove ingredient {i + 1}"
                    onclick={() => removeIngredient(i)}
                    class="pt-2 md:pt-0">×</IconButton
                >
            </div>
        {/each}
        <Button
            type="button"
            onclick={addIngredient}
            variant="dashed"
            class="text-sm normal-case tracking-normal"
            data-testid="add-ingredient-btn">+ Add ingredient</Button
        >
    </fieldset>

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
