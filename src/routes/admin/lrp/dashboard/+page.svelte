<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { learnerReportsService } from '$lib/api/learner-reports.js';
  import { api } from '$lib/api/client.js';
  import { natureOfCaseLabel } from '$lib/constants/intake-sheets.js';
  import { natureOfConcernLabel, relationshipLabel } from '$lib/constants/learner-reports.js';
  import TrendLineChart from '$lib/components/TrendLineChart.svelte';

  let loading = $state(true);
  let error = $state('');
  /** @type {any} */
  let data = $state(null);
  /** @type {any} */
  let reportStats = $state(null);

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

    const [sheetsRes, reportsRes] = await Promise.all([
      intakeSheetsService.getStatistics(params),
      learnerReportsService.getStatistics(params)
    ]);

    if (sheetsRes.success) {
      data = sheetsRes.data;
    } else {
      error = sheetsRes.error || 'Failed to load dashboard.';
    }
    if (reportsRes.success) reportStats = reportsRes.data;

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
  /** @param {string} sex */
  function sexLabel(sex) {
    return sex === 'MALE' ? 'Male' : sex === 'FEMALE' ? 'Female' : 'Unspecified';
  }
  /** @param {number|null|undefined} hours */
  function fmtHours(hours) {
    if (hours === null || hours === undefined) return '—';
    if (hours < 24) return `${hours}h`;
    return `${(hours / 24).toFixed(1)}d`;
  }

  // Every card/chart below carries a colored top edge + its section's icon so
  // it's recognizable which data source it belongs to even out of context of
  // the section header (Intake Sheets = primary, Learner Reports = accent —
  // kept consistent with the Super Admin dashboard's matching panels).
  const SHEET_CARD = 'bg-base-100 rounded-2xl p-5 border border-base-200 border-t-2 border-t-primary/50';
  const REPORT_CARD = 'bg-base-100 rounded-2xl p-5 border border-base-200 border-t-2 border-t-accent/50';

  // Combined trend chart — merges both series' independently-fetched 6-month
  // windows into one aligned month list (they cover the same calendar window,
  // but are joined by month key rather than assumed to already match 1:1).
  let trendMonths = $derived.by(() => {
    /** @type {Map<string, {month: string, label: string, sheets: number, reports: number}>} */
    const byMonth = new Map();
    for (const m of data?.monthly_trend || []) {
      byMonth.set(m.month, { month: m.month, label: m.label, sheets: m.count, reports: 0 });
    }
    for (const m of reportStats?.monthly_trend || []) {
      const existing = byMonth.get(m.month);
      if (existing) existing.reports = m.count;
      else byMonth.set(m.month, { month: m.month, label: m.label, sheets: 0, reports: m.count });
    }
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  });
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
      {:else if authState.getOrgLabel()}
        <div class="flex items-center gap-2 px-3 py-1.5 bg-base-100 border border-base-200 rounded-xl text-xs">
          <span class="w-2 h-2 rounded-full bg-primary"></span>
          <span class="text-base-content/60">{authState.getOrgLabel()}</span>
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
    {#if (reportStats?.summary?.new ?? 0) > 0}
      <button
        type="button"
        class="alert bg-accent/10 border border-accent/30 text-sm w-full text-left hover:bg-accent/20 transition-colors"
        onclick={() => goto('/admin/lrp/reports?status=new')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0 text-accent">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/>
        </svg>
        <span><strong>{reportStats.summary.new}</strong> new learner report{reportStats.summary.new !== 1 ? 's' : ''} awaiting triage. Tap to review.</span>
      </button>
    {/if}

    <!-- ═══════════════════════════════════════════════════════════════════
         Intake Sheets — the actual case record. Identity color: primary.
    ═══════════════════════════════════════════════════════════════════ -->
    <div class="flex items-center gap-2">
      <span class="w-5 h-5 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-primary">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h6"/>
        </svg>
      </span>
      <p class="text-xs font-semibold text-primary uppercase tracking-wider">Intake Sheet / Incident Report</p>
    </div>

    <!-- Section 1 — Key Metrics -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <button type="button" class="{SHEET_CARD} hover:shadow-sm transition-shadow text-left w-full cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets')}>
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Total Sheets</span>
          <span class="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-primary">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.total ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">{data.summary?.recently_added ?? 0} new in last 30 days · tap to view</p>
      </button>

      <button type="button" class="{SHEET_CARD} hover:shadow-sm transition-shadow text-left w-full cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets?status=awaiting_me')}>
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Awaiting My Office</span>
          <span class="w-8 h-8 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-warning">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.pending_review ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">Forwarded or returned to your office for review · tap to view</p>
      </button>

      <button type="button" class="{SHEET_CARD} hover:shadow-sm transition-shadow text-left w-full cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets?status=resolved')}>
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Resolved</span>
          <span class="w-8 h-8 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-success">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.resolved ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">{pct(data.summary?.resolved ?? 0, data.summary?.total ?? 0)}% of total · tap to view</p>
      </button>

      <div class="{SHEET_CARD} hover:shadow-sm transition-shadow">
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

    <!-- Section 2 — Nature of Case + Learner Sex (monthly trend moved to the
         combined chart below, alongside Learner Reports) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class={SHEET_CARD}>
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
                  <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2 leading-tight" title={natureOfCaseLabel(row.nature_of_case)}>{natureOfCaseLabel(row.nature_of_case)}</span>
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

      <div class={SHEET_CARD}>
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
    </div>

    <!-- Section 3 — By Division (regional only) + Top Schools -->
    <div class="grid grid-cols-1 {data.by_division?.length ? 'lg:grid-cols-2' : ''} gap-4">
      {#if data.by_division?.length}
        <div class={SHEET_CARD}>
          <h2 class="text-sm font-semibold mb-4">By Division</h2>
          <div class="space-y-3">
            {#each data.by_division as row}
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2" title={row.name}>{row.name}</span>
                  <span class="text-xs font-bold shrink-0 tabular-nums">{row.count}</span>
                </div>
                <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-primary h-full rounded-full transition-all duration-500" style="width:{pct(row.count, data.summary?.total)}%"></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class={SHEET_CARD}>
        <h2 class="text-sm font-semibold mb-4">Schools with the Most Cases</h2>
        {#if data.by_school?.length}
          <div class="space-y-3">
            {#each data.by_school as row, i}
              <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-base-content/20 w-4 text-center tabular-nums">{i + 1}</span>
                <span class="text-sm flex-1 line-clamp-2 break-words min-w-0 leading-tight" title={row.name}>{row.name}</span>
                <span class="text-xs font-bold tabular-nums bg-base-200 px-2 py-0.5 rounded-full">{row.count}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         Learner Reports — submissions from the public report form, ahead of
         (and separate from) full intake sheets. Identity color: accent.
    ═══════════════════════════════════════════════════════════════════ -->
    {#if reportStats}
      <div class="flex items-center justify-between pt-2">
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-accent">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/>
            </svg>
          </span>
          <p class="text-xs font-semibold text-accent uppercase tracking-wider">Learner Reports</p>
        </div>
        <button class="btn btn-ghost btn-xs" onclick={() => goto('/admin/lrp/reports')}>View All →</button>
      </div>

      <div class="bg-base-100 rounded-2xl border border-base-200 border-t-2 border-t-accent/50 p-5">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-base-200 rounded-xl overflow-hidden">
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/reports')}>
            <p class="text-2xl font-bold tabular-nums">{reportStats.summary?.total ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Total</p>
          </button>
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/reports?status=new')}>
            <p class="text-2xl font-bold tabular-nums text-warning">{reportStats.summary?.new ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">New</p>
          </button>
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/reports?status=under_review')}>
            <p class="text-2xl font-bold tabular-nums text-info">{reportStats.summary?.under_review ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Under Review</p>
          </button>
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/reports?status=linked')}>
            <p class="text-2xl font-bold tabular-nums text-success">{reportStats.summary?.linked ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Linked</p>
          </button>
        </div>
        <div class="flex items-center justify-between mt-3 text-xs text-base-content/40">
          <span>Tap a number above to view that list — {reportStats.summary?.dismissed ?? 0} dismissed · {reportStats.summary?.recently_added ?? 0} new in last 30 days</span>
          <span class="hidden sm:inline">Avg. time to first review: <span class="font-semibold text-base-content/60">{fmtHours(reportStats.summary?.avg_review_hours)}</span></span>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class={REPORT_CARD}>
          <h2 class="text-sm font-semibold mb-4">Nature of Concern</h2>
          {#if reportStats.by_nature_of_concern?.length}
            <div class="space-y-3">
              {#each reportStats.by_nature_of_concern as row}
                {@const w = pct(row.count, reportStats.summary?.total)}
                <div>
                  <div class="flex justify-between items-baseline mb-1">
                    <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2 leading-tight" title={natureOfConcernLabel(row.nature_of_concern)}>{natureOfConcernLabel(row.nature_of_concern)}</span>
                    <span class="text-xs font-bold shrink-0 tabular-nums">{row.count}</span>
                  </div>
                  <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-accent h-full rounded-full transition-all duration-500" style="width:{w}%"></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-base-content/30 text-center py-4">No data</p>
          {/if}
        </div>

        <div class={REPORT_CARD}>
          <h2 class="text-sm font-semibold mb-4">Who's Reporting</h2>
          {#if reportStats.by_relationship?.length}
            <div class="space-y-3">
              {#each reportStats.by_relationship as row}
                {@const w = pct(row.count, reportStats.summary?.total)}
                <div>
                  <div class="flex justify-between items-baseline mb-1">
                    <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2 leading-tight" title={relationshipLabel(row.relationship)}>{relationshipLabel(row.relationship)}</span>
                    <span class="text-xs font-bold shrink-0 tabular-nums">{row.count}</span>
                  </div>
                  <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-accent h-full rounded-full transition-all duration-500" style="width:{w}%"></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-base-content/30 text-center py-4">No data</p>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Combined trend — both series on one shared count axis, so volume can
         actually be compared month to month instead of read from two
         separate mini-charts. -->
    {#if trendMonths.length}
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-sm font-semibold">Monthly Volume</h2>
        </div>
        <p class="text-xs text-base-content/30 mb-4">Past 6 months</p>
        <TrendLineChart
          months={trendMonths.map((m) => ({ label: m.label }))}
          series={[
            { name: 'Intake Sheet / Incident Report', color: 'var(--color-primary)', values: trendMonths.map((m) => m.sheets) },
            { name: 'Learner Reports', color: 'var(--color-accent)', values: trendMonths.map((m) => m.reports) }
          ]}
        />
      </div>
    {/if}

    <!-- Quick links -->
    <div class="bg-base-100 rounded-2xl border border-base-200 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p class="text-sm text-base-content/60">View, review, or file a new intake sheet — or triage an incoming learner report.</p>
      <div class="flex gap-2 w-full sm:w-auto">
        <button class="btn btn-outline btn-sm flex-1 sm:flex-none" onclick={() => goto('/admin/lrp/reports')}>
          <span class="w-2 h-2 rounded-full bg-accent shrink-0"></span>
          Learner Reports
        </button>
        <button class="btn btn-primary btn-sm flex-1 sm:flex-none" onclick={() => goto('/admin/lrp/intake-sheets')}>
          Intake Sheet / Incident Report
        </button>
      </div>
    </div>
  {/if}
</div>
