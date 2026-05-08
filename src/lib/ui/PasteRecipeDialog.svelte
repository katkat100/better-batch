<!-- src/lib/ui/PasteRecipeDialog.svelte -->
<script lang="ts">
  import type { VariableSchemaItem } from '$lib/server';
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import { parseRecipePaste, type PasteParseResult } from '$lib/shared/recipe-paste';

  let {
    open = $bindable(false),
    schema,
    formHasContent,
    onApply
  }: {
    open?: boolean;
    schema: VariableSchemaItem[];
    formHasContent: boolean;
    onApply: (result: PasteParseResult, mode: 'append' | 'replace') => void;
  } = $props();

  let pasteText = $state('');
  let parsed = $state<PasteParseResult | null>(null);
  let unmatchedOpen = $state(false);

  $effect(() => {
    if (open) {
      pasteText = '';
      parsed = null;
      unmatchedOpen = false;
    }
  });

  function handleParse() {
    parsed = parseRecipePaste(pasteText, schema);
  }

  function close() {
    open = false;
  }

  function apply(mode: 'append' | 'replace') {
    if (!parsed) return;
    onApply(parsed, mode);
    close();
  }
</script>

<Dialog
  bind:open
  title="Paste Recipe"
  titleId="paste-recipe-dialog-title"
  subtitle="Paste a recipe and we'll fill in what we can."
  size="2xl"
  onClose={close}
>
  <div class="flex flex-col gap-4" data-testid="paste-recipe-dialog">
    <textarea
      bind:value={pasteText}
      rows="12"
      placeholder="Paste your recipe here…"
      class="border border-drafting bg-canvas px-3 py-2 rounded-sm text-sm font-mono resize-y"
      data-testid="paste-recipe-textarea"
    ></textarea>

    {#if parsed === null}
      <div class="flex justify-end gap-2 pt-2 border-t border-drafting">
        <Button type="button" variant="ghost" onclick={close} data-testid="paste-recipe-cancel-btn">Cancel</Button>
        <Button
          type="button"
          variant={pasteText.trim() ? 'primary' : 'outline'}
          disabled={!pasteText.trim()}
          onclick={handleParse}
          data-testid="paste-recipe-parse-btn"
        >Parse</Button>
      </div>
    {:else}
      <p class="text-sm text-obsidian/70" data-testid="paste-recipe-summary">
        {parsed.ingredients.length} ingredient{parsed.ingredients.length === 1 ? '' : 's'}
        · {parsed.steps.length} step{parsed.steps.length === 1 ? '' : 's'}
        · {Object.keys(parsed.variables).length} variable{Object.keys(parsed.variables).length === 1 ? '' : 's'} filled
      </p>

      {#if parsed.unmatchedLines.length > 0}
        <div class="flex flex-col gap-1 border border-drafting/50 rounded-sm p-2">
          <button
            type="button"
            class="text-left text-xs uppercase tracking-wider text-obsidian/60 hover:text-obsidian"
            onclick={() => unmatchedOpen = !unmatchedOpen}
          >Couldn't categorize ({parsed.unmatchedLines.length}) {unmatchedOpen ? '▼' : '▶'}</button>
          {#if unmatchedOpen}
            <ul class="text-xs text-obsidian/60 font-mono pl-3" data-testid="paste-recipe-unmatched">
              {#each parsed.unmatchedLines as line, i (i)}
                <li>{line}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      <div class="flex justify-end gap-2 pt-2 border-t border-drafting">
        <Button type="button" variant="ghost" onclick={close} data-testid="paste-recipe-cancel-btn">Cancel</Button>
        {#if formHasContent}
          <Button type="button" variant="outline" onclick={() => apply('append')} data-testid="paste-recipe-append-btn">Append</Button>
          <Button type="button" variant="primary" onclick={() => apply('replace')} data-testid="paste-recipe-replace-btn">Replace</Button>
        {:else}
          <Button type="button" variant="primary" onclick={() => apply('replace')} data-testid="paste-recipe-apply-btn">Apply</Button>
        {/if}
      </div>
    {/if}
  </div>
</Dialog>
