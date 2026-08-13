<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { api } from '$lib/api/client.js';
  import { NATURE_OF_CASE_OPTIONS, natureOfCaseLabel, STATUS_OPTIONS, statusLabel, statusBadgeClass } from '$lib/constants/intake-sheets.js';

  /** @type {any[]} */
  let sheets = $state([]);
  let loading = $state(true);
  let error = $state('');

  // Pre-filter from a deep link, e.g. the dashboard's "N drafts" banner.
  let statusFilter = $state(page.url.searchParams.get('status') || '');
  let divisionFilter = $state('');
  let natureFilter = $state('');
  let currentPage = $state(1);
  let totalPages = $state(1);
  let total = $state(0);

  const isRegional = authState.user?.organizationLevel === 'regional';
  const isSchoolLevel = authState.user?.organizationLevel === 'school';
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
        {:else if isSchoolLevel}
          {authState.user?.school?.name || 'Your school'} · {total} sheet{total !== 1 ? 's' : ''}
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
      {#each STATUS_OPTIONS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
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

  {#if loading}
    <div class="card bg-base-100 shadow-sm border border-base-200 py-10">
      <span class="loading loading-spinner mx-auto"></span>
    </div>
  {:else if sheets.length === 0}
    <div class="card bg-base-100 shadow-sm border border-base-200 py-10">
      <p class="text-center text-base-content/50">No intake sheets found</p>
    </div>
  {:else}
    <!-- Mobile: card list (avoids horizontal-scrolling a 6-7 column table) -->
    <div class="md:hidden space-y-3">
      {#each sheets as sheet}
        <button
          type="button"
          class="w-full text-left card bg-base-100 shadow-sm border border-base-200 p-4 active:bg-base-200/50 transition-colors"
          onclick={() => goto(`/admin/lrp/intake-sheets/${sheet.intake_sheet_id}`)}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-medium truncate">{sheet.learner_victim?.full_name || '—'}</p>
              {#if sheet.learner_victim?.grade}
                <p class="text-xs text-base-content/50">Grade {sheet.learner_victim.grade}{sheet.learner_victim.section ? ` - ${sheet.learner_victim.section}` : ''}</p>
              {/if}
            </div>
            <span class="badge badge-sm shrink-0 {statusBadgeClass(sheet.status)}">{statusLabel(sheet.status)}</span>
          </div>
          <div class="mt-2 text-sm text-base-content/70 truncate">{sheet.school?.name || '—'}</div>
          {#if isRegional}<div class="text-xs text-base-content/50 truncate">{sheet.division?.name || '—'}</div>{/if}
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="badge badge-sm badge-ghost">{natureOfCaseLabel(sheet.nature_of_case)}</span>
            <span class="text-xs text-base-content/50">{new Date(sheet.date_of_intake).toLocaleDateString()}</span>
          </div>
        </button>
      {/each}
    </div>

    <!-- Desktop/tablet: table -->
    <div class="hidden md:block card bg-base-100 shadow-sm border border-base-200">
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
                  <span class="badge badge-sm {statusBadgeClass(sheet.status)}">{statusLabel(sheet.status)}</span>
                </td>
                <td>
                  <button class="btn btn-outline btn-xs" onclick={(e) => { e.stopPropagation(); goto(`/admin/lrp/intake-sheets/${sheet.intake_sheet_id}`); }}>View</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}

  {#if totalPages > 1}
    <div class="card bg-base-100 shadow-sm border border-base-200 p-4 flex flex-row items-center justify-between">
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
