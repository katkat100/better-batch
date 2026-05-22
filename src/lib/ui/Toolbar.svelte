<script lang="ts">
  import TextInput from '$lib/ui/primitives/TextInput.svelte';
  import Select from '$lib/ui/primitives/Select.svelte';

  let {
    search = $bindable(''),
    tag = $bindable(''),
    status = $bindable('all'),
    sort = $bindable('last_cooked'),
    allTags = []
  }: {
    search?: string;
    tag?: string;
    status?: 'all' | 'has_cooked' | 'drafts_only';
    sort?: 'last_cooked' | 'name' | 'batch_count';
    allTags?: string[];
  } = $props();
</script>

<div class="flex flex-wrap items-center gap-3 border-b border-drafting pb-3 text-sm">
  <TextInput
    type="search"
    bind:value={search}
    placeholder="Search recipes"
    class="flex-1 min-w-[200px] focus:outline-none focus:border-obsidian"
    data-testid="search"
  />

  <label class="flex items-center gap-2 text-label">
    Tag
    <Select bind:value={tag} class="px-2 py-1 text-xs">
      <option value="">All</option>
      {#each allTags as t (t)}
        <option value={t}>{t}</option>
      {/each}
    </Select>
  </label>

  <label class="flex items-center gap-2 text-label">
    Status
    <Select bind:value={status} class="px-2 py-1 text-xs">
      <option value="all">All</option>
      <option value="has_cooked">Cooked</option>
      <option value="drafts_only">Drafts only</option>
    </Select>
  </label>

  <label class="flex items-center gap-2 text-label">
    Sort
    <Select bind:value={sort} class="px-2 py-1 text-xs">
      <option value="last_cooked">Last cooked</option>
      <option value="name">Name</option>
      <option value="batch_count">Batch count</option>
    </Select>
  </label>
</div>
