<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { api } from '$lib/api/client.js';
  import { NATURE_OF_CASE_OPTIONS, natureOfCaseLabel } from '$lib/constants/intake-sheets.js';

  /** @type {any[]} */
  let sheets = $state([]);
  let loading = $state(true);
  let error = $state('');

  let statusFilter = $state('');
  let divisionFilter = $state('');
  let natureFilter = $state('');
  let currentPage = $state(1);
  let totalPages = $state(1);
  let total = $state(0);

  const isRegional = authState.user?.organizationLevel === 'regional';
  /** @type {any[]} */
  let divisions = $state([]);

  onMount(async () => {
    if (isRegional) {
      try {
        const res = await api.get('/divisions/all');
        divisions = res.data || [];
      } catch (e) {
        divisions = [];
      }
    }
    await load();
  });

  async function load() {
    loading = true;
    error = '';
    /** @type {Record<string,any>} */
    const params = { page: currentPage, per_page: 15 };
    if (statusFilter) params.status = statusFilter;
    if (divisionFilter) params.division_id = divisionFilter;
    if (natureFilter) params.nature_of_case = natureFilter;

    const result = await intakeSheetsService.getIntakeSheets(params);
    if (result.success) {
      sheets = result.data?.data || [];
      totalPages = result.data?.last_page || 1;
      total = result.data?.total || 0;
    } else {
      error = result.error || 'Failed to load intake sheets';
    }
    loading = false;
  }

  function handleFilterChange() {
    currentPage = 1;
    load();
  }

  /** @param {number} p */
  function changePage(p) {
    currentPage = p;
    load();
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">Intake Sheets</h1>
      <p class="text-base-content/50 mt-1">
        {#if authState.isIntakeSheetsReadOnly()}
          Read-only view across all divisions · {total} sheet{total !== 1 ? 's' : ''}
        {:else if isRegional}
          All divisions · {total} sheet{total !== 1 ? 's' : ''}
        {:else}
          {authState.user?.division?.name || 'Your division'} · {total} sheet{total !== 1 ? 's' : ''}
        {/if}
      </p>
    </div>
    {#if authState.canManageIntakeSheets()}
      <button class="btn btn-primary" onclick={() => goto('/admin/lrp/intake-sheets/new')}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New Intake Sheet
      </button>
    {/if}
  </div>

  {#if authState.isIntakeSheetsReadOnly()}
    <div class="alert alert-info text-sm">
      <span>Super Admin access to learner rights &amp; protection cases is read-only.</span>
    </div>
  {/if}

  <div class="flex flex-col sm:flex-row gap-3">
    <select class="select select-bordered w-full sm:w-48" bind:value={statusFilter} onchange={handleFilterChange}>
      <option value="">All Status</option>
      <option value="pending_review">Pending Review</option>
      <option value="reviewed">Reviewed</option>
    </select>
    <select class="select select-bordered w-full sm:w-56" bind:value={natureFilter} onchange={handleFilterChange}>
      <option value="">All Nature of Case</option>
      {#each NATURE_OF_CASE_OPTIONS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
    {#if isRegional && divisions.length}
      <select class="select select-bordered w-full sm:w-56" bind:value={divisionFilter} onchange={handleFilterChange}>
        <option value="">All Divisions</option>
        {#each divisions as d}
          <option value={String(d.division_id)}>{d.name}</option>
        {/each}
      </select>
    {/if}
  </div>

  {#if error}
    <div class="alert alert-error"><span>{error}</span></div>
  {/if}

  <div class="card bg-base-100 shadow-sm border border-base-200">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Learner</th>
            <th>School</th>
            {#if isRegional}<th>Division</th>{/if}
            <th>Nature of Case</th>
            <th>Date of Intake</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan={isRegional ? 7 : 6} class="text-center py-10"><span class="loading loading-spinner"></span></td></tr>
          {:else if sheets.length === 0}
            <tr><td colspan={isRegional ? 7 : 6} class="text-center py-10 text-base-content/50">No intake sheets found</td></tr>
          {:else}
            {#each sheets as sheet}
              <tr class="hover cursor-pointer" onclick={() => goto(`/admin/lrp/intake-sheets/${sheet.intake_sheet_id}`)}>
                <td>
                  <p class="font-medium">{sheet.learner_victim?.full_name || '—'}</p>
                  {#if sheet.learner_victim?.grade}
                    <p class="text-xs text-base-content/50">Grade {sheet.learner_victim.grade}{sheet.learner_victim.section ? ` - ${sheet.learner_victim.section}` : ''}</p>
                  {/if}
                </td>
                <td class="text-sm">{sheet.school?.name || '—'}</td>
                {#if isRegional}<td class="text-sm text-base-content/70">{sheet.division?.name || '—'}</td>{/if}
                <td class="text-sm">
                  <span class="badge badge-sm badge-ghost">{natureOfCaseLabel(sheet.nature_of_case)}</span>
                </td>
                <td class="text-sm">{new Date(sheet.date_of_intake).toLocaleDateString()}</td>
                <td>
                  <span class="badge badge-sm {sheet.status === 'reviewed' ? 'badge-success' : 'badge-warning'}">
                    {sheet.status === 'reviewed' ? 'Reviewed' : 'Pending Review'}
                  </span>
                </td>
                <td>
                  <button class="btn btn-outline btn-xs" onclick={(e) => { e.stopPropagation(); goto(`/admin/lrp/intake-sheets/${sheet.intake_sheet_id}`); }}>View</button>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    {#if totalPages > 1}
      <div class="p-4 border-t border-base-200 flex items-center justify-between">
        <span class="text-sm text-base-content/50">Page {currentPage} of {totalPages}</span>
        <div class="join">
          <button class="join-item btn btn-sm" disabled={currentPage <= 1} onclick={() => changePage(currentPage - 1)}>«</button>
          {#each Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1) as p}
            <button class="join-item btn btn-sm {p === currentPage ? 'btn-active' : ''}" onclick={() => changePage(p)}>{p}</button>
          {/each}
          <button class="join-item btn btn-sm" disabled={currentPage >= totalPages} onclick={() => changePage(currentPage + 1)}>»</button>
        </div>
      </div>
    {/if}
  </div>
</div>
