<!-- src/lib/ui/InconsistencyDialog.svelte -->
<script lang="ts">
  import Dialog from './primitives/Dialog.svelte';
  import Button from './primitives/Button.svelte';
  import { formatIngredientIssue, type IngredientIssue } from '$lib/shared/batch-validation';

  let {
    open = $bindable(false),
    issues,
    onFix,
    onSaveAnyway
  }: {
    open?: boolean;
    issues: IngredientIssue[];
    onFix: () => void;
    onSaveAnyway: (note: string) => void;
  } = $props();

  let confirming = $state(false);
  let note = $state('');

  $effect(() => {
    if (open) {
      confirming = false;
      note = '';
    }
  });

</script>

<Dialog bind:open title="Ingredient inconsistencies" onClose={onFix}>
  <div class="flex flex-col gap-4" data-testid="inconsistency-dialog">
    <p class="text-sm text-obsidian/70">
      Some ingredients don't add up. You can fix them, or save anyway and add a note explaining why.
    </p>
    <ul class="font-mono text-sm space-y-1" data-testid="inconsistency-list">
      {#each issues as issue (issue.ingredientId + ':' + issue.kind + ':' + (issue.stepIndex ?? ''))}
        <li class="text-ochre">⚠ {formatIngredientIssue(issue)}</li>
      {/each}
    </ul>

    {#if confirming}
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Optional note (why is this intentional?)</span>
        <textarea
          bind:value={note}
          rows="3"
          class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm font-mono text-sm"
          data-testid="inconsistency-note"
        ></textarea>
      </label>
      <div class="flex gap-2 justify-end">
        <Button type="button" variant="dashed" onclick={() => confirming = false}>Back</Button>
        <Button type="button" onclick={() => onSaveAnyway(note.trim())} data-testid="inconsistency-confirm-save">
          Save anyway
        </Button>
      </div>
    {:else}
      <div class="flex gap-2 justify-end">
        <Button type="button" variant="dashed" onclick={onFix} data-testid="inconsistency-fix">
          Fix it
        </Button>
        <Button type="button" onclick={() => confirming = true} data-testid="inconsistency-save-anyway">
          Save anyway
        </Button>
      </div>
    {/if}
  </div>
</Dialog>
