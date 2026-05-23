<!-- src/lib/ui/WelcomePanel.svelte -->
<script lang="ts">
  import Button from '$lib/ui/primitives/Button.svelte';
  import IconButton from '$lib/ui/primitives/IconButton.svelte';
  import SectionHeading from '$lib/ui/primitives/SectionHeading.svelte';
  import FormError from '$lib/ui/primitives/FormError.svelte';

  let {
    onCreateRecipe,
    onLoadSample,
    onDismiss
  }: {
    onCreateRecipe: () => void;
    onLoadSample: () => Promise<void>;
    onDismiss: () => void;
  } = $props();

  let loading = $state(false);
  let error = $state<string | null>(null);

  async function handleLoadSample() {
    loading = true;
    error = null;
    try {
      await onLoadSample();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load sample';
      loading = false;
    }
    // On success: parent handles dismiss + navigation, so we don't reset loading.
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onDismiss()} />

<div
  class="max-w-2xl mx-auto bg-canvas border border-drafting rounded-sm p-6 md:p-8 flex flex-col gap-4 relative"
  data-testid="welcome-panel"
>
  <div class="absolute top-2 right-2">
    <IconButton aria-label="Dismiss welcome guide" onclick={onDismiss} data-testid="welcome-dismiss-btn">×</IconButton>
  </div>

  <SectionHeading text="Welcome to Better Batch" />

  <p class="text-base leading-relaxed">
    Better Batch tracks each cook as a <em>batch</em> under its recipe.
    Fork from your best batch, change one thing, and cook it again — the
    app remembers everything so you can compare attempts side by side.
  </p>

  <div class="flex flex-col md:flex-row gap-2 pt-2">
    <Button
      variant="primary"
      onclick={onCreateRecipe}
      disabled={loading}
      data-testid="welcome-create-btn"
    >+ Create your first recipe</Button>
    <Button
      variant="outline"
      onclick={handleLoadSample}
      disabled={loading}
      data-testid="welcome-load-sample-btn"
    >{loading ? 'Loading sample…' : 'Load sample recipe'}</Button>
  </div>

  <FormError message={error} />
</div>
