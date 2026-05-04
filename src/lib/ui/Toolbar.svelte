<script lang="ts">
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
  <input
    type="search"
    bind:value={search}
    placeholder="Search recipes"
    class="flex-1 min-w-[200px] border border-drafting bg-canvas px-3 py-1.5 rounded-sm focus:outline-none focus:border-obsidian"
    data-testid="search"
  />

  <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider">
    Tag
    <select bind:value={tag} class="border border-drafting bg-canvas px-2 py-1 rounded-sm">
      <option value="">All</option>
      {#each allTags as t}
        <option value={t}>{t}</option>
      {/each}
    </select>
  </label>

  <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider">
    Status
    <select bind:value={status} class="border border-drafting bg-canvas px-2 py-1 rounded-sm">
      <option value="all">All</option>
      <option value="has_cooked">Cooked</option>
      <option value="drafts_only">Drafts only</option>
    </select>
  </label>

  <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider">
    Sort
    <select bind:value={sort} class="border border-drafting bg-canvas px-2 py-1 rounded-sm">
      <option value="last_cooked">Last cooked</option>
      <option value="name">Name</option>
      <option value="batch_count">Batch count</option>
    </select>
  </label>
</div>
