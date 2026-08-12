<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { api } from '$lib/api/client.js';
  import { natureOfCaseLabel } from '$lib/constants/intake-sheets.js';

  let loading = $state(true);
  let error = $state('');
  /** @type {any} */
  let data = $state(null);

  const isRegional = authState.user?.organizationLevel === 'regional';
  /** @type {any[]} */
  let divisions = $state([]);
  let divisionFilter = $state('');

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
    const params = {};
    if (divisionFilter) params.division_id = divisionFilter;
    const result = await intakeSheetsService.getStatistics(params);
    if (result.success) {
      data = result.data;
    } else {
      error = result.error || 'Failed to load dashboard.';
    }
    loading = false;
  }

  function handleFilterChange() {
    load();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  /** @param {number} n @param {number} total */
  function pct(n, total) {
    if (!total) return 0;
    return Math.round((n / total) * 100);
  }
  /** @param {any[]} arr @param {string} key */
  function maxOf(arr, key) {
    return arr.reduce((m, r) => Math.max(m, r[key] ?? 0), 1);
  }
  /** @param {string} sex */
  function sexLabel(sex) {
    return sex === 'MALE' ? 'Male' : sex === 'FEMALE' ? 'Female' : 'Unspecified';
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
    <div>
      <p class="text-xs text-base-content/40 uppercase tracking-wider mb-0.5">Dashboard</p>
      <h1 class="text-2xl font-bold">{authState.user?.fullName || 'Focal Person'}</h1>
      <p class="text-sm text-base-content/50 mt-0.5">Learner Rights &amp; Protection</p>
    </div>
    <div class="flex items-center gap-2">
      {#if isRegional && divisions.length}
        <select class="select select-bordered select-sm w-full sm:w-48" bind:value={divisionFilter} onchange={handleFilterChange}>
          <option value="">All Divisions</option>
          {#each divisions as d}
            <option value={String(d.division_id)}>{d.name}</option>
          {/each}
        </select>
      {:else if authState.user?.division}
        <div class="flex items-center gap-2 px-3 py-1.5 bg-base-100 border border-base-200 rounded-xl text-xs">
          <span class="w-2 h-2 rounded-full bg-primary"></span>
          <span class="text-base-content/60">{authState.user.division.name}</span>
        </div>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {#each [1, 2, 3, 4] as _}
        <div class="bg-base-100 rounded-2xl p-5 border border-base-200 space-y-3 animate-pulse">
          <div class="h-3 w-20 bg-base-200 rounded"></div>
          <div class="h-7 w-12 bg-base-200 rounded"></div>
          <div class="h-2.5 w-16 bg-base-200 rounded"></div>
        </div>
      {/each}
    </div>
    <div class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

  {:else if error}
    <div class="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span>{error}</span>
      <button class="btn btn-sm btn-ghost" onclick={load}>Retry</button>
    </div>

  {:else if data}
    {#if (data.summary?.drafts ?? 0) > 0}
      <button
        type="button"
        class="alert bg-base-200/60 border border-base-300 text-sm w-full text-left hover:bg-base-200 transition-colors"
        onclick={() => goto('/admin/lrp/intake-sheets?status=draft')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
        </svg>
        <span><strong>{data.summary.drafts}</strong> intake sheet{data.summary.drafts !== 1 ? 's' : ''} still in draft — not counted below until finalized. Tap to view.</span>
      </button>
    {/if}

    <!-- Section 1 — Key Metrics -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Total Sheets</span>
          <span class="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-primary">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.total ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">{data.summary?.recently_added ?? 0} new in last 30 days</p>
      </div>

      <div class="bg-base-100 rounded-2xl p-5 border border-base-200 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Pending Review</span>
          <span class="w-8 h-8 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-warning">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.pending_review ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">Awaiting review</p>
      </div>

      <div class="bg-base-100 rounded-2xl p-5 border border-base-200 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Reviewed</span>
          <span class="w-8 h-8 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-success">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.reviewed ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">{pct(data.summary?.reviewed ?? 0, data.summary?.total ?? 0)}% of total</p>
      </div>

      <div class="bg-base-100 rounded-2xl p-5 border border-base-200 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">New This Month</span>
          <span class="w-8 h-8 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-info">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.recently_added ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">Last 30 days</p>
      </div>
    </div>

    <!-- Section 2 — Nature of Case + Learner Sex + Monthly Trend -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold">Nature of Case</h2>
          <span class="text-xs text-base-content/30 font-mono">{data.summary?.total ?? 0} total</span>
        </div>
        {#if data.by_nature_of_case?.length}
          <div class="space-y-3">
            {#each data.by_nature_of_case as row}
              {@const w = pct(row.count, data.summary?.total)}
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <span class="text-xs text-base-content/60 truncate pr-2 leading-tight">{natureOfCaseLabel(row.nature_of_case)}</span>
                  <span class="text-xs font-bold shrink-0 tabular-nums">{row.count}</span>
                </div>
                <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-primary h-full rounded-full transition-all duration-500" style="width:{w}%"></div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>

      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <h2 class="text-sm font-semibold mb-4">Learner-Victims by Sex</h2>
        {#if data.by_sex?.length}
          {@const totalSex = data.by_sex.reduce((s, r) => s + r.count, 0)}
          <div class="space-y-3">
            {#each data.by_sex as row}
              <div class="flex items-center gap-3">
                <span class="badge badge-sm {row.sex === 'MALE' ? 'badge-info' : row.sex === 'FEMALE' ? 'badge-secondary' : 'badge-ghost'} shrink-0 w-20 justify-center">{sexLabel(row.sex)}</span>
                <div class="flex-1 bg-base-200 rounded-full h-2 overflow-hidden">
                  <div class="bg-info h-full rounded-full transition-all duration-500" style="width:{pct(row.count, totalSex)}%"></div>
                </div>
                <span class="text-sm font-bold tabular-nums w-6 text-right">{row.count}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>

      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-sm font-semibold">Monthly Volume</h2>
          <span class="text-xs font-bold tabular-nums text-base-content/50">
            {data.monthly_trend?.reduce((s, m) => s + m.count, 0) ?? 0} sheets
          </span>
        </div>
        <p class="text-xs text-base-content/30 mb-4">Past 6 months</p>
        {#if data.monthly_trend?.length}
          {@const maxVal = maxOf(data.monthly_trend, 'count')}
          <div class="flex items-end gap-2 h-20">
            {#each data.monthly_trend as m}
              {@const h = Math.max(3, Math.round((m.count / maxVal) * 80))}
              <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div
                  class="w-full rounded-sm bg-primary/60 hover:bg-primary transition-colors cursor-default"
                  style="height:{h}px"
                  title="{m.label}: {m.count}"
                ></div>
              </div>
            {/each}
          </div>
          <div class="flex justify-between text-xs text-base-content/25 mt-1.5">
            <span>{data.monthly_trend[0]?.label}</span>
            <span>{data.monthly_trend[data.monthly_trend.length - 1]?.label}</span>
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-6">No activity data</p>
        {/if}
      </div>
    </div>

    <!-- Section 3 — By Division (regional only) + Top Schools -->
    <div class="grid grid-cols-1 {data.by_division?.length ? 'lg:grid-cols-2' : ''} gap-4">
      {#if data.by_division?.length}
        <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
          <h2 class="text-sm font-semibold mb-4">By Division</h2>
          <div class="space-y-3">
            {#each data.by_division as row}
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <span class="text-xs text-base-content/60 truncate pr-2">{row.name}</span>
                  <span class="text-xs font-bold shrink-0 tabular-nums">{row.count}</span>
                </div>
                <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-secondary h-full rounded-full transition-all duration-500" style="width:{pct(row.count, data.summary?.total)}%"></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <h2 class="text-sm font-semibold mb-4">Schools with the Most Cases</h2>
        {#if data.by_school?.length}
          <div class="space-y-3">
            {#each data.by_school as row, i}
              <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-base-content/20 w-4 text-center tabular-nums">{i + 1}</span>
                <span class="text-sm flex-1 truncate leading-tight">{row.name}</span>
                <span class="text-xs font-bold tabular-nums bg-base-200 px-2 py-0.5 rounded-full">{row.count}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>
    </div>

    <!-- Quick link -->
    <div class="bg-base-100 rounded-2xl border border-base-200 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p class="text-sm text-base-content/60">View, review, or file a new intake sheet.</p>
      <button class="btn btn-primary btn-sm w-full sm:w-auto" onclick={() => goto('/admin/lrp/intake-sheets')}>
        Go to Intake Sheets
      </button>
    </div>
  {/if}
</div>
