<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { learnerReportsService } from '$lib/api/learner-reports.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { api } from '$lib/api/client.js';
  import { NATURE_OF_CONCERN_OPTIONS, natureOfConcernLabel, STATUS_OPTIONS, statusLabel, statusBadgeClass, relationshipLabel } from '$lib/constants/learner-reports.js';

  /** @type {any[]} */
  let reports = $state([]);
  let loading = $state(true);
  let error = $state('');

  let statusFilter = $state('');
  let natureFilter = $state('');
  let divisionFilter = $state('');
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
    if (natureFilter) params.nature_of_concern = natureFilter;
    if (divisionFilter) params.division_id = divisionFilter;

    const result = await learnerReportsService.getReports(params);
    if (result.success) {
      reports = result.data?.data || [];
      totalPages = result.data?.last_page || 1;
      total = result.data?.total || 0;
    } else {
      error = result.error || 'Failed to load reports';
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

  /** @param {string} d */
  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">Learner Reports</h1>
      <p class="text-base-content/50 mt-1">
        {#if authState.isLearnerReportsReadOnly()}
          Read-only view across all divisions · {total} report{total !== 1 ? 's' : ''}
        {:else if isSchoolLevel}
          {authState.user?.school?.name || 'Your school'} · {total} report{total !== 1 ? 's' : ''}
        {:else if isRegional}
          All divisions · {total} report{total !== 1 ? 's' : ''}
        {:else}
          {authState.user?.division?.name || 'Your division'} · {total} report{total !== 1 ? 's' : ''}
        {/if}
      </p>
    </div>
  </div>

  {#if authState.isLearnerReportsReadOnly()}
    <div class="alert alert-info text-sm">
      <span>Super Admin access to learner reports is read-only.</span>
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
      <option value="">All Nature of Concern</option>
      {#each NATURE_OF_CONCERN_OPTIONS as opt}
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
  {:else if reports.length === 0}
    <div class="card bg-base-100 shadow-sm border border-base-200 py-10">
      <p class="text-center text-base-content/50">No learner reports found</p>
    </div>
  {:else}
    <!-- Mobile: card list -->
    <div class="md:hidden space-y-3">
      {#each reports as r}
        <button
          type="button"
          class="w-full text-left card bg-base-100 shadow-sm border border-base-200 p-4 active:bg-base-200/50 transition-colors"
          onclick={() => goto(`/admin/lrp/reports/${r.learner_report_id}`)}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-medium truncate">{r.is_anonymous ? 'Anonymous' : r.reporter_full_name}</p>
              <p class="text-xs text-base-content/50">{relationshipLabel(r.reporter_relationship)}</p>
            </div>
            <span class="badge badge-sm shrink-0 {statusBadgeClass(r.status)}">{statusLabel(r.status)}</span>
          </div>
          <div class="mt-2 text-sm text-base-content/70 truncate">{r.school?.name || '—'}</div>
          {#if isRegional}<div class="text-xs text-base-content/50 truncate">{r.division?.name || '—'}</div>{/if}
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="badge badge-sm badge-ghost">{natureOfConcernLabel(r.nature_of_concern)}</span>
            <span class="text-xs text-base-content/50">{fmtDate(r.created_at)}</span>
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
              <th>Reporter</th>
              <th>School</th>
              {#if isRegional}<th>Division</th>{/if}
              <th>Nature of Concern</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each reports as r}
              <tr class="hover cursor-pointer" onclick={() => goto(`/admin/lrp/reports/${r.learner_report_id}`)}>
                <td>
                  <p class="font-medium">{r.is_anonymous ? 'Anonymous' : r.reporter_full_name}</p>
                  <p class="text-xs text-base-content/50">{relationshipLabel(r.reporter_relationship)}</p>
                </td>
                <td class="text-sm">{r.school?.name || '—'}</td>
                {#if isRegional}<td class="text-sm text-base-content/70">{r.division?.name || '—'}</td>{/if}
                <td class="text-sm">
                  <span class="badge badge-sm badge-ghost">{natureOfConcernLabel(r.nature_of_concern)}</span>
                </td>
                <td class="text-sm">{fmtDate(r.created_at)}</td>
                <td>
                  <span class="badge badge-sm {statusBadgeClass(r.status)}">{statusLabel(r.status)}</span>
                </td>
                <td>
                  <button class="btn btn-outline btn-xs" onclick={(e) => { e.stopPropagation(); goto(`/admin/lrp/reports/${r.learner_report_id}`); }}>View</button>
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
